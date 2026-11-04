// Nota do Google PageSpeed por página: mede pela API, guarda no banco (tabela "pagespeed") e
// devolve um resumo com o diagnóstico (usado na tag de nota, no filtro e no "Copiar relatório").
import { sql, usandoBanco } from './store.mjs';
import { linkDaPagina } from './core.mjs';

export const NOTA_MINIMA = 90;
const CHAVE = () => process.env.PAGESPEED_API_KEY || process.env.PSI_API_KEY || '';

let pronto = null;
function preparar() {
  if (!usandoBanco) return Promise.resolve();
  if (!pronto) {
    pronto = sql`create table if not exists pagespeed (
      slug text not null,
      estrategia text not null,
      nota int,
      dados jsonb not null,
      medido_em timestamptz not null default now(),
      primary key (slug, estrategia)
    )`.catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

const ms = (v) => (v == null ? null : Math.round(v));
const kb = (v) => (v == null ? null : Math.round(v / 1024));

// Resume o resultado do Lighthouse no que interessa para decidir o que otimizar.
function resumir(d, alvo, estrategia) {
  const lh = d.lighthouseResult || {};
  const cat = lh.categories || {};
  const a = lh.audits || {};
  const nota = (c) => (c?.score == null ? null : Math.round(c.score * 100));
  const lista = (v) => (Array.isArray(v) ? v : []); // alguns diagnósticos trazem "items" como objeto (checklist)
  const itens = (id) => lista(a[id]?.details?.items);
  const lcpEl = itens('largest-contentful-paint-element')[0]?.items?.[0]?.node?.snippet
    || itens('largest-contentful-paint-element')[0]?.node?.snippet || '';
  const fases = lista(itens('lcp-breakdown-insight')[0]?.items || itens('lcp-phases'))
    .map((x) => ({ fase: x.label || x.subpart || x.phase, ms: ms(x.duration ?? x.timing) }))
    .filter((x) => x.fase && x.ms != null);
  const terceiros = (itens('third-party-summary').length ? itens('third-party-summary') : itens('third-parties-insight'))
    .map((x) => ({ nome: x.entity?.text || x.entity || '?', cpu: ms(x.mainThreadTime), kb: kb(x.transferSize) }))
    .filter((x) => x.cpu > 0 || x.kb > 0).sort((x, y) => y.cpu - x.cpu).slice(0, 8);
  const pesados = itens('total-byte-weight').slice(0, 8).map((x) => ({ url: String(x.url || '').slice(0, 160), kb: kb(x.totalBytes) }));
  const tarefas = itens('long-tasks').slice(0, 6).map((x) => ({ url: String(x.url || '').slice(0, 120), inicio: ms(x.startTime), ms: ms(x.duration) }));
  const corrigir = Object.values(a)
    .filter((x) => x && x.score != null && x.score < 0.9 && x.scoreDisplayMode !== 'informative' && x.scoreDisplayMode !== 'notApplicable'
      && (x.details?.overallSavingsMs > 0 || x.details?.overallSavingsBytes > 0 || x.metricSavings))
    .map((x) => ({
      titulo: x.title, valor: x.displayValue || '',
      ganhoMs: ms(x.details?.overallSavingsMs || x.metricSavings?.LCP || x.metricSavings?.FCP || x.metricSavings?.TBT || 0),
      ganhoKb: kb(x.details?.overallSavingsBytes || 0),
      itens: lista(x.details?.items).slice(0, 4).map((i) => String(i.url || i.node?.snippet || i.source?.url || i.entity || '').slice(0, 140)).filter(Boolean),
    }))
    .sort((x, y) => (y.ganhoMs || 0) - (x.ganhoMs || 0) || (y.ganhoKb || 0) - (x.ganhoKb || 0)).slice(0, 10);
  const campo = d.loadingExperience?.metrics ? Object.fromEntries(Object.entries(d.loadingExperience.metrics).map(([k, v]) => [k, { p75: v.percentile, cat: v.category }])) : null;
  return {
    url: alvo, estrategia, em: new Date().toISOString(),
    performance: nota(cat.performance), acessibilidade: nota(cat.accessibility), praticas: nota(cat['best-practices']), seo: nota(cat.seo),
    fcp: a['first-contentful-paint']?.displayValue, lcp: a['largest-contentful-paint']?.displayValue,
    tbt: a['total-blocking-time']?.displayValue, cls: a['cumulative-layout-shift']?.displayValue, si: a['speed-index']?.displayValue,
    peso: kb(a['total-byte-weight']?.numericValue), requisicoes: itens('network-requests').length,
    lcpElemento: String(lcpEl).slice(0, 300), lcpFases: fases, terceiros, pesados, tarefas, corrigir, campo,
  };
}

// Mede uma página na API do PageSpeed e grava o resultado. Lança erro se a API falhar.
export async function medirPagina(p, cfg, estrategia = 'mobile', hostAtual = '') {
  const alvo = linkDaPagina(p, cfg, hostAtual);
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  // parâmetro só para furar o cache da CDN logo depois de publicar
  api.searchParams.set('url', `${alvo}?psi=${Date.now().toString(36)}`);
  api.searchParams.set('strategy', estrategia === 'desktop' ? 'desktop' : 'mobile');
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) api.searchParams.append('category', c);
  if (CHAVE()) api.searchParams.set('key', CHAVE());
  // 3 rodadas em paralelo e guarda a mediana: na mesma página, uma rodada só varia ±10 pontos
  // (o tempo de execução do GTM e do Pixel da Meta muda de uma rodada para outra)
  const uma = async (i) => {
    const u = new URL(api);
    u.searchParams.set('url', `${alvo}?psi=${Date.now().toString(36)}${i}`);
    const r = await fetch(u, { signal: AbortSignal.timeout(55000) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`PageSpeed: ${d.error?.message || r.status}`), { status: 502 });
    return resumir(d, alvo, estrategia);
  };
  const res = (await Promise.allSettled([0, 1, 2].map(uma)));
  const ok = res.filter((x) => x.status === 'fulfilled' && x.value.performance != null).map((x) => x.value).sort((a, b) => a.performance - b.performance);
  if (!ok.length) throw res.find((x) => x.status === 'rejected')?.reason || new Error('PageSpeed sem resultado.');
  const resultado = { ...ok[Math.floor((ok.length - 1) / 2)], rodadas: ok.map((x) => x.performance) };
  await gravarNota(p.slug, estrategia, resultado);
  return resultado;
}

export async function gravarNota(slug, estrategia, resultado) {
  if (!usandoBanco) return;
  await preparar();
  await sql`insert into pagespeed (slug, estrategia, nota, dados, medido_em) values (${slug}, ${estrategia}, ${resultado.performance}, ${JSON.stringify(resultado)}, now())
    on conflict (slug, estrategia) do update set nota = excluded.nota, dados = excluded.dados, medido_em = now()`;
}

// { 'slug:mobile': resultado, ... }
export async function listarNotas() {
  if (!usandoBanco) return {};
  await preparar();
  const linhas = await sql`select slug, estrategia, dados from pagespeed`;
  return Object.fromEntries(linhas.map((l) => [`${l.slug}:${l.estrategia}`, typeof l.dados === 'string' ? JSON.parse(l.dados) : l.dados]));
}

// Marca a página como "medindo" (o painel mostra isso até a nota chegar).
export async function marcarMedindo(slug, estrategia = 'mobile') {
  if (!usandoBanco) return;
  await preparar();
  await sql`insert into pagespeed (slug, estrategia, nota, dados, medido_em) values (${slug}, ${estrategia}, null, ${JSON.stringify({ medindo: true, em: new Date().toISOString() })}, now())
    on conflict (slug, estrategia) do update set dados = pagespeed.dados || ${JSON.stringify({ medindo: true, medindoDesde: new Date().toISOString() })}::jsonb`;
}

// A medição falhou: mantém a última nota boa e só registra o erro.
export async function marcarErro(slug, estrategia, msg) {
  if (!usandoBanco) return;
  await preparar();
  await sql`update pagespeed set dados = (dados - 'medindo' - 'medindoDesde') || ${JSON.stringify({ erro: String(msg).slice(0, 300), erroEm: new Date().toISOString() })}::jsonb
    where slug = ${slug} and estrategia = ${estrategia}`;
}

export async function apagarNotas(slug) {
  if (!usandoBanco) return;
  await preparar();
  await sql`delete from pagespeed where slug = ${slug}`;
}

// Agenda a medição para depois da resposta (na Vercel). Fora dela, não faz nada.
export async function agendarMedicao(p, cfg, hostAtual = '') {
  if (!process.env.VERCEL || !p?.ativa || p.lab) return;
  try {
    const { waitUntil } = await import('@vercel/functions');
    await marcarMedindo(p.slug).catch(() => {});
    waitUntil(medirPagina(p, cfg, 'mobile', hostAtual).catch(async (e) => {
      console.error(JSON.stringify({ tipo: 'erro', rota: 'pagespeed-auto', slug: p.slug, msg: e.message }));
      await marcarErro(p.slug, 'mobile', e.message).catch(() => {});
    }));
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: 'pagespeed-agendar', msg: e.message }));
  }
}
