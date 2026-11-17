// POST /api/rota/conta  — contas do app Rota do Bilhão (migrado do Netlify)
//   { acao:'google', credential, aceite }      → 200/201 { token, perfil }  (qualquer conta Google entra direto)
//   { acao:'cadastrar', email, senha, aceite } → 202 { pendente }  pedido de acesso; o superadmin aprova em /aprovacoes
//   { acao:'entrar', email, senha }            → 200 { token, perfil } só se aprovado | 403 { pendente } | 401
//   { acao:'redefinir', email, senha, chave }  → 200 (só a equipe, chave = ROTA_ADMIN_CHAVE)
import { timingSafeEqual } from 'node:crypto';
import {
  json, erro, criarToken, hashSenha, senhaConfere, normalizarEmail, emailValido, espera, getConta, setConta,
  usoSobe, usoLer, hoje, ipDe, acessoAutomatico,
} from '../../lib/rota/base.mjs';
import { verificarIdToken } from '../../lib/google-login.mjs';

// Limites por dia (contra robô testando senha ou criando conta em massa). Contam só erros no login.
const MAX_ERROS_IP = 30, MAX_ERROS_EMAIL = 15, MAX_CADASTROS_IP = 10, MAX_ADMIN_IP = 5;
const bloqueado = () => erro('Muitas tentativas. Tente de novo amanhã ou fale com a equipe do Clube R1.', 429);
const log = (acao, d) => console.log(JSON.stringify({ tipo: 'evento', rota: '/api/rota/conta', acao, ...d, em: new Date().toISOString() }));

// e-mails com acesso livre (equipe), para conferir o app inteiro
const LIVRES = String(process.env.ROTA_LIVRE_EMAILS || process.env.LIVRE_EMAILS || 'acesso.livre@cluber1.com.br')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const perfilDe = (email, conta) => ({ email, nome: conta.nome || '', empresa: conta.empresa || '', livre: LIVRES.includes(email) });

async function ler(request) {
  try { return await request.json(); } catch { return {}; }
}

export const POST = async (request) => {
  try { return await tratar(request); } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/conta', msg: e.message }));
    return erro('Serviço indisponível no momento. Tente de novo.', 503);
  }
};

async function tratar(request) {
  const c = await ler(request);
  const ip = ipDe(request), dia = hoje();

  if (c.acao === 'google') {
    // "Entrar com Google": o navegador manda o ID token do Google; conferimos assinatura, aplicativo e e-mail
    // confirmado (lib/google-login.mjs). Conta nova já nasce com o nome do Google; conta antiga passa a entrar
    // também pelo Google. Como o Google garante que o e-mail é da pessoa, ninguém assume o e-mail de outro.
    if (await usoLer(`cad:ip:${ip}:${dia}`) >= MAX_CADASTROS_IP) { log('google_bloqueado', { ip }); return bloqueado(); }
    let g;
    try { g = await verificarIdToken(c.credential); }
    catch (e) { await usoSobe(`cad:ip:${ip}:${dia}`); log('google_negado', { ip, msg: e.message }); return erro(e.message, e.status || 401); }
    const atual = await getConta(g.email);
    if (!atual && c.aceite !== true) return erro('Para entrar, aceite a Política de Privacidade.', 400);
    // a identidade estável do Google é o `sub`: se a conta já foi ligada a outra Conta Google (e-mail reatribuído), recusa
    if (atual?.google?.sub && g.sub && atual.google.sub !== g.sub) {
      log('google_sub_diferente', { email: g.email, ip });
      return erro('Esta conta está ligada a outra Conta Google. Fale com a equipe do Clube R1.', 403);
    }
    const agora = new Date().toISOString();
    const conta = {
      ...(atual || { email: g.email, criado: agora, pedido_em: agora }),
      nome: atual?.nome || g.nome, google: { sub: g.sub, em: agora },
      ...(!atual?.lgpd && c.aceite === true ? { lgpd: { aceite: agora, versao: '2026-11-15' } } : {}),
    };
    delete conta.via;
    // Primeira vez que o dono do e-mail (provado pelo Google) entra numa conta que foi criada por senha: a senha não
    // provava nada (cadastro sem confirmação de e-mail). Apaga a senha e derruba os tokens antigos (`desde`), para quem
    // criou a conta com o e-mail de outra pessoa perder o acesso. O dono segue entrando pelo Google.
    const retomada = Boolean(atual && !atual.google && atual.hash);
    if (retomada) { delete conta.hash; delete conta.sal; conta.desde = agora; }
    await setConta(g.email, conta);
    // Google @grupor1.com entra direto; Gmail e outros domínios precisam da aprovação do superadmin (/aprovacoes)
    if (!acessoAutomatico(g.email, conta) && !conta.aprovado) {
      if (!atual) await usoSobe(`cad:ip:${ip}:${dia}`); // pedido novo conta no limite por IP
      log(conta.recusado ? 'google_recusado' : 'google_pedido', { email: g.email, ip });
      if (conta.recusado) return erro('O seu acesso não foi aprovado. Fale com a equipe do Clube R1.', 403);
      return json(atual
        ? { pendente: true, erro: 'Seu acesso está aguardando aprovação do Clube R1. Tente de novo mais tarde.' }
        : { pendente: true, mensagem: 'Pedido enviado! Assim que o Clube R1 aprovar o seu acesso, toque de novo em Continuar com o Google.' }, atual ? 403 : 202);
    }
    log(atual ? (retomada ? 'google_retomou_conta' : 'google_entrou') : 'google_cadastro', { email: g.email, ip });
    return json({ token: criarToken(g.email), perfil: perfilDe(g.email, conta), novo: !atual, retomada }, atual ? 200 : 201);
  }

  const email = normalizarEmail(c.email), senha = String(c.senha || '');
  if (!emailValido(email)) return erro('Confira o e-mail.', 400);

  if (c.acao === 'cadastrar') {
    if (await usoSobe(`cad:ip:${ip}:${dia}`) > MAX_CADASTROS_IP) { log('cadastro_bloqueado', { ip }); return bloqueado(); }
    // primeiro acesso: a pessoa cria a própria senha. Conta antiga (migrada sem senha própria) é assumida e mantém os dados.
    const nome = String(c.nome || '').trim().slice(0, 80), empresa = String(c.empresa || '').trim().slice(0, 80);
    if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.', 400);
    if (c.aceite !== true) return erro('Para entrar, aceite a Política de Privacidade.', 400);
    const atual = await getConta(email);
    if (atual && atual.hash) return erro('Este e-mail já tem senha. Toque em Entrar.', 409);
    // conta criada pelo Google (sem senha): ninguém cria uma senha por cima dela — só o dono, entrando com o Google
    if (atual && atual.google) return erro('Este e-mail entra com o Google. Toque em Entrar com Google.', 409);
    // Sem Google, o cadastro vira PEDIDO DE ACESSO: a senha só vale depois que o superadmin aprovar em
    // interno.grupor1.com/aprovacoes (lib/aprovacao.mjs). Até lá a conta não recebe token.
    const agora = new Date().toISOString();
    const conta = {
      ...(atual || { email, criado: agora }),
      nome: atual?.nome || nome, empresa: atual?.empresa || empresa, pedido_em: agora,
      ...hashSenha(senha), lgpd: { aceite: agora, versao: '2026-11-15' },
    };
    delete conta.via; delete conta.aprovado; delete conta.recusado;
    await setConta(email, conta);
    log('pedido_acesso', { email, ip });
    return json({ pendente: true, mensagem: 'Pedido enviado! Assim que o Clube R1 aprovar o seu acesso, entre com este e-mail e a senha que você criou. Com e-mail @grupor1.com, entre pelo Google sem esperar.' }, 202);
  }

  if (c.acao === 'entrar') {
    const kIp = `err:ip:${ip}:${dia}`, kEm = `err:em:${email}:${dia}`;
    if (await usoLer(kIp) >= MAX_ERROS_IP || await usoLer(kEm) >= MAX_ERROS_EMAIL) { log('login_bloqueado', { email, ip }); return bloqueado(); }
    const conta = await getConta(email);
    if (conta && !conta.hash && conta.google) { await espera(400); return erro('Este e-mail entra com o Google. Toque em Continuar com o Google.', 401); }
    if (conta && !conta.hash) { await espera(400); return json({ erro: 'Crie a sua senha em Primeiro acesso.', criar: true }, 401); }
    if (!conta || !senhaConfere(senha, conta)) {
      await usoSobe(kIp); await usoSobe(kEm);
      await espera(600); return erro('E-mail ou senha incorretos.', 401);
    }
    // senha certa, mas o acesso por senha depende de aprovação do superadmin
    if (conta.recusado) return erro('O seu acesso não foi aprovado. Fale com a equipe do Clube R1.', 403);
    if (!conta.aprovado) return json({ erro: 'Seu acesso está aguardando aprovação do Clube R1. Com e-mail @grupor1.com, entre pelo Google sem esperar.', pendente: true }, 403);
    if (c.aceite === true && !conta.lgpd) { conta.lgpd = { aceite: new Date().toISOString(), versao: '2026-11-15' }; await setConta(email, conta); }
    return json({ token: criarToken(email), perfil: perfilDe(email, conta) });
  }

  if (c.acao === 'redefinir') {
    const kAdm = `adm:ip:${ip}:${dia}`;
    if (await usoLer(kAdm) >= MAX_ADMIN_IP) { log('redefinir_bloqueado', { ip }); return bloqueado(); }
    const adm = Buffer.from(process.env.ROTA_ADMIN_CHAVE || ''), veio = Buffer.from(String(c.chave || ''));
    if (adm.length < 16 || adm.length !== veio.length || !timingSafeEqual(adm, veio)) {
      await usoSobe(kAdm); log('redefinir_negado', { email, ip }); await espera(800); return erro('Não autorizado.', 403);
    }
    const conta = await getConta(email);
    if (!conta) return erro('E-mail sem conta.', 404);
    if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.', 400);
    // senha nova derruba as sessões antigas (desde)
    const quando = new Date().toISOString();
    await setConta(email, { ...conta, ...hashSenha(senha), redefinida: quando, desde: quando });
    log('redefinida', { email, ip });
    return json({ ok: true });
  }

  return erro('Ação inválida.', 400);
}
