import { protegido, json, erro, carregarConfig, salvarConfig, temRedis, lerJson, auditar, texto, htmlValido } from '../lib/servidor.mjs';
import { lerArquivo, lerArquivos, podeGravar, usandoGitHub, usandoBanco, shaAtual } from '../lib/store.mjs';
import { PASTA_PAGINAS, extrairCopy, limparPixelMeta, limparClarity, detectarRastreio, rastreioDaPagina, hostDaPagina, hostPadrao } from '../lib/core.mjs';
import { ipDe } from '../lib/auth.mjs';
import { criarPagina, cadastrar, descadastrar } from '../lib/operacoes.mjs';

// Lista as páginas + quem está logado + pixel/Clarity de cada página.
export const GET = protegido(async (request, url, usuario) => {
  const cfg = await carregarConfig();
  const htmls = await lerArquivos(cfg.paginas.map((p) => `${PASTA_PAGINAS}/${p.arquivo}`));
  const rastreio = {};
  const hostAtual = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, '');
  const hosts = {};
  cfg.paginas.forEach((p, i) => { rastreio[p.slug] = detectarRastreio(htmls[i], rastreioDaPagina(p, cfg)); hosts[p.slug] = hostDaPagina(p, cfg, hostAtual); });
  const resposta = {
    config: cfg,
    rastreio,
    hosts,
    hostPadrao: hostPadrao(cfg, hostAtual),
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

  const quem = { login: usuario.login, papel: usuario.papel, ip: ipDe(request), origem: 'painel', hostAtual: (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, '') };

  if (d.acao === 'criar') {
    const { pagina } = await criarPagina({ url: d.url, titulo: d.titulo, html: d.html, ativa: d.ativa, dominio: d.dominio, pixel: d.pixel, clarity: d.clarity, gtm: d.gtm }, quem);
    return json({ ok: true, sha: null, url: pagina.url, slug: pagina.slug });
  }

  // listas suspensas: cadastrar/remover pixel, Clarity ou domínio
  if (d.acao === 'cadastrar') {
    const c = await cadastrar(String(d.tipo || ''), { id: d.id, nome: d.nome, padrao: d.padrao }, quem);
    return json({ ok: true, pixels: c.pixels, clarities: c.clarities, gtms: c.gtms, dominios: c.dominios });
  }
  if (d.acao === 'descadastrar') {
    await descadastrar(String(d.tipo || ''), String(d.id || ''), quem);
    return json({ ok: true });
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
