// Utilidades usadas só pela API do painel (nunca pelas páginas).
import crypto from 'node:crypto';
import { lerArquivo, listarPasta, gravar } from './store.mjs';
import { ARQUIVO_CONFIG, PASTA_PAGINAS, mesclarConfig, configParaSalvar, validarUrls } from './core.mjs';

/* ---------------- login ---------------- */
// Login simples, só para controle (pedido do Ricardo). Pode ser trocado pelas variáveis de ambiente.
const USUARIO = process.env.PAINEL_USUARIO || 'ricardo';
const SENHA = process.env.PAINEL_SENHA || '2026';
const SEGREDO = process.env.SESSION_SECRET || 'troque-este-segredo-na-vercel';
const COOKIE = 'r1_painel';
const DURACAO = 60 * 60 * 24 * 30; // 30 dias

const assinar = (txt) => crypto.createHmac('sha256', SEGREDO).update(txt).digest('base64url');

export function conferirCredenciais(usuario, senha) {
  const igual = (a, b) => {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };
  return igual(String(usuario || '').trim().toLowerCase(), USUARIO.toLowerCase()) && igual(senha, SENHA);
}

export function cookieDeSessao() {
  const payload = Buffer.from(JSON.stringify({ u: USUARIO, exp: Math.floor(Date.now() / 1000) + DURACAO })).toString('base64url');
  const seguro = process.env.VERCEL ? '; Secure' : '';
  return `${COOKIE}=${payload}.${assinar(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO}${seguro}`;
}

export const cookieDeSaida = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function logado(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [payload, assinatura] = m[1].split('.');
  if (!payload || !assinatura || assinar(payload) !== assinatura) return false;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

/* ---------------- respostas ---------------- */
export const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export const erro = (mensagem, status = 400) => json({ erro: mensagem }, status);

// Envolve um handler exigindo login e tratando erros.
export function protegido(fn) {
  return async (request) => {
    if (!logado(request)) return erro('Faça login para continuar.', 401);
    try {
      return await fn(request, new URL(request.url));
    } catch (e) {
      console.error(e);
      return erro(e.message || 'Erro inesperado.', e.status || 500);
    }
  };
}

/* ---------------- config das páginas ---------------- */
export async function carregarConfig() {
  const [bruta, arquivos] = await Promise.all([lerArquivo(ARQUIVO_CONFIG), listarPasta(PASTA_PAGINAS)]);
  const html = arquivos.filter((n) => /\.html?$/i.test(n)).sort();
  return mesclarConfig(bruta ? JSON.parse(bruta) : null, html);
}

export async function salvarConfig(cfg, mensagem, arquivosExtras = []) {
  const problema = validarUrls(cfg);
  if (problema) throw new Error(problema);
  return gravar([{ caminho: ARQUIVO_CONFIG, conteudo: configParaSalvar(cfg) }, ...arquivosExtras], mensagem);
}

export function dominioBase(cfg, request) {
  const d = (cfg.dominio || '').trim().replace(/\/+$/, '');
  return d || new URL(request.url).origin;
}

/* ---------------- Redis (Upstash) para métricas ---------------- */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const temRedis = Boolean(REDIS_URL && REDIS_TOKEN);

export async function redis(...comandos) {
  if (!temRedis) return comandos.map(() => null);
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

export const hashParaObjeto = (arr) => {
  const o = {};
  for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]) || arr[i + 1];
  return o;
};
