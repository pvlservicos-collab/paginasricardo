// Login do painel: usuários, sessões e registro de ações, tudo no banco.
//
// Camadas de segurança:
// - Senha guardada só como hash scrypt (com sal); comparação em tempo constante.
// - Mesma resposta para "usuário não existe" e "senha errada" (não revela quem tem conta).
// - Limite de tentativas: 5 erros por conta ou 20 por IP em 15 min bloqueiam novas tentativas.
// - Sessão guardada no servidor (o cookie leva só um código aleatório; o banco guarda o hash dele).
//   Expira após 12 h sem uso e, de qualquer jeito, após 7 dias. O código é trocado a cada 30 min.
//   Sair apaga a sessão no servidor.
// - Cookie HttpOnly (JavaScript não lê), Secure (só HTTPS), SameSite=Strict e prefixo __Host-.
//   Nada de token em localStorage/sessionStorage.
// - Papéis: "admin" (tudo) e "editor" (sem as funções em construção). Conferido no servidor em toda rota.
// - Toda ação importante vai para a tabela "eventos" (quem, quando, IP, o quê) e para o log da Vercel.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { sql, usandoBanco } from './store.mjs';

const scrypt = promisify(crypto.scrypt);
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SEGURO = Boolean(process.env.VERCEL);
export const COOKIE = SEGURO ? '__Host-r1s' : 'r1s';
const OCIOSA_MS = 12 * 3600e3;
const MAX_MS = 7 * 24 * 3600e3;
const ROTACAO_MS = 30 * 60e3;
const TOLERANCIA_MS = 60e3; // requisições em paralelo com o código anterior logo após a troca
const JANELA_MIN = 15, MAX_CONTA = 5, MAX_IP = 20;

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

export async function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const chave = await scrypt(String(senha), sal, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${sal.toString('base64')}$${chave.toString('base64')}`;
}

async function conferirSenha(senha, guardado) {
  const [alg, N, r, p, sal, chave] = String(guardado || '').split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(chave, 'base64');
  const obtido = await scrypt(String(senha), Buffer.from(sal, 'base64'), esperado.length, { N: +N, r: +r, p: +p, maxmem: PARAMS.maxmem });
  return crypto.timingSafeEqual(obtido, esperado);
}

let hashFalso = null; // para gastar o mesmo tempo quando o usuário não existe

let pronto = null;
export function prepararAuth() {
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists usuarios (
        id serial primary key,
        login text unique not null,
        email text,
        nome text not null,
        papel text not null check (papel in ('admin','editor')),
        senha_hash text not null,
        ativo boolean not null default true,
        criado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists sessoes (
        token_hash text primary key,
        token_anterior text,
        trocado_em timestamptz,
        usuario_id int not null references usuarios(id) on delete cascade,
        criada_em timestamptz not null default now(),
        usada_em timestamptz not null default now(),
        renovada_em timestamptz not null default now(),
        ip text,
        agente text
      )`;
      await sql`create index if not exists sessoes_anterior on sessoes (token_anterior)`;
      await sql`create table if not exists tentativas (
        id bigserial primary key,
        login text,
        ip text,
        em timestamptz not null default now()
      )`;
      await sql`create index if not exists tentativas_em on tentativas (em)`;
      await sql`create table if not exists eventos (
        id bigserial primary key,
        em timestamptz not null default now(),
        usuario text,
        acao text not null,
        ip text,
        detalhe jsonb
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export function ipDe(request) {
  const h = request.headers;
  return (h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0] || '').trim().slice(0, 64) || 'desconhecido';
}

export async function registrar(acao, { usuario = null, ip = null, detalhe = null } = {}) {
  console.log(JSON.stringify({ tipo: 'evento', acao, usuario, ip, detalhe, em: new Date().toISOString() }));
  if (!usandoBanco) return;
  try {
    await prepararAuth();
    await sql`insert into eventos (usuario, acao, ip, detalhe) values (${usuario}, ${acao}, ${ip}, ${detalhe ? JSON.stringify(detalhe) : null})`;
  } catch (e) { console.error(JSON.stringify({ tipo: 'erro', onde: 'registrar', msg: e.message })); }
}

const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SEGURO ? '; Secure' : ''}`;
export const cookieDeSaida = () => cookie('', 0);

function lerCookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/[-]/g, '\\-')}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

/* ---------------- sem banco (só no computador, npm run dev) ---------------- */
const sessoesLocais = new Map();
const usuarioLocal = { id: 0, login: process.env.PAINEL_USUARIO || 'ricardo', nome: 'Ricardo', papel: 'admin', email: null };

/* ---------------- entrar ---------------- */
// Confere usuário e senha (com limite de tentativas). Usada pelo login do painel e pela autorização do Claude.
export async function verificarCredenciais(identificador, senha, request) {
  const ip = ipDe(request);
  const ident = String(identificador || '').trim().toLowerCase().slice(0, 160);
  const pass = String(senha || '');
  if (!ident || !pass || pass.length > 200) return { status: 400, erro: 'Informe usuário e senha.' };

  if (!usandoBanco) {
    if (SEGURO) return { status: 503, erro: 'Login indisponível: conecte o banco de dados ao projeto.' };
    const ok = ident === usuarioLocal.login && pass === (process.env.PAINEL_SENHA || '2026');
    return ok ? { usuario: usuarioLocal } : { status: 401, erro: 'Usuário ou senha incorretos.' };
  }

  await prepararAuth();
  const [{ conta, porIp }] = await sql`select
      count(*) filter (where login = ${ident})::int as conta,
      count(*) filter (where ip = ${ip})::int as "porIp"
    from tentativas where em > now() - make_interval(mins => ${JANELA_MIN})`;
  if (conta >= MAX_CONTA || porIp >= MAX_IP) {
    await registrar('login_bloqueado', { usuario: ident, ip });
    return { status: 429, erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };
  }

  const [u] = await sql`select id, login, email, nome, papel, senha_hash from usuarios where ativo and (login = ${ident} or lower(email) = ${ident}) limit 1`;
  if (!hashFalso) hashFalso = await hashSenha(token());
  const confere = await conferirSenha(pass, u ? u.senha_hash : hashFalso);
  if (!u || !confere) {
    await sql`insert into tentativas (login, ip) values (${ident}, ${ip})`;
    await registrar('login_falhou', { usuario: ident, ip });
    return { status: 401, erro: 'Usuário ou senha incorretos.' };
  }

  await sql`delete from tentativas where login = ${ident} or em < now() - interval '1 day'`;
  return { usuario: { id: u.id, login: u.login, email: u.email, nome: u.nome, papel: u.papel } };
}

export async function entrar(identificador, senha, request) {
  const v = await verificarCredenciais(identificador, senha, request);
  if (v.erro) return v;
  const u = v.usuario, ip = ipDe(request);
  if (!usandoBanco) {
    const t = token(); sessoesLocais.set(sha(t), Date.now());
    return { cookie: cookie(t, MAX_MS / 1000), usuario: u };
  }
  await sql`delete from sessoes where usuario_id = ${u.id} and (usada_em < now() - interval '12 hours' or criada_em < now() - interval '7 days')`;
  const t = token();
  await sql`insert into sessoes (token_hash, usuario_id, ip, agente) values (${sha(t)}, ${u.id}, ${ip}, ${(request.headers.get('user-agent') || '').slice(0, 300)})`;
  await registrar('login', { usuario: u.login, ip });
  return { cookie: cookie(t, MAX_MS / 1000), usuario: u };
}

/* ---------------- sessão de cada requisição ---------------- */
// Devolve { usuario, cookie? } ou null. "cookie" vem preenchido quando o código da sessão foi trocado.
export async function sessaoAtual(request) {
  const t = lerCookie(request);
  if (!t) return null;
  const h = sha(t);

  if (!usandoBanco) {
    if (SEGURO) return null;
    const em = sessoesLocais.get(h);
    return em && Date.now() - em < MAX_MS ? { usuario: usuarioLocal } : null;
  }

  await prepararAuth();
  const [s] = await sql`select s.token_hash, s.criada_em, s.usada_em, s.renovada_em, s.trocado_em, s.token_anterior = ${h} as antigo,
      u.id, u.login, u.email, u.nome, u.papel
    from sessoes s join usuarios u on u.id = s.usuario_id
    where u.ativo and (s.token_hash = ${h} or s.token_anterior = ${h}) limit 1`;
  if (!s) return null;
  const agora = Date.now();
  if (s.antigo && (!s.trocado_em || agora - new Date(s.trocado_em) > TOLERANCIA_MS)) return null;
  if (agora - new Date(s.usada_em) > OCIOSA_MS || agora - new Date(s.criada_em) > MAX_MS) {
    await sql`delete from sessoes where token_hash = ${s.token_hash}`;
    return null;
  }
  const usuario = { id: s.id, login: s.login, email: s.email, nome: s.nome, papel: s.papel };
  if (!s.antigo && agora - new Date(s.renovada_em) > ROTACAO_MS) {
    const novo = token();
    await sql`update sessoes set token_anterior = token_hash, trocado_em = now(), token_hash = ${sha(novo)}, renovada_em = now(), usada_em = now() where token_hash = ${s.token_hash}`;
    const resta = Math.max(60, Math.floor((MAX_MS - (agora - new Date(s.criada_em))) / 1000));
    return { usuario, cookie: cookie(novo, resta) };
  }
  if (agora - new Date(s.usada_em) > 60e3) await sql`update sessoes set usada_em = now() where token_hash = ${s.token_hash}`;
  return { usuario };
}

export async function sair(request) {
  const t = lerCookie(request);
  if (!t) return;
  const h = sha(t);
  if (!usandoBanco) { sessoesLocais.delete(h); return; }
  await prepararAuth();
  await sql`delete from sessoes where token_hash = ${h} or token_anterior = ${h}`;
}

/* ---------------- gestão de usuários (usada pelo script scripts/usuarios.mjs) ---------------- */
export function senhaForte() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', a = 'abcdefghijkmnopqrstuvwxyz', n = '23456789', s = '!@#$%*?-_+';
  const todos = A + a + n + s;
  const pega = (c) => c[crypto.randomInt(c.length)];
  const chars = [pega(A), pega(a), pega(n), pega(s), ...Array.from({ length: 16 }, () => pega(todos))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

export async function salvarUsuario({ login, email = null, nome, papel, senha }) {
  await prepararAuth();
  const l = String(login).trim().toLowerCase();
  const hash = await hashSenha(senha);
  await sql`insert into usuarios (login, email, nome, papel, senha_hash) values (${l}, ${email}, ${nome}, ${papel}, ${hash})
    on conflict (login) do update set email = excluded.email, nome = excluded.nome, papel = excluded.papel, senha_hash = excluded.senha_hash, ativo = true`;
  // senha nova derruba as sessões abertas desse usuário (painel e conectores do Claude)
  await sql`delete from sessoes where usuario_id = (select id from usuarios where login = ${l})`;
  await sql`create table if not exists oauth_tokens (token_hash text primary key, tipo text not null, client_id text not null, usuario_id int not null references usuarios(id) on delete cascade, recurso text, expira_em timestamptz not null, criado_em timestamptz not null default now())`;
  await sql`delete from oauth_tokens where usuario_id = (select id from usuarios where login = ${l})`;
}
