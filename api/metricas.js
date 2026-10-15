import { protegido, json, carregarConfig, redis, temRedis, hashParaObjeto } from '../lib/servidor.mjs';
import { lerArquivo } from '../lib/store.mjs';
import { normalizarUrl, PASTA_PAGINAS, extrairCopy } from '../lib/core.mjs';

const diaBR = (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);

function ultimosDias(n) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) dias.push(diaBR(Date.now() - i * 864e5));
  return dias;
}

// Leads do HubSpot agrupados pela URL onde o formulário foi enviado.
async function leadsHubspot(formIds, desde) {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token || !formIds.length) return null;
  const porCaminho = {}; // caminho -> { dia: n }
  for (const id of formIds) {
    let after = null;
    for (let pagina = 0; pagina < 60; pagina++) {
      const u = new URL(`https://api.hubapi.com/form-integrations/v1/submissions/forms/${id}`);
      u.searchParams.set('limit', '50');
      if (after) u.searchParams.set('after', after);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HubSpot ${r.status}: verifique o HUBSPOT_TOKEN (escopo "forms").`);
      const d = await r.json();
      let acabou = false;
      for (const s of d.results || []) {
        if (s.submittedAt < desde) { acabou = true; continue; }
        let caminho = '/';
        try { caminho = new URL(s.pageUrl).pathname.replace(/\/+$/, '').toLowerCase() || '/'; } catch {}
        const dia = diaBR(s.submittedAt);
        (porCaminho[caminho] ||= {})[dia] = (porCaminho[caminho][dia] || 0) + 1;
      }
      after = d.paging?.next?.after;
      if (acabou || !after) break;
    }
  }
  return porCaminho;
}

export const GET = protegido(async (request, url) => {
  const n = Math.min(90, Math.max(1, Number(url.searchParams.get('dias')) || 7));
  const dias = ultimosDias(n);
  const desde = Date.parse(`${dias[0]}T00:00:00-03:00`);
  const cfg = await carregarConfig();

  // cada página soma as visitas da URL atual e das URLs antigas que redirecionam para ela
  const caminhosDe = (p) => {
    const atual = normalizarUrl(p.url);
    return [`/${atual}`, ...cfg.redirecionamentos.filter((r) => normalizarUrl(r.para) === atual).map((r) => `/${normalizarUrl(r.de)}`)];
  };

  const avisos = [];
  let brutos = {};
  if (temRedis) {
    const chaves = [...new Set(cfg.paginas.flatMap(caminhosDe))];
    const cmds = chaves.flatMap((c) => [['HGETALL', `v:${c}`], ['HGETALL', `d:${c}`], ['HGETALL', `f:${c}`], ['HGETALL', `c:${c}`]]);
    const res = await redis(...cmds);
    chaves.forEach((c, i) => {
      brutos[c] = { v: hashParaObjeto(res[i * 4]), d: hashParaObjeto(res[i * 4 + 1]), f: hashParaObjeto(res[i * 4 + 2]), c: hashParaObjeto(res[i * 4 + 3]) };
    });
  } else avisos.push('Visitas desligadas: conecte o Upstash Redis no projeto da Vercel (Storage → Upstash).');

  let leads = null;
  if (process.env.HUBSPOT_TOKEN) {
    const ids = new Set();
    await Promise.all(cfg.paginas.map(async (p) => {
      const html = await lerArquivo(`${PASTA_PAGINAS}/${p.arquivo}`);
      if (html) extrairCopy(html).formIds.forEach((i) => ids.add(i));
    }));
    let cache = null;
    const chaveCache = `hs:${n}:${[...ids].sort().join(',')}`;
    if (temRedis) [cache] = await redis(['GET', chaveCache]);
    if (cache) leads = JSON.parse(cache);
    else {
      try {
        leads = await leadsHubspot([...ids], desde);
        if (temRedis) await redis(['SET', chaveCache, JSON.stringify(leads), 'EX', 600]);
      } catch (e) { avisos.push(e.message); }
    }
  } else avisos.push('Leads desligados: adicione HUBSPOT_TOKEN na Vercel para ver as inscrições por página.');

  const somar = (alvo, obj) => { for (const [k, v] of Object.entries(obj || {})) alvo[k] = (alvo[k] || 0) + (Number(v) || 0); };
  const paginas = cfg.paginas.map((p) => {
    const visitasDia = {}, leadsDia = {}, disp = {}, fontes = {}, campanhas = {};
    for (const c of caminhosDe(p)) {
      const b = brutos[c];
      if (b) { somar(visitasDia, b.v); somar(disp, b.d); somar(fontes, b.f); somar(campanhas, b.c); }
      if (leads?.[c]) somar(leadsDia, leads[c]);
    }
    const serieV = dias.map((d) => visitasDia[d] || 0);
    const serieL = dias.map((d) => leadsDia[d] || 0);
    const visitas = serieV.reduce((a, b) => a + b, 0);
    const inscricoes = serieL.reduce((a, b) => a + b, 0);
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return {
      slug: p.slug, visitas, leads: leads ? inscricoes : null,
      conversao: leads && visitas ? inscricoes / visitas : null,
      serieVisitas: serieV, serieLeads: leads ? serieL : null,
      dispositivos: disp, fontes: top(fontes), campanhas: top(campanhas),
    };
  });

  return json({ dias, paginas, avisos, temRedis, temHubspot: Boolean(process.env.HUBSPOT_TOKEN) });
}, { admin: true }); // Métricas: em construção (só admin)
