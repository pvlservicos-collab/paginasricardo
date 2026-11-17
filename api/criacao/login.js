// Login do dashboard de criativos (interno.grupor1.com/dashboardscriacao). Só pelo Google, mesma regra da Central R1.
//   GET → { logado, email, nome, google }   POST { credential } → cookie   DELETE → sai
import { json, erro, mesmaOrigem } from '../../lib/servidor.mjs';
import { ipDe } from '../../lib/auth.mjs';
import { GOOGLE_CLIENT_ID } from '../../lib/google-login.mjs';
import { entrar, sessaoDe, sair, cookieSaida } from '../../lib/criacao.mjs';

export const hostOk = (r) => /^(interno\.grupor1\.com|localhost|127\.)/.test((r.headers.get('x-forwarded-host') || r.headers.get('host') || '').toLowerCase());

export async function GET(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  try {
    const s = await sessaoDe(request);
    return json({ logado: Boolean(s), email: s?.email || null, nome: s?.nome || null, google: GOOGLE_CLIENT_ID || null });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/login', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

export async function POST(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  let d = {};
  try { d = await request.json(); } catch {}
  try {
    const r = await entrar(d.credential, ipDe(request));
    if (r.erro) return json({ erro: r.erro, pendente: r.status === 202 }, r.status);
    console.log(JSON.stringify({ tipo: 'evento', acao: 'criacao_login', usuario: r.email, em: new Date().toISOString() }));
    return json({ ok: true, email: r.email, nome: r.nome }, 200, { 'Set-Cookie': r.cookie });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/login', msg: e.message }));
    return erro('Login indisponível agora.', 503);
  }
}

export async function DELETE(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  await sair(request).catch(() => {});
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSaida() });
}
