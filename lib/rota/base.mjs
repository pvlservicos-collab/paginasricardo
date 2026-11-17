// Núcleo do backend do app Rota do Bilhão (migrado do Netlify para o painel; dados no Postgres da VPS).
//
// Diferenças em relação ao resto do painel:
// - Estas rotas são PÚBLICAS (app de membros em outro domínio), com token Bearer próprio em vez do cookie do painel.
//   O app é servido pelo mesmo app da Vercel (ricardonunes.grupor1.com e membros.cluber1.com.br), então as chamadas
//   são de MESMA ORIGEM e não precisam de CORS. Navegador de outro site não lê a resposta.
// - O hash de senha é o mesmo do backend antigo (scrypt, 64 bytes, sal em hex) para as contas migradas continuarem entrando.
// - O token é HMAC-SHA256 com ROTA_SEGREDO; se ROTA_SEGREDO for o mesmo valor do antigo SESSAO_SEGREDO do Netlify,
//   os tokens de 60 dias que já estão no aparelho das pessoas continuam valendo (ninguém é deslogado).
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { sql } from '../store.mjs';

const DURACAO = 60 * 60 * 24 * 60; // 60 dias

/* ---------------- esquema (criado uma vez por instância) ---------------- */
let pronto = null;
export function prepararRota() {
  if (!pronto) {
    pronto = (async () => {
      // contas e estados são DADOS DE USUÁRIO: entram no backup. uso e cache de voz são descartáveis (ver lib/backup.mjs).
      await sql`create table if not exists rota_contas (
        email text primary key,
        conta jsonb not null,
        atualizado timestamptz not null default now()
      )`;
      await sql`create table if not exists rota_estados (
        email text primary key,
        estado jsonb not null,
        atualizado timestamptz not null default now()
      )`;
      await sql`create table if not exists rota_uso (
        chave text primary key,
        n int not null default 0,
        dia date not null default current_date
      )`;
      // conteúdo do app (lista de membros com contatos, e-mails de membros, livro, minutagem dos eventos).
      // Fica no banco e NÃO no código: o repositório do painel é público. Carregado por scripts/rota-importar.mjs.
      await sql`create table if not exists rota_dados (
        nome text primary key,
        valor text not null,
        atualizado timestamptz not null default now()
      )`;
      await sql`create table if not exists rota_voz_cache (
        h text primary key,
        mp3 bytea not null,
        criado timestamptz not null default now()
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

/* ---------------- respostas ---------------- */
export const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
export const erro = (mensagem, status = 400) => json({ erro: mensagem }, status);

/* ---------------- token assinado (HMAC) ---------------- */
function segredo() {
  const s = process.env.ROTA_SEGREDO || process.env.SESSAO_SEGREDO;
  if (!s || s.length < 32) throw Object.assign(new Error('Defina ROTA_SEGREDO (mínimo 32 caracteres).'), { status: 503 });
  return s;
}
const assinar = (d) => createHmac('sha256', segredo()).update(d).digest('base64url');
export function criarToken(email) {
  const d = Buffer.from(JSON.stringify({ e: email, x: Math.floor(Date.now() / 1000) + DURACAO })).toString('base64url');
  return d + '.' + assinar(d);
}
export function lerToken(request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)\.(.+)$/);
  if (!m) return null;
  let esperado;
  try { esperado = Buffer.from(assinar(m[1])); } catch { return null; } // sem segredo configurado: trata como não logado
  const veio = Buffer.from(m[2]);
  if (esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) return null;
  try { const p = JSON.parse(Buffer.from(m[1], 'base64url').toString()); return p.x > Date.now() / 1000 ? p.e : null; } catch { return null; }
}

/* ---------------- senha (compatível com as contas migradas) ---------------- */
export function hashSenha(senha, sal = randomBytes(16).toString('hex')) {
  return { sal, hash: scryptSync(String(senha), sal, 64).toString('hex') };
}
export function senhaConfere(senha, conta) {
  if (!conta || !conta.sal || !conta.hash) return false;
  const a = Buffer.from(hashSenha(senha, conta.sal).hash, 'hex'), b = Buffer.from(conta.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/* ---------------- e-mail ---------------- */
export const normalizarEmail = (e) => String(e || '').trim().toLowerCase();
export const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
export const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- contas / estados (Postgres) ---------------- */
export async function getConta(email) {
  await prepararRota();
  const [l] = await sql`select conta from rota_contas where email = ${email}`;
  return l ? l.conta : null;
}
export async function setConta(email, conta) {
  await prepararRota();
  await sql`insert into rota_contas (email, conta, atualizado) values (${email}, ${JSON.stringify(conta)}::jsonb, now())
    on conflict (email) do update set conta = excluded.conta, atualizado = now()`;
}
export async function getEstado(email) {
  await prepararRota();
  const [l] = await sql`select estado from rota_estados where email = ${email}`;
  return l ? l.estado : null;
}
export async function setEstado(email, estado) {
  await prepararRota();
  await sql`insert into rota_estados (email, estado, atualizado) values (${email}, ${JSON.stringify(estado)}::jsonb, now())
    on conflict (email) do update set estado = excluded.estado, atualizado = now()`;
}

// Limite diário por pessoa. Devolve o novo total do dia; quem chama compara com o limite.
// (conta a tentativa atual; o dia vira sozinho porque a chave inclui a data.)
export async function usoSobe(chave) {
  await prepararRota();
  const [l] = await sql`insert into rota_uso (chave, n, dia) values (${chave}, 1, current_date)
    on conflict (chave) do update set n = rota_uso.n + 1 returning n`;
  return l.n;
}
export async function usoLer(chave) {
  await prepararRota();
  const [l] = await sql`select n from rota_uso where chave = ${chave}`;
  return l ? l.n : 0;
}
/* ---------------- conteúdo do app (tabela rota_dados), com cópia em memória por 10 min ---------------- */
const CACHE_DADOS = new Map();
export async function dado(nome, { json: ehJson = true } = {}) {
  const c = CACHE_DADOS.get(nome);
  if (c && Date.now() - c.em < 10 * 60e3) return c.v;
  await prepararRota();
  const [l] = await sql`select valor from rota_dados where nome = ${nome}`;
  if (!l) throw Object.assign(new Error(`Conteúdo "${nome}" não carregado no banco (rode scripts/rota-importar.mjs).`), { status: 503 });
  const v = ehJson ? JSON.parse(l.valor) : l.valor;
  CACHE_DADOS.set(nome, { v, em: Date.now() });
  return v;
}

export const hoje = () => new Date().toISOString().slice(0, 10);
export function ipDe(request) {
  const h = request.headers;
  return (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64) || 'desconhecido';
}

/* ---------------- cache de áudio da voz (bytea; fora do backup, limpo na faxina) ---------------- */
export async function vozCacheLer(h) {
  await prepararRota();
  const [l] = await sql`select mp3 from rota_voz_cache where h = ${h}`;
  return l ? l.mp3 : null; // pg devolve Buffer
}
export async function vozCacheGravar(h, buf) {
  await prepararRota();
  await sql`insert into rota_voz_cache (h, mp3) values (${h}, ${buf}) on conflict (h) do nothing`;
}
