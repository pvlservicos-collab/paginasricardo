import { protegido, json, erro, carregarConfig, salvarConfig, temRedis } from '../lib/servidor.mjs';
import { lerArquivo, podeGravar, usandoGitHub, usandoBanco, shaAtual } from '../lib/store.mjs';
import { normalizarUrl, PASTA_PAGINAS, extrairCopy, limparPixelMeta, limparClarity } from '../lib/core.mjs';

// Lista as páginas + estado do deploy.
export const GET = protegido(async (request, url) => {
  const cfg = await carregarConfig();
  const resposta = {
    config: cfg,
    podeGravar,
    usandoGitHub,
    usandoBanco,
    temRedis,
    temHubspot: Boolean(process.env.HUBSPOT_TOKEN),
    deploy: { publicado: process.env.VERCEL_GIT_COMMIT_SHA || null, atual: await shaAtual().catch(() => null) },
  };
  if (url.searchParams.get('copias')) {
    const copias = {};
    await Promise.all(cfg.paginas.map(async (p) => {
      const html = await lerArquivo(`${PASTA_PAGINAS}/${p.arquivo}`);
      copias[p.slug] = html ? { ...extrairCopy(html), tamanho: Buffer.byteLength(html) } : null;
    }));
    resposta.copias = copias;
  }
  return json(resposta);
});

// Ações gerais: criar página, reordenar o funil, definir o domínio.
export const POST = protegido(async (request) => {
  const d = await request.json();
  const cfg = await carregarConfig();

  if (d.acao === 'criar') {
    const url = normalizarUrl(d.url || d.titulo);
    if (!url) return erro('Informe a URL da nova página.');
    if (!d.html || d.html.length < 20) return erro('Cole o HTML da página.');
    const base = url.replace(/\//g, '-');
    let arquivo = `${base}.html`, n = 2;
    const existentes = new Set(cfg.paginas.map((p) => p.arquivo));
    while (existentes.has(arquivo)) arquivo = `${base}-${n++}.html`;
    cfg.paginas.push({
      slug: arquivo.replace(/\.html$/, ''), arquivo, titulo: d.titulo || url, url, ativa: d.ativa !== false,
      ordem: Math.max(0, ...cfg.paginas.map((p) => p.ordem || 0)) + 1,
      redirecionarInativaPara: '', criativo: { imagem: '', texto: '', link: '' }, notas: '',
    });
    const r = await salvarConfig(cfg, `Nova página /${url}`, [{ caminho: `${PASTA_PAGINAS}/${arquivo}`, conteudo: d.html }]);
    return json({ ok: true, sha: r.sha });
  }

  if (d.acao === 'ordem') {
    const pos = new Map((d.ordem || []).map((s, i) => [s, i + 1]));
    cfg.paginas.forEach((p) => { if (pos.has(p.slug)) p.ordem = pos.get(p.slug); });
    const r = await salvarConfig(cfg, 'Nova ordem do funil');
    return json({ ok: true, sha: r.sha });
  }

  if (d.acao === 'dominio') {
    cfg.dominio = String(d.dominio || '').trim().replace(/\/+$/, '');
    if (cfg.dominio && !/^https?:\/\//.test(cfg.dominio)) cfg.dominio = 'https://' + cfg.dominio;
    if (d.pixelMeta !== undefined) cfg.pixelMeta = limparPixelMeta(d.pixelMeta);
    if (d.clarity !== undefined) cfg.clarity = limparClarity(d.clarity);
    const r = await salvarConfig(cfg, `Domínio: ${cfg.dominio || '(padrão)'} · Pixel: ${cfg.pixelMeta || '(nenhum)'} · Clarity: ${cfg.clarity || '(nenhum)'}`);
    return json({ ok: true, sha: r.sha });
  }

  return erro('Ação desconhecida.');
});
