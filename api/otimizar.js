// /otimizar — terminal do Claude Code na VPS (substitui o Marquinhos, 20/11/2026).
// O painel só grava o pedido numa fila do banco e lê o que o Claude vai escrevendo; quem trabalha é o serviço
// "otimizar" na VPS (usuário Linux sem root, Claude Code com as técnicas de PageSpeed no CLAUDE.md). Sem porta exposta.
// Acesso (20/11/2026): (1) login Google do interno.grupor1.com (cookie do /dashboardscriacao, lib/criacao.mjs) com e-mail
// liberado em OTIMIZAR_EMAILS (padrão: o Lucas, que não tem usuário no painel); ou (2) login do painel com papel admin.
//   GET  /api/otimizar                    → { pode, voce, vps: { online, logado, ocupado, fila } }
//   GET  /api/otimizar?historico=1        → { itens: [{ id, texto, estado, chunks, criado }] }  (conversa atual)
//   GET  /api/otimizar?id=&cursor=        → { chunks, total, estado }
//   POST /api/otimizar { texto }          → { id }
//   POST /api/otimizar { acao: 'parar', id } · { acao: 'nova' }  (para o pedido / começa conversa nova)
import { protegido, json, erro, lerJson, mesmaOrigem } from '../lib/servidor.mjs';
import { sql } from '../lib/store.mjs';
import { sessaoDe as sessaoGoogle } from '../lib/criacao.mjs';
import { carregarConfig } from '../lib/servidor.mjs';
import { linkDaPagina } from '../lib/core.mjs';
import { createHash, timingSafeEqual } from 'node:crypto';

// Sem login (pedido do Pedro, 20/11/2026): quem já abriu a Central (interno.grupor1.com) tem a chave dela guardada no
// navegador (localStorage r1int.chave = CENTRAL_CONTEUDO_KEY) e o chat manda essa chave no cabeçalho X-Central-Chave.
// A conversa fica como "equipe" (uma só para todos que entram assim).
function chaveDaCentral(request) {
  const chave = (process.env.CENTRAL_CONTEUDO_KEY || '').trim(), veio = (request.headers.get('x-central-chave') || '').trim();
  if (chave.length < 16 || !veio) return false;
  return timingSafeEqual(createHash('sha256').update(chave).digest(), createHash('sha256').update(veio).digest());
}

const LIBERADOS = new Set(String(process.env.OTIMIZAR_EMAILS || 'lucas.figueiredo@grupor1.com').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const emailDe = (u) => String(u.email || u.login || '').toLowerCase();
const pode = (u) => u.papel === 'admin' || u.papel === 'central' || LIBERADOS.has(emailDe(u));
// Google liberado primeiro; senão, o login do painel (protegido cuida do cookie, da renovação e da origem)
const comAcesso = (fn) => async (request) => {
  if (chaveDaCentral(request)) {
    if (!['GET', 'HEAD'].includes(request.method) && !mesmaOrigem(request)) return erro('Origem não permitida.', 403);
    return fn(request, new URL(request.url), { email: 'equipe@central', papel: 'central' });
  }
  const g = await sessaoGoogle(request).catch(() => null);
  const email = String(g?.email || '').toLowerCase();
  if (email && LIBERADOS.has(email)) {
    if (!['GET', 'HEAD'].includes(request.method) && !mesmaOrigem(request)) return erro('Origem não permitida.', 403);
    return fn(request, new URL(request.url), { email, papel: 'google' });
  }
  return protegido(fn)(request);
};

let pronto = null;
export const prepararOtimizar = () => (pronto ||= (async () => {
  await sql`create table if not exists otimizar_fila (
    id uuid primary key default gen_random_uuid(), email text not null, texto text not null,
    estado text not null default 'pendente', chunks jsonb not null default '[]', conversa int not null default 1,
    criado timestamptz not null default now(), atualizado timestamptz not null default now())`;
  await sql`create table if not exists otimizar_conversas (email text primary key, conversa int not null default 1, sessao_id text, atualizado timestamptz default now())`;
  await sql`create table if not exists otimizar_status (chave text primary key, valor text, em timestamptz not null default now())`;
})().catch((e) => { pronto = null; throw e; }));

async function conversaDe(email) {
  const [c] = await sql`select conversa from otimizar_conversas where email = ${email}`;
  return c ? c.conversa : 1;
}

// Última nota do PageSpeed (celular) de cada página, por endereço sem https:// (ex.: "ricardonunes.grupor1.com/x").
// Usado pelo selo redondo nos cartões da aba LPs da Central (otimizar/barra.js). Cópia em memória por 2 min.
let NOTAS = null;
async function notas() {
  if (NOTAS && Date.now() - NOTAS.em < 120e3) return NOTAS.v;
  const [cfg, linhas] = await Promise.all([carregarConfig(), sql`select slug, nota, medido_em from pagespeed where estrategia = 'mobile' and nota is not null`]);
  const porSlug = new Map(linhas.map((l) => [l.slug, l]));
  const v = {};
  for (const p of cfg.paginas) {
    const l = porSlug.get(p.slug); if (!l || p.lab) continue;
    v[linkDaPagina(p, cfg).replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase()] = { nota: l.nota, em: l.medido_em };
  }
  NOTAS = { v, em: Date.now() };
  return v;
}

export const GET = comAcesso(async (request, url, u) => {
  const email = emailDe(u);
  if (!pode(u)) return json({ pode: false, voce: email });
  if (url.searchParams.get('notas')) return json({ notas: await notas() });
  await prepararOtimizar();
  const id = url.searchParams.get('id');
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return erro('Pedido inválido.', 400);
    const [row] = await sql`select email, estado, chunks from otimizar_fila where id = ${id}`;
    if (!row || row.email !== email) return erro('Pedido não encontrado.', 404);
    const cursor = Math.max(0, Number(url.searchParams.get('cursor') || 0));
    const chunks = Array.isArray(row.chunks) ? row.chunks : [];
    return json({ chunks: chunks.slice(cursor), total: chunks.length, estado: row.estado });
  }
  if (url.searchParams.get('historico')) {
    const conversa = await conversaDe(email);
    const itens = await sql`select id, texto, estado, chunks, criado from otimizar_fila
      where email = ${email} and conversa = ${conversa} order by criado desc limit 30`;
    return json({ itens: itens.reverse() });
  }
  const st = Object.fromEntries((await sql`select chave, valor, em from otimizar_status`).map((x) => [x.chave, x]));
  const vivo = st.batida && Date.now() - new Date(st.batida.em).getTime() < 45e3;
  const [{ n }] = await sql`select count(*)::int as n from otimizar_fila where estado = 'pendente'`;
  return json({
    pode: true, voce: email,
    vps: { online: Boolean(vivo), logado: st.login?.valor !== 'nao', ocupado: st.ocupado?.valor === 'sim', fila: n, conta: st.conta?.valor || null },
  });
});

export const POST = comAcesso(async (request, url, u) => {
  const email = emailDe(u);
  if (!pode(u)) return erro('Sem acesso ao terminal de otimização.', 403);
  await prepararOtimizar();
  const d = await lerJson(request, 40000);
  if (d.acao === 'nova') {
    await sql`insert into otimizar_conversas (email, conversa, sessao_id) values (${email}, 2, null)
      on conflict (email) do update set conversa = otimizar_conversas.conversa + 1, sessao_id = null, atualizado = now()`;
    return json({ ok: true });
  }
  if (d.acao === 'parar') {
    const id = String(d.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return erro('Pedido inválido.', 400);
    await sql`update otimizar_fila set estado = case when estado = 'pendente' then 'pronto' else 'parar' end, atualizado = now()
      where id = ${id} and email = ${email} and estado in ('pendente', 'rodando')`;
    return json({ ok: true });
  }
  const texto = String(d.texto || '').trim().slice(0, 20000);
  if (!texto) return erro('Escreva o pedido.', 400);
  const conversa = await conversaDe(email);
  const [row] = await sql`insert into otimizar_fila (email, texto, conversa) values (${email}, ${texto}, ${conversa}) returning id`;
  return json({ id: row.id });
});
