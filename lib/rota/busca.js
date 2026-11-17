// Busca nos trechos minutados dos eventos (RGV, Clube Instinto, Caixa Preta, Arena R1) — BM25 simples, índice montado no 1º uso.
// A minutagem fica no banco (tabela rota_dados), não no código: o repositório é público.
import { dado } from './base.mjs';
let M = null;

const PARE = new Set('a o e é de da do das dos em no na nos nas um uma uns umas que se por para pra com sem como mas ou ao aos à às eu você voce vocês voces ele ela eles elas isso isto esse essa este esta aquele aquela meu minha seu sua nosso nossa lhe me te nos já ja não nao sim tem ter ser foi era vai vou tá ta tô to aí ai lá la aqui então entao porque quando onde qual quais quem muito mais menos bem só so também tambem ainda tudo todo toda todos todas cada mesmo mesma coisa gente né ne tipo assim daí dai pro pela pelo pelas pelos num numa dele dela deles há ha está esta estão estao sou são sao fazer faz fala falar disse diz vamos'.split(' '));
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const toks = s => norm(s).split(/[^a-z0-9%]+/).filter(w => w.length > 2 && !PARE.has(w));
const raiz = w => w.length > 5 ? w.replace(/(oes|aes|mente|cao|coes|ando|endo|indo|ados|idas|idos|ada|ado|ida|ido|ar|er|ir|as|es|os|is|s)$/, '') : w;

let IDX = null;
function indice() {
  if (IDX && IDX.M === M) return IDX;
  const inv = new Map(), len = new Uint32Array(M.r.length); let tot = 0;
  M.r.forEach((r, i) => {
    const tf = new Map();
    for (const w of toks(r[5])) { const k = raiz(w); tf.set(k, (tf.get(k) || 0) + 1); len[i]++; }
    tot += len[i];
    for (const [k, n] of tf) { let l = inv.get(k); if (!l) inv.set(k, l = []); l.push(i, n); }
  });
  return IDX = { M, inv, len, med: tot / M.r.length };
}

export async function buscar(pergunta, n = 10) {
  M = await dado('minutagem');
  const { inv, len, med } = indice(), N = M.r.length, sc = new Map();
  const termos = [...new Set(toks(pergunta).map(raiz))];
  for (const k of termos) {
    const l = inv.get(k); if (!l) continue;
    const df = l.length / 2, idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (let j = 0; j < l.length; j += 2) {
      const i = l[j], tf = l[j + 1];
      sc.set(i, (sc.get(i) || 0) + idf * (Math.min(tf, 3) * 2.2) / (Math.min(tf, 3) + 1.2 * (0.25 + 0.75 * len[i] / med)));
    }
  }
  const top = [...sc.entries()].sort((a, b) => b[1] - a[1]);
  const vistos = new Set(), out = [];
  for (const [i] of top) {
    const r = M.r[i], chave = r[4] + ':' + Math.floor(r[3] / 90);
    if (vistos.has(chave)) continue; vistos.add(chave);
    // junta o trecho anterior e o seguinte do mesmo vídeo para dar contexto
    const ctx = [i - 1, i, i + 1].filter(k => M.r[k] && M.r[k][4] === r[4]).map(k => M.r[k][5]).join(' ');
    out.push({ evento: r[0], dia: r[1], tempo: r[2], link: M.v[r[4]] ? `https://drive.google.com/file/d/${M.v[r[4]]}/view` : '', texto: ctx.slice(0, 900) });
    if (out.length >= n) break;
  }
  return out;
}
