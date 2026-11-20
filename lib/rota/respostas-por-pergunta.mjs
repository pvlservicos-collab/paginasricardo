/*
 * Rota do Bilhão · contagem das respostas por pergunta (para o telão /medias)
 *
 * Uso no servidor, junto do cálculo que já existe em /api/rota/medias:
 *
 *   import { respostasPorPergunta } from './respostas-por-pergunta.mjs';
 *   import catalogo from './catalogo-perguntas.mjs';
 *   out.respostas = respostasPorPergunta(estados, catalogo, MIN_N);   (feito em agregar(), lib/rota/medias.mjs)
 *
 * - estados: a lista de objetos S de cada empresário (o mesmo que o servidor já
 *   lê para as médias). Não usa nome, e-mail, empresa nem texto livre.
 * - Só conta perguntas de múltipla escolha. Resposta digitada ("Outro") entra
 *   como "Outra resposta", sem o texto.
 * - Pergunta com menos de minN respostas vai com pct null (mesma regra do telão).
 */

function ler(S, caminho) {
  // "a.b.c" ou alternativas "a.b|a.c" (usa a primeira que tiver valor)
  for (const alt of String(caminho).split('|')) {
    let v = S;
    for (const k of alt.split('.')) { if (v == null) break; v = v[k]; }
    if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.filter(x => x !== '' && x != null).length)) return v;
  }
  return undefined;
}

export function respostasPorPergunta(estados, catalogo, minN) {
  minN = minN || 3;
  const lista = (estados || []).filter(Boolean);
  return catalogo.etapas.map(etapa => ({
    id: etapa.id,
    nome: etapa.nome,
    perguntas: etapa.perguntas.map(p => {
      const valores = p.ops.map(o => String(o[1]));
      const cont = p.ops.map(() => 0);
      let outra = 0, n = 0;
      for (const S of lista) {
        const v = ler(S, p.id);
        if (v === undefined) continue;
        const marcadas = (Array.isArray(v) ? v : [v]).filter(x => x !== '' && x != null);
        if (!marcadas.length) continue;
        n++;
        const vistos = new Set();
        for (const m of marcadas) {
          const k = valores.indexOf(String(m));
          if (k >= 0) { if (!vistos.has(k)) { cont[k]++; vistos.add(k); } }
          else outra++;
        }
      }
      const pct = c => (n >= minN ? Math.round(c / n * 100) : null);
      const opcoes = p.ops.map((o, k) => ({ nome: o[0], n: n >= minN ? cont[k] : null, pct: pct(cont[k]) }));
      if (outra) opcoes.push({ nome: 'Outra resposta', n: n >= minN ? outra : null, pct: pct(outra) });
      return { id: p.id, pergunta: p.q, curto: p.curto, multi: p.multi, n, opcoes };
    })
  }));
}

