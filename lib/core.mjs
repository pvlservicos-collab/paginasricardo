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
  return { dominio: '', dominios: [], pixelMeta: '', clarity: '', gtm: '', pixels: [], clarities: [], gtms: [], grupos: [], paginas: [], redirecionamentos: [] };
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
// Ordem: escolha da própria página > rastreamento do domínio da página > padrão do painel.
// Em qualquer nível, "nenhum" desliga. No pixel, "gtm" = sem pixel direto na página: ele dispara pelo GTM.
// "nenhum" desliga; "gtm" (só no pixel) também não põe nada na página, porque o pixel dispara pelo GTM.
export const semDireto = (v) => v === 'nenhum' || v === 'gtm';
export function padraoDoDominio(host, cfg) {
  const d = (cfg.porDominio || {})[host] || {};
  const v = (campo, global) => (semDireto(d[campo]) ? d[campo] : d[campo] || global || '');
  return { pixel: v('pixel', cfg.pixelMeta), clarity: v('clarity', cfg.clarity), gtm: v('gtm', cfg.gtm) };
}
export function rastreioDaPagina(p, cfg) {
  const dom = padraoDoDominio(limparHost(p.dominio) || hostPadrao(cfg), cfg);
  const efetivo = (campo) => { const v = p[campo] || dom[campo]; return semDireto(v) ? '' : v || ''; };
  return { pixelMeta: efetivo('pixel'), clarity: efetivo('clarity'), gtm: efetivo('gtm') };
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
    // uso = legenda (para que serve), editada na tela Trackeamento
    return (Array.isArray(v) ? v : []).map((x) => ({ id: limpar(x?.id), nome: String(x?.nome || '').slice(0, 60), ...(x?.uso ? { uso: String(x.uso).slice(0, 200) } : {}) })).filter((x) => x.id && !vistos.has(x.id) && vistos.add(x.id));
  };
  cfg.pixels = lista(cfg.pixels, limparPixelMeta);
  if (cfg.pixelMeta && !cfg.pixels.some((x) => x.id === cfg.pixelMeta)) cfg.pixels.unshift({ id: cfg.pixelMeta, nome: 'Pixel principal' });
  cfg.clarities = lista(cfg.clarities, limparClarity);
  if (cfg.clarity && !cfg.clarities.some((x) => x.id === cfg.clarity)) cfg.clarities.unshift({ id: cfg.clarity, nome: 'Clarity principal' });
  cfg.gtms = lista(cfg.gtms, limparGtm);
  const idsGrupo = new Set();
  // grupos podem ter um grupo-pai (subgrupos, até 3 níveis) e uma cor (bolinha no painel)
  cfg.grupos = (Array.isArray(cfg.grupos) ? cfg.grupos : []).map((g) => {
    const x = { id: String(g?.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30), titulo: String(g?.titulo || '').trim().slice(0, 80) };
    const pai = String(g?.pai || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 30);
    if (pai && pai !== x.id) x.pai = pai;
    if (/^#[0-9a-f]{6}$/i.test(String(g?.cor || ''))) x.cor = g.cor.toLowerCase();
    return x;
  }).filter((g) => g.id && g.titulo && !idsGrupo.has(g.id) && idsGrupo.add(g.id));
  // pai que não existe ou que formaria um ciclo: o grupo volta para o topo
  const grupoPorId = new Map(cfg.grupos.map((g) => [g.id, g]));
  cfg.grupos.forEach((g) => {
    if (!g.pai) return;
    if (!grupoPorId.has(g.pai)) { delete g.pai; return; }
    let a = grupoPorId.get(g.pai), passos = 0;
    while (a && passos++ < 10) { if (a === g) { delete g.pai; return; } a = a.pai ? grupoPorId.get(a.pai) : null; }
    if (passos >= 10) delete g.pai;
  });
  cfg.paginas.forEach((p) => { if (p.grupo && !idsGrupo.has(p.grupo)) delete p.grupo; });
  if (cfg.gtm && !cfg.gtms.some((x) => x.id === cfg.gtm)) cfg.gtms.unshift({ id: cfg.gtm, nome: 'GTM principal' });
  cfg.dominios = [...new Set([limparHost(cfg.dominio), ...(Array.isArray(cfg.dominios) ? cfg.dominios : []).map(limparHost)].filter(Boolean))];
  // rastreamento por domínio: { host: { pixel, clarity, gtm } } — '' = padrão do painel, 'nenhum' = desligado
  const pd = {};
  for (const [host, v] of Object.entries(cfg.porDominio && typeof cfg.porDominio === 'object' ? cfg.porDominio : {})) {
    const hh = limparHost(host);
    if (!hh || !cfg.dominios.includes(hh) || !v || typeof v !== 'object') continue;
    const campo = (x, limpar) => (x === 'nenhum' ? 'nenhum' : limpar(x));
    const item = { pixel: v.pixel === 'gtm' ? 'gtm' : campo(v.pixel, limparPixelMeta), clarity: campo(v.clarity, limparClarity), gtm: campo(v.gtm, limparGtm) };
    if (item.pixel || item.clarity || item.gtm) pd[hh] = item;
  }
  cfg.porDominio = pd;
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
      gtm: cfg.gtm || '',
      pixels: cfg.pixels || [],
      clarities: cfg.clarities || [],
      gtms: cfg.gtms || [],
      grupos: cfg.grupos || [],
      porDominio: cfg.porDominio || {},
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
  // laboratório oculto (testes do Claude): só páginas marcadas como lab usam zz-lab/
  for (const p of cfg.paginas) {
    const u = normalizarUrl(p.url);
    if (!u) return `A página "${p.titulo}" está sem URL.`;
    if (reservadas.has(u.split('/')[0])) return `A URL "/${u}" é reservada pelo sistema.`;
    if ((u.split('/')[0] === 'zz-lab') !== Boolean(p.lab)) return `A URL "/${u}" é reservada pelo sistema.`;
    if (vistos.has(u)) return `Já existe uma página com a URL /${u} (“${vistos.get(u)}”). Use outro slug ou edite a página existente.`;
    vistos.set(u, p.titulo);
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Rastreamento de cada página (escolhido no painel):
// - Pixel da Meta: a fila oficial (fbq + init + PageView) fica no <head>, então nenhum evento se perde
//   e qualquer fbq('track', ...) da página funciona desde o início. O PageView leva um eventID.
// - API de Conversões da Meta (se houver token do pixel na Vercel): o mesmo PageView, com o mesmo
//   eventID, sai também pelo nosso servidor (/api/capi) por um beacon de ~300 bytes logo após abrir.
//   A Meta junta os dois (deduplicação). Assim quem sai antes do fbevents.js baixar também é contado.
//   Os cookies _fbp/_fbc são criados no formato da Meta, e o fbevents.js reaproveita os mesmos.
// - Google Tag Manager: snippet padrão no head, carrega na abertura (o pixel dentro do GTM não pode atrasar).
// - Microsoft Clarity: a fila (clarity) existe desde o início.
// - Os scripts pesados de fora (fbevents.js ~115 KB, Clarity ~60 KB) baixam juntos no 1º gesto
//   do visitante (toque, rolagem, mouse, tecla) ou 6 s depois de a página terminar de abrir, o que vier
//   primeiro. Assim eles não travam a abertura (nota do PageSpeed) e os eventos são enviados em seguida.
// Não roda dentro de iframe (prévias do painel). Se a página já tiver o código de algum deles, não duplica.
export const limparPixelMeta = (v) => String(v || '').replace(/\D/g, '');
export const limparClarity = (v) => String(v || '').trim().replace(/^.*clarity\.ms\/tag\//, '').replace(/[^a-z0-9]/gi, '');
export const limparGtm = (v) => {
  const m = /GTM-[A-Z0-9]{4,12}/i.exec(String(v || ''));
  return m ? m[0].toUpperCase() : '';
};

export function codigoRastreio({ pixelMeta = '', clarity = '', gtm = '', capi = false } = {}, html = '') {
  const fb = /connect\.facebook\.net\/[^/]+\/fbevents\.js/.test(html) ? '' : limparPixelMeta(pixelMeta);
  const cl = /clarity\.ms\/tag\//.test(html) ? '' : limparClarity(clarity);
  const gt = /googletagmanager\.com\/gtm\.js/.test(html) ? '' : limparGtm(gtm);
  const usaCapi = Boolean(fb && capi);
  const head = [
    fb ? `<!-- Meta Pixel Code (padrão da Meta: o fbevents.js baixa na abertura; PageView e Lead não podem esperar gesto) -->
<script>
if(window.top===window.self){
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];
t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
(function(d,l){var c=d.cookie,ano=7776000,seg=l.protocol==='https:'?';Secure':'';
var poe=function(n,v){d.cookie=n+'='+v+';path=/;max-age='+ano+';SameSite=Lax'+seg};
if(!/(^|; )_fbp=/.test(c))poe('_fbp','fb.1.'+Date.now()+'.'+Math.floor(Math.random()*2147483647));
var q=new URLSearchParams(l.search).get('fbclid');if(q)poe('_fbc','fb.1.'+Date.now()+'.'+q);})(document,location);
window.__r1pv='pv.'+Date.now().toString(36)+'.'+Math.random().toString(36).slice(2,10);
fbq('init', '${fb}');
fbq('track', 'PageView', {}, {eventID: window.__r1pv});${usaCapi ? `
window.__r1capi='${fb}';` : ''}
}
</script>
<!-- End Meta Pixel Code -->` : '',
    gt ? `<!-- Google Tag Manager (carrega direto, na abertura: o PageView do pixel dentro do GTM não pode esperar). -->
<script>if(window.top===window.self){(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gt}');}</script>
<!-- End Google Tag Manager -->` : '',
  ].filter(Boolean).join(String.fromCharCode(10));
  const body = [
    fb ? `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${fb}&amp;ev=PageView&amp;noscript=1"></noscript>` : '',
    gt ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gt}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : '',
    cl ? `<script>if(window.top===window.self){window.clarity=window.clarity||function(){(window.clarity.q=window.clarity.q||[]).push(arguments)};(window.__r1tags=window.__r1tags||[]).push('https://www.clarity.ms/tag/${cl}');}</script>` : '',
    usaCapi ? `<script>
/* API de Conversões: o mesmo PageView (mesmo eventID) vai pelo nosso servidor, num beacon minúsculo */
(function(w,d){
  var px=w.__r1capi,id=w.__r1pv,foi=!1;
  if(!px||!id||w.top!==w.self||/bot|crawl|spider|lighthouse|headless|preview/i.test(navigator.userAgent))return;
  var k=function(n){var m=d.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):''};
  var envia=function(){
    if(foi)return;foi=!0;
    var b=JSON.stringify({p:px,e:id,u:location.href,r:d.referrer||'',fbp:k('_fbp'),fbc:k('_fbc'),t:Math.floor(Date.now()/1000)});
    try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/capi',new Blob([b],{type:'application/json'})))return;}catch(e){}
    try{fetch('/api/capi',{method:'POST',body:b,keepalive:!0,headers:{'Content-Type':'application/json'}});}catch(e){}
  };
  if(d.readyState==='complete')setTimeout(envia,0);else w.addEventListener('load',function(){setTimeout(envia,0)});
  setTimeout(envia,2500);
  w.addEventListener('pagehide',envia);
})(window,document);
</script>` : '',
    fb || cl || gt ? `<script>
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
function montarDocumentoBase(html, titulo, rastreio = {}) {
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

// ---------- otimizações aplicadas ao servir (valem para todas as páginas, inclusive as que já têm código gravado) ----------
const LOADER_ANTIGO = /var depois=function\(\)\{setTimeout\(function\(\)\{\(w\.requestIdleCallback\|\|setTimeout\)\(carrega,\{timeout:2000\}\)\},6000\)\};\s*if\(d\.readyState==='complete'\)depois\(\);else w\.addEventListener\('load',depois\);/g;
const LOADER_NOVO = "var depois=function(){requestAnimationFrame(function(){setTimeout(carrega,0)})};if(d.readyState!=='loading')depois();else d.addEventListener('DOMContentLoaded',depois);";
const VIDEO_ANTIGO = "if(document.readyState==='complete')setTimeout(go,300);else addEventListener('load',function(){setTimeout(go,300)});";
const VIDEO_NOVO = "var on=0,ev=['touchstart','pointerdown','scroll','keydown','mousemove'],run=function(){if(on)return;on=1;ev.forEach(function(e){removeEventListener(e,run)});go()};ev.forEach(function(e){addEventListener(e,run,{passive:true})});";
// vídeo do topo (modelo tmv das v3/v4): no 1º toque o mp4 de 0,5–1,6 MB disputava a banda com o GTM e o Pixel e o PageView
// saía 1–3 s mais tarde (connect caía). Agora, depois do toque, ele ainda espera o PageView sair (facebook.com/tr) ou 8 s.
const VIDEO_TMV_ANTIGO = /\['touchstart','pointerdown','click','scroll','keydown','mousemove'\]\.forEach\(function\(evt\)\{\s*document\.addEventListener\(evt, carregarVideo, \{once:true, passive:true\}\);\s*\}\);/;
const VIDEO_TMV_NOVO = "var aposPV=function(fn){var ok=0,f=function(){if(ok)return;ok=1;fn()};try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){if(/facebook\\.com\\/tr/.test(e.name))setTimeout(f,300)})}).observe({type:'resource',buffered:true})}catch(e){}setTimeout(f,8000)};var pedeVideo=function(){aposPV(carregarVideo)};['touchstart','pointerdown','click','scroll','keydown','mousemove'].forEach(function(evt){ document.addEventListener(evt, pedeVideo, {once:true, passive:true}); });";
const attr = (tag, nome) => { const m = new RegExp(String.raw`\s` + nome + String.raw`\s*=\s*"([^"]*)"`, 'i').exec(tag); return m ? m[1] : ''; };

const SHIM_GTAG = `<script>if(window.top===window.self){(function(){var N=Node.prototype,ib=N.insertBefore,ac=N.appendChild,fila=[],lib=false;var ehG=function(n){return n&&n.tagName==='SCRIPT'&&n.src.indexOf('googletagmanager.com/gtag/js')>-1};N.insertBefore=function(n,r){if(!lib&&ehG(n)){var p=this;fila.push(function(){ib.call(p,n,r)});return n}return ib.call(this,n,r)};N.appendChild=function(n){if(!lib&&ehG(n)){var p=this;fila.push(function(){ac.call(p,n)});return n}return ac.call(this,n)};var solta=function(){if(lib)return;lib=true;N.insertBefore=ib;N.appendChild=ac;var f=fila;fila=[];f.forEach(function(x){try{x()}catch(e){}})};['touchstart','pointerdown','scroll','keydown','mousemove'].forEach(function(e){addEventListener(e,solta,{once:true,passive:true})});addEventListener('load',function(){setTimeout(solta,6000)});setTimeout(solta,12000)})();}</script>`;
export function otimizarDocumento(doc) {
  let d = String(doc);
  // GTM: as tags gtag/js do Google (GA4/Ads) que ele injeta ficam na fila até o 1º gesto ou 3 s após o load (saem depois, sem perder evento).
  // O gtm.js e o Pixel da Meta dentro do GTM continuam imediatos (é o que leva o PageView).
  if (!d.includes("n.src.indexOf('googletagmanager.com/gtag/js')")) {
    const i = d.search(/<script>\s*if\(window\.top===window\.self\)\{\(function\(w,d,s,l,i\)\{w\[l\]=w\[l\]\|\|\[\];w\[l\]\.push\(\{'gtm\.start'/);
    if (i >= 0) d = d.slice(0, i) + SHIM_GTAG + '\n' + d.slice(i);
  }
  // GTM: snippet padrão, carrega na abertura (pedido do Lucas, 29/10/2026: rastreamento 100%, mesmo custando nota no PageSpeed).
  // Não voltar a segurar o gtm.js até o LCP/gesto: o Pixel e os Leads de dentro do GTM dependem dele.
  // (páginas que ficaram com essa espera gravada no HTML voltam ao snippet padrão)
  d = d.split("var foi=0,vai=function(){if(foi)return;foi=1;f.parentNode.insertBefore(j,f)};try{new PerformanceObserver(function(){requestAnimationFrame(function(){setTimeout(vai,0)})}).observe({type:'largest-contentful-paint',buffered:true})}catch(e){vai()}['touchstart','pointerdown','scroll','keydown'].forEach(function(e){addEventListener(e,vai,{once:true,passive:true})});setTimeout(vai,2500);")
    .join('f.parentNode.insertBefore(j,f);');
  // vídeo de fundo gravado no HTML com o portão de 5 s: tira o timer (o vídeo só baixa no 1º gesto; um vídeo de 3–4 MB no meio do teste derruba a nota)
  d = d.split("var tarde=function(){setTimeout(run,5000)};if(document.readyState==='complete')tarde();else addEventListener('load',tarde);").join('');
  // vídeo de fundo: só baixa no 1º gesto (toque, rolagem, mouse, tecla)
  // Pixel da Meta gravado no HTML com o fbevents.js na fila do 1º gesto / 6 s: passa a baixar na abertura (PageView e Lead 100%)
  d = d.split("(window.__r1tags=window.__r1tags||[]).push('https://connect.facebook.net/en_US/fbevents.js');")
    .join("(function(d){var t=d.createElement('script'),s=d.getElementsByTagName('script')[0];t.async=!0;t.src='https://connect.facebook.net/en_US/fbevents.js';s.parentNode.insertBefore(t,s)})(document);");
  if (d.includes(VIDEO_ANTIGO)) d = d.split(VIDEO_ANTIGO).join(VIDEO_NOVO);
  d = d.replace(VIDEO_TMV_ANTIGO, () => VIDEO_TMV_NOVO);
  // Google Fonts: folha de estilo que não bloqueia a abertura
  d = d.replace(/<link\b[^>]*>/gi, (tag, off) => {
    if (!/fonts\.googleapis\.com\/css/i.test(tag) || !/rel\s*=\s*["']?stylesheet/i.test(tag) || /media\s*=|onload\s*=/i.test(tag)) return tag;
    if (/<noscript>\s*$/i.test(d.slice(Math.max(0, off - 20), off))) return tag;
    const href = attr(tag, 'href');
    if (!href) return tag;
    return `<link rel="preload" as="style" href="${href}" onload="this.onload=null;this.rel='stylesheet'"><noscript><link rel="stylesheet" href="${href}"></noscript>`;
  });
  // HubSpot Forms: o script do formulário só entra no 1º gesto, perto do formulário ou 4 s depois de abrir
  d = d.replace(/<script\b[^>]*\bsrc\s*=\s*"(https:\/\/js\.hsforms\.net\/forms\/embed\/developer\/\d+\.js)"[^>]*><\/script>/gi, (_, src) =>
    `<script>(function(){var ok=0,hs=function(){if(ok)return;ok=1;var s=document.createElement('script');s.src='${src}';s.defer=true;document.head.appendChild(s)};['touchstart','pointerdown','scroll','keydown','mousemove'].forEach(function(e){addEventListener(e,hs,{once:true,passive:true})});var f=document.querySelector('.hs-form-html');if(f&&'IntersectionObserver' in window)new IntersectionObserver(function(es,o){if(es[0].isIntersecting){hs();o.disconnect()}},{rootMargin:'600px'}).observe(f);var t=function(){setTimeout(hs,4000)};if(document.readyState==='complete')t();else addEventListener('load',t)})();</script>`);
  // foto do topo: se a página não pré-carrega nenhuma imagem, pré-carrega a 1ª <img fetchpriority="high"> (mesmo srcset/sizes)
  if (!/<link\b[^>]*rel\s*=\s*["']?preload[^>]*as\s*=\s*["']?image/i.test(d) && !/<link\b[^>]*as\s*=\s*["']?image[^>]*rel\s*=\s*["']?preload/i.test(d)) {
    const im = /<img\b[^>]*fetchpriority\s*=\s*"high"[^>]*>/i.exec(d);
    if (im) {
      const tag = im[0], src = attr(tag, 'src'), antes = d.slice(Math.max(0, im.index - 600), im.index);
      if (src && !/^data:/i.test(src) && !/loading\s*=\s*"lazy"/i.test(tag) && !/<source\b[^>]*>\s*$/i.test(antes) && !/<picture\b(?![\s\S]*<\/picture>)/i.test(antes)) {
        const ss = attr(tag, 'srcset'), sz = attr(tag, 'sizes');
        const link = `<link rel="preload" as="image" href="${src}"${ss ? ` imagesrcset="${ss}"` : ''}${ss && sz ? ` imagesizes="${sz}"` : ''} fetchpriority="high">`;
        if (/<head[^>]*>/i.test(d)) d = d.replace(/<head[^>]*>/i, (m) => m + '\n' + link);
      }
    }
  }
  // pré-carga de imagem antes do <meta viewport>: nesse ponto o celular ainda acha que a tela tem 980 px, avalia
  // imagesizes/media como desktop e baixa a versão grande (além da certa). Elas vão para logo depois da viewport.
  const PRE_IMG = /<link\b(?=[^>]*\brel\s*=\s*["']?preload)(?=[^>]*\bas\s*=\s*["']?image)[^>]*>/gi;
  const vp = /<meta\b[^>]*name\s*=\s*["']?viewport[^>]*>/i.exec(d);
  if (vp) {
    const antesVp = d.slice(0, vp.index);
    const pre = antesVp.match(PRE_IMG);
    if (pre) d = antesVp.replace(PRE_IMG, '') + vp[0] + pre.join('') + d.slice(vp.index + vp[0].length);
  }
  return d;
}

// Página no ar (ativa, fora do laboratório) com o rastreamento dela. Usada pela api/servir e pelo build
// das páginas estáticas (scripts/estaticas.mjs), para as duas entregarem exatamente o mesmo HTML.
// apelido = aberta por um endereço antigo (redirecionamento): a barra passa a mostrar o endereço novo.
export function documentoNoAr(p, cfg, html, caminho, apelido = false) {
  const rastreio = rastreioDaPagina(p, cfg);
  rastreio.capi = Boolean(rastreio.pixelMeta && process.env[`META_CAPI_TOKEN_${rastreio.pixelMeta}`]);
  let doc = montarDocumento(html, p.titulo, rastreio);
  if (apelido) {
    const troca = `<script>try{history.replaceState(history.state,'',${JSON.stringify('/' + caminho)}+location.search+location.hash)}catch(e){}</script><link rel="canonical" href="/${caminho}">`;
    doc = /<head[^>]*>/i.test(doc) ? doc.replace(/<head[^>]*>/i, (m) => m + troca) : troca + doc;
  }
  return doc;
}

export function montarDocumento(html, titulo, rastreio = {}) {
  return otimizarDocumento(montarDocumentoBase(html, titulo, rastreio));
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
  const gtmPagina = uniq([...h.matchAll(/googletagmanager[.]com[/]gtm[.]js[?]id=(GTM-[A-Z0-9]+)/gi)].map((m) => m[1].toUpperCase()));
  const gtmGlobal = limparGtm(cfg.gtm);
  const pixelGlobal = limparPixelMeta(cfg.pixelMeta), clarityGlobal = limparClarity(cfg.clarity);
  return {
    pixel: temFb ? pixelsPagina.map((id) => ({ id, origem: 'pagina' })) : pixelGlobal ? [{ id: pixelGlobal, origem: 'painel' }] : [],
    clarity: clarityPagina.length ? clarityPagina.map((id) => ({ id, origem: 'pagina' })) : clarityGlobal ? [{ id: clarityGlobal, origem: 'painel' }] : [],
    gtm: gtmPagina.length ? gtmPagina.map((id) => ({ id, origem: 'pagina' })) : gtmGlobal ? [{ id: gtmGlobal, origem: 'painel' }] : [],
  };
}
