// Gera a pasta dist/ que a Vercel publica.
// Cada página vira um HTML estático e puro: nenhum código do painel entra nelas.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ARQUIVO_CONFIG, PASTA_PAGINAS, mesclarConfig, validarUrls, normalizarUrl,
  montarDocumento, documentoInativo, documentoRedirecionamento,
} from '../lib/core.mjs';
import { baixarFaltantes } from './imagens.mjs';

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

async function escrever(urlRel, conteudo) {
  const destino = path.join(DIST, `${urlRel}.html`);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, conteudo);
}

export async function build({ silencioso = false, imagens = !process.argv.includes('--sem-imagens') } = {}) {
  const log = silencioso ? () => {} : console.log;
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const arquivos = (await fs.readdir(path.join(RAIZ, PASTA_PAGINAS))).filter((n) => /\.html?$/i.test(n)).sort();
  let bruta = null;
  try { bruta = JSON.parse(await fs.readFile(path.join(RAIZ, ARQUIVO_CONFIG), 'utf8')); } catch {}
  const cfg = mesclarConfig(bruta, arquivos);
  const problema = validarUrls(cfg);
  if (problema) throw new Error(problema);

  const ocupadas = new Set();
  for (const p of cfg.paginas) {
    const url = normalizarUrl(p.url);
    ocupadas.add(url);
    if (!p.ativa) {
      await escrever(url, p.redirecionarInativaPara ? documentoRedirecionamento(p.redirecionarInativaPara, p.titulo) : documentoInativo(p.titulo));
      log(`  ○ /${url}  (desativada${p.redirecionarInativaPara ? ' → /' + normalizarUrl(p.redirecionarInativaPara) : ''})`);
      continue;
    }
    const html = await fs.readFile(path.join(RAIZ, PASTA_PAGINAS, p.arquivo), 'utf8');
    await escrever(url, montarDocumento(html, p.titulo, { pixelMeta: cfg.pixelMeta, clarity: cfg.clarity }));
    log(`  ● /${url}  ← ${p.arquivo}`);
  }

  // URLs antigas continuam levando para a nova (mantém UTMs dos anúncios já rodando)
  for (const r of cfg.redirecionamentos) {
    const de = normalizarUrl(r.de);
    if (!de || ocupadas.has(de)) continue;
    ocupadas.add(de);
    await escrever(de, documentoRedirecionamento(r.para, 'Redirecionando'));
    log(`  ↪ /${de} → /${normalizarUrl(r.para)}`);
  }

  await fs.writeFile(path.join(DIST, '404.html'), documentoInativo('Página não encontrada').replace('Esta página não está disponível no momento.', 'Página não encontrada.'));
  const nPublic = await copiarPasta(path.join(RAIZ, 'public'), DIST);
  await copiarPasta(path.join(RAIZ, 'painel'), path.join(DIST, 'painel'));
  if (imagens) {
    try { await baixarFaltantes({ destinos: [DIST], log }); }
    catch (e) { log('Imagens: não foi possível baixar agora (' + e.message + ').'); }
  }
  log(`Build pronto: ${cfg.paginas.length} página(s), ${nPublic} arquivo(s) de public/.`);
  return cfg;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().catch((e) => { console.error('Erro no build:', e.message); process.exit(1); });
}
