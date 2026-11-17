// POST /api/rota/conta  — contas do app Rota do Bilhão (migrado do Netlify)
//   { acao:'cadastrar', email, senha, aceite } → 201/200 { token, perfil } | 409 e-mail já tem senha
//   { acao:'entrar', email, senha }            → 200 { token, perfil } | 401
//   { acao:'redefinir', email, senha, chave }  → 200 (só a equipe, chave = ROTA_ADMIN_CHAVE)
import { timingSafeEqual } from 'node:crypto';
import {
  json, erro, criarToken, hashSenha, senhaConfere, normalizarEmail, emailValido, espera, getConta, setConta,
  usoSobe, usoLer, hoje, ipDe,
} from '../../lib/rota/base.mjs';

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
  const email = normalizarEmail(c.email), senha = String(c.senha || '');
  if (!emailValido(email)) return erro('Confira o e-mail.', 400);
  const ip = ipDe(request), dia = hoje();

  if (c.acao === 'cadastrar') {
    if (await usoSobe(`cad:ip:${ip}:${dia}`) > MAX_CADASTROS_IP) { log('cadastro_bloqueado', { ip }); return bloqueado(); }
    // primeiro acesso: a pessoa cria a própria senha. Conta antiga (migrada sem senha própria) é assumida e mantém os dados.
    const nome = String(c.nome || '').trim().slice(0, 80), empresa = String(c.empresa || '').trim().slice(0, 80);
    if (senha.length < 6) return erro('A senha precisa ter pelo menos 6 caracteres.', 400);
    if (c.aceite !== true) return erro('Para entrar, aceite a Política de Privacidade.', 400);
    const atual = await getConta(email);
    if (atual && atual.hash) return erro('Este e-mail já tem senha. Toque em Entrar.', 409);
    const conta = {
      ...(atual || { email, criado: new Date().toISOString() }),
      nome: atual?.nome || nome, empresa: atual?.empresa || empresa,
      ...hashSenha(senha), lgpd: { aceite: new Date().toISOString(), versao: '2026-11-15' },
    };
    delete conta.via;
    await setConta(email, conta);
    log('cadastro', { email, ip });
    return json({ token: criarToken(email), perfil: perfilDe(email, conta) }, atual ? 200 : 201);
  }

  if (c.acao === 'entrar') {
    const kIp = `err:ip:${ip}:${dia}`, kEm = `err:em:${email}:${dia}`;
    if (await usoLer(kIp) >= MAX_ERROS_IP || await usoLer(kEm) >= MAX_ERROS_EMAIL) { log('login_bloqueado', { email, ip }); return bloqueado(); }
    const conta = await getConta(email);
    if (conta && !conta.hash) { await espera(400); return json({ erro: 'Crie a sua senha em Primeiro acesso.', criar: true }, 401); }
    if (!conta || !senhaConfere(senha, conta)) {
      await usoSobe(kIp); await usoSobe(kEm);
      await espera(600); return erro('E-mail ou senha incorretos.', 401);
    }
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
    await setConta(email, { ...conta, ...hashSenha(senha), redefinida: new Date().toISOString() });
    log('redefinida', { email, ip });
    return json({ ok: true });
  }

  return erro('Ação inválida.', 400);
}
