// Dados do dashboard de criativos (precisa da sessão do login Google).
//   GET  ?dias=7&visao=xeque&projeto=ID           → { eu, dias, criativos, serie, insights, eventos, projetos, conversa, maquina }
//   POST { acao: 'insight', id, status }                      muda o status de uma sugestão
//   POST { acao: 'projeto', id?, nome, estado }               salva o projeto (canvas)
//   POST { acao: 'excluir-projeto', id }
//   POST { acao: 'conversa', projeto_id, texto, contexto? }   pergunta à máquina (Claude com as métricas, até a IA da VPS responder)
//   POST { acao: 'analisar', dias?, visao? }                  a máquina lê as métricas e grava sugestões (origem 'claude')
//   POST { acao: 'sincronizar' }                              busca hoje e ontem no Painel Grupo R1 agora
//   POST { acao: 'ler-oferta', oferta, cerebro? }             lê a oferta → públicos, ângulos e ganchos (JSON)
import Anthropic from '@anthropic-ai/sdk';
import { json, erro, mesmaOrigem, lerJson } from '../../lib/servidor.mjs';
import { sessaoDe, carregarTudo, conversa, decidirInsight, salvarProjeto, excluirProjeto, guardarMensagem, resumoTexto, lerEstado } from '../../lib/criacao.mjs';
import { PERSONA, perguntar, jsonDe, analisar, temMaquina } from '../../lib/criacao-ia.mjs';
import { sincronizar, temR1 } from '../../lib/r1consulta.mjs';
import { hostOk } from './login.js';

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
    const tudo = await carregarTudo(url.searchParams.get('dias') || 7, url.searchParams.get('visao') || '');
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
        const tudo = await carregarTudo(d.dias || 7, d.visao || '');
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
        let n;
        try { n = await analisar({ dias: d.dias || 7, visao: d.visao || '', quem: 'pedida por ' + eu.email }); } catch (e) { return e.status && !(e instanceof Anthropic.APIError) ? erro(e.message, e.status) : erroMaquina(e); }
        log('criacao_analise', { sugestoes: n });
        return json({ ok: true, sugestoes: n });
      }
      case 'sincronizar': {
        // botão "Atualizar agora": busca hoje e ontem no Painel R1 (no máximo 1 vez a cada 2 min)
        if (!temR1()) return erro('Falta a variável R1_CONSULTA_TOKEN na Vercel.', 503);
        const ult = await lerEstado('sync');
        if (ult && ult.em && Date.now() - Date.parse(ult.em) < 120000) return json({ ok: true, recente: true, ...ult });
        const r = await sincronizar(2);
        log('criacao_sync', { linhas: r.linhas });
        return json({ ok: true, ...r });
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
