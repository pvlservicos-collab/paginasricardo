// Botão "Otimizar" do painel: aplica na página as técnicas que já funcionaram aqui
// (ver TECNICAS-OTIMIZACAO-PAGESPEED.md). Tudo que dá para fazer sem mudar o visual:
//   1. Google Fonts -> mesmas fontes hospedadas no nosso domínio (não bloqueia a abertura)
//   2. Imagens/vídeos dos sites antigos (WordPress) -> cópia no nosso domínio
//   3. Foto do topo com loading="lazy" -> carrega com prioridade
//   4. Vídeos do YouTube/Panda em iframe -> loading="lazy"
//   5. Imagens em base64 no HTML -> arquivos · 6. todos os <style> juntos no começo (sem salto de layout)
//   7. sem pré-carga de foto de desktop no celular · 8. vídeo do topo só no 1º gesto
// O que já é feito para todas as páginas ao servir (GTM depois do LCP, gtag em fila, HubSpot sob demanda,
// vídeo de fundo no 1º gesto, pré-carga da foto do topo) fica em lib/core.mjs (otimizarDocumento).
// Antes de gravar, o HTML atual vai para backups/<slug>/<data>.html (botão "Desfazer").
import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { gravar, lerArquivo, listarPasta, TOKEN_BLOB } from './store.mjs';
import { PASTA_PAGINAS } from './core.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const HOSTS_ANTIGOS = { 'turnemaquinadevendas.com.br': 'tmv', 'convocacaonacional.com.br': 'cne', 'lp.grupor1.com': 'lp', 'metodorgv.com.br': 'mdv', 'rgvprocessos.com.br': 'rgv' };
const RE_MIDIA = /https?:\/\/(?:www\.)?(turnemaquinadevendas\.com\.br|convocacaonacional\.com\.br|lp\.grupor1\.com|metodorgv\.com\.br|rgvprocessos\.com\.br)\/wp-content\/uploads\/([^\s"'()<>\\,]+?\.(?:webp|jpe?g|png|gif|svg|avif|mp4|webm))(\?[^\s"'()<>\\,]*)?(?=[\s"'()<>\\,]|$)/gi;

async function subir(caminho, buf, tipo) {
  if (!TOKEN_BLOB) throw new Error('Falta o Vercel Blob (BLOB_READ_WRITE_TOKEN).');
  await put(caminho, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: tipo, token: TOKEN_BLOB });
  return '/' + caminho;
}

async function emLotes(lista, n, fn) {
  const out = [];
  for (let i = 0; i < lista.length; i += n) out.push(...await Promise.allSettled(lista.slice(i, i + n).map(fn)));
  return out;
}

// 1. Google Fonts -> @font-face com os .woff2 no nosso domínio (mesmas fontes, mesmo text=)
async function fontesLocais(html, log, prazo) {
  // <link rel=stylesheet href=fonts.googleapis…> e também @import url(fonts.googleapis…) dentro de <style>
  // (o @import escondido num bloco do meio da página bloqueava a abertura: 79–89 → 96–98 nas cidades v2)
  const links = [
    ...[...html.matchAll(/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2?\?[^"]+)"[^>]*>/gi)].filter((m) => /stylesheet/i.test(m[0])).map((m) => ({ trecho: m[0], href: m[1], embrulha: true })),
    ...[...html.matchAll(/@import\s+url\(\s*['"]?(https:\/\/fonts\.googleapis\.com\/css2?\?[^'")]+)['"]?\s*\)\s*;?/gi)].map((m) => ({ trecho: m[0], href: m[1], embrulha: false })),
  ];
  for (const m of links) {
    if (Date.now() > prazo) break;
    const css = await (await fetch(m.href.replace(/&amp;/g, '&'), { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) })).text();
    if (!/@font-face/.test(css)) continue;
    let novo = css;
    const arquivos = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((x) => x[1]))];
    const res = await emLotes(arquivos, 6, async (u) => {
      const buf = Buffer.from(await (await fetch(u, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(10000) })).arrayBuffer());
      return [u, await subir(`wp-content/uploads/fonts/g/${crypto.createHash('sha1').update(u).digest('hex').slice(0, 16)}.woff2`, buf, 'font/woff2')];
    });
    if (res.some((r) => r.status !== 'fulfilled')) continue; // se algum arquivo falhar, mantém o Google Fonts dessa família
    for (const r of res) novo = novo.split(r.value[0]).join(r.value[1]);
    novo = novo.replace(/\/\*[^*]*\*\//g, '').replace(/\s*\n\s*/g, '').trim();
    html = html.split(m.trecho).join(m.embrulha ? `<style>${novo}</style>` : novo);
    log.push(`Fonte do Google hospedada no nosso domínio (${arquivos.length} arquivo(s))`);
  }
  if (log.some((l) => l.startsWith('Fonte do Google'))) {
    html = html.replace(/<link\b[^>]*rel="preconnect"[^>]*href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/gi, '');
  }
  return html;
}

// 2. Mídia dos sites antigos -> nosso domínio
async function midiaLocal(html, log, prazo) {
  const achados = new Map();
  for (const m of html.matchAll(RE_MIDIA)) achados.set(m[0], { host: m[1].toLowerCase(), rel: m[2] });
  if (!achados.size) return html;
  let ok = 0, falhou = 0;
  await emLotes([...achados.entries()], 6, async ([url, { host, rel }]) => {
    if (Date.now() > prazo) { falhou++; return; }
    const r = await fetch(url.replace(/\?.*$/, ''), { headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*,video/*,*/*' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) { falhou++; return; }
    const buf = Buffer.from(await r.arrayBuffer());
    const local = await subir(`wp-content/uploads/x/${HOSTS_ANTIGOS[host]}/${rel}`, buf, r.headers.get('content-type') || 'application/octet-stream');
    html = html.split(url).join(local);
    ok++;
  });
  if (ok) log.push(`${ok} imagem(ns)/vídeo(s) do site antigo copiados para o nosso domínio${falhou ? ` (${falhou} não baixaram e ficaram como estavam)` : ''}`);
  return html;
}

// 3. Foto do topo com loading="lazy" (atrasa o LCP) -> prioridade alta
function fotoDoTopo(html, log) {
  if (/fetchpriority\s*=\s*"high"/i.test(html)) return html;
  const corpo = Math.max(0, html.search(/<body[\s>]/i));
  const m = /<img\b[^>]*>/i.exec(html.slice(corpo));
  if (!m) return html;
  const tag = m[0];
  if (/src\s*=\s*"data:/i.test(tag) || /\.svg["?]/i.test(tag) || !/loading\s*=\s*"lazy"/i.test(tag)) return html;
  // só se a imagem estiver bem no começo da página
  if (corpo + m.index > corpo + 0.25 * (html.length - corpo)) return html;
  const nova = tag.replace(/\s+loading\s*=\s*"lazy"/i, '').replace(/^<img\b/i, '<img fetchpriority="high"');
  log.push('Foto do topo deixou de esperar ("lazy") e carrega com prioridade');
  return html.slice(0, corpo + m.index) + nova + html.slice(corpo + m.index + tag.length);
}

// 4. iframes de vídeo sem loading="lazy"
function iframesLazy(html, log) {
  let n = 0;
  const out = html.replace(/<iframe\b(?![^>]*\bloading\s*=)[^>]*\bsrc\s*=\s*"https:\/\/[^"]*(youtube\.com|youtube-nocookie\.com|pandavideo\.com\.br|vimeo\.com)[^"]*"[^>]*>/gi, (tag) => { n++; return tag.replace(/^<iframe\b/i, '<iframe loading="lazy"'); });
  if (n) log.push(`${n} vídeo(s) em iframe só carregam perto da tela`);
  return out;
}

// 5. Imagens embutidas em base64 (≥8 KB) -> arquivos no nosso domínio (o HTML fica leve; a 1ª pintura sai antes)
async function base64ParaArquivo(html, log, prazo) {
  let k = 0, kb = 0;
  for (const m of [...new Set(html.match(/data:image\/(webp|png|jpe?g|gif|avif);base64,[A-Za-z0-9+/=]{10900,}/g) || [])]) {
    if (Date.now() > prazo) break;
    const tipo = /data:image\/([a-z]+)/.exec(m)[1].replace('jpeg', 'jpg');
    const buf = Buffer.from(m.slice(m.indexOf(',') + 1), 'base64');
    const local = await subir(`wp-content/uploads/x/b64/${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${tipo}`, buf, 'image/' + tipo.replace('jpg', 'jpeg'));
    html = html.split(m).join(local); k++; kb += buf.length;
  }
  if (k) log.push(`${k} imagem(ns) embutida(s) no HTML (${Math.round(kb / 1024)} KB) viraram arquivos`);
  // modelo v1: foto do topo em versão PC (.ph-d) e celular (.ph-m): no celular só baixa a do celular, com pré-carga
  const d = /<span class="ph ph-d"><img src="(\/wp-content\/[^"]+)"/.exec(html), mo = /<span class="ph ph-m"><img src="(\/wp-content\/[^"]+)"/.exec(html);
  if (d && mo && !html.includes(`href="${mo[1]}" media=`)) {
    html = html.replace(d[0], `<span class="ph ph-d"><img loading="lazy" src="${d[1]}"`).replace(mo[0], `<span class="ph ph-m"><img fetchpriority="high" src="${mo[1]}"`);
    html = `<link rel="preload" as="image" href="${mo[1]}" media="(max-width: 899px)" fetchpriority="high">\n` + html;
    log.push('Foto do topo: no celular só baixa a versão do celular, com pré-carga');
  }
  return html;
}

// 6. Todos os <style> juntos no lugar do primeiro, na mesma ordem (o CSS final é o mesmo).
// Estilos no meio da página faziam o navegador redesenhar o topo depois da 1ª pintura (salto de layout de 0,1–0,5).
function juntarEstilos(html, log) {
  const blocos = []; let primeiro = -1;
  const sem = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, (m, pos) => { if (primeiro < 0) primeiro = pos; blocos.push(m); return ''; });
  if (blocos.length < 2) return html;
  const novo = sem.slice(0, primeiro) + blocos.join('\n') + sem.slice(primeiro);
  if (novo !== html) log.push(`${blocos.length} blocos de estilo juntos no começo da página (sem salto de layout)`);
  return novo;
}

// 7. Pré-carga de imagem só de desktop (media min-width) baixava no celular também
function semPreloadDesktop(html, log) {
  const novo = html.replace(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*media="\(min-width:\s*\d+px\)"[^>]*>/gi, '');
  if (novo !== html) log.push('Pré-carga da foto de desktop removida (baixava no celular)');
  return novo;
}

// 8. Vídeo do topo (modelo da Turnê) que baixava sozinho após o poster ou 2,5 s: só no 1º gesto (o poster fica)
function videoNoGesto(html, log) {
  const novo = html.replace(/if\s*\(\s*poster\.complete\s*\)\s*\{\s*carregarVideo\(\);?\s*\}\s*else\s*\{[^}]*\}\s*setTimeout\(\s*carregarVideo\s*,\s*\d+\s*\);?/g,
    "['touchstart','pointerdown','scroll','keydown','mousemove'].forEach(function(e){addEventListener(e,carregarVideo,{once:true,passive:true})});");
  if (novo !== html) log.push('Vídeo do topo só baixa no 1º toque/rolagem');
  return novo;
}

export async function otimizarHtml(html) {
  const log = [];
  const prazo = Date.now() + 35000; // a função tem 60 s; sobra tempo para gravar
  let h = html;
  h = await fontesLocais(h, log, prazo).catch((e) => { log.push('Fontes: não deu (' + e.message + ')'); return h; });
  h = await midiaLocal(h, log, prazo).catch((e) => { log.push('Imagens: não deu (' + e.message + ')'); return h; });
  h = await base64ParaArquivo(h, log, prazo).catch((e) => { log.push('Imagens embutidas: não deu (' + e.message + ')'); return h; });
  h = juntarEstilos(h, log);
  h = semPreloadDesktop(h, log);
  h = videoNoGesto(h, log);
  h = fotoDoTopo(h, log);
  h = iframesLazy(h, log);
  return { html: h, mudancas: log, mudou: h !== html };
}

export async function guardarBackup(pagina, html) {
  const quando = new Date().toISOString().replace(/[:.]/g, '-');
  await gravar([{ caminho: `backups/${pagina.slug}/${quando}.html`, conteudo: html }], `Backup antes de otimizar /${pagina.url}`);
  return quando;
}

export async function ultimoBackup(pagina) {
  const nomes = (await listarPasta(`backups/${pagina.slug}`)).filter((n) => n.endsWith('.html')).sort();
  if (!nomes.length) return null;
  const nome = nomes[nomes.length - 1];
  return { nome, html: await lerArquivo(`backups/${pagina.slug}/${nome}`) };
}

export const htmlAtual = (pagina) => lerArquivo(`${PASTA_PAGINAS}/${pagina.arquivo}`);
