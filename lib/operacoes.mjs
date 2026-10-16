// Operações de página usadas pelo painel e pelo conector do Claude (as mesmas regras nos dois).
// Cada função recebe quem está fazendo ({ login, papel }) e o IP, para o registro de eventos.
import { carregarConfig, salvarConfig, texto, htmlValido, linkValido } from './servidor.mjs';
import { lerArquivo } from './store.mjs';
import { registrar } from './auth.mjs';
import {
  PASTA_PAGINAS, PASTA_CRIATIVOS, normalizarUrl, limparCodigo, limparHost, limparPixelMeta, limparClarity, limparGtm,
} from './core.mjs';

const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });

// Acha a página pelo slug interno ou pela URL (com ou sem / e domínio).
export function acharPagina(cfg, chave) {
  if (typeof chave !== 'string' || !chave || chave.length > 300) throw falha('Página não encontrada.', 404);
  const u = normalizarUrl(chave);
  const p = cfg.paginas.find((x) => x.slug === chave) || cfg.paginas.find((x) => normalizarUrl(x.url) === u);
  if (!p) throw falha(`Página não encontrada: ${chave}`, 404);
  return p;
}

// Valida domínio/pixel/Clarity escolhidos contra as listas cadastradas. undefined = não mexe.
// pixel/clarity aceitam "nenhum" (desliga) ou "padrao" (volta a seguir o padrão do painel).
export function escolhas(cfg, d) {
  const out = {};
  if (d.dominio !== undefined) {
    const h = limparHost(d.dominio);
    if (d.dominio && !h) throw falha('Domínio inválido.');
    if (h && !cfg.dominios.includes(h)) throw falha(`O domínio ${h} não está cadastrado. Domínios disponíveis: ${cfg.dominios.join(', ') || '(nenhum cadastrado)'}.`);
    out.dominio = h;
  }
  for (const [campo, lista, limpar, nome] of [['pixel', cfg.pixels, limparPixelMeta, 'Pixel'], ['clarity', cfg.clarities, limparClarity, 'Clarity'], ['gtm', cfg.gtms, limparGtm, 'GTM']]) {
    if (d[campo] === undefined) continue;
    const v = String(d[campo] ?? '').trim();
    if (v === 'nenhum' || v === 'padrao' || v === '') { out[campo] = v === 'nenhum' ? 'nenhum' : ''; continue; }
    const id = limpar(v);
    if (!lista.some((x) => x.id === id)) throw falha(`${nome} ${v} não está cadastrado. Disponíveis: ${lista.map((x) => x.id).join(', ') || '(nenhum)'}.`);
    out[campo] = id;
  }
  return out;
}

// O domínio já está apontado para este app? (evita publicar num endereço que ainda não abre)
const noAr = new Map();
export async function dominioNoAr(host) {
  const c = noAr.get(host);
  if (c && Date.now() - c.em < (c.ok ? 600e3 : 30e3)) return c.ok;
  let ok = false;
  try {
    const r = await fetch(`https://${host}/.well-known/oauth-protected-resource`, { signal: AbortSignal.timeout(6000), redirect: 'manual' });
    ok = r.ok && String((await r.json()).resource || '').startsWith(`https://${host}/`);
  } catch {}
  noAr.set(host, { ok, em: Date.now() });
  return ok;
}
async function exigirNoAr(host, quem) {
  if (!host || host === quem.hostAtual || /^(localhost|127[.])/.test(quem.hostAtual || '')) return;
  if (!(await dominioNoAr(host))) throw falha(`O domínio ${host} ainda não está apontado para o app (DNS/Vercel). Use outro domínio por enquanto.`, 409);
}

// Grupo pelo id ou pelo título (o Claude manda o título; se não existir, cria).
function resolverGrupo(cfg, v, { criar = false } = {}) {
  if (v === undefined) return undefined;
  const t = String(v ?? '').trim();
  if (!t || t === 'nenhum') return '';
  const g = cfg.grupos.find((x) => x.id === t) || cfg.grupos.find((x) => x.titulo.toLowerCase() === t.toLowerCase());
  if (g) return g.id;
  if (!criar) throw falha('Grupo não encontrado.');
  const novo = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titulo: t.slice(0, 80) };
  cfg.grupos.push(novo);
  return novo.id;
}

export async function criarPagina(d, quem) {
  const cfg = await carregarConfig();
  let url = normalizarUrl(texto(d.url, 120, 'URL') || texto(d.titulo, 120, 'Título'));
  if (!url) throw falha('Informe a URL (slug) da nova página.');
  // laboratório oculto: páginas de teste ficam em zz-lab/, fora das listas e sem rastreamento
  if (d.lab) url = 'zz-lab/' + url.replace(/^zz-lab\//, '');
  const existe = cfg.paginas.find((p) => normalizarUrl(p.url) === url);
  if (existe) throw falha(`Já existe uma página com a URL /${url} (“${existe.titulo}”). Use outro slug ou edite a página existente.`, 409);
  const html = limparCodigo(htmlValido(d.html));
  if (html.length < 20 || !html.includes('<')) throw falha('O código não parece HTML.');
  const titulo = texto(d.titulo, 120, 'Título').trim() || url;
  const esc = escolhas(cfg, d);
  await exigirNoAr(esc.dominio, quem);
  const grupoId = resolverGrupo(cfg, d.grupo, { criar: true });
  const base = url.replace(/\//g, '-');
  let arquivo = `${base}.html`, n = 2;
  const existentes = new Set(cfg.paginas.map((p) => p.arquivo));
  while (existentes.has(arquivo)) arquivo = `${base}-${n++}.html`;
  const pagina = {
    slug: arquivo.replace(/\.html$/, ''), arquivo, titulo, url, ativa: d.ativa !== false,
    ordem: Math.max(0, ...cfg.paginas.map((p) => p.ordem || 0)) + 1,
    redirecionarInativaPara: '', criativo: { imagem: '', texto: '', link: '' }, notas: '',
    ...(d.lab ? { lab: true, pixel: 'nenhum', clarity: 'nenhum', gtm: 'nenhum' } : {}),
    ...(grupoId ? { grupo: grupoId } : {}),
    dominio: esc.dominio || '', ...(esc.pixel !== undefined ? { pixel: esc.pixel } : {}), ...(esc.clarity !== undefined ? { clarity: esc.clarity } : {}), ...(esc.gtm !== undefined ? { gtm: esc.gtm } : {}),
  };
  cfg.paginas.push(pagina);
  await salvarConfig(cfg, `Nova página /${url}`, [{ caminho: `${PASTA_PAGINAS}/${arquivo}`, conteudo: html }]);
  await registrar('pagina_criada', { usuario: quem.login, ip: quem.ip, detalhe: { url, dominio: pagina.dominio, bytes: html.length, origem: quem.origem } });
  return { cfg, pagina, html };
}

// Altera HTML e/ou ajustes. Campos ausentes não mudam.
export async function atualizarPagina(chave, d, quem) {
  const cfg = await carregarConfig();
  const pagina = acharPagina(cfg, chave);
  if (d.criativo && quem.papel !== 'admin') throw falha('Esta função está em construção.', 403);
  texto(d.titulo, 120, 'Título'); texto(d.url, 120, 'URL'); texto(d.notas, 2000, 'Notas'); texto(d.redirecionarInativaPara, 120, 'Redirecionamento');
  const mudancas = [], extras = [];
  let html = null;
  if (d.html !== undefined) {
    html = limparCodigo(htmlValido(d.html));
    if (html.length < 20) throw falha('O HTML está vazio.');
    extras.push({ caminho: `${PASTA_PAGINAS}/${pagina.arquivo}`, conteudo: html });
    mudancas.push('HTML');
  }
  if (d.titulo !== undefined && d.titulo.trim() && d.titulo !== pagina.titulo) { pagina.titulo = d.titulo.trim(); mudancas.push('título'); }
  if (d.url !== undefined) {
    const nova = normalizarUrl(d.url), antiga = normalizarUrl(pagina.url);
    if (!nova) throw falha('URL inválida.');
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
  const esc = escolhas(cfg, d);
  if (esc.dominio && esc.dominio !== (pagina.dominio || '')) await exigirNoAr(esc.dominio, quem);
  if (esc.dominio !== undefined && esc.dominio !== (pagina.dominio || '')) { pagina.dominio = esc.dominio; mudancas.push(`domínio ${esc.dominio || 'padrão'}`); }
  if (esc.pixel !== undefined) { if (esc.pixel) pagina.pixel = esc.pixel; else delete pagina.pixel; mudancas.push('pixel'); }
  if (esc.clarity !== undefined) { if (esc.clarity) pagina.clarity = esc.clarity; else delete pagina.clarity; mudancas.push('Clarity'); }
  if (esc.gtm !== undefined) { if (esc.gtm) pagina.gtm = esc.gtm; else delete pagina.gtm; mudancas.push('GTM'); }
  const grupo = resolverGrupo(cfg, d.grupo, { criar: quem.origem === 'claude' });
  if (grupo !== undefined && grupo !== (pagina.grupo || '')) { if (grupo) pagina.grupo = grupo; else delete pagina.grupo; mudancas.push('grupo'); }
  if (d.criativo) {
    pagina.criativo = { ...pagina.criativo };
    if (d.criativo.texto !== undefined) pagina.criativo.texto = texto(d.criativo.texto, 5000, 'Copy do anúncio');
    if (d.criativo.link !== undefined) pagina.criativo.link = linkValido(d.criativo.link);
    mudancas.push('criativo');
  }
  await salvarConfig(cfg, `/${pagina.url}: ${mudancas.join(', ') || 'ajustes'}`, extras);
  await registrar(html ? 'html_alterado' : 'pagina_ajustada', { usuario: quem.login, ip: quem.ip, detalhe: { url: pagina.url, mudancas, origem: quem.origem } });
  return { cfg, pagina, html, mudancas };
}

export async function excluirPagina(chave, quem) {
  const cfg = await carregarConfig();
  const pagina = acharPagina(cfg, chave);
  cfg.paginas = cfg.paginas.filter((p) => p.slug !== pagina.slug);
  const url = normalizarUrl(pagina.url);
  cfg.redirecionamentos = cfg.redirecionamentos.filter((r) => normalizarUrl(r.para) !== url);
  cfg.paginas.forEach((p) => { if (normalizarUrl(p.redirecionarInativaPara) === url) p.redirecionarInativaPara = ''; });
  const extras = [{ caminho: `${PASTA_PAGINAS}/${pagina.arquivo}`, apagar: true }];
  if (pagina.criativo?.imagem) extras.push({ caminho: `${PASTA_CRIATIVOS}/${pagina.criativo.imagem}`, apagar: true });
  await salvarConfig(cfg, `Página excluída: /${pagina.url}`, extras);
  await registrar('pagina_excluida', { usuario: quem.login, ip: quem.ip, detalhe: { url: pagina.url, origem: quem.origem } });
  return { pagina };
}

export async function htmlDaPagina(pagina) {
  return (await lerArquivo(`${PASTA_PAGINAS}/${pagina.arquivo}`)) || '';
}

// Cadastros: domínios, pixels e Clarity (listas da lista suspensa).
export async function cadastrar(tipo, d, quem) {
  const cfg = await carregarConfig();
  const nome = texto(d.nome, 60, 'Nome').trim();
  let msg;
  if (tipo === 'pixel') {
    const id = limparPixelMeta(texto(d.id, 40, 'Pixel'));
    if (id.length < 6) throw falha('ID do pixel inválido (só números).');
    if (!cfg.pixels.some((x) => x.id === id)) cfg.pixels.push({ id, nome: nome || `Pixel ${id.slice(-4)}` });
    if (d.padrao || !cfg.pixelMeta) cfg.pixelMeta = id;
    msg = `Pixel ${id}`;
  } else if (tipo === 'clarity') {
    const id = limparClarity(texto(d.id, 200, 'Clarity'));
    if (id.length < 6) throw falha('ID do Clarity inválido.');
    if (!cfg.clarities.some((x) => x.id === id)) cfg.clarities.push({ id, nome: nome || `Clarity ${id}` });
    if (d.padrao || !cfg.clarity) cfg.clarity = id;
    msg = `Clarity ${id}`;
  } else if (tipo === 'gtm') {
    const id = limparGtm(texto(d.id, 200, 'GTM'));
    if (!id) throw falha('ID do GTM inválido (formato GTM-XXXXXXX).');
    if (!cfg.gtms.some((x) => x.id === id)) cfg.gtms.push({ id, nome: nome || id });
    if (d.padrao || !cfg.gtm) cfg.gtm = id;
    msg = `GTM ${id}`;
  } else if (tipo === 'dominio') {
    if (quem.papel !== 'admin') throw falha('Só o administrador cadastra domínios.', 403);
    const h = limparHost(texto(d.id, 253, 'Domínio'));
    if (!h || h === 'localhost' || /^[0-9.]+$/.test(h) || h.endsWith('.local') || h.endsWith('.internal')) throw falha('Domínio inválido: use algo como lp.seudominio.com');
    if (!cfg.dominios.includes(h)) cfg.dominios.push(h);
    if (d.padrao || !cfg.dominio) cfg.dominio = `https://${h}`;
    msg = `Domínio ${h}`;
  } else throw falha('Cadastro desconhecido.');
  await salvarConfig(cfg, `Cadastro: ${msg}`);
  await registrar('cadastro', { usuario: quem.login, ip: quem.ip, detalhe: { tipo, msg, origem: quem.origem } });
  return cfg;
}

export async function descadastrar(tipo, id, quem) {
  if (quem.papel !== 'admin') throw falha('Só o administrador remove cadastros.', 403);
  const cfg = await carregarConfig();
  const usa = cfg.paginas.filter((p) => (tipo === 'dominio' ? limparHost(p.dominio) === id : p[tipo] === id));
  if (usa.length) throw falha(`Em uso em ${usa.map((p) => '/' + p.url).join(', ')}. Troque nessas páginas antes.`, 409);
  if (tipo === 'pixel') { cfg.pixels = cfg.pixels.filter((x) => x.id !== id); if (cfg.pixelMeta === id) cfg.pixelMeta = cfg.pixels[0]?.id || ''; }
  else if (tipo === 'clarity') { cfg.clarities = cfg.clarities.filter((x) => x.id !== id); if (cfg.clarity === id) cfg.clarity = cfg.clarities[0]?.id || ''; }
  else if (tipo === 'gtm') { cfg.gtms = cfg.gtms.filter((x) => x.id !== id); if (cfg.gtm === id) cfg.gtm = cfg.gtms[0]?.id || ''; }
  else if (tipo === 'dominio') { cfg.dominios = cfg.dominios.filter((x) => x !== id); if (limparHost(cfg.dominio) === id) cfg.dominio = cfg.dominios[0] ? `https://${cfg.dominios[0]}` : ''; }
  else throw falha('Cadastro desconhecido.');
  await salvarConfig(cfg, `Cadastro removido: ${tipo} ${id}`);
  await registrar('descadastro', { usuario: quem.login, ip: quem.ip, detalhe: { tipo, id, origem: quem.origem } });
  return cfg;
}

// Rastreamento de um domínio: pixel/Clarity/GTM que valem para todas as páginas dele (exceto as que
// escolheram outro na própria página). '' = segue o padrão do painel; 'nenhum' = desligado.
// Um ID novo digitado aqui entra sozinho nas listas de cadastro.
export async function rastreioDoDominio(host, d, quem) {
  if (quem.papel !== 'admin') throw falha('Só o administrador muda o rastreamento por domínio.', 403);
  const cfg = await carregarConfig();
  const h = limparHost(host);
  if (!h || !cfg.dominios.includes(h)) throw falha('Domínio não cadastrado.', 404);
  const atual = { ...(cfg.porDominio[h] || {}) };
  const tipos = [['pixel', limparPixelMeta, cfg.pixels, 6, 'Pixel'], ['clarity', limparClarity, cfg.clarities, 6, 'Clarity'], ['gtm', limparGtm, cfg.gtms, 5, 'GTM']];
  for (const [campo, limpar, lista, minimo, nome] of tipos) {
    if (d[campo] === undefined) continue;
    const bruto = texto(d[campo], 200, nome).trim();
    if (!bruto) { delete atual[campo]; continue; }
    if (bruto.toLowerCase() === 'nenhum') { atual[campo] = 'nenhum'; continue; }
    const id = limpar(bruto);
    if (!id || id.length < minimo) throw falha(`${nome} inválido: ${bruto}`);
    if (!lista.some((x) => x.id === id)) lista.push({ id, nome: `${nome} ${h}` });
    atual[campo] = id;
  }
  if (Object.keys(atual).length) cfg.porDominio[h] = atual; else delete cfg.porDominio[h];
  await salvarConfig(cfg, `Rastreamento do domínio ${h}`);
  await registrar('rastreio_dominio', { usuario: quem.login, ip: quem.ip, detalhe: { dominio: h, ...atual, origem: quem.origem } });
  return { porDominio: cfg.porDominio, pixels: cfg.pixels, clarities: cfg.clarities, gtms: cfg.gtms };
}

// Grupos: juntar várias páginas sob um título (só organização do painel; não muda nada no ar).
//   criar { titulo, paginas[] } · renomear { id, titulo } · paginas { id, paginas[] } · excluir { id }
export async function gerenciarGrupo(acao, d, quem) {
  const cfg = await carregarConfig();
  const slugs = Array.isArray(d.paginas) ? d.paginas.filter((x) => typeof x === 'string').slice(0, 500) : null;
  let g = d.id ? cfg.grupos.find((x) => x.id === d.id) : null;
  if (acao !== 'criar' && !g) throw falha('Grupo não encontrado.', 404);
  if (acao === 'criar' || acao === 'renomear') {
    const titulo = texto(d.titulo, 80, 'Título do grupo').trim();
    if (!titulo) throw falha('Dê um título ao grupo.');
    if (cfg.grupos.some((x) => x.titulo.toLowerCase() === titulo.toLowerCase() && x !== g)) throw falha('Já existe um grupo com esse título.', 409);
    if (acao === 'criar') { g = { id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), titulo }; cfg.grupos.push(g); }
    else g.titulo = titulo;
  }
  if (acao === 'excluir') {
    cfg.grupos = cfg.grupos.filter((x) => x !== g);
    cfg.paginas.forEach((p) => { if (p.grupo === g.id) delete p.grupo; });
  } else if (slugs) {
    const dentro = new Set(slugs);
    cfg.paginas.forEach((p) => { if (dentro.has(p.slug)) p.grupo = g.id; else if (p.grupo === g.id) delete p.grupo; });
  }
  await salvarConfig(cfg, `Grupo ${acao}: ${g.titulo}`);
  await registrar('grupo_' + acao, { usuario: quem.login, ip: quem.ip, detalhe: { grupo: g.titulo, paginas: slugs?.length, origem: quem.origem } });
  return { grupos: cfg.grupos, id: g.id };
}
