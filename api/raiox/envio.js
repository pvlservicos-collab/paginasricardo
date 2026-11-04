// Recebe cada diagnóstico do quiz Raio-X (pública). O quiz manda text/plain sem CORS (sem preflight),
// com um id por visita: refazer o resultado sobrescreve em vez de duplicar. Responde 204 e pronto.
import { limparEnvio, salvarEnvio, ipDe } from '../../lib/raiox.mjs';

const vazio = (status = 204) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request) {
  const corpo = await request.text().catch(() => '');
  if (!corpo || corpo.length > 64 * 1024) return vazio(413);
  let d;
  try { d = JSON.parse(corpo); } catch { return vazio(400); }
  const e = limparEnvio(d);
  if (!e) return vazio(400);
  try {
    if (!(await salvarEnvio(e, ipDe(request)))) return vazio(429);
  } catch (err) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/raiox/envio', msg: err.message }));
    return vazio(503);
  }
  return vazio();
}
