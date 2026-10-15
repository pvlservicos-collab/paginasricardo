// Baixa as imagens/vídeos que as páginas usam (/wp-content/uploads/...) do site atual.
//   npm run imagens            → salva em public/wp-content/uploads (rode uma vez e suba no GitHub)
// O build também chama isto para buscar só o que estiver faltando, então o deploy
// nunca sai com imagem quebrada, mesmo antes de você rodar o comando acima.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGEM = (process.env.IMAGENS_ORIGEM || 'https://lp.grupor1.com').replace(/\/+$/, '');
const RE = /\/wp-content\/uploads\/[A-Za-z0-9._\/-]+\.(?:webp|png|jpe?g|gif|svg|avif|mp4|webm)/g;

export async function caminhosUsados() {
  const pasta = path.join(RAIZ, 'paginas');
  const set = new Set();
  for (const nome of await fs.readdir(pasta)) {
    if (!/\.html?$/i.test(nome)) continue;
    const html = await fs.readFile(path.join(pasta, nome), 'utf8');
    for (const m of html.matchAll(RE)) set.add(m[0]);
  }
  return [...set].sort();
}

const existe = (p) => fs.access(p).then(() => true, () => false);

export async function baixarFaltantes({ destinos, log = console.log }) {
  const lista = await caminhosUsados();
  const faltando = [];
  for (const c of lista) {
    let tem = false;
    for (const d of destinos) if (await existe(path.join(d, c))) { tem = true; break; }
    if (!tem) faltando.push(c);
  }
  if (!faltando.length) { log(`Imagens: todas as ${lista.length} já estão no projeto.`); return { total: lista.length, baixadas: 0, falhas: [] }; }
  log(`Imagens: baixando ${faltando.length} de ${ORIGEM} ...`);
  const falhas = [];
  let baixadas = 0;
  const fila = [...faltando];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (fila.length) {
      const c = fila.shift();
      try {
        const r = await fetch(ORIGEM + c, { headers: { 'User-Agent': 'Mozilla/5.0 painel-r1' }, signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const alvo = path.join(destinos[0], c);
        await fs.mkdir(path.dirname(alvo), { recursive: true });
        await fs.writeFile(alvo, buf);
        baixadas++;
        log(`  ✓ ${c} (${Math.round(buf.length / 1024)} KB)`);
      } catch (e) {
        falhas.push(c);
        log(`  ✗ ${c} — ${e.message}`);
      }
    }
  }));
  log(`Imagens: ${baixadas} baixada(s), ${falhas.length} falha(s).`);
  return { total: lista.length, baixadas, falhas };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  baixarFaltantes({ destinos: [path.join(RAIZ, 'public')] }).then((r) => {
    if (r.falhas.length) process.exitCode = 1;
  });
}
