// Lista das Conexões da Rota, para a tela de administração da equipe (pedido do Lucas, 20/11/2026).
// Authorization: Bearer <ROTA_CONEXOES_CHAVE>   (sem chave ou chave errada → 401)
//
//   GET                       → { membros, total, atualizadoEm, versoes: [{ id, em, total }] }  (lista atual + últimas versões)
//   GET ?versao=<id>          → { versao: { id, em, total, membros } }                          (uma versão anterior)
//   PUT  [ ...empresas ]      → { ok, total, versaoAnterior }   grava a lista completa (ou { "membros": [...] })
//   PUT  { "desfazer": <id> } → { ok, total, versaoAnterior }   volta para uma versão anterior
//
// Antes de gravar, a lista atual vai para rota_conexoes_versoes (ficam as 60 últimas). O GET /api/rota/conexoes do
// app confere a data da lista a cada pedido (dado(..., { fresco: true })), então a lista nova aparece na hora.
import { json, dado } from '../../../lib/rota/base.mjs';
import { sql } from '../../../lib/store.mjs';
import { chaveConfere, validarConexoes, prepararVersoes } from '../../../lib/rota/admin-conexoes.mjs';

const MAX_BYTES = 4 * 1024 * 1024, GUARDAR = 60;
const cab = { 'x-robots-tag': 'noindex, nofollow' };
const naoAutorizado = () => json({ erro: 'Não autorizado.' }, 401, cab);
const log = (acao, d) => console.log(JSON.stringify({ tipo: 'evento', rota: '/api/rota/admin/conexoes', acao, ...d }));

export const GET = async (request) => {
  if (!chaveConfere(request)) return naoAutorizado();
  try {
    await prepararVersoes();
    const id = new URL(request.url).searchParams.get('versao');
    if (id) {
      if (!/^\d{1,18}$/.test(id)) return json({ erro: 'Versão inválida.' }, 400, cab);
      const [v] = await sql`select id, em, total, valor from rota_conexoes_versoes where id = ${id}`;
      if (!v) return json({ erro: 'Versão não encontrada.' }, 404, cab);
      return json({ versao: { id: String(v.id), em: v.em, total: v.total, membros: JSON.parse(v.valor) } }, 200, cab);
    }
    const [atual] = await sql`select valor, atualizado from rota_dados where nome = 'membros'`;
    const versoes = await sql`select id, em, total from rota_conexoes_versoes order by id desc limit ${GUARDAR}`;
    const membros = atual ? JSON.parse(atual.valor) : [];
    return json({ membros, total: membros.length, atualizadoEm: atual?.atualizado ?? null, versoes: versoes.map((v) => ({ id: String(v.id), em: v.em, total: v.total })) }, 200, cab);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/admin/conexoes', msg: e.message }));
    return json({ erro: 'Lista indisponível agora. Tente de novo.' }, 503, cab);
  }
};

export const PUT = async (request) => {
  if (!chaveConfere(request)) return naoAutorizado();
  try {
    const txt = await request.text();
    if (txt.length > MAX_BYTES) return json({ erro: 'Lista grande demais (máximo 4 MB).' }, 413, cab);
    let corpo;
    try { corpo = JSON.parse(txt); } catch { return json({ erro: 'O corpo precisa ser JSON.' }, 400, cab); }
    await prepararVersoes();

    let lista;
    if (corpo && !Array.isArray(corpo) && corpo.desfazer != null) {
      if (!/^\d{1,18}$/.test(String(corpo.desfazer))) return json({ erro: 'Versão inválida.' }, 400, cab);
      const [v] = await sql`select valor from rota_conexoes_versoes where id = ${String(corpo.desfazer)}`;
      if (!v) return json({ erro: 'Versão não encontrada.' }, 404, cab);
      lista = JSON.parse(v.valor);
    } else {
      const r = validarConexoes(corpo);
      if (r.erros) return json({ erro: 'A lista tem erros; nada foi gravado.', erros: r.erros, totalErros: r.total ?? r.erros.length }, 422, cab);
      lista = r.lista;
    }

    const [atual] = await sql`select valor from rota_dados where nome = 'membros'`;
    let versaoAnterior = null;
    if (atual) {
      const [v] = await sql`insert into rota_conexoes_versoes (total, valor)
        values (${JSON.parse(atual.valor).length}, ${atual.valor}) returning id`;
      versaoAnterior = String(v.id);
      await sql`delete from rota_conexoes_versoes where id not in (select id from rota_conexoes_versoes order by id desc limit ${GUARDAR})`;
    }
    const valor = JSON.stringify(lista);
    await sql`insert into rota_dados (nome, valor, atualizado) values ('membros', ${valor}, now())
      on conflict (nome) do update set valor = excluded.valor, atualizado = now()`;
    await dado('membros', { fresco: true }).catch(() => {}); // atualiza a cópia em memória desta instância
    log(corpo?.desfazer != null ? 'desfeito' : 'gravado', { total: lista.length, versaoAnterior });
    return json({ ok: true, total: lista.length, versaoAnterior }, 200, cab);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/admin/conexoes', msg: e.message }));
    return json({ erro: 'Não consegui gravar agora. Nada foi alterado; tente de novo.' }, 503, cab);
  }
};
