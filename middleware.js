// Roda antes da CDN em toda visita de página (Vercel Routing Middleware). Faz duas coisas:
// 1) Cache: cada clique de anúncio chega com um fbclid/utm diferente, e a CDN guardava uma cópia
//    por endereço completo — quase toda visita gerava a página de novo (custo de função e de
//    "Fast Origin Transfer"). Aqui a página é pedida à CDN sem os parâmetros; o navegador continua
//    com o endereço completo, então Pixel, CAPI, GTM e UTMs leem tudo normalmente.
//    As prévias do painel (r1previa) passam com os parâmetros.
// 2) Contador de visitas no servidor: assim as páginas não carregam nenhum JavaScript extra.
//    A gravação acontece depois da resposta (waitUntil). Só liga quando o Redis (Upstash) estiver configurado.
import { waitUntil, rewrite } from '@vercel/functions';

export const config = {
  // tudo menos API, painel, arquivos estáticos e arquivos com extensão
  matcher: ['/((?!api/|api$|painel|trackeamento$|wp-content|_vercel|.*\\.[a-z0-9]+$).+)'],
};

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ROBO = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit|whatsapp|monitor|curl|wget|python|node-fetch/i;

export default function middleware(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return;
  contarVisita(request);
  const url = new URL(request.url);
  if (url.search && !url.searchParams.has('r1previa')) return rewrite(new URL(url.pathname, url));
}

function contarVisita(request) {
  if (!URL_REDIS || !TOKEN_REDIS || request.method !== 'GET') return;
  const h = request.headers;
  const ua = h.get('user-agent') || '';
  if (ROBO.test(ua)) return;
  if (h.get('sec-fetch-dest') === 'iframe') return; // pré-visualizações do painel
  if (h.get('purpose') === 'prefetch' || h.get('sec-purpose')) return;
  if (/(^|; *)(__Host-)?r1s=/.test(h.get('cookie') || '')) return; // você mesmo navegando logado
  if (!(h.get('accept') || '').includes('text/html')) return;

  const url = new URL(request.url);
  const caminho = url.pathname.replace(/\/+$/, '').toLowerCase() || '/';
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Brasília
  const disp = /mobi|android|iphone|ipad/i.test(ua) ? 'celular' : 'computador';
  let origem = 'direto';
  try { if (h.get('referer')) origem = new URL(h.get('referer')).hostname.replace(/^www\./, ''); } catch {}
  const fonte = (url.searchParams.get('utm_source') || origem).toLowerCase().slice(0, 40);
  const campanha = (url.searchParams.get('utm_campaign') || '').slice(0, 80);

  const cmds = [
    ['HINCRBY', `v:${caminho}`, dia, 1],
    ['HINCRBY', `d:${caminho}`, disp, 1],
    ['HINCRBY', `f:${caminho}`, fonte, 1],
  ];
  if (campanha) cmds.push(['HINCRBY', `c:${caminho}`, campanha, 1]);

  waitUntil(
    fetch(`${URL_REDIS}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN_REDIS}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    }).catch(() => {}),
  );
}
