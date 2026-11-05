// Sessão por cookie assinado (HMAC-SHA256). Sem banco de dados.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE = 'rgv_sessao';
const DURACAO = 60 * 60 * 24 * 30; // 30 dias

function segredo() {
  const s = process.env.SESSAO_SEGREDO;
  if (!s || s.length < 32) throw new Error('Defina SESSAO_SEGREDO (mínimo 32 caracteres) nas variáveis de ambiente.');
  return s;
}

const b64 = s => Buffer.from(s).toString('base64url');
const assinar = dados => createHmac('sha256', segredo()).update(dados).digest('base64url');

function iguais(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && timingSafeEqual(A, B);
}

/** Lista de usuários: USUARIOS="ana:senha1,joao:senha2" ou PAINEL_USUARIO + PAINEL_SENHA. */
function usuarios() {
  const lista = [];
  for (const par of (process.env.USUARIOS || '').split(',')) {
    const i = par.indexOf(':');
    if (i > 0) lista.push([par.slice(0, i).trim(), par.slice(i + 1).trim()]);
  }
  if (process.env.PAINEL_USUARIO && process.env.PAINEL_SENHA) {
    lista.push([process.env.PAINEL_USUARIO.trim(), process.env.PAINEL_SENHA]);
  }
  return lista;
}

export function conferirSenha(usuario, senha) {
  let ok = false;
  for (const [u, s] of usuarios()) {
    // compara todos (sem sair cedo) para não vazar tempo de resposta
    if (iguais(u.toLowerCase(), String(usuario || '').toLowerCase()) & iguais(s, String(senha || ''))) ok = u;
  }
  return ok;
}

export function criarCookie(usuario) {
  const dados = b64(JSON.stringify({ u: usuario, exp: Math.floor(Date.now() / 1000) + DURACAO }));
  const valor = dados + '.' + assinar(dados);
  return `${COOKIE}=${valor}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACAO}`;
}

export const cookieSair = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Devolve o nome do usuário logado ou null. */
export function lerSessao(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  if (!m) return null;
  const [dados, assinatura] = m[1].split('.');
  if (!dados || !assinatura || !iguais(assinar(dados), assinatura)) return null;
  try {
    const p = JSON.parse(Buffer.from(dados, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p.u : null;
  } catch {
    return null;
  }
}

export const json = (corpo, status = 200, headers = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
  });

export const naoAutorizado = () => json({ ok: false, logado: false, erro: 'Sessão expirada. Entre de novo.' }, 401);
