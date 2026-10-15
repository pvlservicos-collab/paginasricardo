// Sobe as imagens e vídeos de public/wp-content/ para o Vercel Blob, com o mesmo caminho
// (ex.: wp-content/uploads/foto.webp). O site entrega /wp-content/... direto do Blob.
//   npm run imagens        → sobe só o que ainda não está no Blob
//   npm run imagens -- --todas   → sobe tudo de novo (substitui)
// Usa o BLOB_READ_WRITE_TOKEN do arquivo .env.local.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const linha of (await fs.readFile(path.join(RAIZ, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!token) { console.log('Falta BLOB_READ_WRITE_TOKEN (coloque no .env.local).'); process.exit(1); }
const { put, list } = await import('@vercel/blob');

async function arquivos(dir, base = '') {
  const out = [];
  for (const i of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (i.isDirectory()) out.push(...await arquivos(path.join(dir, i.name), `${base}${i.name}/`));
    else if (i.name !== '.gitkeep') out.push(`${base}${i.name}`);
  }
  return out;
}

const locais = await arquivos(path.join(RAIZ, 'public', 'wp-content'));
const existentes = new Set();
let cursor;
do {
  const r = await list({ prefix: 'wp-content/', cursor, limit: 1000, token });
  r.blobs.forEach((b) => existentes.add(b.pathname));
  cursor = r.hasMore ? r.cursor : undefined;
} while (cursor);

const todas = process.argv.includes('--todas');
const fila = locais.filter((rel) => todas || !existentes.has(`wp-content/${rel}`));
console.log(`${locais.length} arquivo(s) locais · ${existentes.size} já no Blob · subindo ${fila.length}`);
let ok = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (fila.length) {
    const rel = fila.shift();
    const dados = await fs.readFile(path.join(RAIZ, 'public', 'wp-content', rel));
    await put(`wp-content/${rel}`, dados, { access: 'public', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000, token });
    ok++;
    console.log(`  ✓ /wp-content/${rel} (${Math.round(dados.length / 1024)} KB)`);
  }
}));
console.log(`Pronto: ${ok} enviado(s).`);
