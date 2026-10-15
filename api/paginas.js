import { protegido, json, erro, carregarConfig, salvarConfig, temRedis, lerJson, auditar, texto, htmlValido } from '../lib/servidor.mjs';
import { lerArquivo, lerArquivos, podeGravar, usandoGitHub, usandoBanco, shaAtual } from '../lib/store.mjs';
import { normalizarUrl, PASTA_PAGINAS, extrairCopy, limparPixelMeta, limparClarity, limparCodigo, detectarRastreio } from '../lib/core.mjs';

// Lista as páginas + quem está logado + pixel/Clarity de cada página.
export const GET = protegido(async (request, url, usuario) => {
  const cfg = await carregarConfig();
  const htmls = await lerArquivos(cfg.paginas.map((p) => `${PASTA_PAGINAS}/${p.arquivo}`));
  const rastreio = {};
  cfg.paginas.forEach((p, i) => { rastreio[p.slug] = detectarRastreio(htmls[i], cfg); });
  const resposta = {
    config: cfg,
    rastreio,
    usuario: { nome: usuario.nome, login: usuario.login, papel: usuario.papel },
    podeGravar,
    usandoGitHub,
    usandoBanco,
    temRedis,
    temHubspot: Boolean(process.env.HUBSPOT_TOKEN),
    deploy: { publicado: process.env.VERCEL_GIT_COMMIT_SHA || null, atual: await shaAtual().catch(() => null) },
  };
  if (url.searchParams.get('copias') && usuario.papel === 'admin') {
    const copias = {};
    cfg.paginas.forEach((p, i) => { copias[p.slug] = htmls[i] ? { ...extrairCopy(htmls[i]), tamanho: Buffer.byteLength(htmls[i]) } : null; });
    resposta.copias = copias;
  }
  return json(resposta);
});

// Domínio usado para status/PageSpeed: só https e nunca endereço interno (o servidor acessa essa URL).
function dominioValido(v) {
  let t = texto(v, 200, 'Domínio').trim().replace(/\/+$/, '');
  if (!t) return '';
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t;
  let u;
  try { u = new URL(t); } catch { throw Object.assign(new Error('Domínio inválido.'), { status: 400 }); }
  const host = u.hostname.toLowerCase();
  const interno = host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || /^[\d.]+$/.test(host) || host.includes(':');
  if (u.protocol !== 'https:' || interno || !host.includes('.') || u.username || u.password) {
    throw Object.assign(new Error('Domínio inválido: use algo como https://lp.seudominio.com'), { status: 400 });
  }
  return `https://${host}${u.port ? ':' + u.port : ''}`;
}

// Ações gerais: criar página, reordenar o funil, domínio/pixel/Clarity.
export const POST = protegido(async (request, url, usuario) => {
  const d = await lerJson(request);
  const cfg = await carregarConfig();

  if (d.acao === 'criar') {
    const urlNova = normalizarUrl(texto(d.url, 120, 'URL') || texto(d.titulo, 120, 'Título'));
    if (!urlNova) return erro('Informe a URL (slug) da nova página.');
    const html = limparCodigo(htmlValido(d.html));
    if (html.length < 20 || !html.includes('<')) return erro('O código colado não parece HTML.');
    const titulo = (texto(d.titulo, 120, 'Título').trim() || urlNova);
    const base = urlNova.replace(/\//g, '-');
    let arquivo = `${base}.html`, n = 2;
    const existentes = new Set(cfg.paginas.map((p) => p.arquivo));
    while (existentes.has(arquivo)) arquivo = `${base}-${n++}.html`;
    cfg.paginas.push({
      slug: arquivo.replace(/\.html$/, ''), arquivo, titulo, url: urlNova, ativa: d.ativa !== false,
      ordem: Math.max(0, ...cfg.paginas.map((p) => p.ordem || 0)) + 1,
      redirecionarInativaPara: '', criativo: { imagem: '', texto: '', link: '' }, notas: '',
    });
    const r = await salvarConfig(cfg, `Nova página /${urlNova}`, [{ caminho: `${PASTA_PAGINAS}/${arquivo}`, conteudo: html }]);
    await auditar(usuario, 'pagina_criada', { url: urlNova, bytes: html.length }, request);
    return json({ ok: true, sha: r.sha, url: urlNova, slug: arquivo.replace(/\.html$/, '') });
  }

  if (d.acao === 'ordem') {
    if (usuario.papel !== 'admin') return erro('Esta função está em construção.', 403);
    if (!Array.isArray(d.ordem) || d.ordem.length > 1000) return erro('Ordem inválida.');
    const pos = new Map(d.ordem.filter((s) => typeof s === 'string').map((s, i) => [s, i + 1]));
    cfg.paginas.forEach((p) => { if (pos.has(p.slug)) p.ordem = pos.get(p.slug); });
    const r = await salvarConfig(cfg, 'Nova ordem do funil');
    await auditar(usuario, 'funil_ordem', null, request);
    return json({ ok: true, sha: r.sha });
  }

  if (d.acao === 'dominio') {
    cfg.dominio = dominioValido(d.dominio);
    if (d.pixelMeta !== undefined) cfg.pixelMeta = limparPixelMeta(texto(d.pixelMeta, 40, 'Pixel'));
    if (d.clarity !== undefined) cfg.clarity = limparClarity(texto(d.clarity, 200, 'Clarity'));
    const r = await salvarConfig(cfg, `Domínio: ${cfg.dominio || '(padrão)'} · Pixel: ${cfg.pixelMeta || '(nenhum)'} · Clarity: ${cfg.clarity || '(nenhum)'}`);
    await auditar(usuario, 'rastreio_alterado', { dominio: cfg.dominio, pixelMeta: cfg.pixelMeta, clarity: cfg.clarity }, request);
    return json({ ok: true, sha: r.sha });
  }

  return erro('Ação desconhecida.');
});
