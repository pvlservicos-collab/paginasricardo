// Raio-X Tributário: diagnósticos do quiz (ricardonunes.grupor1.com/raioxtributario) e o painel
// Impostômetro (/raioxtributariodash), com login próprio, separado do painel de páginas.
//
// - Papéis: "admin" (tudo: leads com nome/e-mail/telefone, campanhas, usuários) e "leitor" (só o Impostômetro).
//   Quem é leitor nunca recebe dados pessoais: a API corta antes de responder.
// - Senha só como hash scrypt (o mesmo de lib/auth.mjs); limite de tentativas por conta e por IP.
// - Sessão no servidor; o cookie HttpOnly leva só um código aleatório. 12 h sem uso ou 7 dias, o que vier antes.
import crypto from 'node:crypto';
import { sql, usandoBanco } from './store.mjs';
import { hashSenha, conferirSenha, ipDe, registrar } from './auth.mjs';
import { json, erro, mesmaOrigem } from './servidor.mjs';

const SEGURO = Boolean(process.env.VERCEL);
const COOKIE = SEGURO ? '__Host-rx' : 'rx';
const OCIOSA_H = 12, MAX_D = 7;
const JANELA_MIN = 15, MAX_CONTA = 5, MAX_IP = 20;
export const PAPEIS = ['admin', 'leitor'];

// Cada quiz grava em /api/raiox/envio; o painel separa os dashboards pelo endereço da página que mandou.
// "rd" = identificador da conversão no RD Station (dá para trocar na aba Integrações).
// O que não casar com nenhum fica no primeiro (como era antes de haver mais de um).
export const PROJETOS = [
  { id: 'tributario', nome: 'Raio-X Tributário', pagina: '/raioxtributario', re: /^\/raioxtributario(?:[-/]|$)/, rd: 'raiox-tributario', formato: 'completo' },
  { id: 'xequemate', nome: 'Raio-X Xeque-Mate', pagina: '/raiox-xequemate2', re: /^\/raiox-xequemate/, rd: 'raiox-xequemate', formato: 'curto' },
  { id: 'tributario-raiox', nome: 'Tributário Raio-X', pagina: '/tributario-raiox', re: /^\/tributario-raiox/, rd: 'tributario-raiox', formato: 'curto' },
];
export const caminhoDe = (url) => { try { return new URL(String(url || ''), 'https://x.invalid').pathname.toLowerCase(); } catch { return ''; } };
export const projetoDe = (url) => { const c = caminhoDe(url); return PROJETOS.find((p) => p.re.test(c)) || PROJETOS[0]; };
export const acharProjeto = (id) => PROJETOS.find((p) => p.id === id) || PROJETOS[0];

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

let pronto = null;
export function prepararRaiox() {
  if (!usandoBanco) throw Object.assign(new Error('Banco de dados não conectado.'), { status: 503 });
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists raiox_envios (
        id text primary key,
        recebido_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now(),
        ip text,
        dados jsonb not null
      )`;
      await sql`create index if not exists raiox_envios_recebido on raiox_envios (recebido_em)`;
      await sql`create index if not exists raiox_envios_ip on raiox_envios (ip, atualizado_em)`;
      // gestão dos leads (aba Leads do admin): etapa, anotações, teste marcado à mão, lixeira
      await sql`alter table raiox_envios add column if not exists status text not null default 'novo'`;
      await sql`alter table raiox_envios add column if not exists notas jsonb not null default '[]'::jsonb`;
      await sql`alter table raiox_envios add column if not exists teste_manual boolean`;
      await sql`alter table raiox_envios add column if not exists excluido_em timestamptz`;
      await sql`alter table raiox_envios add column if not exists excluido_por text`;
      await sql`alter table raiox_envios add column if not exists gestao_em timestamptz`;
      await sql`alter table raiox_envios add column if not exists gestao_por text`;
      // RD Station: quando o lead foi enviado e como foi (ok | ok-sem-campos | enviando | erro: ...)
      await sql`alter table raiox_envios add column if not exists rd_em timestamptz`;
      await sql`alter table raiox_envios add column if not exists rd_status text`;
      await sql`create table if not exists raiox_config (
        chave text primary key,
        valor jsonb not null,
        atualizado_em timestamptz not null default now(),
        atualizado_por text
      )`;
      await sql`create table if not exists raiox_usuarios (
        id serial primary key,
        login text unique not null,
        nome text not null,
        papel text not null check (papel in ('admin','leitor')),
        senha_hash text not null,
        ativo boolean not null default true,
        criado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists raiox_sessoes (
        token_hash text primary key,
        usuario_id int not null references raiox_usuarios(id) on delete cascade,
        criada_em timestamptz not null default now(),
        usada_em timestamptz not null default now(),
        ip text
      )`;
      await sql`create table if not exists raiox_tentativas (
        id bigserial primary key,
        login text,
        ip text,
        em timestamptz not null default now()
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

/* ---------------- diagnósticos ---------------- */
const txt = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
const num = (v) => (Number.isFinite(+v) ? +v : 0);
function plano(o, maxChaves, maxTexto) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [k, v] of Object.entries(o).slice(0, maxChaves)) {
    if (!/^[A-Za-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v ? 1 : 0;
    else if (typeof v === 'string') out[k] = v.slice(0, maxTexto);
  }
  return out;
}

// Só guarda o formato que o quiz manda; o resto é descartado.
export function limparEnvio(d) {
  if (!d || typeof d !== 'object' || !/^[a-z0-9]{6,40}$/.test(String(d.id || ''))) return null;
  const r = d.res || {}, l = d.lead || {};
  return {
    id: d.id,
    // os quizzes curtos (Xeque-Mate, tributario-raiox) mandam o celular como "whatsapp"
    lead: { nome: txt(l.nome), email: txt(l.email, 160), telefone: txt(l.telefone || l.whatsapp, 40) },
    perfil: plano(d.perfil, 80, 160),
    utm: plano(d.utm, 10, 200),
    url: txt(d.url, 300),
    res: {
      total: num(r.total), recuperacao: num(r.recuperacao), beneficios: num(r.beneficios), estrategias: num(r.estrategias),
      carga: num(r.carga), pct: num(r.pct), economia: num(r.economia), nOpps: num(r.nOpps),
      top: (Array.isArray(r.top) ? r.top : []).slice(0, 12).map((o) => ({ nome: txt(o && o.nome, 120), val: num(o && o.val) })),
    },
  };
}

export async function salvarEnvio(e, ip) {
  await prepararRaiox();
  // trava contra enxurrada: 60 diagnósticos por IP por hora
  const [{ n }] = await sql`select count(*)::int as n from raiox_envios where ip = ${ip} and atualizado_em > now() - interval '1 hour'`;
  if (n >= 60) return false;
  await sql`insert into raiox_envios (id, ip, dados) values (${e.id}, ${ip}, ${JSON.stringify(e)}::jsonb)
    on conflict (id) do update set dados = excluded.dados, atualizado_em = now()`;
  return true;
}

const TESTE_EMAIL = /@grupor1\.com|teste|luc4s|pentefino|@test|example\./, TESTE_NOME = /^(teste|test|aas|asa|asd)\b/;
export function ehTeste(e) {
  const l = e.lead || {}, em = (l.email || '').toLowerCase(), t = (l.telefone || '').replace(/\D/g, ''), n = (l.nome || '').toLowerCase();
  return TESTE_EMAIL.test(em) || TESTE_NOME.test(n) || t.endsWith('991493872') || (e.utm || {}).source === 'teste-claude';
}

// Admin recebe tudo (inclusive a lixeira, marcada com "excluido"); leitor recebe sem nome, e-mail, telefone,
// nome da empresa e sem os campos de gestão. Lead na lixeira não entra em conta nenhuma do leitor.
export async function listarEnvios(papel, projetoId) {
  await prepararRaiox();
  const projeto = acharProjeto(projetoId);
  const linhas = papel === 'admin'
    ? await sql`select dados, recebido_em, status, notas, teste_manual, excluido_em, excluido_por, gestao_em, gestao_por, rd_em, rd_status
        from raiox_envios order by recebido_em desc limit 20000`
    : await sql`select dados, recebido_em, teste_manual from raiox_envios where excluido_em is null order by recebido_em desc limit 20000`;
  const contagem = Object.fromEntries(PROJETOS.map((p) => [p.id, 0]));
  const envios = [];
  for (const r of linhas) {
    const e = typeof r.dados === 'string' ? JSON.parse(r.dados) : r.dados;
    const p = projetoDe(e.url);
    if (!r.excluido_em) contagem[p.id]++;
    if (p.id !== projeto.id) continue;
    const automatico = ehTeste(e);
    const base = { ...e, pagina: caminhoDe(e.url), ts: e.ts || new Date(r.recebido_em).toISOString(), teste: r.teste_manual ?? automatico };
    if (papel === 'admin') {
      envios.push({ ...base, testeAuto: automatico, testeManual: r.teste_manual, status: STATUS.includes(r.status) ? r.status : 'novo',
        notas: Array.isArray(r.notas) ? r.notas : [], excluido: r.excluido_em ? { em: r.excluido_em, por: r.excluido_por } : null,
        gestao: r.gestao_em ? { em: r.gestao_em, por: r.gestao_por } : null,
        rd: r.rd_status ? { em: r.rd_em, status: r.rd_status } : null });
      continue;
    }
    const { nome, ...perfil } = base.perfil || {};
    envios.push({ ...base, lead: undefined, perfil });
  }
  return { projeto: projeto.id, projetos: PROJETOS.map((p) => ({ id: p.id, nome: p.nome, pagina: p.pagina, formato: p.formato, n: contagem[p.id] })), envios };
}

/* ---------------- gestão dos leads (só admin) ---------------- */
export const STATUS = ['novo', 'contato', 'reuniao', 'cliente', 'perdido'];
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const idsValidos = (ids) => {
  const l = [...new Set((Array.isArray(ids) ? ids : [ids]).map(String))];
  if (!l.length || l.length > 1000 || l.some((x) => !/^[a-z0-9]{6,40}$/.test(x))) throw falha('Leads inválidos.');
  return l;
};

// d = { acao, ids | id, ... }. Devolve quantos leads mudaram.
export async function gerirLeads(d, quem) {
  await prepararRaiox();
  const por = String(quem || '').slice(0, 80);
  switch (d.acao) {
    case 'status': {
      if (!STATUS.includes(d.status)) throw falha('Etapa inválida.');
      const ids = idsValidos(d.ids);
      const r = await sql`update raiox_envios set status = ${d.status}, gestao_em = now(), gestao_por = ${por} where id = any(${ids}) returning id`;
      return r.length;
    }
    case 'teste': { // true = é teste · false = é lead de verdade · null = volta para a regra automática
      const v = d.teste === null ? null : Boolean(d.teste);
      const ids = idsValidos(d.ids);
      const r = await sql`update raiox_envios set teste_manual = ${v}, gestao_em = now(), gestao_por = ${por} where id = any(${ids}) returning id`;
      return r.length;
    }
    case 'excluir': {
      const ids = idsValidos(d.ids);
      const r = await sql`update raiox_envios set excluido_em = now(), excluido_por = ${por} where id = any(${ids}) and excluido_em is null returning id`;
      return r.length;
    }
    case 'restaurar': {
      const ids = idsValidos(d.ids);
      const r = await sql`update raiox_envios set excluido_em = null, excluido_por = null where id = any(${ids}) returning id`;
      return r.length;
    }
    case 'apagar': { // definitivo: só o que já está na lixeira
      const ids = idsValidos(d.ids);
      const r = await sql`delete from raiox_envios where id = any(${ids}) and excluido_em is not null returning id`;
      return r.length;
    }
    case 'esvaziar': {
      const r = await sql`delete from raiox_envios where excluido_em is not null returning id`;
      return r.length;
    }
    case 'nota': {
      const [id] = idsValidos(d.id);
      const texto = String(d.texto || '').trim().slice(0, 2000);
      if (!texto) throw falha('Escreva a anotação.');
      const nota = { id: token().slice(0, 12), em: new Date().toISOString(), por, texto };
      const r = await sql`update raiox_envios set notas = (case when jsonb_array_length(notas) >= 200 then notas else notas || ${JSON.stringify([nota])}::jsonb end),
          gestao_em = now(), gestao_por = ${por} where id = ${id} returning id`;
      return r.length;
    }
    case 'tirarNota': {
      const [id] = idsValidos(d.id);
      const nid = String(d.nota || '');
      if (!/^[A-Za-z0-9_-]{6,20}$/.test(nid)) throw falha('Anotação inválida.');
      const r = await sql`update raiox_envios set notas = coalesce((select jsonb_agg(n) from jsonb_array_elements(notas) n where n->>'id' <> ${nid}), '[]'::jsonb)
        where id = ${id} returning id`;
      return r.length;
    }
    default: throw falha('Ação desconhecida.');
  }
}

/* ---------------- login ---------------- */
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SEGURO ? '; Secure' : ''}`;
export const cookieDeSaida = () => cookie('', 0);
function lerCookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/-/g, '\\-')}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

let hashFalso = null;
export async function entrar(login, senha, request) {
  await prepararRaiox();
  const ip = ipDe(request), ident = String(login || '').trim().toLowerCase().slice(0, 80), pass = String(senha || '');
  if (!ident || !pass || pass.length > 200) return { status: 400, erro: 'Informe usuário e senha.' };
  const [{ conta, porIp }] = await sql`select count(*) filter (where login = ${ident})::int as conta, count(*) filter (where ip = ${ip})::int as "porIp"
    from raiox_tentativas where em > now() - make_interval(mins => ${JANELA_MIN})`;
  if (conta >= MAX_CONTA || porIp >= MAX_IP) return { status: 429, erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos.` };
  const [u] = await sql`select id, login, nome, papel, senha_hash from raiox_usuarios where ativo and login = ${ident} limit 1`;
  if (!hashFalso) hashFalso = await hashSenha(token());
  const ok = await conferirSenha(pass, u ? u.senha_hash : hashFalso);
  if (!u || !ok) {
    await sql`insert into raiox_tentativas (login, ip) values (${ident}, ${ip})`;
    await registrar('raiox_login_falhou', { usuario: ident, ip });
    return { status: 401, erro: 'Usuário ou senha incorretos.' };
  }
  await sql`delete from raiox_tentativas where login = ${ident} or em < now() - interval '1 day'`;
  await sql`delete from raiox_sessoes where usada_em < now() - make_interval(hours => ${OCIOSA_H}) or criada_em < now() - make_interval(days => ${MAX_D})`;
  const t = token();
  await sql`insert into raiox_sessoes (token_hash, usuario_id, ip) values (${sha(t)}, ${u.id}, ${ip})`;
  await registrar('raiox_login', { usuario: u.login, ip });
  return { cookie: cookie(t, MAX_D * 86400), usuario: { login: u.login, nome: u.nome, papel: u.papel } };
}

export async function sessao(request) {
  const t = lerCookie(request);
  if (!t) return null;
  await prepararRaiox();
  const [s] = await sql`select s.token_hash, u.id, u.login, u.nome, u.papel,
      s.usada_em < now() - make_interval(hours => ${OCIOSA_H}) or s.criada_em < now() - make_interval(days => ${MAX_D}) as vencida,
      s.usada_em < now() - interval '1 minute' as tocar
    from raiox_sessoes s join raiox_usuarios u on u.id = s.usuario_id where u.ativo and s.token_hash = ${sha(t)} limit 1`;
  if (!s) return null;
  if (s.vencida) { await sql`delete from raiox_sessoes where token_hash = ${s.token_hash}`; return null; }
  if (s.tocar) await sql`update raiox_sessoes set usada_em = now() where token_hash = ${s.token_hash}`;
  return { id: s.id, login: s.login, nome: s.nome, papel: s.papel };
}

export async function sair(request) {
  const t = lerCookie(request);
  if (t) { await prepararRaiox(); await sql`delete from raiox_sessoes where token_hash = ${sha(t)}`; }
}

// Rota que exige login do Raio-X (e, se pedido, admin). O handler recebe (request, url, usuario).
export function protegidoRaiox(fn, { admin = false } = {}) {
  return async (request) => {
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) && !mesmaOrigem(request)) return erro('Origem não permitida.', 403);
    try {
      const u = await sessao(request);
      if (!u) return erro('Faça login para continuar.', 401);
      if (admin && u.papel !== 'admin') return erro('Só o administrador acessa isso.', 403);
      return await fn(request, url, u);
    } catch (e) {
      const status = e.status || 500;
      console.error(JSON.stringify({ tipo: 'erro', rota: url.pathname, metodo: request.method, status, msg: e.message }));
      return erro(status >= 500 ? 'Erro inesperado. Tente de novo.' : e.message, status);
    }
  };
}

/* ---------------- usuários (aba Usuários do admin e scripts) ---------------- */
export async function listarUsuarios() {
  await prepararRaiox();
  return sql`select u.login, u.nome, u.papel, u.ativo, u.criado_em,
      (select max(s.usada_em) from raiox_sessoes s where s.usuario_id = u.id) as ultimo_acesso
    from raiox_usuarios u order by u.ativo desc, u.papel, u.login`;
}

export function senhaForte() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ', a = 'abcdefghijkmnopqrstuvwxyz', n = '23456789';
  const todos = A + a + n, pega = (c) => c[crypto.randomInt(c.length)];
  const chars = [pega(A), pega(a), pega(n), ...Array.from({ length: 11 }, () => pega(todos))];
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

// Cria ou atualiza. Senha nova derruba as sessões abertas da conta.
export async function salvarUsuario({ login, nome, papel, senha }) {
  await prepararRaiox();
  const l = String(login || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(l)) throw Object.assign(new Error('Login: 3 a 40 letras minúsculas, números, ponto, hífen ou _.'), { status: 400 });
  if (!PAPEIS.includes(papel)) throw Object.assign(new Error('Papel inválido.'), { status: 400 });
  const n = String(nome || '').trim().slice(0, 80) || l;
  if (senha) {
    if (String(senha).length < 8) throw Object.assign(new Error('Senha com pelo menos 8 caracteres.'), { status: 400 });
    const h = await hashSenha(senha);
    await sql`insert into raiox_usuarios (login, nome, papel, senha_hash) values (${l}, ${n}, ${papel}, ${h})
      on conflict (login) do update set nome = excluded.nome, papel = excluded.papel, senha_hash = excluded.senha_hash, ativo = true`;
    await sql`delete from raiox_sessoes where usuario_id = (select id from raiox_usuarios where login = ${l})`;
  } else {
    const r = await sql`update raiox_usuarios set nome = ${n}, papel = ${papel} where login = ${l} returning id`;
    if (!r.length) throw Object.assign(new Error('Usuário não existe; informe uma senha para criar.'), { status: 404 });
  }
}

export async function ativarUsuario(login, ativo) {
  await prepararRaiox();
  const r = await sql`update raiox_usuarios set ativo = ${Boolean(ativo)} where login = ${String(login || '').toLowerCase()} returning id`;
  if (!r.length) throw Object.assign(new Error('Usuário não encontrado.'), { status: 404 });
  if (!ativo) await sql`delete from raiox_sessoes where usuario_id = ${r[0].id}`;
}

export { json, erro, mesmaOrigem, ipDe, registrar };
