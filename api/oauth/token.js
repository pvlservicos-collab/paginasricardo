// Troca o código de autorização por tokens e renova tokens (OAuth 2.1).
import { trocarToken } from '../../lib/oauth.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const resp = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...CORS } });

export async function POST(request) {
  const t = await request.text();
  if (t.length > 8192) return resp({ error: 'invalid_request' }, 400);
  let p = {};
  if (/application\/json/i.test(request.headers.get('content-type') || '')) { try { p = JSON.parse(t); } catch {} }
  else p = Object.fromEntries(new URLSearchParams(t));
  let basic = null;
  const auth = request.headers.get('authorization') || '';
  if (/^Basic /i.test(auth)) {
    const [id, segredo] = Buffer.from(auth.slice(6), 'base64').toString().split(':').map((x) => decodeURIComponent(x || ''));
    basic = { id, segredo };
  }
  try {
    return resp(await trocarToken(p, request, basic));
  } catch (e) {
    if (!e.oauth) console.error(JSON.stringify({ tipo: 'erro', rota: '/api/oauth/token', msg: e.message }));
    return resp({ error: e.oauth || 'server_error', error_description: e.oauth ? e.message : 'Erro inesperado.' }, e.status || (e.oauth ? 400 : 500));
  }
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
