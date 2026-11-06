// Publicação em lote das páginas estáticas (ver lib/publicacao.mjs).
//   GET com Authorization: Bearer CRON_SECRET (Vercel Cron, a cada minuto) → publica se tiver alteração parada há 2 min
//   GET logado no painel → situação: { estado: 'no_ar' | 'aguardando' | 'publicando', ... }
import crypto from 'node:crypto';
import { protegido, json, erro } from '../lib/servidor.mjs';
import { publicarSePreciso, situacao } from '../lib/publicacao.mjs';

function ehCron(request) {
  const s = process.env.CRON_SECRET;
  const a = request.headers.get('authorization') || '';
  if (!s || a.length !== `Bearer ${s}`.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(`Bearer ${s}`));
}

const doPainel = protegido(async () => json(await situacao()));

export async function GET(request) {
  if (!ehCron(request)) return doPainel(request);
  try {
    const r = await publicarSePreciso();
    if (r.fez === 'publicou') console.log(JSON.stringify({ tipo: 'evento', acao: 'publicacao_disparada', mudouEm: r.mudouEm }));
    return json(r);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/publicar', msg: e.message }));
    return erro('Falha ao publicar: ' + e.message, 502);
  }
}
