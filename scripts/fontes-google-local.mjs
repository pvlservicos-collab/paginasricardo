// (mover/rodar a partir da pasta painel-r1: node scripts/fontes-google-local.mjs <pasta-backup> slug1 slug2 ... [--dry])
// Troca <link> do Google Fonts por @font-face com os arquivos .woff2 no nosso domínio (mesmas fontes, mesmo visual).
// Uso: node zz-fontes.mjs <pasta-backup> slug1 slug2 ... [--dry]
import fs from 'fs';
import crypto from 'crypto';
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) { const m = /^([A-Z_0-9]+)=(.*)$/.exec(l.trim()); if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, ''); }
const { carregarConfig } = await import('../lib/servidor.mjs');
const { htmlDaPagina, atualizarPagina } = await import('../lib/operacoes.mjs');
const { put } = await import('@vercel/blob');
const [bk, ...resto] = process.argv.slice(2);
const dry = resto.includes('--dry');
const slugs = resto.filter((x) => !x.startsWith('--'));
const cfg = await carregarConfig();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const subidos = new Map();
async function localizar(href) {
  const css = await (await fetch(href.replace(/&amp;/g, '&'), { headers: { 'user-agent': UA } })).text();
  if (!/@font-face/.test(css)) throw new Error('CSS sem @font-face: ' + href);
  let out = css;
  for (const m of css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)) {
    const u = m[1];
    if (!subidos.has(u)) {
      const buf = Buffer.from(await (await fetch(u, { headers: { 'user-agent': UA } })).arrayBuffer());
      const nome = `wp-content/uploads/fonts/g/${crypto.createHash('sha1').update(u).digest('hex').slice(0, 16)}.woff2`;
      if (!dry) await put(nome, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'font/woff2', token: process.env.BLOB_READ_WRITE_TOKEN });
      subidos.set(u, '/' + nome);
    }
    out = out.split(u).join(subidos.get(u));
  }
  return out.replace(/\/\*[^*]*\*\//g, '').replace(/\s*\n\s*/g, '').trim();
}
fs.mkdirSync(bk, { recursive: true });
for (const s of slugs) {
  const p = cfg.paginas.find((x) => x.slug === s) || cfg.paginas.find((x) => x.url === s);
  if (!p) { console.log('não achei', s); continue; }
  const h = await htmlDaPagina(p);
  let n = h, trocas = 0;
  const links = [...h.matchAll(/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/css2?\?[^"]+)"[^>]*>/gi)];
  for (const m of links) {
    const tag = m[0];
    if (!/stylesheet/i.test(tag)) continue;
    const css = await localizar(m[1]);
    n = n.split(tag).join(`<style>${css}</style>`);
    trocas++;
  }
  // as pré-conexões ao Google Fonts deixam de ser usadas
  n = n.replace(/<link\b[^>]*rel="preconnect"[^>]*href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/gi, '');
  if (!trocas) { console.log('sem Google Fonts', s); continue; }
  fs.writeFileSync(`${bk}/${s}.html`, h);
  if (dry) { console.log('dry', s, trocas, 'link(s)'); continue; }
  await atualizarPagina(p.slug, { html: n }, { login: 'claude', papel: 'admin', origem: 'claude', ip: 'local' });
  console.log('publicado', s, trocas, 'link(s)');
}
console.log('arquivos de fonte:', subidos.size);
