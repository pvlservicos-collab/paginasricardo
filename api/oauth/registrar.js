// Registro dinâmico de cliente (RFC 7591): o Claude se cadastra sozinho ao adicionar o conector.
import { registrarCliente } from '../../lib/oauth.mjs';
import { registrar, ipDe } from '../../lib/auth.mjs';
import { sql, usandoBanco } from '../../lib/store.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const resp = (corpo, status) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS } });

export async function POST(request) {
  let d;
  try {
    const t = await request.text();
    if (t.length > 8192) return resp({ error: 'invalid_client_metadata', error_description: 'Cadastro grande demais.' }, 400);
    d = JSON.parse(t);
  } catch { return resp({ error: 'invalid_client_metadata', error_description: 'JSON inválido.' }, 400); }
  try {
    // o cadastro é aberto (o Claude se cadastra sozinho): no máximo 20 por hora por IP, para ninguém encher o banco
    if (usandoBanco) {
      const [{ n }] = await sql`select count(*)::int as n from eventos where acao = 'oauth_cliente_registrado' and ip = ${ipDe(request)} and em > now() - interval '1 hour'`.catch(() => [{ n: 0 }]);
      if (n >= 20) return resp({ error: 'temporarily_unavailable', error_description: 'Muitos cadastros. Tente mais tarde.' }, 429);
    }
    const c = await registrarCliente(d);
    await registrar('oauth_cliente_registrado', { ip: ipDe(request), detalhe: { client_id: c.client_id, nome: c.client_name, redirects: c.redirect_uris } });
    return resp(c, 201);
  } catch (e) {
    return resp({ error: e.oauth || 'invalid_client_metadata', error_description: e.message }, e.status || 400);
  }
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
