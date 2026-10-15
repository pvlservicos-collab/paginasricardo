// Servidor para usar o painel no seu computador:  npm run dev  →  http://localhost:3000/painel
// Faz o mesmo que a Vercel: serve o dist/, roda a pasta api/ e refaz o build depois de cada alteração.
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './build.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const PORTA = Number(process.env.PORT) || 3000;
const TIPOS = {
  html: 'text/html; charset=utf-8', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', ico: 'image/x-icon', avif: 'image/avif',
};

await build({ imagens: false });

async function arquivo(caminho) {
  const limpo = decodeURIComponent(caminho).replace(/\.\.+/g, '');
  const tentativas = [limpo, `${limpo}.html`, path.join(limpo, 'index.html')];
  for (const t of tentativas) {
    const p = path.join(DIST, t);
    try { if ((await fs.stat(p)).isFile()) return p; } catch {}
  }
  return null;
}

async function api(req, res, nome) {
  const mod = await import(pathToFileURL(path.join(RAIZ, 'api', `${nome}.js`)).href + `?t=${Date.now()}`).catch(() => null);
  const fn = mod?.[req.method];
  if (!fn) { res.writeHead(404).end('{"erro":"rota não existe"}'); return; }
  const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => {
    const partes = []; req.on('data', (c) => partes.push(c)); req.on('end', () => ok(Buffer.concat(partes)));
  });
  const request = new Request(`http://localhost:${PORTA}${req.url}`, { method: req.method, headers: req.headers, body: corpo });
  const resposta = await fn(request);
  // refaz o build antes de responder (como a Vercel faria depois do commit)
  if (req.method !== 'GET' && resposta.ok && nome !== 'login') await rebuild();
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

let fila = Promise.resolve();
const rebuild = () => (fila = fila.then(() => build({ silencioso: true, imagens: false })).catch((e) => console.error('Build:', e.message)));

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/') { res.writeHead(302, { Location: '/painel' }).end(); return; }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname.slice(5).replace(/\/$/, ''));
    const p = await arquivo(pathname);
    if (p) {
      res.writeHead(200, { 'Content-Type': TIPOS[p.split('.').pop()] || 'application/octet-stream' });
      res.end(await fs.readFile(p));
      return;
    }
    if (pathname.startsWith('/wp-content/uploads/')) {
      // imagem ainda não baixada: busca no site atual (rode "npm run imagens" para guardar no projeto)
      const r = await fetch('https://lp.grupor1.com' + pathname).catch(() => null);
      if (r?.ok) { res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || '' }); res.end(Buffer.from(await r.arrayBuffer())); return; }
    }
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }).end(await fs.readFile(path.join(DIST, '404.html')));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end(String(e.message));
  }
}).listen(PORTA, () => console.log(`\nPainel: http://localhost:${PORTA}/painel  (usuário ricardo / senha 2026)\n`));
