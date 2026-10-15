import { protegido, json, erro, carregarConfig, salvarConfig } from '../lib/servidor.mjs';
import { lerArquivo } from '../lib/store.mjs';
import { normalizarUrl, PASTA_PAGINAS, PASTA_CRIATIVOS, extrairCopy } from '../lib/core.mjs';

async function achar(slug) {
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

// Troca o HTML (copiar e colar no painel).
export const PUT = protegido(async (request) => {
  const d = await request.json();
  const { cfg, pagina } = await achar(d.slug);
  if (!d.html || d.html.trim().length < 20) return erro('O HTML está vazio.');
  const r = await salvarConfig(cfg, `Conteúdo atualizado: /${pagina.url}`, [
    { caminho: `${PASTA_PAGINAS}/${pagina.arquivo}`, conteudo: d.html },
  ]);
  return json({ ok: true, sha: r.sha });
});

// Configurações: título, URL, ativa/desativada, redirecionamento, notas, copy do criativo.
export const PATCH = protegido(async (request) => {
  const d = await request.json();
  const { cfg, pagina } = await achar(d.slug);
  const mudancas = [];
  if (d.titulo !== undefined && d.titulo !== pagina.titulo) { pagina.titulo = String(d.titulo).trim() || pagina.titulo; mudancas.push('título'); }
  if (d.url !== undefined) {
    const nova = normalizarUrl(d.url), antiga = normalizarUrl(pagina.url);
    if (!nova) return erro('URL inválida.');
    if (nova !== antiga) {
      pagina.url = nova;
      cfg.redirecionamentos = cfg.redirecionamentos.filter((r) => normalizarUrl(r.de) !== nova);
      if (d.manterRedirecionamento !== false) {
        cfg.redirecionamentos.push({ de: antiga, para: nova });
        cfg.redirecionamentos.forEach((r) => { if (normalizarUrl(r.para) === antiga) r.para = nova; });
      }
      mudancas.push(`URL /${antiga} → /${nova}`);
    }
  }
  if (d.ativa !== undefined && Boolean(d.ativa) !== pagina.ativa) { pagina.ativa = Boolean(d.ativa); mudancas.push(pagina.ativa ? 'ativada' : 'desativada'); }
  if (d.redirecionarInativaPara !== undefined) pagina.redirecionarInativaPara = normalizarUrl(d.redirecionarInativaPara);
  if (d.notas !== undefined) pagina.notas = String(d.notas);
  if (d.criativo) {
    pagina.criativo = { ...pagina.criativo };
    if (d.criativo.texto !== undefined) pagina.criativo.texto = String(d.criativo.texto);
    if (d.criativo.link !== undefined) pagina.criativo.link = String(d.criativo.link).trim();
    mudancas.push('criativo');
  }
  const r = await salvarConfig(cfg, `/${pagina.url}: ${mudancas.join(', ') || 'ajustes'}`);
  return json({ ok: true, sha: r.sha, pagina });
});

// Duplicar.
export const POST = protegido(async (request) => {
  const d = await request.json();
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
  return json({ ok: true, sha: r.sha, slug });
});

// Excluir de vez (o histórico continua no GitHub).
export const DELETE = protegido(async (request, u) => {
  const { cfg, pagina } = await achar(u.searchParams.get('slug'));
  cfg.paginas = cfg.paginas.filter((p) => p.slug !== pagina.slug);
  const url = normalizarUrl(pagina.url);
  cfg.redirecionamentos = cfg.redirecionamentos.filter((r) => normalizarUrl(r.para) !== url);
  cfg.paginas.forEach((p) => { if (normalizarUrl(p.redirecionarInativaPara) === url) p.redirecionarInativaPara = ''; });
  const extras = [{ caminho: `${PASTA_PAGINAS}/${pagina.arquivo}`, apagar: true }];
  if (pagina.criativo?.imagem) extras.push({ caminho: `${PASTA_CRIATIVOS}/${pagina.criativo.imagem}`, apagar: true });
  const r = await salvarConfig(cfg, `Página excluída: /${pagina.url}`, extras);
  return json({ ok: true, sha: r.sha });
});
