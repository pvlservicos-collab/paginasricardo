// Gera as páginas como arquivos estáticos em dist/_p/<domínio>/<url>.html (rodado pelo build).
//
// O vercel.json reescreve /<url> nos domínios do site para /_p/<domínio>/<url>. Arquivo estático ignora a
// query, então /pagina?fbclid=abc e /pagina?fbclid=xyz saem da mesma cópia da CDN, sem rodar função
// (era o grosso da conta da Vercel).
//
// ATENÇÃO: nesses domínios, endereço sem arquivo dá 404 (a Vercel não passa para a api/servir quando o
// arquivo falta). Por isso este build cobre tudo o que a api/servir faria, para cada domínio da lista:
//   - página do próprio domínio (ou cujo domínio ainda não tem DNS) → a página, com o mesmo HTML da api/servir;
//   - página de outro domínio já no ar → leva para lá mantendo ?fbclid/UTMs (a api/servir fazia com 308);
//   - página inativa → aviso de indisponível (ou redirecionamento escolhido no painel);
//   - endereço antigo (URL trocada) → a página nova, com a barra trocando para o endereço novo.
// Página criada depois do deploy só aparece no próximo (publicação em lote, ~3 min: lib/publicacao.mjs).
// Domínios fora da lista, o laboratório (zz-lab/) e as prévias continuam pela api/servir.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// domínios da regra estática, lidos do próprio vercel.json (has.host da reescrita para /_p/)
export async function dominiosEstaticos() {
  const v = JSON.parse(await fs.readFile(path.join(RAIZ, 'vercel.json'), 'utf8'));
  const r = (v.rewrites || []).find((x) => String(x.destination).startsWith('/_p/'));
  const valor = r && (r.has || []).find((h) => h.type === 'host')?.value;
  if (!valor) return [];
  // só nomes de domínio literais (o padrão dos endereços de deploy *.vercel.app fica de fora)
  return valor.replace(/^\(\?<host>/, '').replace(/\)$/, '').split('|')
    .filter((s) => /^[a-z0-9-]+(\\\.[a-z0-9-]+)+$/.test(s)).map((s) => s.replace(/\\\./g, '.'));
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// leva para o domínio certo mantendo a query (fbclid, UTMs) e o #; sem pixel nenhum (como o 308 de antes)
const documentoIr = (destino) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Redirecionando…</title><link rel="canonical" href="${esc(destino)}"><script>location.replace(${JSON.stringify(destino)}+location.search+location.hash)</script><noscript><meta http-equiv="refresh" content="0;url=${esc(destino)}"></noscript></head><body></body></html>`;

export async function gerarEstaticas(DIST, log = console.log) {
  // Sem estas páginas, os domínios da lista dariam 404. Qualquer falha aqui derruba o build (scripts/build.mjs),
  // e a versão anterior continua no ar.
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) throw new Error('sem DATABASE_URL para gerar as páginas');
  if (!(process.env.VERCEL_DEPLOY_HOOK || process.env.VERCEL_TOKEN) || !process.env.CRON_SECRET) {
    console.warn('AVISO: falta VERCEL_DEPLOY_HOOK (ou VERCEL_TOKEN) ou CRON_SECRET: alterações do painel só entram no ar no próximo deploy.');
  }
  const inicio = new Date();
  const { carregarConfig } = await import('../lib/servidor.mjs');
  const { lerArquivos } = await import('../lib/store.mjs');
  const { dominioNoAr } = await import('../lib/operacoes.mjs');
  const { PASTA_PAGINAS, normalizarUrl, hostDaPagina, documentoNoAr, documentoInativo, documentoRedirecionamento } = await import('../lib/core.mjs');
  const { marcarGerado } = await import('../lib/publicacao.mjs');

  const lista = await dominiosEstaticos();
  if (!lista.length) { log('Páginas estáticas: vercel.json sem a regra de /_p/, pulei.'); return 0; }
  const cfg = await carregarConfig();
  const paginas = cfg.paginas.filter((p) => !p.lab);
  const htmls = await lerArquivos(paginas.map((p) => `${PASTA_PAGINAS}/${p.arquivo}`));
  const htmlDe = new Map(paginas.map((p, i) => [p.slug, htmls[i]]));

  // domínio "no ar" = aponta para o app. Os da lista recebem tráfego por definição; os outros, consulta.
  const noArCache = new Map(lista.map((h) => [h, true]));
  const noAr = async (h) => { if (!noArCache.has(h)) noArCache.set(h, await dominioNoAr(h)); return noArCache.get(h); };

  // endereço único do deploy (paginasricardo-xxxx-....vercel.app, usado para testar a prévia): responde como o domínio padrão
  const alvos = lista.map((h) => ({ host: h, comoSe: h }));
  if (process.env.VERCEL_URL && !lista.includes(process.env.VERCEL_URL)) alvos.push({ host: process.env.VERCEL_URL, comoSe: hostDaPagina({}, cfg, '') });

  const urls = new Set(paginas.map((p) => normalizarUrl(p.url)));
  const arquivos = [];
  // o que abrir em <comoSe>/<caminho> para a página p (apelido = veio de endereço antigo)
  const entrega = async (p, comoSe, caminho, apelido) => {
    const url = normalizarUrl(p.url), certo = hostDaPagina(p, cfg, '');
    if (certo && certo !== comoSe && (await noAr(certo))) return documentoIr(`https://${certo}/${url}`);
    if (!p.ativa) return apelido ? documentoIr('/' + url) : p.redirecionarInativaPara ? documentoRedirecionamento(p.redirecionarInativaPara, p.titulo) : documentoInativo(p.titulo);
    const h = htmlDe.get(p.slug);
    if (h == null) return null; // sem HTML: 404 (igual à api/servir)
    return documentoNoAr(p, cfg, h, url, apelido);
  };
  for (const { host, comoSe } of alvos) {
    for (const p of paginas) {
      const url = normalizarUrl(p.url);
      const doc = url && (await entrega(p, comoSe, url, false));
      if (doc) arquivos.push({ host, url, doc });
    }
    for (const r of cfg.redirecionamentos || []) {
      const de = normalizarUrl(r.de), alvo = normalizarUrl(r.para);
      if (!de || urls.has(de)) continue; // página existente tem prioridade (igual à api/servir)
      const p = paginas.find((x) => normalizarUrl(x.url) === alvo);
      const doc = p && (await entrega(p, comoSe, de, true));
      if (doc) arquivos.push({ host, url: de, doc });
    }
  }

  for (const a of arquivos) {
    const destino = path.join(DIST, '_p', a.host, ...a.url.split('/')) + '.html';
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, a.doc);
  }
  await marcarGerado(inicio);
  log(`Páginas estáticas: ${arquivos.length} arquivo(s) em ${alvos.length} domínio(s).`);
  return arquivos.length;
}
