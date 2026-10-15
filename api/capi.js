// API de Conversões da Meta (servidor → Meta). Recebe o beacon da página com o PageView (mesmo eventID do
// pixel do navegador, para a Meta deduplicar) e envia para a Graph API com IP e navegador do visitante.
// O token fica só na Vercel (variável META_CAPI_TOKEN_<id do pixel>), nunca na página.
// Responde na hora (204) e envia em segundo plano: o visitante não espera nada.
import { waitUntil } from '@vercel/functions';
import { carregarConfig } from '../lib/servidor.mjs';
import { limparHost, limparPixelMeta } from '../lib/core.mjs';

const VERSAO_GRAPH = 'v22.0';
const ROBO = /bot|crawl|spider|slurp|lighthouse|pagespeed|headless|preview|facebookexternalhit|whatsapp|monitor|curl|wget|python|node-fetch|axios/i;
const vazio = (status = 204) => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });

// limite simples por IP (por instância): 60 eventos por minuto
const janela = new Map();
function excedeu(ip) {
  const agora = Date.now();
  const r = janela.get(ip);
  if (!r || agora - r.inicio > 60e3) { janela.set(ip, { inicio: agora, n: 1 }); if (janela.size > 5000) janela.clear(); return false; }
  r.n++;
  return r.n > 60;
}

let cfgCache = null;
async function config() {
  if (!cfgCache || Date.now() - cfgCache.em > 30e3) cfgCache = { em: Date.now(), cfg: await carregarConfig() };
  return cfgCache.cfg;
}

const sha256 = async (t) => {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
};

export async function POST(request) {
  const h = request.headers;
  const ua = h.get('user-agent') || '';
  if (!ua || ROBO.test(ua) || h.get('sec-purpose') || h.get('purpose') === 'prefetch') return vazio();
  const ip = (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  if (!ip || excedeu(ip)) return vazio(429);

  const texto = await request.text();
  if (texto.length > 4096) return vazio(413);
  let d;
  try { d = JSON.parse(texto); } catch { return vazio(400); }

  const pixel = limparPixelMeta(d.p);
  const token = pixel && process.env[`META_CAPI_TOKEN_${pixel}`];
  if (!token) return vazio();
  const eventId = String(d.e || '');
  if (!/^pv\.[a-z0-9]{4,16}\.[a-z0-9]{4,16}$/.test(eventId)) return vazio(400);

  let pagina;
  try { pagina = new URL(String(d.u || '')); } catch { return vazio(400); }
  const cfg = await config();
  const hostAtual = limparHost(h.get('x-forwarded-host') || h.get('host'));
  const hostsNossos = new Set([hostAtual, ...cfg.dominios].filter(Boolean));
  const origem = h.get('origin');
  if (!hostsNossos.has(pagina.hostname) || (origem && !hostsNossos.has(limparHost(origem)))) return vazio(403);
  if (!cfg.pixels.some((x) => x.id === pixel)) return vazio(403);

  const agora = Math.floor(Date.now() / 1000);
  const quando = Number(d.t) > agora - 3600 && Number(d.t) <= agora + 60 ? Number(d.t) : agora;
  const fbp = /^fb\.\d\.\d{10,14}\.\d{1,20}$/.test(d.fbp || '') ? d.fbp : undefined;
  const fbc = /^fb\.\d\.\d{10,14}\.[\w-]{10,500}$/.test(d.fbc || '') ? d.fbc : undefined;
  const userData = {
    client_ip_address: ip,
    client_user_agent: ua.slice(0, 500),
    ...(fbp ? { fbp } : {}),
    ...(fbc ? { fbc } : {}),
    // identificador anônimo estável do navegador (o próprio _fbp), em hash, ajuda a Meta a casar os eventos
    ...(fbp ? { external_id: [await sha256(fbp)] } : {}),
  };
  const corpo = {
    data: [{
      event_name: 'PageView',
      event_time: quando,
      event_id: eventId,
      action_source: 'website',
      event_source_url: pagina.href.slice(0, 1000),
      user_data: userData,
    }],
    ...(process.env.META_CAPI_TEST_CODE ? { test_event_code: process.env.META_CAPI_TEST_CODE } : {}),
  };

  waitUntil(
    fetch(`https://graph.facebook.com/${VERSAO_GRAPH}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(8000),
    })
      .then(async (r) => { if (process.env.CAPI_DEBUG) console.log('CAPI', r.status, (await r.clone().text()).slice(0, 200)); if (!r.ok) console.error(JSON.stringify({ tipo: 'erro', rota: '/api/capi', status: r.status, msg: (await r.text()).slice(0, 300) })); })
      .catch((e) => console.error(JSON.stringify({ tipo: 'erro', rota: '/api/capi', msg: e.message }))),
  );
  return vazio();
}
