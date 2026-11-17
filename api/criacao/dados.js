// Dados do dashboard de criativos (precisa da sessão do login Google).
//   GET  ?dias=7&projeto=ID            → { eu, dias, criativos, serie, insights, eventos, projetos, conversa, maquina }
//   POST { acao: 'insight', id, status }                      muda o status de uma sugestão
//   POST { acao: 'projeto', id?, nome, estado }               salva o projeto (canvas)
//   POST { acao: 'excluir-projeto', id }
//   POST { acao: 'conversa', projeto_id, texto, contexto? }   pergunta à máquina (Claude com as métricas, até a IA da VPS responder)
//   POST { acao: 'analisar', dias? }                          a máquina lê as métricas e grava sugestões (origem 'claude')
//   POST { acao: 'ler-oferta', oferta, cerebro? }             lê a oferta → públicos, ângulos e ganchos (JSON)
import Anthropic from '@anthropic-ai/sdk';
import { json, erro, mesmaOrigem, lerJson } from '../../lib/servidor.mjs';
import { sessaoDe, carregarTudo, conversa, decidirInsight, salvarProjeto, excluirProjeto, guardarMensagem, receberInsights, registrarEvento, resumoTexto } from '../../lib/criacao.mjs';
import { hostOk } from './login.js';

const MODELO = 'claude-opus-5-5';
const temMaquina = () => Boolean(process.env.ANTHROPIC_API_KEY);
const PERSONA = `Você é "a máquina": a analista de criativos e tráfego do Grupo R1 (Ricardo Nunes — Turnê, RGV, Xeque-Mate e captações).
Fala português do Brasil, direto, sem enrolar, com números. Nunca invente métricas: use só o que está no contexto. Quando faltar dado, diga o que falta.
Pensa como gestor de tráfego sênior e diretor criativo: hook rate (3s/impressões), hold (thruplay/3s), CTR do link, CPL, CPA, ROAS, frequência, fadiga, praça atrás do ritmo.`;

async function perguntar(system, mensagens, maxTokens = 1800) {
  const client = new Anthropic();
  const d = await client.messages.create({ model: MODELO, max_tokens: maxTokens, thinking: { type: 'adaptive' }, system, messages: mensagens });
  if (d.stop_reason === 'refusal') throw Object.assign(new Error('A máquina não quis responder isso.'), { status: 422 });
  return (d.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}
const jsonDe = (t) => { const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(t); if (!m) throw Object.assign(new Error('A máquina respondeu fora do formato.'), { status: 502 }); return JSON.parse(m[0]); };
const erroMaquina = (e) => {
  if (e instanceof Anthropic.RateLimitError) return erro('A máquina está cheia agora. Tente em um minuto.', 429);
  if (e instanceof Anthropic.APIError) return erro('A máquina não conseguiu responder agora.', 502);
  return erro(e.message || 'Sem conexão com a máquina.', e.status || 502);
};

export async function GET(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  try {
    const eu = await sessaoDe(request);
    if (!eu) return erro('Entre para ver os dados.', 401);
    const url = new URL(request.url);
    const tudo = await carregarTudo(url.searchParams.get('dias') || 7);
    const projeto = url.searchParams.get('projeto');
    const conv = projeto ? await conversa(projeto) : [];
    return json({ eu, ...tudo, conversa: conv, maquina: temMaquina() });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/dados', msg: e.message }));
    return erro(e.status ? e.message : 'Serviço indisponível.', e.status || 503);
  }
}

export async function POST(request) {
  if (!hostOk(request)) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  let eu;
  try { eu = await sessaoDe(request); } catch { return erro('Serviço indisponível.', 503); }
  if (!eu) return erro('Entre para continuar.', 401);
  let d;
  try { d = await lerJson(request, 1024 * 1024); } catch (e) { return erro(e.message, e.status || 400); }
  const log = (acao, extra) => console.log(JSON.stringify({ tipo: 'evento', acao, usuario: eu.email, ...extra, em: new Date().toISOString() }));
  try {
    switch (d.acao) {
      case 'insight': {
        await decidirInsight(d.id, d.status, eu.email);
        log('criacao_insight', { id: d.id, status: d.status });
        return json({ ok: true });
      }
      case 'projeto': {
        const id = await salvarProjeto(d, eu.email);
        return json({ ok: true, id });
      }
      case 'excluir-projeto': {
        await excluirProjeto(d.id);
        log('criacao_projeto_excluido', { id: d.id });
        return json({ ok: true });
      }
      case 'conversa': {
        const texto = String(d.texto || '').trim().slice(0, 4000);
        const pid = String(d.projeto_id || '').trim().slice(0, 60);
        if (!texto || !pid) return erro('Escreva a pergunta.');
        await guardarMensagem(pid, 'voce', texto, eu.email);
        if (!temMaquina()) return json({ ok: true, resposta: null, aviso: 'Pergunta guardada. A máquina da VPS responde pelo webhook (tipo "resposta").' });
        const tudo = await carregarTudo(d.dias || 7);
        const historico = (await conversa(pid)).slice(-12).map((m) => ({ role: m.papel === 'voce' ? 'user' : 'assistant', content: m.texto }));
        // a última mensagem já é a pergunta (acabou de ser guardada); garante que a conversa termina em 'user'
        if (!historico.length || historico[historico.length - 1].role !== 'user') historico.push({ role: 'user', content: texto });
        const contexto = typeof d.contexto === 'string' ? d.contexto.slice(0, 6000) : '';
        const system = [
          { type: 'text', text: PERSONA },
          { type: 'text', text: 'MÉTRICAS ATUAIS:\n' + resumoTexto(tudo) + (contexto ? '\n\nPROJETO ABERTO NA TELA:\n' + contexto : '') },
        ];
        let resposta;
        try { resposta = await perguntar(system, historico); } catch (e) { return erroMaquina(e); }
        await guardarMensagem(pid, 'maquina', resposta, 'claude');
        return json({ ok: true, resposta });
      }
      case 'analisar': {
        if (!temMaquina()) return erro('A máquina (ANTHROPIC_API_KEY) não está ligada; as sugestões chegam pelo webhook.', 503);
        const tudo = await carregarTudo(d.dias || 7);
        if (!tudo.criativos.some((c) => c.gasto > 0 || c.impressoes > 0)) return erro('Ainda não há métricas para analisar. Conecte o webhook.', 409);
        const pedido = `Analise as métricas e devolva SOMENTE um JSON: {"itens":[{"tipo":"vencedor|variacao|trafego|alerta|analise","prioridade":"urgente|alta|normal","titulo":"até 90 caracteres","texto":"2 a 4 frases com os números que justificam","acao":"verbo curto, ex.: Fazer variações / Escalar / Pausar / Trocar o gancho","criativo_id":"id do criativo quando a sugestão for sobre um"}]}.
Regras: de 3 a 10 itens; pelo menos um "vencedor" (criativo para escalar) e um "variacao" quando houver dado; "urgente" só quando há dinheiro saindo sem resultado ou uma praça claramente atrás. Não repita estas sugestões já abertas: ${tudo.insights.filter((i) => i.status === 'novo').map((i) => i.titulo).join(' | ') || 'nenhuma'}.`;
        let texto;
        try { texto = await perguntar([{ type: 'text', text: PERSONA }, { type: 'text', text: 'MÉTRICAS:\n' + resumoTexto(tudo) }], [{ role: 'user', content: pedido }], 3000); } catch (e) { return erroMaquina(e); }
        let itens;
        try { itens = jsonDe(texto).itens || []; } catch (e) { return erro(e.message, 502); }
        const n = await receberInsights(itens, 'claude');
        await registrarEvento('claude', 'insights', n, 'análise pedida por ' + eu.email);
        log('criacao_analise', { sugestoes: n });
        return json({ ok: true, sugestoes: n });
      }
      case 'ler-oferta': {
        if (!temMaquina()) return erro('A máquina (ANTHROPIC_API_KEY) não está ligada.', 503);
        const oferta = String(d.oferta || '').trim().slice(0, 6000);
        if (oferta.length < 20) return erro('Descreva a oferta (o que é, para quem, preço, promessa, prova).');
        const cerebro = typeof d.cerebro === 'string' ? d.cerebro.slice(0, 6000) : '';
        const pedido = `OFERTA:\n${oferta}${cerebro ? '\n\nCÉREBRO (contexto da marca):\n' + cerebro : ''}

Devolva SOMENTE um JSON: {"resumo":"1 frase do que é a oferta","publicos":[{"nome":"até 40 caracteres","dor":"1 frase","gatilho":"1 frase"}],"angulos":[{"nome":"até 50 caracteres","por_que":"1 frase"}],"ganchos":["frase de abertura do vídeo, até 110 caracteres"],"nunca_dizer":["..."]}.
Regras: 3 a 5 públicos, 4 a 6 ângulos, 10 ganchos, nunca_dizer com 2 a 5 itens (políticas da Meta: nada de atributo pessoal, promessa garantida ou antes/depois). Português do Brasil, concreto, sem clichê.`;
        let texto;
        try { texto = await perguntar([{ type: 'text', text: PERSONA }], [{ role: 'user', content: pedido }], 3000); } catch (e) { return erroMaquina(e); }
        try { return json({ ok: true, ...jsonDe(texto) }); } catch (e) { return erro(e.message, 502); }
      }
      default:
        return erro('Ação inválida.');
    }
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/criacao/dados', acao: d.acao, msg: e.message }));
    return erro(e.status ? e.message : 'Não consegui agora. Tente de novo.', e.status || 503);
  }
}
