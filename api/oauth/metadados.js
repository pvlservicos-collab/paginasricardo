// Descoberta automática do OAuth (o Claude lê estes endereços ao adicionar o conector):
//   /.well-known/oauth-protected-resource   → ?tipo=recurso
//   /.well-known/oauth-authorization-server → ?tipo=servidor
import { metadadosRecurso, metadadosServidor } from '../../lib/oauth.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, MCP-Protocol-Version' };

export function GET(request) {
  const tipo = new URL(request.url).searchParams.get('tipo');
  const corpo = tipo === 'recurso' ? metadadosRecurso(request) : metadadosServidor(request);
  return new Response(JSON.stringify(corpo), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CORS } });
}

export const OPTIONS = () => new Response(null, { status: 204, headers: CORS });
