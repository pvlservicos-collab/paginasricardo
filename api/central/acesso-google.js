// POST /api/central/acesso-google { credential } → { chave, exp }
// "Entrar com Google" na tela "Acesso restrito" de interno.grupor1.com. A página da Central vem criptografada e só abre
// com a chave (CENTRAL_CONTEUDO_KEY, a mesma CONTEUDO_KEY do backend antigo centralr1-acesso no Netlify, que segue
// cuidando do login por e-mail e senha). Pelo Google entram contas @grupor1.com e, por exceção pedida em 17/11/2026,
// @ivoxmarketing.com — e-mail confirmado pelo Google.
import { verificarIdToken } from '../../lib/google-login.mjs';
import { sql, usandoBanco } from '../../lib/store.mjs';
import { prepararCentral, ipDe, registrar, json, erro, hostDe } from '../../lib/central.mjs';
import { mesmaOrigem } from '../../lib/servidor.mjs';

const DOMINIOS = ['@grupor1.com', '@ivoxmarketing.com'];
const DURACAO_MS = 7 * 24 * 3600e3; // quanto tempo a chave fica guardada no navegador
const JANELA_MIN = 15, MAX_IP = 20;

export async function POST(request) {
  if (hostDe(request) !== 'interno.grupor1.com' && !/^(localhost|127\.)/.test(hostDe(request))) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const chave = (process.env.CENTRAL_CONTEUDO_KEY || '').trim();
  if (!chave || !usandoBanco) return erro('Login com Google indisponível agora.', 503);
  const ip = ipDe(request);
  try {
    await prepararCentral();
    const [{ n }] = await sql`select count(*)::int as n from central_tentativas where ip = ${ip} and em > now() - make_interval(mins => ${JANELA_MIN})`;
    if (n >= MAX_IP) return erro(`Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.`, 429);
    let d = {};
    try { d = await request.json(); } catch {}
    let g;
    try { g = await verificarIdToken(d.credential); }
    catch (e) {
      await sql`insert into central_tentativas (login, ip) values ('google', ${ip})`;
      return erro(e.message, e.status || 401);
    }
    if (!DOMINIOS.some((d) => g.email.endsWith(d))) {
      await sql`insert into central_tentativas (login, ip) values (${g.email}, ${ip})`;
      await registrar('central_acesso_google_negado', { usuario: g.email, ip });
      return erro('Use a sua conta Google corporativa (@grupor1.com ou @ivoxmarketing.com).', 403);
    }
    await registrar('central_acesso_google', { usuario: g.email, ip });
    return json({ chave, exp: Date.now() + DURACAO_MS, email: g.email });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/central/acesso-google', msg: e.message }));
    return erro('Login com Google indisponível agora. Tente de novo.', 503);
  }
}
