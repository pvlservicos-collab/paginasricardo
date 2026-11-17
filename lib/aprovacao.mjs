// Aprovação manual de acesso — Rota do Bilhão e Central R1 (pedido de 17/11/2026).
//
// Regra: quem entra com Google entra direto (Rota: qualquer conta Google; Central: @grupor1.com e @ivoxmarketing.com).
// Quem não usa Google pede acesso com e-mail e uma senha criada no pedido; a senha só passa a valer depois que o
// SUPERADMIN aprova em interno.grupor1.com/aprovacoes. Na Central, uma conta Google de outro domínio também vira pedido.
//
// Superadmin: SUPERADMIN_EMAILS (padrão lucas.figueiredo@grupor1.com). Ele entra na tela de aprovação com o Google;
// a sessão dele é um cookie HttpOnly próprio (__Host-apv), guardado com hash em superadmin_sessoes, 12 h.
import crypto from 'node:crypto';
import { sql, usandoBanco } from './store.mjs';
import { verificarIdToken } from './google-login.mjs';

export const SUPERADMINS = String(process.env.SUPERADMIN_EMAILS || 'lucas.figueiredo@grupor1.com')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
export const DOMINIOS_CENTRAL = ['@grupor1.com', '@ivoxmarketing.com']; // Google desses domínios entra direto na Central

const SEGURO = Boolean(process.env.VERCEL);
const COOKIE = SEGURO ? '__Host-apv' : 'apv';
const DURACAO_H = 12;
const JANELA_MIN = 15, MAX_IP = 20;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const falha = (m, status = 400) => Object.assign(new Error(m), { status });

/* ---------------- tabelas ---------------- */
let pronto = null;
export function prepararAprovacao() {
  if (!usandoBanco) throw falha('Banco de dados não conectado.', 503);
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists superadmin_sessoes (
        token_hash text primary key,
        email text not null,
        criada_em timestamptz not null default now(),
        ip text
      )`;
      await sql`create table if not exists aprovacao_tentativas (
        id bigserial primary key,
        ip text,
        em timestamptz not null default now()
      )`;
      // pedidos de acesso à Central R1 (quem não entra direto pelo Google do domínio)
      await sql`create table if not exists central_acessos (
        email text primary key,
        nome text,
        origem text not null check (origem in ('google','senha')),
        senha_sal text,
        senha_hash text,
        google_sub text,
        status text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
        pedido_em timestamptz not null default now(),
        decidido_por text,
        decidido_em timestamptz
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

/* ---------------- limite por IP (login do superadmin e pedidos da Central) ---------------- */
export async function limiteIp(ip) {
  await prepararAprovacao();
  const [{ n }] = await sql`select count(*)::int as n from aprovacao_tentativas where ip = ${ip} and em > now() - make_interval(mins => ${JANELA_MIN})`;
  return n >= MAX_IP;
}
export async function contarFalha(ip) {
  await prepararAprovacao();
  await sql`insert into aprovacao_tentativas (ip) values (${ip})`;
  await sql`delete from aprovacao_tentativas where em < now() - interval '1 day'`;
}

/* ---------------- sessão do superadmin ---------------- */
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SEGURO ? '; Secure' : ''}`;
export const cookieSaida = () => cookie('', 0);
function lerCookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/-/g, '\\-')}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

export async function entrarSuperadmin(credential, ip) {
  await prepararAprovacao();
  if (await limiteIp(ip)) return { status: 429, erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos.` };
  let g;
  try { g = await verificarIdToken(credential); }
  catch (e) { await contarFalha(ip); return { status: e.status || 401, erro: e.message }; }
  if (!SUPERADMINS.includes(g.email)) { await contarFalha(ip); return { status: 403, erro: 'Esta conta Google não é de superadmin.' }; }
  const t = crypto.randomBytes(32).toString('base64url');
  await sql`delete from superadmin_sessoes where criada_em < now() - make_interval(hours => ${DURACAO_H})`;
  await sql`insert into superadmin_sessoes (token_hash, email, ip) values (${sha(t)}, ${g.email}, ${ip})`;
  return { email: g.email, cookie: cookie(t, DURACAO_H * 3600) };
}

export async function superadminDe(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return null;
  await prepararAprovacao();
  const [s] = await sql`select email from superadmin_sessoes where token_hash = ${sha(t)} and criada_em > now() - make_interval(hours => ${DURACAO_H})`;
  return s && SUPERADMINS.includes(s.email) ? s.email : null;
}

export async function sairSuperadmin(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return;
  await prepararAprovacao();
  await sql`delete from superadmin_sessoes where token_hash = ${sha(t)}`;
}

/* ---------------- pedidos ---------------- */
// Rota: contas por senha (sem Google). Estado: aprovado / recusado / pendente (campos na própria conta).
const statusRota = (c) => (c.aprovado ? 'aprovado' : c.recusado ? 'recusado' : 'pendente');

export async function listarPedidos() {
  await prepararAprovacao();
  const rota = (await sql`select email, conta, atualizado from rota_contas where not (conta ? 'google') order by atualizado desc limit 300`)
    .map((l) => ({
      email: l.email, nome: l.conta.nome || '', empresa: l.conta.empresa || '', status: statusRota(l.conta),
      pedido_em: l.conta.pedido_em || l.conta.criado || null,
      decidido_em: l.conta.aprovado?.em || l.conta.recusado?.em || null, decidido_por: l.conta.aprovado?.por || l.conta.recusado?.por || null,
    }));
  const central = await sql`select email, nome, origem, status, pedido_em, decidido_em, decidido_por from central_acessos order by pedido_em desc limit 300`;
  return { rota, central };
}

export async function decidir(sistema, email, acao, quem) {
  await prepararAprovacao();
  if (!['aprovar', 'recusar'].includes(acao)) throw falha('Ação inválida.');
  const e = String(email || '').trim().toLowerCase();
  const agora = new Date().toISOString();
  if (sistema === 'rota') {
    const [l] = await sql`select conta from rota_contas where email = ${e}`;
    if (!l) throw falha('Pedido não encontrado.', 404);
    const conta = { ...l.conta };
    if (conta.google) throw falha('Esta conta entra pelo Google; não precisa de aprovação.', 409);
    if (acao === 'aprovar') { conta.aprovado = { por: quem, em: agora }; delete conta.recusado; }
    else { conta.recusado = { por: quem, em: agora }; delete conta.aprovado; conta.desde = agora; } // recusar derruba sessões
    await sql`update rota_contas set conta = ${JSON.stringify(conta)}::jsonb, atualizado = now() where email = ${e}`;
    return { sistema, email: e, status: statusRota(conta) };
  }
  if (sistema === 'central') {
    const status = acao === 'aprovar' ? 'aprovado' : 'recusado';
    const r = await sql`update central_acessos set status = ${status}, decidido_por = ${quem}, decidido_em = now() where email = ${e} returning email`;
    if (!r.length) throw falha('Pedido não encontrado.', 404);
    return { sistema, email: e, status };
  }
  throw falha('Sistema inválido.');
}
