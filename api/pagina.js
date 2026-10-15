import { protegido, json, carregarConfig, salvarConfig, lerJson, auditar } from '../lib/servidor.mjs';
import { ipDe } from '../lib/auth.mjs';
import { atualizarPagina, excluirPagina } from '../lib/operacoes.mjs';
import { lerArquivo } from '../lib/store.mjs';
import { PASTA_PAGINAS, extrairCopy } from '../lib/core.mjs';

async function achar(slug) {
  if (typeof slug !== 'string' || !slug || slug.length > 200) throw Object.assign(new Error('Página não encontrada.'), { status: 404 });
  const cfg = await carregarConfig();
  const pagina = cfg.paginas.find((p) => p.slug === slug);
  if (!pagina) throw Object.assign(new Error('Página não encontrada.'), { status: 404 });
  return { cfg, pagina };
}

// HTML completo da página (para o editor).
export const GET = protegido(async (request, url) => {
  const { pagina } = await achar(url.searchParams.get('slug'));
  const html = await lerArquivo(`${PASTA_PAGINAS}/${pagina.arquivo}`);
  return json({ pagina, html: html || '', copy: html ? extrairCopy(html) : null });
});

const quem = (usuario, request) => ({ login: usuario.login, papel: usuario.papel, ip: ipDe(request), origem: 'painel', hostAtual: (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, '') });

// Troca o HTML (copiar e colar no painel).
export const PUT = protegido(async (request, url, usuario) => {
  const d = await lerJson(request);
  await atualizarPagina(d.slug, { html: d.html }, quem(usuario, request));
  return json({ ok: true, sha: null });
});

// Ajustes: título, URL, ativa/desativada, domínio, pixel, Clarity, redirecionamento, notas, copy do criativo.
export const PATCH = protegido(async (request, url, usuario) => {
  const d = await lerJson(request);
  const { pagina } = await atualizarPagina(d.slug, {
    titulo: d.titulo, url: d.url, manterRedirecionamento: d.manterRedirecionamento, ativa: d.ativa,
    redirecionarInativaPara: d.redirecionarInativaPara, notas: d.notas, criativo: d.criativo,
    dominio: d.dominio, pixel: d.pixel, clarity: d.clarity, gtm: d.gtm,
  }, quem(usuario, request));
  return json({ ok: true, sha: null, pagina });
});

// Duplicar.
export const POST = protegido(async (request, url, usuario) => {
  const d = await lerJson(request);
  const { cfg, pagina } = await achar(d.slug);
  const html = await lerArquivo(`${PASTA_PAGINAS}/${pagina.arquivo}`);
  const base = `${pagina.slug}-copia`;
  let arquivo = `${base}.html`, n = 2;
  const usados = new Set(cfg.paginas.map((p) => p.arquivo));
  while (usados.has(arquivo)) arquivo = `${base}-${n++}.html`;
  const slug = arquivo.replace(/\.html$/, '');
  cfg.paginas.push({
    ...pagina, slug, arquivo, url: slug, titulo: `${pagina.titulo} (cópia)`, ativa: false,
    ordem: Math.max(...cfg.paginas.map((p) => p.ordem || 0)) + 1,
    criativo: { ...pagina.criativo },
  });
  const r = await salvarConfig(cfg, `Cópia de /${pagina.url}`, [{ caminho: `${PASTA_PAGINAS}/${arquivo}`, conteudo: html || '' }]);
  await auditar(usuario, 'pagina_duplicada', { de: pagina.url, para: slug }, request);
  return json({ ok: true, sha: r.sha, slug });
});

// Excluir de vez.
export const DELETE = protegido(async (request, u, usuario) => {
  await excluirPagina(u.searchParams.get('slug'), quem(usuario, request));
  return json({ ok: true, sha: null });
});
