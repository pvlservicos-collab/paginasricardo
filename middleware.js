// Contador de visitas feito no servidor (Vercel Routing Middleware).
// Por que aqui e não um script na página: assim as páginas não carregam nenhum
// JavaScript extra e a nota de performance não muda. A gravação acontece depois
// da resposta (waitUntil), então o visitante não espera por ela.
// Só liga quando o Redis (Upstash, pela Vercel) estiver configurado.
import { waitUntil } from '@vercel/functions';

export const config = {
  // tudo menos API, painel, arquivos estáticos e arquivos com extensão
  matcher: ['/((?!api/|api$|painel|wp-content|_vercel|.*\\.[a-z0-9]+$).+)'],
};

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const ROBO = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit|whatsapp|monitor|curl|wget|python|node-fetch/i;

export default function middleware(request) {
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
