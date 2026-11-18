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
import { receberMetricas, receberInsights, receberResposta, registrarEvento, carregarTudo, resumoTexto } from '../../lib/criacao.mjs';

const chaveOk = (request) => {
  const esperada = (process.env.CRIACAO_WEBHOOK_CHAVE || '').trim();
  if (!esperada) return false;
  const h = request.headers.get('authorization') || '';
  const dada = (h.startsWith('Bearer ') ? h.slice(7) : request.headers.get('x-chave') || '').trim();
  if (!dada || dada.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(dada), Buffer.from(esperada));
};

// GET com a chave e ?resumo=1 → o que a IA da VPS precisa para gerar ideias (mesmos números da tela):
//   ?dias=7|14|30  ?visao=xeque|rgv|maquina_de_vendas|…   → { texto (resumo pronto para o prompt), funis, campanhas, criativos, diario, sugestoes_abertas, como_responder }
export async function GET(request) {
  const url = new URL(request.url);
  if (url.searchParams.get('resumo')) {
    if (!chaveOk(request)) return erro('Chave do webhook inválida.', 401);
    try {
      const tudo = await carregarTudo(url.searchParams.get('dias') || 7, url.searchParams.get('visao') || '');
      return json({
        periodo_dias: tudo.dias, visao: tudo.visao || 'todas', dados_ate: tudo.fonte.dadosAte, sincronizado: tudo.fonte.sincronizado,
        texto: resumoTexto(tudo), funis: tudo.funis, campanhas: tudo.campanhas, criativos: tudo.criativos.slice(0, 150), diario: tudo.diario,
        sugestoes_abertas: tudo.insights.filter((i) => i.status === 'novo').map((i) => ({ id: i.id, tipo: i.tipo, prioridade: i.prioridade, titulo: i.titulo, origem: i.origem })),
        como_responder: 'POST neste endereço com {"tipo":"insights","itens":[{"tipo":"vencedor|variacao|trafego|alerta|analise","prioridade":"urgente|alta|normal","titulo","texto","acao","criativo_id"}]} e o cabeçalho x-origem: vps',
      });
    } catch (e) {
      console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/webhook?resumo', msg: e.message }));
      return erro('Não consegui montar o resumo agora.', 503);
    }
  }
  return json({ webhook: '/api/criacao/webhook', configurado: Boolean((process.env.CRIACAO_WEBHOOK_CHAVE || '').trim()), tipos: ['metricas', 'insights', 'resposta'], leitura: '/api/criacao/webhook?resumo=1&dias=7' });
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
