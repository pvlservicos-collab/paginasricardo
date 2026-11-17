// "Entrar com Google" (Google Identity Services), usado pelo app Rota do Bilhão e pela Central R1.
// O botão do Google entrega ao navegador um ID token (JWT); o navegador manda esse token para a nossa API e aqui
// conferimos, no servidor, que ele é legítimo antes de abrir a sessão:
// - assinatura RS256 com as chaves públicas do Google (https://www.googleapis.com/oauth2/v3/certs), em cache;
// - emissor do Google, público (aud) = o nosso GOOGLE_CLIENT_ID, prazo (exp) não vencido e e-mail confirmado.
// Só nome e e-mail são usados. A chave secreta do cliente (GOCSPX-…) não é necessária neste fluxo.
import { createPublicKey, verify as verificarAssinatura } from 'node:crypto';

export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const googleLigado = () => Boolean(GOOGLE_CLIENT_ID);

const CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const EMISSORES = new Set(['https://accounts.google.com', 'accounts.google.com']);
const TOLERANCIA_MS = 30e3;

let cache = { chaves: null, ate: 0 };
async function chavesGoogle(forcar = false) {
  if (!forcar && cache.chaves && Date.now() < cache.ate) return cache.chaves;
  const r = await fetch(CERTS);
  if (!r.ok) throw Object.assign(new Error('Não foi possível conferir o login com o Google agora.'), { status: 503 });
  const { keys } = await r.json();
  const maxAge = Number((r.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  cache = { chaves: keys || [], ate: Date.now() + Math.min(maxAge, 86400) * 1000 };
  return cache.chaves;
}

const b64 = (s) => Buffer.from(s, 'base64url');
const recusa = (m) => Object.assign(new Error(m), { status: 401 });

// Pura (sem rede): confere o token contra uma lista de JWKs. Devolve null se a chave (kid) não estiver na lista,
// para quem chama recarregar as chaves do Google e tentar de novo. Exportada para teste.
export function conferirIdToken(token, chaves, { clientId = GOOGLE_CLIENT_ID, agora = Date.now() } = {}) {
  if (!clientId) throw Object.assign(new Error('Login com Google não configurado.'), { status: 503 });
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || partes.some((p) => !p)) throw recusa('Login com Google inválido.');
  let cab, corpo;
  try { cab = JSON.parse(b64(partes[0])); corpo = JSON.parse(b64(partes[1])); } catch { throw recusa('Login com Google inválido.'); }
  if (!cab || cab.alg !== 'RS256' || !cab.kid) throw recusa('Login com Google inválido.');
  const jwk = (chaves || []).find((k) => k.kid === cab.kid && k.kty === 'RSA');
  if (!jwk) return null;
  const ok = verificarAssinatura('RSA-SHA256', Buffer.from(partes[0] + '.' + partes[1]), createPublicKey({ key: jwk, format: 'jwk' }), b64(partes[2]));
  if (!ok) throw recusa('Login com Google inválido.');
  if (!corpo || !EMISSORES.has(corpo.iss)) throw recusa('Login com Google inválido.');
  if (corpo.aud !== clientId) throw recusa('Login de outro aplicativo.');
  if (typeof corpo.exp !== 'number' || corpo.exp * 1000 < agora - TOLERANCIA_MS) throw recusa('O login com Google expirou. Tente de novo.');
  if (corpo.email_verified !== true || typeof corpo.email !== 'string' || !corpo.email.includes('@')) throw recusa('O Google não confirmou este e-mail.');
  return { email: corpo.email.trim().toLowerCase(), nome: String(corpo.name || '').trim().slice(0, 80), sub: String(corpo.sub || '') };
}

// Botão próprio (sem o botão oficial do Google): o navegador usa o "token client" do Google e manda um access token.
// Conferimos no próprio Google (tokeninfo) que o token é do NOSSO aplicativo (aud), não venceu, tem o escopo de e-mail
// e o e-mail está confirmado. O nome vem do userinfo (mesmo `sub`). Devolve o mesmo formato de verificarIdToken.
export async function verificarAccessToken(token) {
  if (!GOOGLE_CLIENT_ID) throw Object.assign(new Error('Login com Google não configurado.'), { status: 503 });
  const t = String(token || '');
  if (!/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(t)) throw recusa('Login com Google inválido.');
  const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(t));
  if (r.status === 400) throw recusa('Login com Google inválido ou vencido. Tente de novo.');
  if (!r.ok) throw Object.assign(new Error('Não foi possível conferir o login com o Google agora.'), { status: 503 });
  const i = await r.json();
  if (i.aud !== GOOGLE_CLIENT_ID) throw recusa('Login de outro aplicativo.');
  if (!(Number(i.exp) * 1000 > Date.now())) throw recusa('O login com Google expirou. Tente de novo.');
  if (!String(i.scope || '').includes('email')) throw recusa('O Google não liberou o e-mail. Tente de novo.');
  if (!(i.email_verified === true || i.email_verified === 'true') || typeof i.email !== 'string' || !i.email.includes('@')) throw recusa('O Google não confirmou este e-mail.');
  let nome = '';
  try {
    const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: 'Bearer ' + t } });
    if (u.ok) { const j = await u.json(); if (j.sub === i.sub) nome = String(j.name || '').trim().slice(0, 80); }
  } catch {}
  return { email: i.email.trim().toLowerCase(), nome, sub: String(i.sub || '') };
}

// Recarregar as chaves fora de hora (kid desconhecido) só uma vez por minuto por instância: o Google troca as chaves
// raramente, e sem esse freio qualquer um faria a função buscar as chaves a cada pedido com um kid inventado.
let ultimaRecarga = 0;
export async function verificarIdToken(token) {
  let r = conferirIdToken(token, await chavesGoogle());
  if (r === null && Date.now() - ultimaRecarga > 60e3) { ultimaRecarga = Date.now(); r = conferirIdToken(token, await chavesGoogle(true)); }
  if (r === null) throw recusa('Login com Google inválido.');
  return r;
}
