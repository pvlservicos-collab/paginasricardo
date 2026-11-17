// Webhook que recebe os dados da IA/automação da VPS para o dashboard de criativos.
//   POST /api/criacao/webhook   Authorization: Bearer <CRIACAO_WEBHOOK_CHAVE>   (ou cabeçalho x-chave)
//   corpo (JSON, até 4 MB):
//     { "tipo": "metricas", "itens": [ { "criativo": { "id", "nome", "tipo", "frente", "praca", "campanha", "conjunto", "status", "previa", "miniatura" },
//                                        "dia": "2026-11-17", "gasto", "impressoes", "alcance", "cliques", "cliques_link", "views_3s", "thruplays", "leads", "vendas", "receita" } ] }
//     { "tipo": "insights", "itens": [ { "tipo": "vencedor|variacao|trafego|alerta|analise", "prioridade": "urgente|alta|normal",
//                                        "titulo", "texto", "acao", "criativo_id", "dados": {} } ] }
//     { "tipo": "resposta", "projeto_id": "...", "texto": "..." }          ← resposta da máquina na conversa de um projeto
//   Pode mandar vários de uma vez: { "lotes": [ {...}, {...} ] }.
//   GET (sem chave) → só diz se o webhook está configurado. A chave fica na variável CRIACAO_WEBHOOK_CHAVE da Vercel.
import crypto from 'node:crypto';
import { json, erro, lerJson } from '../../lib/servidor.mjs';
import { receberMetricas, receberInsights, receberResposta, registrarEvento } from '../../lib/criacao.mjs';

const chaveOk = (request) => {
  const esperada = (process.env.CRIACAO_WEBHOOK_CHAVE || '').trim();
  if (!esperada) return false;
  const h = request.headers.get('authorization') || '';
  const dada = (h.startsWith('Bearer ') ? h.slice(7) : request.headers.get('x-chave') || '').trim();
  if (!dada || dada.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(esperada));
};

export async function GET() {
  return json({ webhook: '/api/criacao/webhook', configurado: Boolean((process.env.CRIACAO_WEBHOOK_CHAVE || '').trim()), tipos: ['metricas', 'insights', 'resposta'] });
}

export async function POST(request) {
  if (!chaveOk(request)) return erro('Chave do webhook inválida.', 401);
  let corpo;
  try { corpo = await lerJson(request); } catch (e) { return erro(e.message, e.status || 400); }
  const origem = (request.headers.get('x-origem') || 'vps').slice(0, 80);
  const lotes = Array.isArray(corpo.lotes) ? corpo.lotes : [corpo];
  const resultado = [];
  try {
    for (const l of lotes.slice(0, 20)) {
      if (!l || typeof l !== 'object') continue;
      const itens = Array.isArray(l.itens) ? l.itens : [];
      let n = 0;
      if (l.tipo === 'metricas') n = await receberMetricas(itens);
      else if (l.tipo === 'insights') n = await receberInsights(itens, origem);
      else if (l.tipo === 'resposta') n = await receberResposta(l);
      else { resultado.push({ tipo: l.tipo, erro: 'tipo desconhecido' }); continue; }
      await registrarEvento(origem, l.tipo, n, l.tipo === 'resposta' ? 'resposta no projeto ' + l.projeto_id : `${n} de ${itens.length} itens gravados`);
      resultado.push({ tipo: l.tipo, gravados: n });
    }
    console.log(JSON.stringify({ tipo: 'evento', acao: 'criacao_webhook', origem, resultado, em: new Date().toISOString() }));
    return json({ ok: true, resultado });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/webhook', msg: e.message }));
    return erro(e.status ? e.message : 'Não consegui gravar agora.', e.status || 503);
  }
}
