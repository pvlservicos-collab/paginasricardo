// GET /api/rota/estado → { estado|null }   PUT /api/rota/estado { estado } → { ok }   (Authorization: Bearer <token>)
import { json, erro, lerToken, getEstado, setEstado } from '../../lib/rota/base.mjs';

const LIMITE = 400 * 1024;

export const GET = async (request) => {
  const email = lerToken(request);
  if (!email) return erro('Sessão expirada. Entre de novo.', 401);
  return json({ estado: await getEstado(email) });
};

export const PUT = async (request) => {
  const email = lerToken(request);
  if (!email) return erro('Sessão expirada. Entre de novo.', 401);
  const txt = await request.text();
  if (txt.length > LIMITE) return erro('Dados grandes demais.', 413);
  let c;
  try { c = JSON.parse(txt); } catch { return erro('JSON inválido.', 400); }
  if (!c || typeof c.estado !== 'object' || c.estado === null) return erro('Faltou o estado.', 400);
  await setEstado(email, { ...c.estado, atualizado: new Date().toISOString() });
  return json({ ok: true });
};
