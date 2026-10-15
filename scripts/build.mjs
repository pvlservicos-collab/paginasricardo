// Gera a pasta dist/ que a Vercel publica.
// Contém só o painel e o 404. As páginas saem da api/servir (banco) e as imagens/vídeos de
// /wp-content/ saem do Vercel Blob (veja vercel.json e scripts/imagens.mjs).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARQUIVO_CONFIG, PASTA_PAGINAS, mesclarConfig, validarUrls, documentoInativo } from '../lib/core.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

async function copiarPasta(origem, destino) {
  let itens;
  try { itens = await fs.readdir(origem, { withFileTypes: true }); } catch { return 0; }
  await fs.mkdir(destino, { recursive: true });
  let n = 0;
  for (const i of itens) {
    const de = path.join(origem, i.name), para = path.join(destino, i.name);
    if (i.isDirectory()) n += await copiarPasta(de, para);
    else if (i.name !== '.gitkeep') { await fs.copyFile(de, para); n++; }
  }
  return n;
}

export async function build({ silencioso = false } = {}) {
  const log = silencioso ? () => {} : console.log;
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  // As páginas não são geradas aqui: a api/servir entrega cada uma direto do banco (ou da pasta
  // paginas/, sem banco), então uma alteração no painel entra no ar sem precisar de deploy.
  const arquivos = (await fs.readdir(path.join(RAIZ, PASTA_PAGINAS))).filter((n) => /\.html?$/i.test(n)).sort();
  let bruta = null;
  try { bruta = JSON.parse(await fs.readFile(path.join(RAIZ, ARQUIVO_CONFIG), 'utf8')); } catch {}
  const cfg = mesclarConfig(bruta, arquivos);
  const problema = validarUrls(cfg);
  if (problema) throw new Error(problema);

  await fs.writeFile(path.join(DIST, '404.html'), documentoInativo('Página não encontrada').replace('Esta página não está disponível no momento.', 'Página não encontrada.'));
  await copiarPasta(path.join(RAIZ, 'painel'), path.join(DIST, 'painel'));
  log(`Build pronto: painel + ${cfg.paginas.length} página(s) iniciais (imagens no Blob).`);
  return cfg;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error('Erro no build:', e.message); process.exit(1); });
}
