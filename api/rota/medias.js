// GET /api/rota/medias            → médias agregadas da tripulação (telão: membros.cluber1.com.br/rotadobilhao/medias)
// GET /api/rota/medias?simulado=1 → mesmas contas sobre jornadas fictícias geradas na memória (nada é gravado)
// Público e só com números agregados: nada de nome, e-mail ou resposta de uma pessoa (ver lib/rota/medias.mjs).
import { json, erro, prepararRota } from '../../lib/rota/base.mjs';
import { sql } from '../../lib/store.mjs';
import { agregar, simular, contaDaEquipe } from '../../lib/rota/medias.mjs';

let cache = { em: 0, dados: null };
const VALIDADE_MS = 20e3; // o telão consulta a cada 30 s; o banco é lido no máximo a cada 20 s por instância

export const GET = async (request) => {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('simulado') === '1') {
      const lista = simular();
      return json({ ...agregar(lista, { aBordo: lista.length + 34 }), simulado: true });
    }
    if (!cache.dados || Date.now() - cache.em > VALIDADE_MS) {
      await prepararRota();
      const contas = (await sql`select email from rota_contas`).map((l) => l.email).filter((e) => !contaDaEquipe(e));
      const estados = (await sql`select email, estado from rota_estados`).filter((l) => !contaDaEquipe(l.email)).map((l) => l.estado);
      cache = { em: Date.now(), dados: { ...agregar(estados, { aBordo: contas.length }), simulado: false } };
    }
    return json(cache.dados);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/medias', msg: e.message }));
    return erro('Médias indisponíveis agora.', 503);
  }
};
