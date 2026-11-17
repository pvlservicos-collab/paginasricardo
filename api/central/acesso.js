// POST /api/central/acesso — acesso à Central R1 (interno.grupor1.com) para quem NÃO entra pelo Google do domínio.
//   { acao:'pedir',  email, nome, senha } → 202 { pendente, mensagem }  (o superadmin aprova em /aprovacoes)
//   { acao:'entrar', email, senha }       → 200 { chave, exp, email }   só depois de aprovado
// Substitui o login por senha do backend antigo no Netlify (centralr1-acesso), que a página deixou de usar.
import { json, erro, mesmaOrigem } from '../../lib/servidor.mjs';
import { ipDe } from '../../lib/auth.mjs';
import { sql } from '../../lib/store.mjs';
import { hashSenha, senhaConfere, emailValido, normalizarEmail } from '../../lib/rota/base.mjs';
import { prepararAprovacao, limiteIp, contarFalha } from '../../lib/aprovacao.mjs';

const DURACAO_MS = 7 * 24 * 3600e3;
const hostOk = (r) => /^(interno\.grupor1\.com|localhost|127\.)/.test((r.headers.get('x-forwarded-host') || r.headers.get('host') || '').toLowerCase());
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
const MSG_PENDENTE = 'Seu pedido está aguardando aprovação do administrador. Tente entrar de novo depois.';

export async function POST(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const chave = (process.env.CENTRAL_CONTEUDO_KEY || '').trim();
  if (!chave) return erro('Acesso indisponível agora.', 503);
  const ip = ipDe(request);
  let d = {};
  try { d = await request.json(); } catch {}
  try {
    await prepararAprovacao();
    if (await limiteIp(ip)) return erro('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429);
    const email = normalizarEmail(d.email), senha = String(d.senha || '');
    if (!emailValido(email)) return erro('Confira o e-mail.', 400);

    if (d.acao === 'pedir') {
      const nome = String(d.nome || '').trim().slice(0, 80);
      if (nome.length < 2) return erro('Informe o seu nome.', 400);
      if (senha.length < 8 || senha.length > 200) return erro('A senha precisa ter pelo menos 8 caracteres.', 400);
      await contarFalha(ip); // cada pedido conta no limite por IP (contra pedidos em massa)
      const [ja] = await sql`select status from central_acessos where email = ${email}`;
      if (ja?.status === 'aprovado') return erro('Este e-mail já tem acesso. Use "Já fui aprovado".', 409);
      if (ja?.status === 'pendente') return erro('Já existe um pedido para este e-mail. Aguarde a aprovação.', 409);
      if (ja?.status === 'recusado') return erro('O acesso deste e-mail não foi aprovado. Fale com o administrador.', 403);
      const { sal, hash } = hashSenha(senha);
      await sql`insert into central_acessos (email, nome, origem, senha_sal, senha_hash) values (${email}, ${nome}, 'senha', ${sal}, ${hash})`;
      console.log(JSON.stringify({ tipo: 'evento', acao: 'central_acesso_pedido', email, ip, em: new Date().toISOString() }));
      return json({ pendente: true, mensagem: 'Pedido enviado! Assim que o administrador aprovar, entre com este e-mail e a senha que você criou.' }, 202);
    }

    if (d.acao === 'entrar') {
      const [a] = await sql`select status, origem, senha_sal, senha_hash from central_acessos where email = ${email}`;
      const ok = a && a.origem === 'senha' && senhaConfere(senha, { sal: a.senha_sal, hash: a.senha_hash });
      if (!ok) { await contarFalha(ip); await espera(500); return erro('E-mail ou senha incorretos.', 401); }
      if (a.status === 'pendente') return json({ erro: MSG_PENDENTE, pendente: true }, 403);
      if (a.status !== 'aprovado') return erro('O acesso deste e-mail não foi aprovado. Fale com o administrador.', 403);
      console.log(JSON.stringify({ tipo: 'evento', acao: 'central_acesso_senha', email, ip, em: new Date().toISOString() }));
      return json({ chave, exp: Date.now() + DURACAO_MS, email });
    }

    return erro('Ação inválida.', 400);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/central/acesso', msg: e.message }));
    return erro('Acesso indisponível agora. Tente de novo.', 503);
  }
}
