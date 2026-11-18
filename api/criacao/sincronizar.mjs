// Rotina do dashboard de criativos (Vercel Cron, a cada 15 min; Authorization: Bearer CRON_SECRET):
//   1. busca no Painel Grupo R1 hoje e ontem (e os últimos 7 dias uma vez por hora) → tabela criacao_r1
//   2. a cada 6 h, se a IA da VPS não mandou sugestões nesse tempo, o Claude lê as métricas e grava ideias novas
import crypto from 'node:crypto';
import { json, erro } from '../../lib/servidor.mjs';
import { lerEstado, falha } from '../../lib/criacao.mjs';
import { sincronizar, temR1 } from '../../lib/r1consulta.mjs';
import { analisar, temMaquina } from '../../lib/criacao-ia.mjs';
import { sql } from '../../lib/store.mjs';

function ehCron(request) {
  const s = process.env.CRON_SECRET;
  const a = request.headers.get('authorization') || '';
  if (!s || a.length !== `Bearer ${s}`.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(`Bearer ${s}`));
}
const HORA = 3600e3;
const passou = (iso, ms) => !iso || Date.now() - Date.parse(iso) > ms;

export async function GET(request) {
  if (!ehCron(request)) return erro('Não autorizado.', 401);
  const saida = {};
  try {
    if (!temR1()) throw falha('Falta R1_CONSULTA_TOKEN.', 503);
    const ult = await lerEstado('sync');
    saida.sync = await sincronizar(passou(ult && ult.semana_em, 55 * 60e3) ? 7 : 2);
  } catch (e) { saida.sync = { erro: e.message }; }
  try {
    if (temMaquina()) {
      const auto = await lerEstado('analise_auto');
      const [vps] = await sql`select max(criado_em) as em from criacao_insights where origem not in ('claude', 'exemplo')`;
      if (passou(auto && auto.ultima_em, 6 * HORA) && passou(vps && vps.em && new Date(vps.em).toISOString(), 6 * HORA)) {
        saida.analise = { sugestoes: await analisar({ dias: 7, quem: 'automática' }) };
      }
    }
  } catch (e) { saida.analise = { erro: e.message }; }
  console.log(JSON.stringify({ tipo: 'cron-criacao', ...saida, em: new Date().toISOString() }));
  return json({ ok: !saida.sync?.erro, ...saida });
}
