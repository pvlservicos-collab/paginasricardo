import crypto from 'node:crypto';
import { protegido, json, erro, carregarConfig, lerJson, auditar } from '../lib/servidor.mjs';
import { ipDe } from '../lib/auth.mjs';
import { atualizarPagina } from '../lib/operacoes.mjs';
import { medirPagina, listarNotas, marcarMedindo, marcarErro, NOTA_MINIMA } from '../lib/pagespeed.mjs';
import { otimizarHtml, guardarBackup, ultimoBackup, htmlAtual } from '../lib/otimizar.mjs';

// Nota do Google PageSpeed por página.
//   GET                      → todas as notas guardadas ({ 'slug:mobile': resultado })
//   GET ?slug=X&estrategia=  → mede agora (botão "Medir")
//   GET ?cron=1              → (Vercel Cron, todo dia) mede todas as páginas ativas
//   POST { acao: 'otimizar' | 'desfazer', slug } → botão "Otimizar" / "Desfazer otimização"

const hostDe = (request) => (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, '');

// Chamadas do cron (e das medições que ele dispara) vêm com Authorization: Bearer CRON_SECRET.
function ehCron(request) {
  const s = process.env.CRON_SECRET;
  const a = request.headers.get('authorization') || '';
  if (!s || a.length !== `Bearer ${s}`.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(`Bearer ${s}`));
}

async function rotaCron(request, url) {
  const cfg = await carregarConfig();
  // uma página: mede em segundo plano e responde na hora (cada medição roda na sua própria função)
  const slug = url.searchParams.get('slug');
  if (slug) {
    const p = cfg.paginas.find((x) => x.slug === slug);
    if (!p) return erro('Página não encontrada.', 404);
    const { waitUntil } = await import('@vercel/functions');
    await marcarMedindo(p.slug).catch(() => {});
    waitUntil(medirPagina(p, cfg, 'mobile').catch((e) => marcarErro(p.slug, 'mobile', e.message).catch(() => {})));
    return json({ ok: true, slug }, 202);
  }
  // todas: dispara uma medição por página, com um respiro entre elas (cota da API do Google)
  const alvos = cfg.paginas.filter((p) => p.ativa && !p.lab);
  const base = `https://${hostDe(request)}`;
  const auth = request.headers.get('authorization');
  const pedidos = [];
  for (const p of alvos) {
    pedidos.push(fetch(`${base}/api/pagespeed?cron=1&slug=${encodeURIComponent(p.slug)}`, { headers: { authorization: auth }, signal: AbortSignal.timeout(15000) }).then((r) => r.status));
    await new Promise((r) => setTimeout(r, 350));
  }
  const res = await Promise.allSettled(pedidos); // cada um responde na hora (202); a medição continua lá
  const aceitas = res.filter((r) => r.status === 'fulfilled' && r.value === 202).length;
  console.log(JSON.stringify({ tipo: 'cron-pagespeed', paginas: alvos.length, aceitas }));
  return json({ ok: true, paginas: alvos.length, aceitas });
}

const painel = protegido(async (request, url) => {
  const cfg = await carregarConfig();
  if (!url.searchParams.get('slug')) return json({ notas: await listarNotas(), minima: NOTA_MINIMA });
  const p = cfg.paginas.find((x) => x.slug === url.searchParams.get('slug'));
  if (!p) return erro('Página não encontrada.', 404);
  const estrategia = url.searchParams.get('estrategia') === 'desktop' ? 'desktop' : 'mobile';
  const resultado = await medirPagina(p, cfg, estrategia, hostDe(request));
  return json({ slug: p.slug, estrategia, resultado });
});

export const GET = (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get('cron')) {
    if (!ehCron(request)) return erro('Não autorizado.', 401);
    return rotaCron(request, url);
  }
  return painel(request);
};

export const POST = protegido(async (request, url, usuario) => {
  const d = await lerJson(request);
  const cfg = await carregarConfig();
  const p = cfg.paginas.find((x) => x.slug === d.slug);
  if (!p) return erro('Página não encontrada.', 404);
  const quem = { login: usuario.login, papel: usuario.papel, ip: ipDe(request), origem: 'painel', hostAtual: hostDe(request) };

  if (d.acao === 'otimizar') {
    const html = await htmlAtual(p);
    if (!html) return erro('Não achei o HTML da página.', 404);
    const r = await otimizarHtml(html);
    if (!r.mudou) return json({ ok: true, mudou: false, mudancas: r.mudancas });
    const backup = await guardarBackup(p, html);
    await atualizarPagina(p.slug, { html: r.html }, quem); // grava e já agenda a nova medição
    await auditar(usuario, 'pagina_otimizada', { url: p.url, mudancas: r.mudancas, backup }, request);
    return json({ ok: true, mudou: true, mudancas: r.mudancas, backup });
  }

  if (d.acao === 'desfazer') {
    const b = await ultimoBackup(p);
    if (!b?.html) return erro('Não há otimização para desfazer nesta página.', 404);
    await atualizarPagina(p.slug, { html: b.html }, quem);
    await auditar(usuario, 'otimizacao_desfeita', { url: p.url, backup: b.nome }, request);
    return json({ ok: true, backup: b.nome });
  }

  return erro('Ação desconhecida.');
});
