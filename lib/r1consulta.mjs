// Sincroniza os dados do Painel Grupo R1 (https://dashboard-grupo-r1.vercel.app/api/consulta, somente leitura)
// com a tabela criacao_r1: uma linha por anúncio por dia (Meta + vendas da Guru).
//   R1_CONSULTA_URL   endereço da API (padrão: o de produção)
//   R1_CONSULTA_TOKEN token Bearer (nunca no repositório)
// Uma página de 2.000 linhas leva ~12 s na API deles; 2 dias ≈ 1.800 linhas, 7 dias ≈ 6.000.
import crypto from 'node:crypto';
import { sql } from './store.mjs';
import { preparar, gravarEstado, diaBR, falha } from './criacao.mjs';

const URL_R1 = () => (process.env.R1_CONSULTA_URL || 'https://dashboard-grupo-r1.vercel.app/api/consulta').trim();
export const temR1 = () => Boolean((process.env.R1_CONSULTA_TOKEN || '').trim());

export async function consultar(corpo) {
  if (!temR1()) throw falha('Falta a variável R1_CONSULTA_TOKEN.', 503);
  const r = await fetch(URL_R1(), {
    method: 'POST',
    headers: { authorization: 'Bearer ' + process.env.R1_CONSULTA_TOKEN.trim(), 'content-type': 'application/json' },
    body: JSON.stringify(corpo), signal: AbortSignal.timeout(90000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw falha(`O Painel R1 respondeu ${r.status}${d.erro || d.error ? ': ' + (d.erro || d.error) : ''}`, 502);
  return d;
}

const t = (v, max = 400) => (v == null ? '' : String(v).slice(0, max));
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const i = (v) => Math.max(0, Math.round(n(v)));
const COLS = ['anuncio_id', 'dia', 'conta', 'visao', 'cidade', 'evento', 'campanha_id', 'campanha', 'conjunto_id', 'conjunto', 'anuncio', 'link',
  'investimento', 'impressoes', 'alcance', 'cliques', 'cliques_link', 'visitantes', 'compras_pixel', 'vendas_guru', 'ingressos_guru', 'receita_guru'];
const TIPOS = ['text', 'date', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text',
  'numeric', 'bigint', 'bigint', 'bigint', 'bigint', 'bigint', 'int', 'int', 'int', 'numeric'];

function linha(l) {
  // sem ID do anúncio (ex.: "sem origem rastreada"): chave estável a partir dos nomes
  const id = t(l.anuncio_id, 60) || 'x' + crypto.createHash('sha1').update([l.conta, l.visao, l.campanha, l.conjunto, l.anuncio].join('|')).digest('hex').slice(0, 20);
  return [id, t(l.dia, 10), t(l.conta, 60), t(l.visao, 40) || 'outros', t(l.cidade, 80), t(l.evento, 120), t(l.campanha_id, 60), t(l.campanha), t(l.conjunto_id, 60), t(l.conjunto),
    t(l.anuncio), t(l.link, 500), n(l.investimento), i(l.impressoes), i(l.alcance), i(l.cliques), i(l.cliques_link), i(l.visitantes),
    i(l.compras_pixel), i(l.vendas_guru), i(l.ingressos_guru), n(l.receita_guru)];
}

// Busca os últimos `dias` dias (hoje incluído, fuso de Brasília) e grava. Só apaga linhas sumidas se todas as páginas vieram.
export async function sincronizar(dias = 2) {
  await preparar();
  const d = Math.min(31, Math.max(1, Number(dias) || 2));
  const desde = diaBR(d - 1), ate = diaBR(0), inicio = Date.now();
  const brutas = [];
  let pagina = 1, paginas = 1;
  do {
    const r = await consultar({ recurso: 'anuncios', desde, ate, por_dia: true, pagina, por_pagina: 2000 });
    brutas.push(...(Array.isArray(r.linhas) ? r.linhas : []));
    paginas = Number(r.paginas) || 1;
    pagina++;
  } while (pagina <= paginas && pagina <= 40);
  const completo = pagina > paginas;
  // a mesma (anúncio, dia) pode vir repetida entre páginas: fica a última
  const porChave = new Map();
  for (const l of brutas) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(l.dia || ''))) continue; const v = linha(l); porChave.set(v[0] + '|' + v[1], v); }
  const valores = [...porChave.values()];
  for (let k = 0; k < valores.length; k += 1000) {
    const lote = valores.slice(k, k + 1000);
    const arrays = COLS.map((_, c) => lote.map((v) => v[c]));
    await sql.query(`insert into criacao_r1 (${COLS.join(', ')})
      select * from unnest(${COLS.map((_, c) => `$${c + 1}::${TIPOS[c]}[]`).join(', ')})
      on conflict (anuncio_id, dia) do update set ${COLS.slice(2).map((c) => `${c} = excluded.${c}`).join(', ')}, atualizado_em = now()`, arrays);
  }
  let apagadas = 0;
  if (completo) {
    const r = await sql.query(`delete from criacao_r1 where dia between $1::date and $2::date and not ((anuncio_id || '|' || to_char(dia, 'YYYY-MM-DD')) = any($3::text[])) returning 1`, [desde, ate, [...porChave.keys()]]);
    apagadas = r.length;
  }
  await sql`delete from criacao_r1 where dia < current_date - 120`;
  const em = new Date().toISOString();
  const res = { em, desde, ate, linhas: valores.length, paginas, completo, apagadas, ms: Date.now() - inicio };
  await gravarEstado('sync', { ...res, ...(d >= 7 && completo ? { semana_em: em } : {}) });
  return res;
}
