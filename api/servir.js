// Entrega as páginas direto do banco. Desde 06/11/2026 quase todas saem como arquivo estático do deploy
// (scripts/estaticas.mjs, publicadas em lote por lib/publicacao.mjs), que a CDN entrega mesmo com ?fbclid=.
// Esta função fica como reserva: página nova ainda não publicada, domínio errado (leva ao certo), domínio
// ainda sem DNS, redirecionamento para fora, laboratório e prévias do painel.
// O HTML entregue é o mesmo de antes (estático puro + pixel/Clarity): nenhum código do painel entra nele.
// A CDN guarda a resposta por 60 s (entregando a cópia anterior enquanto busca a nova) e esta função
// guarda a configuração e o HTML na memória por 5 s.
import { carregarConfig } from '../lib/servidor.mjs';
import { lerArquivo } from '../lib/store.mjs';
import { dominioNoAr } from '../lib/operacoes.mjs';
import { PASTA_PAGINAS, normalizarUrl, montarDocumento, documentoInativo, documentoRedirecionamento, hostDaPagina, documentoNoAr } from '../lib/core.mjs';

const VALIDADE = 5000;
let cfgCache = null;
const htmlCache = new Map();

async function config() {
  if (!cfgCache || Date.now() - cfgCache.em > VALIDADE) cfgCache = { em: Date.now(), cfg: await carregarConfig() };
  return cfgCache.cfg;
}

async function html(arquivo) {
  const c = htmlCache.get(arquivo);
  if (c && Date.now() - c.em < VALIDADE) return c.html;
  const h = await lerArquivo(`${PASTA_PAGINAS}/${arquivo}`);
  htmlCache.set(arquivo, { em: Date.now(), html: h });
  return h;
}

const resposta = (corpo, status = 200) => new Response(corpo, {
  status,
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vercel-CDN-Cache-Control': status === 200 ? 'max-age=60, stale-while-revalidate=86400' : 'max-age=60',
  },
});

// Entrega a página p. apelido = veio de um endereço antigo (redirecionamento) que aponta para ela.
async function entregar(p, cfg, request, url, caminho, apelido = false) {
  // página de outro domínio: leva para o domínio certo (mantendo as UTMs), mas só quando ele já está no ar
  // (DNS apontado). Enquanto não estiver, a página continua abrindo aqui. As prévias do painel passam direto.
  const hostAtual = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().replace(/:\d+$/, '');
  const hostCerto = hostDaPagina(p, cfg, hostAtual);
  const local = /^(localhost|127\.)/.test(hostAtual);
  if (!p.lab && hostCerto && hostAtual && hostCerto !== hostAtual && !local && !url.searchParams.has('r1previa') && await dominioNoAr(hostCerto)) {
    const destino = new URL(`https://${hostCerto}/${caminho}`);
    url.searchParams.forEach((v, k) => { if (k !== 'caminho') destino.searchParams.append(k, v); });
    return new Response(null, { status: 308, headers: { Location: destino.href, 'Cache-Control': 'public, max-age=0', 'Vercel-CDN-Cache-Control': 'max-age=60' } });
  }
  if (!p.ativa) return resposta(p.redirecionarInativaPara ? documentoRedirecionamento(p.redirecionarInativaPara, p.titulo) : documentoInativo(p.titulo));
  const h = await html(p.arquivo);
  if (h == null) return resposta(documentoInativo(p.titulo), 404);
  // laboratório oculto: sem pixel/CAPI/Clarity/GTM e fora do Google
  if (p.lab) { const r = resposta(montarDocumento(h, p.titulo, {})); r.headers.set('X-Robots-Tag', 'noindex, nofollow'); return r; }
  return resposta(documentoNoAr(p, cfg, h, caminho, apelido));
}

export async function GET(request) {
  const url = new URL(request.url);
  const caminho = normalizarUrl(url.searchParams.get('caminho') || '');
  try {
    const cfg = await config();
    const p = cfg.paginas.find((x) => normalizarUrl(x.url) === caminho);
    if (p) return await entregar(p, cfg, request, url, caminho);
    // URLs antigas continuam levando para a nova (mantém UTMs dos anúncios já rodando).
    // Se o destino é uma página nossa, ela é entregue direto neste endereço e a barra passa a mostrar a URL nova
    // (history.replaceState antes de qualquer script de rastreio): GA4/Pixel veem a mesma URL de antes, sem o
    // salto de redirecionamento, que custava ~800 ms no PageSpeed mesmo como 308.
    const r = cfg.redirecionamentos.find((x) => normalizarUrl(x.de) === caminho);
    if (r) {
      const alvo = normalizarUrl(r.para);
      const destino = cfg.paginas.find((x) => normalizarUrl(x.url) === alvo);
      if (destino && destino.ativa && !destino.lab) return await entregar(destino, cfg, request, url, alvo, true);
      const u = new URL(`/${alvo}`, url.origin);
      url.searchParams.forEach((v, k) => { if (k !== 'caminho') u.searchParams.append(k, v); });
      return new Response(null, { status: 308, headers: { Location: u.pathname + u.search, 'Cache-Control': 'public, max-age=0', 'Vercel-CDN-Cache-Control': 'max-age=60' } });
    }
  } catch (e) {
    console.error(e);
    return new Response('Erro ao carregar a página. Tente de novo em instantes.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
  return resposta(documentoInativo('Página não encontrada').replace('Esta página não está disponível no momento.', 'Página não encontrada.'), 404);
}

export const HEAD = GET;
