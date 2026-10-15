import { protegido, json, erro, carregarConfig, dominioBase, redis, temRedis } from '../lib/servidor.mjs';
import { normalizarUrl } from '../lib/core.mjs';

// Nota do Google PageSpeed (Lighthouse) por página. Guarda o último resultado no Redis.
export const GET = protegido(async (request, url) => {
  const cfg = await carregarConfig();
  if (!url.searchParams.get('slug')) {
    if (!temRedis) return json({ notas: {} });
    const chaves = cfg.paginas.flatMap((p) => [`psi:${p.slug}:mobile`, `psi:${p.slug}:desktop`]);
    const valores = await redis(...chaves.map((k) => ['GET', k]));
    const notas = {};
    chaves.forEach((k, i) => { if (valores[i]) notas[k.slice(4)] = JSON.parse(valores[i]); });
    return json({ notas });
  }
  const p = cfg.paginas.find((x) => x.slug === url.searchParams.get('slug'));
  if (!p) return erro('Página não encontrada.', 404);
  const estrategia = url.searchParams.get('estrategia') === 'desktop' ? 'desktop' : 'mobile';
  const alvo = `${dominioBase(cfg, request)}/${normalizarUrl(p.url)}`;
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', alvo);
  api.searchParams.set('strategy', estrategia);
  for (const c of ['performance', 'accessibility', 'best-practices', 'seo']) api.searchParams.append('category', c);
  if (process.env.PAGESPEED_API_KEY) api.searchParams.set('key', process.env.PAGESPEED_API_KEY);
  const r = await fetch(api, { signal: AbortSignal.timeout(55000) });
  const d = await r.json();
  if (!r.ok) return erro(`PageSpeed: ${d.error?.message || r.status}`, 502);
  const cat = d.lighthouseResult?.categories || {};
  const aud = d.lighthouseResult?.audits || {};
  const nota = (c) => (c ? Math.round(c.score * 100) : null);
  const resultado = {
    performance: nota(cat.performance), acessibilidade: nota(cat.accessibility),
    praticas: nota(cat['best-practices']), seo: nota(cat.seo),
    lcp: aud['largest-contentful-paint']?.displayValue, cls: aud['cumulative-layout-shift']?.displayValue,
    tbt: aud['total-blocking-time']?.displayValue, fcp: aud['first-contentful-paint']?.displayValue,
    url: alvo, em: new Date().toISOString(),
  };
  if (temRedis) await redis(['SET', `psi:${p.slug}:${estrategia}`, JSON.stringify(resultado)]);
  return json({ slug: p.slug, estrategia, resultado });
});
