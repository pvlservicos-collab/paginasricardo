// Acervo do Editor de E-mails (/emails) no banco do painel. Mesmo login do painel; todos veem o mesmo acervo.
// GET ?k=chave → { valor } · PUT { k, v } → { ok } · DELETE ?k=chave → { ok }
// Chaves do editor: editorEmails:indice | :grupos | :biblioteca | :email:<id>.
// Excluir não apaga a linha: marca excluido_em (dá para recuperar pelo banco).
import { protegido, json, erro, lerJson } from '../lib/servidor.mjs';
import { sql, usandoBanco } from '../lib/store.mjs';

const CHAVE = /^editorEmails:(indice|grupos|biblioteca|email:[A-Za-z0-9_-]{1,80})$/;
const LIMITE = 4 * 1024 * 1024;

let pronto = null;
function preparar() {
  if (!usandoBanco) throw Object.assign(new Error('Banco de dados não conectado.'), { status: 503 });
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists emails_dados (
        chave text primary key,
        valor text not null,
        atualizado_em timestamptz not null default now(),
        atualizado_por text,
        excluido_em timestamptz
      )`;
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}
const chaveValida = (k) => typeof k === 'string' && CHAVE.test(k);

export const GET = protegido(async (request, url) => {
  const k = url.searchParams.get('k');
  if (!chaveValida(k)) return erro('Chave inválida.');
  await preparar();
  const [r] = await sql`select valor from emails_dados where chave = ${k} and excluido_em is null`;
  return json({ valor: r ? r.valor : null });
});

export const PUT = protegido(async (request, url, u) => {
  const d = await lerJson(request, LIMITE);
  if (!chaveValida(d.k) || typeof d.v !== 'string') return erro('Dados inválidos.');
  await preparar();
  await sql`insert into emails_dados (chave, valor, atualizado_por) values (${d.k}, ${d.v}, ${u.login})
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por, excluido_em = null`;
  return json({ ok: true });
});

export const DELETE = protegido(async (request, url, u) => {
  const k = url.searchParams.get('k');
  if (!chaveValida(k)) return erro('Chave inválida.');
  await preparar();
  await sql`update emails_dados set excluido_em = now(), atualizado_por = ${u.login} where chave = ${k}`;
  return json({ ok: true });
});
