// Regras compartilhadas entre o build (gera as páginas estáticas) e a API do painel.
// Nada daqui vai para as páginas publicadas: elas saem como HTML puro.

export const PASTA_PAGINAS = 'paginas';
export const ARQUIVO_CONFIG = 'paginas/paginas.json';
export const PASTA_CRIATIVOS = 'criativos';

export function normalizarUrl(url) {
  return String(url || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/-{2,}/g, '-')
    .split('/').map((seg) => seg.replace(/^[-_]+|[-_]+$/g, '')).filter(Boolean).join('/');
}

export function slugDeArquivo(nome) {
  return nome.replace(/\.html?$/i, '');
}

export function configVazia() {
  return { dominio: '', dominios: [], pixelMeta: '', clarity: '', pixels: [], clarities: [], paginas: [], redirecionamentos: [] };
}

// Domínio (host) a partir de um texto como "https://lp.site.com/x" ou "lp.site.com".
export function limparHost(v) {
  const t = String(v || '').trim().toLowerCase().replace(/^https?:[/][/]/, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '');
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(t) && t.length <= 253 ? t : '';
}

// Domínio padrão (onde ficam as páginas sem domínio escolhido).
export function hostPadrao(cfg, hostAtual = '') {
  return limparHost(cfg.dominio) || cfg.dominios?.[0] || limparHost(hostAtual);
}
export const hostDaPagina = (p, cfg, hostAtual = '') => limparHost(p.dominio) || hostPadrao(cfg, hostAtual);
export const linkDaPagina = (p, cfg, hostAtual = '') => `https://${hostDaPagina(p, cfg, hostAtual)}/${normalizarUrl(p.url)}`;

// Pixel e Clarity de uma página: o escolhido nela ("nenhum" desliga) ou, se não escolheu, o padrão do painel.
export function rastreioDaPagina(p, cfg) {
  const px = p.pixel === 'nenhum' ? '' : (p.pixel || cfg.pixelMeta || '');
  const cl = p.clarity === 'nenhum' ? '' : (p.clarity || cfg.clarity || '');
  return { pixelMeta: px, clarity: cl };
}

// Junta o paginas.json com os .html que existem na pasta.
// Um .html que alguém subiu direto na pasta entra ativo, com a URL igual ao nome do arquivo.
export function mesclarConfig(cfgBruta, arquivosHtml) {
  const cfg = { ...configVazia(), ...(cfgBruta || {}) };
  const porArquivo = new Map((cfg.paginas || []).map((p) => [p.arquivo, p]));
  const paginas = [];
  let maiorOrdem = Math.max(0, ...(cfg.paginas || []).map((p) => p.ordem || 0));
  for (const arquivo of arquivosHtml) {
    const existente = porArquivo.get(arquivo);
    const slug = slugDeArquivo(arquivo);
    paginas.push({
      slug,
      arquivo,
      titulo: slug,
      url: slug,
      ativa: true,
      ordem: existente ? existente.ordem : ++maiorOrdem,
      redirecionarInativaPara: '',
      criativo: { imagem: '', texto: '', link: '' },
      notas: '',
      ...(existente || {}),
      slug,
      arquivo,
    });
  }
  paginas.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  cfg.paginas = paginas;
  cfg.redirecionamentos = (cfg.redirecionamentos || []).filter((r) => r && r.de && r.para);
  const lista = (v, limpar) => {
    const vistos = new Set();
    return (Array.isArray(v) ? v : []).map((x) => ({ id: limpar(x?.id), nome: String(x?.nome || '').slice(0, 60) })).filter((x) => x.id && !vistos.has(x.id) && vistos.add(x.id));
  };
  cfg.pixels = lista(cfg.pixels, limparPixelMeta);
  if (cfg.pixelMeta && !cfg.pixels.some((x) => x.id === cfg.pixelMeta)) cfg.pixels.unshift({ id: cfg.pixelMeta, nome: 'Pixel principal' });
  cfg.clarities = lista(cfg.clarities, limparClarity);
  if (cfg.clarity && !cfg.clarities.some((x) => x.id === cfg.clarity)) cfg.clarities.unshift({ id: cfg.clarity, nome: 'Clarity principal' });
  cfg.dominios = [...new Set([limparHost(cfg.dominio), ...(Array.isArray(cfg.dominios) ? cfg.dominios : []).map(limparHost)].filter(Boolean))];
  return cfg;
}

// Remove os campos derivados antes de salvar o JSON.
export function configParaSalvar(cfg) {
  return JSON.stringify(
    {
      dominio: cfg.dominio || '',
      dominios: cfg.dominios || [],
      pixelMeta: cfg.pixelMeta || '',
      clarity: cfg.clarity || '',
      pixels: cfg.pixels || [],
      clarities: cfg.clarities || [],
      paginas: cfg.paginas.map(({ slug, ...p }) => p),
      redirecionamentos: cfg.redirecionamentos || [],
    },
    null,
    2,
  ) + '\n';
}

export function validarUrls(cfg) {
  const vistos = new Map();
  const reservadas = new Set(['api', 'painel', 'wp-content', 'criativos', '404']);
  for (const p of cfg.paginas) {
    const u = normalizarUrl(p.url);
    if (!u) return `A página "${p.titulo}" está sem URL.`;
    if (reservadas.has(u.split('/')[0])) return `A URL "/${u}" é reservada pelo sistema.`;
    if (vistos.has(u)) return `A URL "/${u}" está em duas páginas: "${vistos.get(u)}" e "${p.titulo}".`;
    vistos.set(u, p.titulo);
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rastreamento de cada página (escolhido no painel):
// - Pixel da Meta: a fila oficial (fbq + init + PageView) fica no <head>, então nenhum evento se perde
//   e qualquer fbq('track', ...) da página funciona desde o início.
// - Microsoft Clarity: a fila também existe desde o início.
// - Os scripts pesados de fora (fbevents.js ~115 KB, Clarity ~60 KB) baixam juntos no 1º gesto do
//   visitante (toque, rolagem, mouse, tecla) ou 6 s depois de a página terminar de abrir, o que vier
//   primeiro. Assim eles não travam a abertura (nota do PageSpeed) e os eventos são enviados em seguida.
// Não roda dentro de iframe (prévias do painel). Se a página já tiver o código de algum deles, não duplica.
export const limparPixelMeta = (v) => String(v || '').replace(/\D/g, '');
export const limparClarity = (v) => String(v || '').trim().replace(/^.*clarity\.ms\/tag\//, '').replace(/[^a-z0-9]/gi, '');

export function codigoRastreio({ pixelMeta = '', clarity = '' } = {}, html = '') {
  const fb = /connect\.facebook\.net\/[^/]+\/fbevents\.js/.test(html) ? '' : limparPixelMeta(pixelMeta);
  const cl = /clarity\.ms\/tag\//.test(html) ? '' : limparClarity(clarity);
  const head = fb ? `<!-- Meta Pixel Code (fila no head; o fbevents.js baixa no 1º gesto ou 6 s após abrir) -->
<script>
if(window.top===window.self){
!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];}(window);
fbq('init', '${fb}');
fbq('track', 'PageView');
(window.__r1tags=window.__r1tags||[]).push('https://connect.facebook.net/en_US/fbevents.js');
}
</script>
<!-- End Meta Pixel Code -->` : '';
  const body = [
    fb ? `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${fb}&amp;ev=PageView&amp;noscript=1"></noscript>` : '',
    cl ? `<script>if(window.top===window.self){window.clarity=window.clarity||function(){(window.clarity.q=window.clarity.q||[]).push(arguments)};(window.__r1tags=window.__r1tags||[]).push('https://www.clarity.ms/tag/${cl}');}</script>` : '',
    fb || cl ? `<script>
(function(w,d){
  var srcs=w.__r1tags;
  if(w.top!==w.self||!srcs||!srcs.length)return;
  var ev=['touchstart','pointerdown','keydown','wheel','scroll','mousemove'],foi=!1;
  var carrega=function(){
    if(foi)return;foi=!0;
    for(var i=0;i<ev.length;i++)w.removeEventListener(ev[i],carrega);
    for(var j=0;j<srcs.length;j++){var s=d.createElement('script');s.async=!0;s.src=srcs[j];d.head.appendChild(s);}
  };
  for(var i=0;i<ev.length;i++)w.addEventListener(ev[i],carrega,{passive:!0,once:!0});
  var depois=function(){setTimeout(function(){(w.requestIdleCallback||setTimeout)(carrega,{timeout:2000})},6000)};
  if(d.readyState==='complete')depois();else w.addEventListener('load',depois);
})(window,document);
</script>` : '',
  ].filter(Boolean).join(String.fromCharCode(10));
  return { head, body };
}

// O HTML que sai do WordPress é um fragmento (sem <html>/<head>).
// Aqui vira um documento completo, levando para o <head> as tags de meta/link
// que estavam antes do conteúdo. O conteúdo em si não é alterado (só o rastreamento, se houver).
export function montarDocumento(html, titulo, rastreio = {}) {
  let frag = String(html).replace(/<!--\s*\/?wp:[^>]*-->/g, '').trim();
  const r = codigoRastreio(rastreio, frag);
  if (/<html[\s>]/i.test(frag)) {
    // documento completo (ex.: gerado pelo Claude): garante charset e viewport para ocupar a tela toda no celular
    const extras = [];
    if (!/<meta[^>]+charset/i.test(frag)) extras.push('<meta charset="utf-8">');
    if (!/<meta[^>]+name=["']?viewport/i.test(frag)) extras.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    if (extras.length) {
      frag = /<head[^>]*>/i.test(frag)
        ? frag.replace(/<head[^>]*>/i, (m) => m + '\n' + extras.join('\n'))
        : frag.replace(/<html[^>]*>/i, (m) => m + '\n<head>' + extras.join('') + '</head>');
    }
    if (r.head) frag = /<\/head>/i.test(frag) ? frag.replace(/<\/head>/i, `${r.head}\n</head>`) : r.head + '\n' + frag;
    if (r.body) frag = /<\/body>/i.test(frag) ? frag.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${r.body}\n</body>`) : frag + '\n' + r.body;
    return frag;
  }
  const corte = frag.search(/<(div|section|main|header|body)[\s>]/i);
  let prefixo = corte > 0 ? frag.slice(0, corte) : '';
  let corpo = corte > 0 ? frag.slice(corte) : frag;
  const head = [];
  prefixo = prefixo.replace(/<noscript>[\s\S]*?<\/noscript>|<meta\b[^>]*>|<link\b[^>]*>/gi, (tag) => {
    head.push(tag);
    return '';
  });
  const temTitulo = /<title>/i.test(frag);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${temTitulo ? '' : `<title>${esc(titulo || 'Grupo R1')}</title>\n`}${head.join('\n')}
<style>html,body{margin:0;padding:0;background:#0b0b0c}</style>
${r.head}
</head>
<body>
${prefixo.trim()}
${corpo}
${r.body}
</body>
</html>
`;
}

export function documentoRedirecionamento(destino, titulo) {
  const alvo = '/' + normalizarUrl(destino);
  return `<!doctype html><html lang="pt-BR" data-redirecionamento><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo || 'Redirecionando')}</title><meta http-equiv="refresh" content="0;url=${esc(alvo)}"><script>location.replace(${JSON.stringify(alvo)}+location.search+location.hash)</script><style>body{margin:0;background:#0b0b0c}</style></head><body></body></html>\n`;
}

export function documentoInativo(titulo) {
  return `<!doctype html><html lang="pt-BR" data-pagina-inativa><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página indisponível</title><style>html,body{margin:0;height:100%;background:#0b0b0c;color:#f2f2f2;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#9a9a9a}</style></head><body><main><div><h1>Esta página não está disponível no momento.</h1><p>Grupo R1</p></div></main></body></html>\n`;
}

// Extrai a copy principal para comparar com o criativo no funil.
export function extrairCopy(html) {
  const limpar = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const um = (re) => { const m = re.exec(html); return m ? limpar(m[1]) : ''; };
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => limpar(m[1])).filter(Boolean);
  const ctas = [...new Set([...html.matchAll(/<a[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => limpar(m[1])).filter(Boolean))];
  const formIds = [...new Set([...html.matchAll(/data-form-id="([0-9a-f-]{36})"/gi)].map((m) => m[1]))];
  return {
    topo: um(/<div class="topbar5"[^>]*>([\s\S]*?)<\/div>/i),
    h1: um(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
    sub: um(/<p class="sub"[^>]*>([\s\S]*?)<\/p>/i),
    h2,
    ctas,
    formIds,
  };
}

// Limpa o código colado (ex.: resposta do Claude): tira o bloco ```html ... ```, textos antes/depois
// do HTML e o BOM. Não mexe no conteúdo da página.
export function limparCodigo(codigo) {
  let t = String(codigo || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const cerca = t.match(/```[a-zA-Z0-9_-]*[ \t]*\n([\s\S]*?)\n?```/);
  if (cerca && cerca[1].includes('<')) t = cerca[1].trim();
  const ini = t.search(/<(!doctype|html|head|body|div|section|main|header|style|script|meta|link|title|nav|article|!--)/i);
  if (ini > 0) t = t.slice(ini);
  const fim = t.lastIndexOf('>');
  if (fim > -1) t = t.slice(0, fim + 1);
  return t.trim();
}

// Pixel da Meta e Clarity que valem numa página: os do próprio código dela ou, se ela não tiver, os do painel.
export function detectarRastreio(html, cfg = {}) {
  const h = String(html || '');
  const uniq = (a) => [...new Set(a)];
  const pixelsPagina = uniq([...h.matchAll(/fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{6,20})/g)].map((m) => m[1]));
  const temFb = /connect\.facebook\.net\/[^/'"]+\/fbevents\.js/.test(h) || pixelsPagina.length > 0;
  const clarityPagina = uniq([
    ...[...h.matchAll(/clarity\.ms\/tag\/([a-z0-9]{6,20})/gi)].map((m) => m[1]),
    ...[...h.matchAll(/["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,20})["']/gi)].map((m) => m[1]),
  ]);
  const pixelGlobal = limparPixelMeta(cfg.pixelMeta), clarityGlobal = limparClarity(cfg.clarity);
  return {
    pixel: temFb ? pixelsPagina.map((id) => ({ id, origem: 'pagina' })) : pixelGlobal ? [{ id: pixelGlobal, origem: 'painel' }] : [],
    clarity: clarityPagina.length ? clarityPagina.map((id) => ({ id, origem: 'pagina' })) : clarityGlobal ? [{ id: clarityGlobal, origem: 'painel' }] : [],
  };
}
