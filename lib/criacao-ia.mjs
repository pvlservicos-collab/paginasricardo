// "A máquina" do dashboard de criativos: enquanto a IA da VPS não manda sugestões pelo webhook, o Claude lê as métricas
// do Painel Grupo R1 e grava as ideias (origem 'claude'). Usado pela tela (botão) e pela rotina de 15 min (a cada 6 h).
import Anthropic from '@anthropic-ai/sdk';
import { carregarTudo, receberInsights, registrarEvento, gravarEstado, resumoTexto, falha } from './criacao.mjs';

export const MODELO = 'claude-opus-5-5';
export const temMaquina = () => Boolean(process.env.ANTHROPIC_API_KEY);
export const PERSONA = `Você é "a máquina": a analista de criativos e tráfego do Grupo R1 (Ricardo Nunes — Máquina de Vendas/Turnê, RGV, Xeque-Mate, Caixa Forte, CTRL, Operação 2027 e captações).
Fala português do Brasil, direto, sem enrolar, com números. Nunca invente métricas: use só o que está no contexto. Quando faltar dado, diga o que falta.
Pensa como gestor de tráfego sênior e diretor criativo: CTR do link, CPM, connect rate (visitantes da página / cliques no link), CPA do pixel e da Guru, ROAS, fadiga (CTR caindo nos últimos dias), praça atrás do ritmo, criativo que gasta sem resultado, vencedor para escalar e variações para testar.`;

// formato: JSON schema opcional (saída estruturada: a API garante JSON válido nesse formato)
export async function perguntar(system, mensagens, maxTokens = 1800, formato = null) {
  const client = new Anthropic();
  const d = await client.messages.create({ model: MODELO, max_tokens: maxTokens, thinking: { type: 'adaptive' }, system, messages: mensagens,
    ...(formato ? { output_config: { format: { type: 'json_schema', schema: formato } } } : {}) });
  if (d.stop_reason === 'refusal') throw falha('A máquina não quis responder isso.', 422);
  if (d.stop_reason === 'max_tokens') throw falha('A resposta da máquina ficou longa demais e foi cortada.', 502);
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
export const jsonDe = (t) => { const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(t); if (!m) throw falha('A máquina respondeu fora do formato.', 502); return JSON.parse(m[0]); };

const SUGESTOES = {
  type: 'object', additionalProperties: false, required: ['itens'],
  properties: { itens: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['tipo', 'prioridade', 'titulo', 'texto', 'acao', 'criativo_id'],
    properties: {
      tipo: { type: 'string', enum: ['vencedor', 'variacao', 'trafego', 'alerta', 'analise'] },
      prioridade: { type: 'string', enum: ['urgente', 'alta', 'normal'] },
      titulo: { type: 'string' }, texto: { type: 'string' }, acao: { type: 'string' },
      criativo_id: { type: 'string', description: 'id r1… do criativo, ou vazio quando não é sobre um criativo' },
    },
  } } },
};

// Lê as métricas e grava de 3 a 10 sugestões. Devolve quantas gravou.
export async function analisar({ dias = 7, visao = '', quem = 'automática' } = {}) {
  if (!temMaquina()) throw falha('A máquina (ANTHROPIC_API_KEY) não está ligada; as sugestões chegam pelo webhook.', 503);
  const tudo = await carregarTudo(dias, visao);
  if (!tudo.criativos.some((c) => c.gasto > 0 || c.impressoes > 0)) throw falha('Ainda não há métricas para analisar.', 409);
  const pedido = `Analise as métricas e devolva as sugestões no formato pedido: {"itens":[{"tipo":"vencedor|variacao|trafego|alerta|analise","prioridade":"urgente|alta|normal","titulo":"até 90 caracteres","texto":"2 a 4 frases com os números que justificam","acao":"verbo curto, ex.: Fazer variações / Escalar / Pausar / Trocar o gancho / Revisar a página","criativo_id":"o id (r1…) do criativo quando a sugestão for sobre um"}]}.
Regras: de 3 a 10 itens; pelo menos um "vencedor" (criativo para escalar) e um "variacao" (ideia concreta de novo criativo a partir de um que funciona: o gancho, o formato e o que mudar); "urgente" só quando há dinheiro saindo sem resultado, connect muito baixo (página com problema) ou uma praça claramente atrás. Não repita estas sugestões já abertas: ${tudo.insights.filter((i) => i.status === 'novo').map((i) => i.titulo).join(' | ') || 'nenhuma'}.`;
  const texto = await perguntar([{ type: 'text', text: PERSONA }, { type: 'text', text: 'MÉTRICAS:\n' + resumoTexto(tudo) }], [{ role: 'user', content: pedido }], 16000, SUGESTOES);
  const itens = (JSON.parse(texto).itens || []).map((i) => ({ ...i, criativo_id: i.criativo_id || null }));
  const n = await receberInsights(itens, 'claude');
  await registrarEvento('claude', 'insights', n, 'análise ' + quem + (visao ? ' · ' + visao : ''));
  await gravarEstado('analise_auto', { ultima_em: new Date().toISOString(), ultima_quem: quem, ultima_n: n });
  return n;
}
