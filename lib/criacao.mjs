// Dashboard de análise e criação de criativos — interno.grupor1.com/dashboardscriacao (pedido de 17/11/2026).
//
// Quem entra: Google @grupor1.com / @ivoxmarketing.com direto; outras contas Google só se aprovadas em central_acessos
// (a mesma regra da Central R1). Sessão própria em cookie HttpOnly (__Host-dsc), 12 h.
//
// Dados: chegam pelo webhook (api/criacao/webhook.js) vindos da IA/automação na VPS:
//   metricas  → criacao_criativos + criacao_metricas (um registro por criativo por dia)
//   insights  → criacao_insights (sugestões: vencedor, variação, tráfego, alerta, análise)
//   resposta  → criacao_conversa (resposta da máquina a uma pergunta feita na tela)
// Enquanto a IA da VPS não responde, a conversa e a análise usam o Claude (ANTHROPIC_API_KEY) com as métricas como contexto.
import crypto from 'node:crypto';
import { sql, usandoBanco } from './store.mjs';
import { verificarIdToken } from './google-login.mjs';
import { prepararAprovacao, limiteIp, contarFalha, DOMINIOS_CENTRAL } from './aprovacao.mjs';

const SEGURO = Boolean(process.env.VERCEL);
const COOKIE = SEGURO ? '__Host-dsc' : 'dsc';
const DURACAO_H = 12;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');
export const falha = (m, status = 400) => Object.assign(new Error(m), { status });

export const TIPOS_INSIGHT = ['vencedor', 'variacao', 'trafego', 'alerta', 'analise'];
export const PRIORIDADES = ['urgente', 'alta', 'normal'];
export const STATUS_INSIGHT = ['novo', 'aceito', 'feito', 'descartado'];
export const TIPOS_CRIATIVO = ['video', 'imagem', 'carrossel', 'lp', 'outro'];

/* ---------------- tabelas ---------------- */
let pronto = null;
export function preparar() {
  if (!usandoBanco) throw falha('Banco de dados não conectado.', 503);
  if (!pronto) {
    pronto = (async () => {
      await prepararAprovacao();
      await sql`create table if not exists criacao_sessoes (token_hash text primary key, email text not null, nome text, criada_em timestamptz not null default now(), ip text)`;
      await sql`create table if not exists criacao_criativos (
        id text primary key,
        nome text not null,
        tipo text not null default 'video',
        frente text, praca text, campanha text, conjunto text,
        status text not null default 'ativo',
        previa text, miniatura text,
        dados jsonb not null default '{}'::jsonb,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists criacao_metricas (
        criativo_id text not null references criacao_criativos(id) on delete cascade,
        dia date not null,
        gasto numeric(14,2) not null default 0,
        impressoes bigint not null default 0,
        alcance bigint not null default 0,
        cliques bigint not null default 0,
        cliques_link bigint not null default 0,
        views_3s bigint not null default 0,
        thruplays bigint not null default 0,
        leads bigint not null default 0,
        vendas bigint not null default 0,
        receita numeric(14,2) not null default 0,
        dados jsonb not null default '{}'::jsonb,
        atualizado_em timestamptz not null default now(),
        primary key (criativo_id, dia)
      )`;
      await sql`create table if not exists criacao_insights (
        id bigserial primary key,
        tipo text not null,
        prioridade text not null default 'normal',
        titulo text not null,
        texto text not null default '',
        acao text,
        criativo_id text,
        origem text not null default 'vps',
        dados jsonb not null default '{}'::jsonb,
        status text not null default 'novo',
        criado_em timestamptz not null default now(),
        decidido_em timestamptz, decidido_por text
      )`;
      await sql`create table if not exists criacao_projetos (
        id text primary key,
        nome text not null,
        dono text not null,
        estado jsonb not null default '{}'::jsonb,
        criado_em timestamptz not null default now(),
        atualizado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists criacao_conversa (
        id bigserial primary key,
        projeto_id text not null,
        papel text not null,
        texto text not null,
        quem text,
        criado_em timestamptz not null default now()
      )`;
      await sql`create table if not exists criacao_eventos (
        id bigserial primary key,
        origem text, tipo text, itens int not null default 0, resumo text,
        recebido_em timestamptz not null default now()
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

/* ---------------- sessão ---------------- */
const cookie = (valor, maxAge) => `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SEGURO ? '; Secure' : ''}`;
export const cookieSaida = () => cookie('', 0);
function lerCookie(request) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE.replace(/-/g, '\\-')}=([A-Za-z0-9_-]{20,100})`));
  return m ? m[1] : null;
}

export async function entrar(credential, ip) {
  await preparar();
  if (await limiteIp(ip)) return { status: 429, erro: 'Muitas tentativas. Aguarde 15 minutos.' };
  let g;
  try { g = await verificarIdToken(credential); }
  catch (e) { await contarFalha(ip); return { status: e.status || 401, erro: e.message }; }
  if (!DOMINIOS_CENTRAL.some((d) => g.email.endsWith(d))) {
    const [a] = await sql`select status, google_sub from central_acessos where email = ${g.email}`;
    if (!a) {
      await contarFalha(ip);
      await sql`insert into central_acessos (email, nome, origem, google_sub) values (${g.email}, ${g.nome || null}, 'google', ${g.sub || null})`;
      return { status: 202, erro: 'Pedido de acesso enviado. Assim que o administrador aprovar em /aprovacoes, entre de novo.' };
    }
    if (a.google_sub && g.sub && a.google_sub !== g.sub) { await contarFalha(ip); return { status: 403, erro: 'Este e-mail está ligado a outra Conta Google.' }; }
    if (a.status === 'pendente') return { status: 403, erro: 'Seu pedido está aguardando aprovação do administrador.' };
    if (a.status !== 'aprovado') { await contarFalha(ip); return { status: 403, erro: 'O acesso deste e-mail não foi aprovado.' }; }
  }
  const t = crypto.randomBytes(32).toString('base64url');
  await sql`delete from criacao_sessoes where criada_em < now() - make_interval(hours => ${DURACAO_H})`;
  await sql`insert into criacao_sessoes (token_hash, email, nome, ip) values (${sha(t)}, ${g.email}, ${g.nome || null}, ${ip})`;
  return { email: g.email, nome: g.nome || null, cookie: cookie(t, DURACAO_H * 3600) };
}

export async function sessaoDe(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return null;
  await preparar();
  const [s] = await sql`select email, nome from criacao_sessoes where token_hash = ${sha(t)} and criada_em > now() - make_interval(hours => ${DURACAO_H})`;
  return s || null;
}

export async function sair(request) {
  const t = lerCookie(request);
  if (!t || !usandoBanco) return;
  await preparar();
  await sql`delete from criacao_sessoes where token_hash = ${sha(t)}`;
}

/* ---------------- webhook: métricas, sugestões e respostas ---------------- */
const txt = (v, max = 300) => (v == null ? null : String(v).trim().slice(0, max) || null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const int = (v) => Math.max(0, Math.round(num(v)));
const diaValido = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v));
const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export async function receberMetricas(itens) {
  await preparar();
  let n = 0;
  for (const it of itens.slice(0, 2000)) {
    const c = objeto(it.criativo);
    const id = txt(c.id || it.criativo_id, 120);
    const dia = it.dia || new Date().toISOString().slice(0, 10);
    if (!id || !diaValido(dia)) continue;
    const nome = txt(c.nome || it.nome, 300) || id;
    const tipo = TIPOS_CRIATIVO.includes(c.tipo) ? c.tipo : 'video';
    await sql`insert into criacao_criativos (id, nome, tipo, frente, praca, campanha, conjunto, status, previa, miniatura, dados)
      values (${id}, ${nome}, ${tipo}, ${txt(c.frente)}, ${txt(c.praca)}, ${txt(c.campanha)}, ${txt(c.conjunto)}, ${txt(c.status, 40) || 'ativo'}, ${txt(c.previa, 1000)}, ${txt(c.miniatura, 1000)}, ${JSON.stringify(objeto(c.dados))}::jsonb)
      on conflict (id) do update set nome = excluded.nome, tipo = excluded.tipo,
        frente = coalesce(excluded.frente, criacao_criativos.frente), praca = coalesce(excluded.praca, criacao_criativos.praca),
        campanha = coalesce(excluded.campanha, criacao_criativos.campanha), conjunto = coalesce(excluded.conjunto, criacao_criativos.conjunto),
        status = excluded.status, previa = coalesce(excluded.previa, criacao_criativos.previa), miniatura = coalesce(excluded.miniatura, criacao_criativos.miniatura),
        dados = criacao_criativos.dados || excluded.dados, atualizado_em = now()`;
    await sql`insert into criacao_metricas (criativo_id, dia, gasto, impressoes, alcance, cliques, cliques_link, views_3s, thruplays, leads, vendas, receita, dados)
      values (${id}, ${dia}, ${num(it.gasto)}, ${int(it.impressoes)}, ${int(it.alcance)}, ${int(it.cliques)}, ${int(it.cliques_link)}, ${int(it.views_3s)}, ${int(it.thruplays)}, ${int(it.leads)}, ${int(it.vendas)}, ${num(it.receita)}, ${JSON.stringify(objeto(it.dados))}::jsonb)
      on conflict (criativo_id, dia) do update set gasto = excluded.gasto, impressoes = excluded.impressoes, alcance = excluded.alcance,
        cliques = excluded.cliques, cliques_link = excluded.cliques_link, views_3s = excluded.views_3s, thruplays = excluded.thruplays,
        leads = excluded.leads, vendas = excluded.vendas, receita = excluded.receita, dados = criacao_metricas.dados || excluded.dados, atualizado_em = now()`;
    n++;
  }
  return n;
}

export async function receberInsights(itens, origem = 'vps') {
  await preparar();
  let n = 0;
  for (const it of itens.slice(0, 200)) {
    const titulo = txt(it.titulo, 200);
    if (!titulo) continue;
    const tipo = TIPOS_INSIGHT.includes(it.tipo) ? it.tipo : 'analise';
    const prioridade = PRIORIDADES.includes(it.prioridade) ? it.prioridade : 'normal';
    await sql`insert into criacao_insights (tipo, prioridade, titulo, texto, acao, criativo_id, origem, dados)
      values (${tipo}, ${prioridade}, ${titulo}, ${txt(it.texto, 4000) || ''}, ${txt(it.acao, 80)}, ${txt(it.criativo_id, 120)}, ${origem}, ${JSON.stringify(objeto(it.dados))}::jsonb)`;
    n++;
  }
  return n;
}

export async function receberResposta({ projeto_id, texto }) {
  await preparar();
  const p = txt(projeto_id, 60), t = txt(texto, 8000);
  if (!p || !t) return 0;
  await sql`insert into criacao_conversa (projeto_id, papel, texto, quem) values (${p}, 'maquina', ${t}, 'vps')`;
  return 1;
}

export async function registrarEvento(origem, tipo, itens, resumo) {
  await preparar();
  await sql`insert into criacao_eventos (origem, tipo, itens, resumo) values (${txt(origem, 80)}, ${txt(tipo, 40)}, ${itens}, ${txt(resumo, 300)})`;
  await sql`delete from criacao_eventos where id < (select coalesce(max(id), 0) - 500 from criacao_eventos)`;
}

/* ---------------- leitura para a tela ---------------- */
export async function carregarTudo(dias = 7) {
  await preparar();
  const d = Math.min(90, Math.max(1, Number(dias) || 7));
  const [criativos, serie, insights, eventos, projetos] = await Promise.all([
    sql`select c.id, c.nome, c.tipo, c.frente, c.praca, c.campanha, c.conjunto, c.status, c.previa, c.miniatura, c.dados, c.atualizado_em,
          coalesce(sum(m.gasto),0)::float as gasto, coalesce(sum(m.impressoes),0)::int as impressoes, coalesce(sum(m.alcance),0)::int as alcance,
          coalesce(sum(m.cliques),0)::int as cliques, coalesce(sum(m.cliques_link),0)::int as cliques_link, coalesce(sum(m.views_3s),0)::int as views_3s,
          coalesce(sum(m.thruplays),0)::int as thruplays, coalesce(sum(m.leads),0)::int as leads, coalesce(sum(m.vendas),0)::int as vendas,
          coalesce(sum(m.receita),0)::float as receita, count(m.dia)::int as dias
        from criacao_criativos c left join criacao_metricas m on m.criativo_id = c.id and m.dia > current_date - ${d}::int
        group by c.id order by gasto desc, c.atualizado_em desc limit 500`,
    sql`select criativo_id, to_char(dia,'YYYY-MM-DD') as dia, gasto::float as gasto, impressoes::int as impressoes, cliques_link::int as cliques_link,
          views_3s::int as views_3s, thruplays::int as thruplays, leads::int as leads, vendas::int as vendas, receita::float as receita
        from criacao_metricas where dia > current_date - ${d}::int order by dia`,
    sql`select id, tipo, prioridade, titulo, texto, acao, criativo_id, origem, dados, status, criado_em from criacao_insights
        where status <> 'descartado' or criado_em > now() - interval '2 days' order by (status='novo') desc,
          case prioridade when 'urgente' then 0 when 'alta' then 1 else 2 end, criado_em desc limit 300`,
    sql`select origem, tipo, itens, resumo, recebido_em from criacao_eventos order by id desc limit 30`,
    sql`select id, nome, dono, estado, atualizado_em from criacao_projetos order by atualizado_em desc limit 50`,
  ]);
  return { dias: d, criativos, serie, insights, eventos, projetos, geradoEm: new Date().toISOString() };
}

export async function decidirInsight(id, status, quem) {
  await preparar();
  if (!STATUS_INSIGHT.includes(status)) throw falha('Status inválido.');
  const r = await sql`update criacao_insights set status = ${status}, decidido_em = now(), decidido_por = ${quem} where id = ${Number(id) || 0} returning id`;
  if (!r.length) throw falha('Sugestão não encontrada.', 404);
}

export const novoId = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');

export async function salvarProjeto({ id, nome, estado }, quem) {
  await preparar();
  const pid = txt(id, 60) || novoId();
  const n = txt(nome, 120) || 'Projeto sem nome';
  const est = JSON.stringify(objeto(estado));
  if (est.length > 400_000) throw falha('Projeto grande demais.', 413);
  await sql`insert into criacao_projetos (id, nome, dono, estado) values (${pid}, ${n}, ${quem}, ${est}::jsonb)
    on conflict (id) do update set nome = excluded.nome, estado = excluded.estado, atualizado_em = now()`;
  return pid;
}

export async function excluirProjeto(id) {
  await preparar();
  const pid = txt(id, 60);
  if (!pid) throw falha('Projeto inválido.');
  await sql`delete from criacao_conversa where projeto_id = ${pid}`;
  await sql`delete from criacao_projetos where id = ${pid}`;
}

export async function conversa(projetoId) {
  await preparar();
  return sql`select id, papel, texto, quem, criado_em from criacao_conversa where projeto_id = ${txt(projetoId, 60) || ''} order by id desc limit 80`.then((r) => r.reverse());
}

export async function guardarMensagem(projetoId, papel, texto, quem) {
  await preparar();
  const [r] = await sql`insert into criacao_conversa (projeto_id, papel, texto, quem) values (${txt(projetoId, 60)}, ${papel}, ${txt(texto, 8000)}, ${quem}) returning id, criado_em`;
  return r;
}

/* ---------------- resumo das métricas em texto (contexto da máquina) ---------------- */
const br = (n, c = 2) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
export function resumoTexto(tudo) {
  const L = [`Período: últimos ${tudo.dias} dias. ${tudo.criativos.length} criativos.`];
  const tot = tudo.criativos.reduce((a, c) => { for (const k of ['gasto', 'impressoes', 'cliques_link', 'views_3s', 'thruplays', 'leads', 'vendas', 'receita']) a[k] = (a[k] || 0) + Number(c[k] || 0); return a; }, {});
  L.push(`Total: gasto R$ ${br(tot.gasto)}, impressões ${tot.impressoes}, cliques no link ${tot.cliques_link}, leads ${tot.leads}, vendas ${tot.vendas}, receita R$ ${br(tot.receita)}.`);
  L.push('Por criativo (nome | frente/praça | gasto | impressões | CTR link | hook 3s | hold (thruplay/3s) | leads | CPL | vendas | CPA | ROAS):');
  for (const c of tudo.criativos.slice(0, 60)) {
    const ctr = c.impressoes ? (100 * c.cliques_link / c.impressoes) : 0, hook = c.impressoes ? 100 * c.views_3s / c.impressoes : 0, hold = c.views_3s ? 100 * c.thruplays / c.views_3s : 0;
    const cpl = c.leads ? c.gasto / c.leads : 0, cpa = c.vendas ? c.gasto / c.vendas : 0, roas = c.gasto ? c.receita / c.gasto : 0;
    L.push(`- ${c.nome} | ${[c.frente, c.praca].filter(Boolean).join('/') || '-'} | R$ ${br(c.gasto)} | ${c.impressoes} | ${br(ctr)}% | ${br(hook, 1)}% | ${br(hold, 1)}% | ${c.leads} | R$ ${br(cpl)} | ${c.vendas} | R$ ${br(cpa)} | ${br(roas)}x`);
  }
  const abertas = tudo.insights.filter((i) => i.status === 'novo').slice(0, 20);
  if (abertas.length) L.push('Sugestões em aberto: ' + abertas.map((i) => `[${i.prioridade}] ${i.titulo}`).join('; '));
  return L.join('\n');
}
