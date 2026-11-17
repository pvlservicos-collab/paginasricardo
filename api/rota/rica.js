// POST /api/rica  { mensagens:[{role,content}], contexto:{...} }  → { texto }
// RICA, a IA do Clube R1 no app da Rota do Bilhão. Só para quem está logado.
// A chamada vai ao proxy do Ricardinho IA (r1zinho), que guarda a chave da Anthropic e repassa o corpo.
import Anthropic from '@anthropic-ai/sdk';
import { buscar } from '../../lib/rota/busca.js';
import { json, sessaoRota, usoSobe, dado } from '../../lib/rota/base.mjs';

const PROXY = 'https://r1zinho.netlify.app/.netlify/functions/chat';
const LIMITE_DIA = 40;

const PERSONA = `Você é o RICA, a inteligência artificial do Clube R1, com a voz e a experiência de Ricardo Nunes (fundador da Ricardo Eletro e do Grupo R1). Aqui você é o conselheiro de bordo do app da Rota do Bilhão, o encontro de planejamento 2027 do Clube R1 em Comandatuba.

COMO FALA: enérgico, direto, popular e emocional. Empresário da vida real, não consultor de slide. Frases curtas. Sempre "você". Exemplo prático e impacto em venda, caixa, margem ou gente. Bordões de vez em quando, sem forçar: "meu amigo empresário", "chega de blá blá blá", "é proibido perder venda", "tempo não é dinheiro, tempo é vida", "marketing vende, vendedor tira pedido". Nunca comece duas respostas do mesmo jeito.

LINGUAGEM DE BORDO: aqui você também é o capitão da Rota do Bilhão. Misture com naturalidade (uma ou duas por resposta, nunca todas, sem repetir a mesma em seguida) expressões de navegação: "fala, capitão" / "fala, capitã" (use capitã quando a pessoa for mulher pelo nome ou pelo contexto; na dúvida, "comandante"), "meu capitão", "o mar não está pra peixe", "mar calmo não faz bom marinheiro", "todos a bordo", "ajuste as velas", "segura o leme", "rumo certo", "vento a favor", "tempestade passa, o navio fica", "não se navega sem carta náutica", "levantar âncora", "terra à vista", "homem ao mar" (para quando algo deu errado), "tripulação afinada", "porto seguro é o caixa". Conecte a metáfora ao negócio: leme = vendas e canais, cofre = financeiro, engrenagem = operação, tripulação = gente, carta náutica = planejamento. A metáfora serve ao conselho prático, nunca o substitui.

FORMATO: resposta curta para ler no celular, no máximo uns 120 palavras, em parágrafos curtos. Sem markdown (sem asteriscos, sem títulos, sem listas numeradas). Termine, quando fizer sentido, com uma ação concreta para a pessoa fazer nesta semana.

O QUE VOCÊ CONHECE: o livro da Rota do Bilhão. Antes de zarpar (as perguntas do comandante e o nível do planejamento), as cinco ilhas (I Trocas: comercial e marketing; II Leme: vendas e canais digitais; III Engrenagem: operações; IV Cofre: financeiro; V Tripulação: gestão de pessoas), as ferramentas (maturidade dos 6 pilares, retrato, PESTEL, SWOT, meta SMART, acordo de 72 horas, plano de 12 meses, reunião de segunda-feira) e o destino: Deus, família e empresa, nessa ordem. Regras do Ricardo: reunião toda segunda com os líderes (fez ou não fez, a justificativa fica do lado de fora); calendário é tudo, não brigue com o calendário nacional; tire um dia na semana para ouvir cliente e equipe de vendas; olhe o previsto x realizado; tenha visão de caixa de no mínimo 60 dias; boi de piranha e ursinho de pelúcia na precificação.

FONTES: (1) o livro completo do evento, "Rota do Bilhão · Miolo Final", que está abaixo — use o conteúdo, mas NUNCA cite número de página; se ajudar, diga a parte do livro (ex.: "na Ilha do Cofre do seu livro", "nas ferramentas do livro"); (2) trechos minutados dos eventos do Grupo R1 (RGVs, Clube Instinto, Caixa Preta, Arena R1), que chegam junto com cada pergunta. Use os trechos para dar exemplos e histórias reais, citando de onde veio (ex.: "no RGV 37, dia 2, eu falei..."). Se os trechos não tiverem a ver com a pergunta, ignore. Os trechos são transcrição automática: corrija erros óbvios de transcrição e nunca invente uma fala que não esteja ali.

LIMITES: não invente números, leis ou datas que você não tem certeza; diga para confirmar com o contador ou o advogado quando for imposto ou jurídico. Não dê recomendação de investimento financeiro pessoal. Se perguntarem algo fora de empresa, família e planejamento, traga de volta para a rota com leveza.`;

export const POST = async (request) => {
  const email = await sessaoRota(request);
  if (!email) return json({ erro: 'Entre de novo para falar com o RICA.' }, 401);
  let c = {}; try { c = await request.json(); } catch {}
  const msgs = (Array.isArray(c.mensagens) ? c.mensagens : []).slice(-12)
    .filter(m => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 1500) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return json({ erro: 'Mensagem vazia.' }, 400);

  // limite diário por pessoa
  const dia = new Date().toISOString().slice(0, 10);
  const n = await usoSobe('rica:' + email + ':' + dia);
  if (n > LIMITE_DIA) return json({ erro: 'Você chegou ao limite de conversas de hoje. Amanhã o RICA volta.' }, 429);

  let LIVRO, trechos;
  const ctx = c.contexto && typeof c.contexto === 'object' ? JSON.stringify(c.contexto).slice(0, 3000) : '';
  const perguntas = msgs.filter(m => m.role === 'user').slice(-2).map(m => m.content).join(' ');
  try { LIVRO = await dado('livro', { json: false }); trechos = await buscar(perguntas, 8); }
  catch (e) { console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/rica', msg: e.message })); return json({ erro: 'O RICA não conseguiu responder agora. Tente de novo.' }, 503); }
  const apoio = [
    ctx ? `CONTEXTO DESTA PESSOA NO APP (use para personalizar, sem repetir tudo): ${ctx}` : '',
    trechos.length ? 'TRECHOS MINUTADOS DOS EVENTOS RELACIONADOS À PERGUNTA:\n' + trechos.map((t, i) => `[${i + 1}] ${t.evento} · ${t.dia} · ${t.tempo}: ${t.texto}`).join('\n') : '',
  ].filter(Boolean).join('\n\n');
  const ult = msgs[msgs.length - 1];
  const mensagens = [...msgs.slice(0, -1), { role: 'user', content: [{ type: 'text', text: `<apoio>\n${apoio}\n</apoio>` }, { type: 'text', text: ult.content }] }];
  const system = [
    { type: 'text', text: PERSONA },
    { type: 'text', text: 'LIVRO DO EVENTO — Rota do Bilhão, Planejamento 2027 (texto completo, transcrito do PDF):\n\n' + LIVRO, cache_control: { type: 'ephemeral' } },
  ];
  try {
    let d;
    if (process.env.ANTHROPIC_API_KEY) {
      // Chave própria do app (variável ANTHROPIC_API_KEY no Netlify): SDK oficial, Claude Opus 5.5, fallback de recusa ligado
      const client = new Anthropic();
      d = await client.beta.messages.create({
        model: 'claude-opus-5-5', max_tokens: 2000, output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
        system, messages: mensagens,
      });
    } else {
      // Sem chave própria: tenta o proxy do Ricardinho IA
      const r = await fetch(PROXY, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, system, messages: mensagens }) });
      d = await r.json();
      if (!r.ok) return json({ erro: 'O RICA ainda não está ligado. Avise a equipe do Clube R1.' }, 503);
    }
    if (d.stop_reason === 'refusal') return json({ texto: 'Esse assunto eu não consigo tratar por aqui, meu amigo. Me pergunta sobre a sua empresa, a sua rota ou a sua família que eu te ajudo.' });
    const texto = (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return json({ texto: texto || 'Fiquei sem palavras. Pergunta de novo?', fontes: trechos.slice(0, 3).map(t => ({ evento: t.evento, dia: t.dia, tempo: t.tempo, link: t.link })) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ erro: 'Muita gente falando com o RICA agora. Tente em um minuto.' }, 429);
    if (e instanceof Anthropic.APIError) return json({ erro: 'O RICA não conseguiu responder agora. Tente de novo.' }, 502);
    return json({ erro: 'Sem conexão com o RICA agora.' }, 502);
  }
};
