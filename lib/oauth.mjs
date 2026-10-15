// Autorização OAuth 2.1 do conector do Claude (padrão do MCP).
// - O Claude se cadastra sozinho (registro dinâmico) e só pode receber o código de volta em claude.ai /
//   claude.com (ou localhost, para o Claude Code / Desktop).
// - A pessoa entra com o usuário do painel numa tela nossa; o Claude nunca vê a senha.
// - Código de autorização: 5 min, uso único, amarrado ao PKCE (S256).
// - Token de acesso: 1 h. Token de renovação: 30 dias, trocado a cada uso.
// - No banco ficam só os hashes dos códigos e tokens. Trocar a senha do usuário derruba os tokens.
import crypto from 'node:crypto';
import { sql, usandoBanco } from './store.mjs';
import { prepararAuth } from './auth.mjs';

export const ACESSO_S = 3600;
const RENOVACAO_S = 30 * 24 * 3600;
const CODIGO_S = 300;
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const aleatorio = (n = 32) => crypto.randomBytes(n).toString('base64url');
const erroOAuth = (codigo, descricao, status = 400) => Object.assign(new Error(descricao), { oauth: codigo, status });

// Endereço público deste app (https://host) a partir da requisição.
export function origemDe(request) {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').split(',')[0].trim();
  const local = /^(localhost|127\.)/.test(host);
  return `${local ? 'http' : 'https'}://${host}`;
}
export const recursoDe = (request) => `${origemDe(request)}/api/mcp`;

let pronto = null;
export function prepararOAuth() {
  if (!usandoBanco) throw erroOAuth('server_error', 'Conecte o banco de dados ao projeto.', 503);
  if (!pronto) {
    pronto = (async () => {
      await prepararAuth();
      await sql`create table if not exists oauth_clientes (
        client_id text primary key,
        segredo_hash text,
        nome text,
        redirects jsonb not null,
        criado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists oauth_codigos (
        codigo_hash text primary key,
        client_id text not null,
        usuario_id int not null references usuarios(id) on delete cascade,
        redirect_uri text not null,
        desafio text not null,
        recurso text,
        expira_em timestamptz not null
      )`;
      await sql`create table if not exists oauth_tokens (
        token_hash text primary key,
        tipo text not null,
        client_id text not null,
        usuario_id int not null references usuarios(id) on delete cascade,
        recurso text,
        expira_em timestamptz not null,
        criado_em timestamptz not null default now()
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

// Só devolvemos o código para o Claude (claude.ai / claude.com) ou para um app na própria máquina.
export function redirectPermitido(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === 'https:' && ['claude.ai', 'claude.com', 'www.claude.ai', 'www.claude.com'].includes(u.hostname)) return true;
  if (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) return true;
  return false;
}

export async function registrarCliente(d) {
  await prepararOAuth();
  const redirects = Array.isArray(d.redirect_uris) ? d.redirect_uris.map(String) : [];
  if (!redirects.length || redirects.length > 10 || !redirects.every(redirectPermitido)) {
    throw erroOAuth('invalid_redirect_uri', 'Endereço de retorno não permitido (só Claude ou localhost).');
  }
  const metodo = ['client_secret_post', 'client_secret_basic'].includes(d.token_endpoint_auth_method) ? d.token_endpoint_auth_method : 'none';
  const clientId = 'r1_' + aleatorio(18);
  const segredo = metodo === 'none' ? null : aleatorio(32);
  const nome = String(d.client_name || 'Claude').slice(0, 80);
  await sql`insert into oauth_clientes (client_id, segredo_hash, nome, redirects) values (${clientId}, ${segredo ? sha(segredo) : null}, ${nome}, ${JSON.stringify(redirects)})`;
  return {
    client_id: clientId,
    ...(segredo ? { client_secret: segredo, client_secret_expires_at: 0 } : {}),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: nome,
    redirect_uris: redirects,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: metodo,
  };
}

export async function acharCliente(clientId) {
  await prepararOAuth();
  if (typeof clientId !== 'string' || clientId.length > 100) return null;
  const [c] = await sql`select client_id, segredo_hash, nome, redirects from oauth_clientes where client_id = ${clientId}`;
  return c || null;
}

// Confere os parâmetros do pedido de autorização (antes de mostrar a tela e de novo ao receber o login).
export async function validarPedido(p, request) {
  const cliente = await acharCliente(p.client_id);
  if (!cliente) throw erroOAuth('invalid_client', 'Aplicativo desconhecido. Remova e adicione o conector de novo no Claude.');
  const redirects = Array.isArray(cliente.redirects) ? cliente.redirects : JSON.parse(cliente.redirects || '[]');
  if (!p.redirect_uri || !redirects.includes(p.redirect_uri) || !redirectPermitido(p.redirect_uri)) throw erroOAuth('invalid_request', 'Endereço de retorno inválido.');
  if (p.response_type !== 'code') throw erroOAuth('unsupported_response_type', 'Tipo de resposta não suportado.');
  if (!p.code_challenge || p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) throw erroOAuth('invalid_request', 'PKCE (S256) é obrigatório.');
  if (p.resource && p.resource !== recursoDe(request)) throw erroOAuth('invalid_target', 'Recurso inválido.');
  return cliente;
}

export async function criarCodigo({ cliente, usuario, redirect_uri, code_challenge, resource }) {
  const codigo = aleatorio(32);
  await sql`delete from oauth_codigos where expira_em < now()`;
  await sql`insert into oauth_codigos (codigo_hash, client_id, usuario_id, redirect_uri, desafio, recurso, expira_em)
    values (${sha(codigo)}, ${cliente.client_id}, ${usuario.id}, ${redirect_uri}, ${code_challenge}, ${resource || null}, now() + make_interval(secs => ${CODIGO_S}))`;
  return codigo;
}

function conferirSegredo(cliente, segredo) {
  if (!cliente.segredo_hash) return true; // cliente público: a proteção é o PKCE
  if (!segredo) return false;
  return crypto.timingSafeEqual(Buffer.from(sha(segredo)), Buffer.from(cliente.segredo_hash));
}

async function emitir(clientId, usuarioId, recurso) {
  const acesso = aleatorio(32), renovacao = aleatorio(32);
  await sql`delete from oauth_tokens where expira_em < now()`;
  await sql`insert into oauth_tokens (token_hash, tipo, client_id, usuario_id, recurso, expira_em) values
    (${sha(acesso)}, 'acesso', ${clientId}, ${usuarioId}, ${recurso}, now() + make_interval(secs => ${ACESSO_S})),
    (${sha(renovacao)}, 'renovacao', ${clientId}, ${usuarioId}, ${recurso}, now() + make_interval(secs => ${RENOVACAO_S}))`;
  return { access_token: acesso, token_type: 'Bearer', expires_in: ACESSO_S, refresh_token: renovacao, scope: 'paginas' };
}

// Endpoint /token: troca o código (com PKCE) ou renova (trocando também o token de renovação).
export async function trocarToken(p, request, basic) {
  await prepararOAuth();
  const clientId = basic?.id || p.client_id;
  const cliente = await acharCliente(clientId);
  if (!cliente || !conferirSegredo(cliente, basic?.segredo || p.client_secret)) throw erroOAuth('invalid_client', 'Cliente inválido.', 401);
  const recurso = recursoDe(request);
  if (p.resource && p.resource !== recurso) throw erroOAuth('invalid_target', 'Recurso inválido.');

  if (p.grant_type === 'authorization_code') {
    if (typeof p.code !== 'string' || typeof p.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(p.code_verifier)) throw erroOAuth('invalid_request', 'Faltam code ou code_verifier.');
    const [c] = await sql`delete from oauth_codigos where codigo_hash = ${sha(p.code)} returning client_id, usuario_id, redirect_uri, desafio, expira_em`;
    if (!c || new Date(c.expira_em) < new Date()) throw erroOAuth('invalid_grant', 'Código inválido ou expirado.');
    if (c.client_id !== cliente.client_id || c.redirect_uri !== p.redirect_uri) throw erroOAuth('invalid_grant', 'Código não pertence a este cliente.');
    const desafio = crypto.createHash('sha256').update(p.code_verifier).digest('base64url');
    if (desafio !== c.desafio) throw erroOAuth('invalid_grant', 'PKCE não confere.');
    return emitir(cliente.client_id, c.usuario_id, recurso);
  }

  if (p.grant_type === 'refresh_token') {
    if (typeof p.refresh_token !== 'string') throw erroOAuth('invalid_request', 'Falta refresh_token.');
    const [t] = await sql`delete from oauth_tokens where token_hash = ${sha(p.refresh_token)} and tipo = 'renovacao' returning client_id, usuario_id, expira_em`;
    if (!t || t.client_id !== cliente.client_id || new Date(t.expira_em) < new Date()) throw erroOAuth('invalid_grant', 'Token de renovação inválido ou expirado.');
    const [u] = await sql`select ativo from usuarios where id = ${t.usuario_id}`;
    if (!u?.ativo) throw erroOAuth('invalid_grant', 'Usuário desativado.');
    return emitir(cliente.client_id, t.usuario_id, recurso);
  }

  throw erroOAuth('unsupported_grant_type', 'grant_type não suportado.');
}

// Quem é o dono deste token de acesso (ou null).
export async function usuarioDoToken(token) {
  if (!usandoBanco || typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  await prepararOAuth();
  const [u] = await sql`select u.id, u.login, u.email, u.nome, u.papel from oauth_tokens t join usuarios u on u.id = t.usuario_id
    where t.token_hash = ${sha(token)} and t.tipo = 'acesso' and t.expira_em > now() and u.ativo limit 1`;
  return u || null;
}

export function metadadosServidor(request) {
  const o = origemDe(request);
  return {
    issuer: o,
    authorization_endpoint: `${o}/api/oauth/autorizar`,
    token_endpoint: `${o}/api/oauth/token`,
    registration_endpoint: `${o}/api/oauth/registrar`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['paginas'],
    service_documentation: `${o}/painel`,
  };
}

export function metadadosRecurso(request) {
  const o = origemDe(request);
  return {
    resource: recursoDe(request),
    authorization_servers: [o],
    bearer_methods_supported: ['header'],
    scopes_supported: ['paginas'],
    resource_name: 'Painel de Páginas · Grupo R1',
  };
}
