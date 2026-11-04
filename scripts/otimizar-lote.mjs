// Lote de otimização com o arsenal completo (rodar de dentro de painel-r1): node scripts/otimizar-lote.mjs slug1 slug2 ...
// Além do otimizarHtml: font-display optional + pré-carga das fontes do topo (descobertas num Chrome via puppeteer-core),
// lazy abaixo do hero e content-visibility. Precisa de puppeteer-core (caminho PP abaixo) e da chave PSI em ../ferramentas-pagespeed/.env.
// Otimiza um lote de páginas com o arsenal (backup no banco → otimizarHtml + extras → grava → mede 2x no PageSpeed).
import fs from 'fs';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = /^([A-Z_0-9]+)=(.*)$/.exec(l.trim()); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
for (const l of fs.readFileSync('../ferramentas-pagespeed/.env', 'utf8').split('\n')) { const m = /^(PSI_API_KEY)=(.*)$/.exec(l.trim()); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const { carregarConfig } = await import('../lib/servidor.mjs');
const { atualizarPagina } = await import('../lib/operacoes.mjs');
const { medirPagina } = await import('../lib/pagespeed.mjs');
const { otimizarHtml, guardarBackup, htmlAtual } = await import('../lib/otimizar.mjs');
const slugs = process.argv.slice(2);
const cfg0 = await carregarConfig();
const quem = { login: 'claude', papel: 'admin', origem: 'claude', ip: 'local' };

const CV = `<style id="cv-secoes">section:not(.hero){content-visibility:auto;contain-intrinsic-size:auto 900px}html.cv-off section{content-visibility:visible}</style>
<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(a)document.documentElement.classList.add('cv-off')},true);</script>`;

const { put } = await import('@vercel/blob');
const crypto = await import('node:crypto');
// imagens embutidas no HTML em base64 (≥8 KB) viram arquivos no nosso domínio: o HTML fica leve e a 1ª pintura sai antes
async function extrairBase64(h, log) {
  let n = h, k = 0, kb = 0;
  for (const m of [...new Set(h.match(/data:image\/(webp|png|jpe?g|gif|avif);base64,[A-Za-z0-9+/=]{10900,}/g) || [])]) {
    const tipo = /data:image\/([a-z]+)/.exec(m)[1].replace('jpeg', 'jpg');
    const buf = Buffer.from(m.slice(m.indexOf(',') + 1), 'base64');
    const nome = `wp-content/uploads/x/b64/${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${tipo}`;
    await put(nome, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'image/' + tipo.replace('jpg', 'jpeg'), token: process.env.BLOB_READ_WRITE_TOKEN });
    n = n.split(m).join('/' + nome); k++; kb += buf.length;
  }
  if (k) log.push(`${k} imagem(ns) embutida(s) no HTML (${Math.round(kb / 1024)} KB) viraram arquivos`);
  // modelo v1: foto do topo com versão desktop (.ph-d) e celular (.ph-m)
  const d = /<span class="ph ph-d"><img src="(\/wp-content\/[^"]+)"/.exec(n), mo = /<span class="ph ph-m"><img src="(\/wp-content\/[^"]+)"/.exec(n);
  if (d && mo && !n.includes(`href="${mo[1]}" media=`)) {
    n = n.replace(d[0], `<span class="ph ph-d"><img loading="lazy" src="${d[1]}"`).replace(mo[0], `<span class="ph ph-m"><img fetchpriority="high" src="${mo[1]}"`);
    n = `<link rel="preload" as="image" href="${mo[1]}" media="(max-width: 899px)" fetchpriority="high">\n` + n;
    log.push('foto do topo: só a versão do celular carrega no celular, com pré-carga');
  }
  return n;
}
// <style> dentro do topo: o navegador desenhava o topo antes de ler esses estilos e depois redesenhava (salto de layout).
// Sobem para logo antes do topo (mesma ordem na cascata).
function estilosDoTopo(h, log) {
  const ini = h.search(/<(section|header)\b[^>]*class="[^"]*\b(hero|fh)\b/i);
  if (ini < 0) return h;
  const tag = /<(section|header)/i.exec(h.slice(ini))[1].toLowerCase();
  const fim = h.indexOf(`</${tag}>`, ini);
  if (fim < 0) return h;
  const miolo = h.slice(ini, fim);
  const estilos = miolo.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || [];
  if (!estilos.length) return h;
  log.push(`${estilos.length} bloco(s) de estilo de dentro do topo movidos para antes dele (fim do salto de layout)`);
  return h.slice(0, ini) + estilos.join('\n') + '\n' + miolo.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '') + h.slice(fim);
}

function extras(h, log) {
  let n = estilosDoTopo(h, log);
  // fontes do nosso domínio: optional (com pré-carga das do topo) = sem salto de layout quando a fonte chega
  const f0 = n;
  n = n.replace(/@font-face\s*\{[^}]*?\/wp-content\/uploads\/fonts\/[^}]*?\}/g, (r) => r.replace(/font-display:\s*swap/g, 'font-display: optional'));
  if (n !== f0) log.push('fontes com font-display: optional (sem salto quando carregam)');
  // pré-carga com media de desktop é baixada no celular também: sai
  const antes = n;
  n = n.replace(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*media="\(min-width:\s*\d+px\)"[^>]*>/gi, '');
  if (n !== antes) log.push('pré-carga da foto de desktop removida (baixava no celular)');
  // vídeo do topo (modelo da turnê): baixava após o poster ou 2,5 s; agora só no 1º gesto (o poster fica)
  const v0 = n;
  n = n.replace(/if\s*\(\s*poster\.complete\s*\)\s*\{\s*carregarVideo\(\);?\s*\}\s*else\s*\{[^}]*\}\s*setTimeout\(\s*carregarVideo\s*,\s*\d+\s*\);?/g,
    "['touchstart','pointerdown','scroll','keydown','mousemove'].forEach(function(e){addEventListener(e,carregarVideo,{once:true,passive:true})});");
  if (n !== v0) log.push('vídeo do topo só baixa no 1º gesto');
  // só quando a página tem <section class="hero">: imagens depois do hero carregam perto da tela + seções desenhadas sob demanda
  const hi = n.search(/<section\b[^>]*class="[^"]*\bhero\b/i);
  if (hi >= 0) {
    const fim = n.indexOf('</section>', hi);
    if (fim > 0) {
      let k = 0;
      n = n.slice(0, fim) + n.slice(fim).replace(/<img\b[^>]*>/gi, (tag) => {
        if (/\bloading\s*=/.test(tag) || /fetchpriority/.test(tag)) return tag;
        k++; return tag.replace(/^<img\b/i, '<img loading="lazy" decoding="async"');
      });
      if (k) log.push(`${k} imagem(ns) abaixo do topo com loading=lazy`);
    }
    if (!n.includes('id="cv-secoes"')) { n = CV + '\n' + n; log.push('seções abaixo do topo desenhadas só perto da tela (content-visibility)'); }
  }
  return n;
}

const { linkDaPagina } = await import('../lib/core.mjs');
const PP = 'file:///C:/Users/pedro/AppData/Local/Temp/claude/c--Users-pedro-Desktop-a-RICARDO-NUNES-paginasricardo/8770d05f-0aec-4ad6-a8b3-4d8da21bf36b/scratchpad/pp/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
const puppeteer = (await import(PP)).default;
const navegador = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] });
async function fontesDoTopo(url) {
  const pg = await navegador.newPage();
  try {
    await pg.setViewport({ width: 412, height: 823, isMobile: true, hasTouch: true });
    await pg.goto(url + '?c=' + Date.now(), { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
    // fonte de cada texto visível no topo = a 1ª da lista do CSS que tem @font-face na página
    // (não depende de a fonte já ter carregado — com font-display: optional ela pode não ter)
    return await pg.evaluate(() => {
      const comFace = new Set();
      for (const ss of document.styleSheets) { let rr; try { rr = ss.cssRules; } catch { continue; } for (const r of rr) if (r instanceof CSSFontFaceRule) comFace.add(r.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase()); }
      const vis = [...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0 && b.width > 0 && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()); });
      const usados = new Set();
      for (const e of vis) {
        const s = getComputedStyle(e);
        const fam = s.fontFamily.split(',').map((x) => x.replace(/["']/g, '').trim().toLowerCase()).find((x) => comFace.has(x));
        if (fam) usados.add(`${fam}|${s.fontWeight}|${s.fontStyle}`);
      }
      // faces latin do nosso domínio
      const faces = [];
      for (const ss of document.styleSheets) {
        let regras; try { regras = ss.cssRules; } catch { continue; }
        for (const r of regras) {
          if (!(r instanceof CSSFontFaceRule)) continue;
          const faixa = r.style.getPropertyValue('unicode-range') || '';
          if (faixa && !/U\+0-FF|U\+0000-00FF/i.test(faixa)) continue; // só o subconjunto latin
          const src = (/url\(["']?(\/wp-content\/uploads\/fonts\/[^"')]+\.woff2)/.exec(r.style.getPropertyValue('src')) || [])[1];
          if (!src) continue;
          const [p0, p1] = (r.style.getPropertyValue('font-weight') || '400').split(/\s+/).map(Number);
          faces.push({ fam: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim().toLowerCase(), p0, p1: p1 || p0, it: /italic|oblique/.test(r.style.getPropertyValue('font-style') || ''), src });
        }
      }
      // para cada fonte usada: a face com o mesmo estilo e o peso mais próximo (como o navegador escolhe)
      const out = new Set();
      for (const u of usados) {
        const [f, w, st] = u.split('|');
        const cands = faces.filter((x) => x.fam === f && x.it === (st === 'italic'));
        if (!cands.length) continue;
        const dist = (x) => (+w >= x.p0 && +w <= x.p1 ? 0 : Math.min(Math.abs(+w - x.p0), Math.abs(+w - x.p1)));
        cands.sort((a, b) => dist(a) - dist(b));
        out.add(cands[0].src);
      }
      return [...out].slice(0, 5);
    });
  } finally { await pg.close(); }
}

const res = [];
async function uma(slug) {
  const p = cfg0.paginas.find((x) => x.slug === slug);
  if (!p) { res.push({ slug, erro: 'não achei' }); return; }
  try {
    const html = await htmlAtual(p);
    const o = await otimizarHtml(html);
    const log = [...o.mudancas];
    const novo = extras(await extrairBase64(o.html, log), log);
    if (novo !== html) {
      await guardarBackup(p, html);
      await atualizarPagina(p.slug, { html: novo }, quem);
    }
    // fontes usadas no topo: abre a página num Chrome e pré-carrega os .woff2 (latin) delas — evita o salto de layout da troca de fonte
    const urlsFonte = await fontesDoTopo(linkDaPagina(p, cfg0)).catch(() => []);
    if (urlsFonte.length) {
      const atual = await htmlAtual(p);
      const pre = urlsFonte.filter((u) => !atual.includes(`rel="preload" as="font" type="font/woff2" href="${u}"`)).map((u) => `<link rel="preload" as="font" type="font/woff2" href="${u}" crossorigin>`).join('');
      if (pre) { await atualizarPagina(p.slug, { html: pre + '\n' + atual }, quem); log.push(`${urlsFonte.length} fonte(s) do topo pré-carregadas`); }
    }
    const cfg = await carregarConfig();
    const pp = cfg.paginas.find((x) => x.slug === slug);
    const notas = [];
    for (let i = 0; i < 2; i++) { try { notas.push((await medirPagina(pp, cfg, 'mobile')).performance); } catch (e) { notas.push('erro'); } }
    res.push({ slug, notas, mudancas: log });
    console.log(slug, notas.join('/'), '|', log.join(' · '));
  } catch (e) { res.push({ slug, erro: e.message }); console.log(slug, 'ERRO', e.message); }
}
const fila = [...slugs];
await Promise.all([1, 2, 3].map(async () => { while (fila.length) await uma(fila.shift()); }));
await navegador.close();
fs.writeFileSync(process.env.SAIDA || 'zz-lote-resultado.json', JSON.stringify(res, null, 1));
