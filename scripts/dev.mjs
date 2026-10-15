// Servidor para usar o painel no seu computador:  npm run dev  →  http://localhost:3000/painel
// Faz o mesmo que a Vercel: serve o dist/ (painel e imagens), roda a pasta api/ e entrega as páginas pela api/servir.
// Com DATABASE_URL (ex.: num arquivo .env.local) usa o mesmo banco da Vercel; sem ele, a pasta do projeto.
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

try {
  for (const linha of (await fs.readFile(path.join(RAIZ, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

await build();

async function arquivo(caminho) {
  const limpo = decodeURIComponent(caminho).replace(/\.\.+/g, '');
  const tentativas = [limpo, `${limpo}.html`, path.join(limpo, 'index.html')];
  for (const t of tentativas) {
    const p = path.join(DIST, t);
    try { if ((await fs.stat(p)).isFile()) return p; } catch {}
  }
  return null;
}

async function api(req, res, nome, url = req.url) {
  const mod = await import(pathToFileURL(path.join(RAIZ, 'api', `${nome}.js`)).href + `?t=${Date.now()}`).catch(() => null);
  const fn = mod?.[req.method];
  if (!fn) { res.writeHead(404).end('{"erro":"rota não existe"}'); return; }
  const corpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => {
    const partes = []; req.on('data', (c) => partes.push(c)); req.on('end', () => ok(Buffer.concat(partes)));
  });
  const request = new Request(`http://localhost:${PORTA}${url}`, { method: req.method, headers: req.headers, body: corpo });
  const resposta = await fn(request);
  res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
  res.end(Buffer.from(await resposta.arrayBuffer()));
}

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/') { res.writeHead(302, { Location: '/painel' }).end(); return; }
    if (pathname.startsWith('/api/')) return await api(req, res, pathname.slice(5).replace(/\/$/, ''));
    const wk = /^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server|openid-configuration)/.exec(pathname);
    if (wk) return await api(req, res, 'oauth/metadados', `/api/oauth/metadados?tipo=${wk[1] === 'oauth-protected-resource' ? 'recurso' : 'servidor'}`);
    const p = await arquivo(pathname);
    if (p) {
      res.writeHead(200, { 'Content-Type': TIPOS[p.split('.').pop()] || 'application/octet-stream' });
      res.end(await fs.readFile(p));
      return;
    }
    if (pathname.startsWith('/wp-content/uploads/')) {
      // imagens e vídeos ficam no Vercel Blob (igual na Vercel)
      const r = await fetch('https://mgdpqhggmvokpsko.public.blob.vercel-storage.com' + pathname).catch(() => null);
      if (r?.ok) { res.writeHead(200, { 'Content-Type': r.headers.get('content-type') || '' }); res.end(Buffer.from(await r.arrayBuffer())); return; }
    }
    // páginas publicadas: mesma função que a Vercel usa
    return await api(req, res, 'servir', `/api/servir?caminho=${encodeURIComponent(pathname.slice(1))}`);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500).end(String(e.message));
  }
}).listen(PORTA, () => console.log(`\nPainel: http://localhost:${PORTA}/painel  (usuário ricardo / senha 2026)\n`));
