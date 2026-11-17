// Pedidos de acesso (Rota do Bilhão e Central R1) — só o superadmin logado.
//   GET → { rota:[...], central:[...] }   POST { sistema:'rota'|'central', email, acao:'aprovar'|'recusar' }
import { json, erro, mesmaOrigem } from '../../lib/servidor.mjs';
import { superadminDe, listarPedidos, decidir } from '../../lib/aprovacao.mjs';

export async function GET(request) {
  try {
    if (!(await superadminDe(request))) return erro('Entre como superadmin.', 401);
    return json(await listarPedidos());
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/aprovacoes/pedidos', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

export async function POST(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  try {
    const quem = await superadminDe(request);
    if (!quem) return erro('Entre como superadmin.', 401);
    let d = {};
    try { d = await request.json(); } catch {}
    const r = await decidir(d.sistema, d.email, d.acao, quem);
    console.log(JSON.stringify({ tipo: 'evento', acao: 'acesso_' + r.status, sistema: r.sistema, email: r.email, usuario: quem, em: new Date().toISOString() }));
    return json(r);
  } catch (e) {
    if (e.status) return erro(e.message, e.status);
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/aprovacoes/pedidos', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}
