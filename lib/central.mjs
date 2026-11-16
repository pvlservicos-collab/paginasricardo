// Central R1 (interno.grupor1.com): área de membros com login próprio, separada do painel de páginas.
//
// - Toda página cujo domínio está em DOMINIOS_CENTRAL só é entregue a quem tem sessão (api/servir.js),
//   quando a proteção está ligada (chave na tela Gestão de membros). Sem sessão, a pessoa vê a tela de entrada
//   no próprio endereço da página e, ao entrar, a página abre.
// - Não existe cadastro pelo próprio usuário: só o admin cria membros (tela /gestao-membros). A senha é gerada
//   aleatória, mostrada uma única vez e guardada só como hash scrypt (o mesmo de lib/auth.mjs).
// - Papéis: "admin" (vê as páginas + Gestão de membros) e "membro" (só as páginas).
// - Sessão no servidor; o cookie HttpOnly leva só um código aleatório. 12 h sem uso ou 7 dias, o que vier antes.
//   Desativar o membro ou gerar senha nova derruba as sessões dele na hora.
// - 5 erros por conta ou 20 por IP em 15 min bloqueiam novas tentativas.
// - As páginas protegidas saem com Cache-Control private/no-store: a CDN nunca guarda cópia delas.
import crypto from 'node:crypto';
import { sql, usandoBanco } from './store.mjs';
import { hashSenha, conferirSenha, ipDe, registrar, senhaForte } from './auth.mjs';
import { json, erro, mesmaOrigem } from './servidor.mjs';

export const DOMINIOS_CENTRAL = ['interno.grupor1.com'];
export const HOST_CENTRAL = DOMINIOS_CENTRAL[0];
export const ehCentral = (host) => DOMINIOS_CENTRAL.includes(String(host || '').toLowerCase());
export const PAPEIS = ['admin', 'membro'];

const SEGURO = Boolean(process.env.VERCEL);
const COOKIE = SEGURO ? '__Host-c1' : 'c1';
const OCIOSA_H = 12, MAX_D = 7;
const JANELA_MIN = 15, MAX_CONTA = 5, MAX_IP = 20;

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const falha = (mensagem, status = 400) => Object.assign(new Error(mensagem), { status });
export { senhaForte, registrar, ipDe, json, erro };

let pronto = null;
export function prepararCentral() {
  if (!usandoBanco) throw falha('Banco de dados não conectado.', 503);
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists central_membros (
        id serial primary key,
        login text unique not null,
        nome text not null,
        papel text not null check (papel in ('admin','membro')),
        senha_hash text not null,
        ativo boolean not null default true,
        criado_em timestamptz not null default now(),
        criado_por text,
        senha_em timestamptz not null default now(),
        ultimo_acesso timestamptz
      )`;
      await sql`create table if not exists central_sessoes (
        token_hash text primary key,
        membro_id int not null references central_membros(id) on delete cascade,
        criada_em timestamptz not null default now(),
        usada_em timestamptz not null default now(),
        ip text,
        agente text
      )`;
      await sql`create table if not exists central_tentativas (
        id bigserial primary key,
        login text,
        ip text,
        em timestamptz not null default now()
      )`;
      await sql`create index if not exists central_tentativas_em on central_tentativas (em)`;
      await sql`create table if not exists central_config (
        chave text primary key,
        valor jsonb not null,
        atualizado_em timestamptz not null default now(),
        atualizado_por text
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

/* ---------------- endereço ---------------- */
export const hostDe = (request) => (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase().replace(/:\d+$/, '');
// A API só responde no domínio da Central (o cookie é desse domínio), no computador e nas prévias da Vercel.
export const hostPermitido = (host) => ehCentral(host) || /^(localhost|127\.)/.test(host) || /^paginasricardo-[a-z0-9-]+\.vercel\.app$/.test(host);

/* ---------------- liga/desliga da proteção ---------------- */
let protecaoCache = null;
export async function protecaoLigada() {
  if (!usandoBanco) return false;
  if (protecaoCache && Date.now() - protecaoCache.em < 5000) return protecaoCache.valor;
  await prepararCentral();
  const [r] = await sql`select valor from central_config where chave = 'protecao'`;
  const valor = Boolean(r && (typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor));
  protecaoCache = { em: Date.now(), valor };
  return valor;
}
export async function definirProtecao(ligada, quem) {
  await prepararCentral();
  await sql`insert into central_config (chave, valor, atualizado_por) values ('protecao', ${JSON.stringify(Boolean(ligada))}::jsonb, ${quem})
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`;
  protecaoCache = null;
}

/* ---------------- sessão ---------------- */
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${SEGURO ? '; Secure' : ''}`;
export const cookieDeSaida = () => cookie('', 0);
function lerCookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/[-]/g, '\\-')}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

let hashFalso = null; // gasta o mesmo tempo quando o login não existe

export async function entrar(identificador, senha, request) {
  await prepararCentral();
  const ip = ipDe(request);
  const ident = String(identificador || '').trim().toLowerCase().slice(0, 160);
  const pass = String(senha || '');
  if (!ident || !pass || pass.length > 200) return { status: 400, erro: 'Informe o e-mail e a senha.' };
  const [{ conta, porIp }] = await sql`select
      count(*) filter (where login = ${ident})::int as conta,
      count(*) filter (where ip = ${ip})::int as "porIp"
    from central_tentativas where em > now() - make_interval(mins => ${JANELA_MIN})`;
  if (conta >= MAX_CONTA || porIp >= MAX_IP) {
    await registrar('central_login_bloqueado', { usuario: ident, ip });
    return { status: 429, erro: `Muitas tentativas. Aguarde ${JANELA_MIN} minutos e tente de novo.` };
  }
  const [u] = await sql`select id, login, nome, papel, senha_hash from central_membros where ativo and login = ${ident} limit 1`;
  if (!hashFalso) hashFalso = await hashSenha(token());
  const confere = await conferirSenha(pass, u ? u.senha_hash : hashFalso);
  if (!u || !confere) {
    await sql`insert into central_tentativas (login, ip) values (${ident}, ${ip})`;
    await registrar('central_login_falhou', { usuario: ident, ip });
    return { status: 401, erro: 'E-mail ou senha incorretos.' };
  }
  await sql`delete from central_tentativas where login = ${ident} or em < now() - interval '1 day'`;
  await sql`delete from central_sessoes where membro_id = ${u.id} and (usada_em < now() - make_interval(hours => ${OCIOSA_H}) or criada_em < now() - make_interval(days => ${MAX_D}))`;
  const t = token();
  await sql`insert into central_sessoes (token_hash, membro_id, ip, agente) values (${sha(t)}, ${u.id}, ${ip}, ${(request.headers.get('user-agent') || '').slice(0, 300)})`;
  await sql`update central_membros set ultimo_acesso = now() where id = ${u.id}`;
  await registrar('central_login', { usuario: u.login, ip });
  return { cookie: cookie(t, MAX_D * 86400), membro: { login: u.login, nome: u.nome, papel: u.papel } };
}

// Membro logado (ativo) ou null.
export async function sessao(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return null;
  await prepararCentral();
  const [s] = await sql`select s.token_hash, s.usada_em, s.criada_em, m.id, m.login, m.nome, m.papel
    from central_sessoes s join central_membros m on m.id = s.membro_id
    where s.token_hash = ${sha(t)} and m.ativo limit 1`;
  if (!s) return null;
  const agora = Date.now();
  if (agora - new Date(s.usada_em) > OCIOSA_H * 3600e3 || agora - new Date(s.criada_em) > MAX_D * 86400e3) {
    await sql`delete from central_sessoes where token_hash = ${s.token_hash}`;
    return null;
  }
  if (agora - new Date(s.usada_em) > 60e3) await sql`update central_sessoes set usada_em = now() where token_hash = ${s.token_hash}`;
  return { id: s.id, login: s.login, nome: s.nome, papel: s.papel };
}

export async function sair(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return;
  await prepararCentral();
  await sql`delete from central_sessoes where token_hash = ${sha(t)}`;
}

// Envolve as rotas da API da Central: domínio certo, mesma origem nos pedidos que mudam algo, login e papel.
export function protegidoCentral(fn, { admin = false } = {}) {
  return async (request) => {
    const id = crypto.randomUUID().slice(0, 8);
    const url = new URL(request.url);
    try {
      if (!hostPermitido(hostDe(request))) return erro('Endereço não permitido.', 403);
      if (!['GET', 'HEAD'].includes(request.method) && !mesmaOrigem(request)) {
        await registrar('central_origem_bloqueada', { ip: ipDe(request), detalhe: { rota: url.pathname, origem: request.headers.get('origin') } });
        return erro('Origem não permitida.', 403);
      }
      const u = await sessao(request);
      if (!u) return erro('Faça login para continuar.', 401);
      if (admin && u.papel !== 'admin') return erro('Só o admin pode fazer isso.', 403);
      return await fn(request, url, u);
    } catch (e) {
      if (e.status && e.status < 500) return erro(e.message, e.status);
      console.error(JSON.stringify({ tipo: 'erro', id, rota: url.pathname, msg: e.message }));
      return erro(`Serviço indisponível (código ${id}).`, 503);
    }
  };
}

/* ---------------- membros ---------------- */
const limparLogin = (v) => {
  const l = String(v || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._%+@-]{2,119}$/.test(l)) throw falha('Use um e-mail (ou usuário) com 3 a 120 caracteres: letras, números e . _ - @ +');
  return l;
};
const limparNome = (v) => {
  const n = String(v || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 80);
  if (n.length < 2) throw falha('Informe o nome do membro.');
  return n;
};

export async function listarMembros() {
  await prepararCentral();
  return sql`select m.login, m.nome, m.papel, m.ativo, m.criado_em, m.criado_por, m.senha_em, m.ultimo_acesso,
      (select count(*)::int from central_sessoes s where s.membro_id = m.id and s.usada_em > now() - make_interval(hours => ${OCIOSA_H})) as sessoes
    from central_membros m order by m.ativo desc, m.papel, m.nome`;
}

// Cria o membro com senha aleatória. Devolve a senha (só neste momento).
export async function criarMembro({ login, nome, papel }, quem) {
  await prepararCentral();
  const l = limparLogin(login), n = limparNome(nome);
  if (!PAPEIS.includes(papel)) throw falha('Papel inválido.');
  const [ja] = await sql`select 1 from central_membros where login = ${l}`;
  if (ja) throw falha('Já existe um membro com esse e-mail.', 409);
  const senha = senhaForte();
  await sql`insert into central_membros (login, nome, papel, senha_hash, criado_por) values (${l}, ${n}, ${papel}, ${await hashSenha(senha)}, ${quem})`;
  return { login: l, senha };
}

// Gera senha nova (aleatória) e derruba as sessões abertas do membro.
export async function novaSenha(login, quem) {
  await prepararCentral();
  const l = limparLogin(login);
  const senha = senhaForte();
  const r = await sql`update central_membros set senha_hash = ${await hashSenha(senha)}, senha_em = now() where login = ${l} returning id`;
  if (!r.length) throw falha('Membro não encontrado.', 404);
  await sql`delete from central_sessoes where membro_id = ${r[0].id}`;
  await sql`delete from central_tentativas where login = ${l}`;
  return { login: l, senha };
}

// Ativa/desativa, troca nome ou papel. Desativar derruba as sessões na hora.
export async function alterarMembro(login, d) {
  await prepararCentral();
  const l = limparLogin(login);
  const [m] = await sql`select id, nome, papel, ativo from central_membros where login = ${l}`;
  if (!m) throw falha('Membro não encontrado.', 404);
  const nome = d.nome !== undefined ? limparNome(d.nome) : m.nome;
  const papel = d.papel !== undefined ? d.papel : m.papel;
  if (!PAPEIS.includes(papel)) throw falha('Papel inválido.');
  const ativo = d.ativo !== undefined ? Boolean(d.ativo) : m.ativo;
  await sql`update central_membros set nome = ${nome}, papel = ${papel}, ativo = ${ativo} where id = ${m.id}`;
  if (!ativo) await sql`delete from central_sessoes where membro_id = ${m.id}`;
  return { login: l, nome, papel, ativo };
}

export async function excluirMembro(login) {
  await prepararCentral();
  const l = limparLogin(login);
  const r = await sql`delete from central_membros where login = ${l} returning id`;
  if (!r.length) throw falha('Membro não encontrado.', 404);
}

/* ---------------- telas entregues no lugar da página ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Tela de entrada, no próprio endereço da página. Ao entrar, recarrega e a página abre.
export function documentoEntrada(titulo) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Central R1 · Acesso restrito</title>
<style>:root{--bg:#0D0D0D;--card:#151515;--linha:#2a2a2a;--txt:#f2f2f2;--sub:#a3a3a3;--red:#FE0026;--red2:#B8001C}
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--txt);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px;background:radial-gradient(900px 500px at 50% -10%,rgba(254,0,38,.18),transparent 60%),var(--bg)}
form{width:100%;max-width:400px;background:var(--card);border:1px solid var(--linha);border-radius:18px;padding:32px 28px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.tag{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--sub);display:flex;align-items:center;gap:8px}.tag i{width:7px;height:7px;border-radius:50%;background:var(--red)}
h1{font-weight:700;font-size:28px;line-height:1.1;margin:14px 0 8px;letter-spacing:-.02em}p{color:var(--sub);font-size:14.5px;line-height:1.5;margin:0 0 22px}
label{display:block;font-size:12.5px;color:var(--sub);margin:0 0 6px}
input{width:100%;height:48px;border-radius:12px;border:1px solid var(--linha);background:#0f0f0f;color:var(--txt);font:inherit;font-size:16px;padding:0 14px;margin:0 0 14px;outline:none}input:focus{border-color:var(--red)}
button{width:100%;height:50px;border:0;border-radius:12px;background:var(--red);color:#fff;font:inherit;font-weight:600;font-size:15px;cursor:pointer}button:hover{background:var(--red2)}button:disabled{opacity:.55;cursor:wait}
.erro{color:#ff6b7f;font-size:13.5px;min-height:18px;margin:-4px 0 12px}.nota{font-size:12.5px;margin:16px 0 0}</style></head>
<body><main><form id="f" novalidate><div class="tag"><i></i>Grupo R1 · Central interna</div><h1>Acesso restrito</h1><p>${esc(titulo || 'Central R1')}</p>
<label for="u">E-mail</label><input id="u" type="text" autocomplete="username" inputmode="email" autocapitalize="none" spellcheck="false">
<label for="s">Senha</label><input id="s" type="password" autocomplete="current-password">
<div class="erro" id="e" role="alert"></div><button id="b" type="submit">Entrar</button>
<p class="nota">Não tem acesso ou esqueceu a senha? Fale com o administrador da Central.</p></form></main>
<script>(function(){var f=document.getElementById('f'),b=document.getElementById('b'),e=document.getElementById('e');document.getElementById('u').focus();
f.addEventListener('submit',function(ev){ev.preventDefault();b.disabled=true;e.textContent='';
fetch('/api/central/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({usuario:document.getElementById('u').value,senha:document.getElementById('s').value})})
.then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(!r.ok)throw new Error(j.erro||'Não foi possível entrar agora.');location.reload()})})
.catch(function(x){e.textContent=x.message;b.disabled=false})})})();</script></body></html>
`;
}

// Barrinha discreta no canto da página para quem está logado: nome, Sair e (admin) Gestão de membros.
// Fica num shadow DOM, sem interferir no CSS da página.
export function barraMembro(m) {
  const dados = JSON.stringify({ nome: m.nome, admin: m.papel === 'admin' }).replace(/</g, '\\u003c');
  return `<div id="c1-barra"></div><script>(function(){var d=${dados},h=document.getElementById('c1-barra');if(!h||!h.attachShadow)return;var r=h.attachShadow({mode:'closed'});
r.innerHTML='<style>:host{all:initial}.b{position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:6px;font:500 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;background:rgba(13,13,13,.88);color:#f2f2f2;border:1px solid #2a2a2a;border-radius:999px;padding:5px 6px 5px 12px;backdrop-filter:blur(6px);box-shadow:0 6px 20px rgba(0,0,0,.35)}.n{max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.8}a,button{font:inherit;color:#fff;background:#262626;border:0;border-radius:999px;padding:6px 10px;cursor:pointer;text-decoration:none}a{background:#FE0026}a:hover{background:#B8001C}button:hover{background:#333}</style><div class="b"><span class="n"></span></div>';
var b=r.querySelector('.b');r.querySelector('.n').textContent=d.nome;
if(d.admin){var a=document.createElement('a');a.href='/gestao-membros';a.textContent='Gestão de membros';b.appendChild(a)}
var s=document.createElement('button');s.type='button';s.textContent='Sair';s.onclick=function(){fetch('/api/central/login',{method:'DELETE',credentials:'same-origin'}).finally(function(){location.reload()})};b.appendChild(s)})();</script>`;
}

export function comBarra(doc, m) {
  const barra = barraMembro(m);
  return /<\/body>/i.test(doc) ? doc.replace(/<\/body>(?![\s\S]*<\/body>)/i, barra + '</body>') : doc + barra;
}
