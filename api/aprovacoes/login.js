// Login do superadmin na tela de aprovação (interno.grupor1.com/aprovacoes). Só pelo Google, só SUPERADMIN_EMAILS.
//   GET    → { logado, email, google }   POST { credential } → cookie   DELETE → sai
import { json, erro, mesmaOrigem } from '../../lib/servidor.mjs';
import { ipDe } from '../../lib/auth.mjs';
import { GOOGLE_CLIENT_ID } from '../../lib/google-login.mjs';
import { entrarSuperadmin, superadminDe, sairSuperadmin, cookieSaida } from '../../lib/aprovacao.mjs';

const hostOk = (r) => /^(interno\.grupor1\.com|localhost|127\.)/.test((r.headers.get('x-forwarded-host') || r.headers.get('host') || '').toLowerCase());

export async function GET(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  try {
    const email = await superadminDe(request);
    return json({ logado: Boolean(email), email, google: GOOGLE_CLIENT_ID || null });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/aprovacoes/login', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

export async function POST(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  let d = {};
  try { d = await request.json(); } catch {}
  try {
    const r = await entrarSuperadmin(d.credential, ipDe(request));
    if (r.erro) return erro(r.erro, r.status);
    console.log(JSON.stringify({ tipo: 'evento', acao: 'superadmin_login', usuario: r.email, em: new Date().toISOString() }));
    return json({ ok: true, email: r.email }, 200, { 'Set-Cookie': r.cookie });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/aprovacoes/login', msg: e.message }));
    return erro('Login indisponível agora.', 503);
  }
}

export async function DELETE(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  await sairSuperadmin(request).catch(() => {});
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSaida() });
}
