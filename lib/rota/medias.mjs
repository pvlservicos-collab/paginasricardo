// Médias da tripulação — o que o telão do evento mostra em membros.cluber1.com.br/rotadobilhao/medias.
// Junta as jornadas (rota_estados) e devolve SÓ números agregados, nunca o dado de uma pessoa:
//  - empresários da equipe/teste ficam de fora (EXCLUIR_DOMINIOS);
//  - cada bloco só mostra média com pelo menos MIN_N respostas (com menos, dá para adivinhar quem respondeu).
// As regras de cálculo são as mesmas do app (bússola das ilhas, pilares, Deus-Família-Empresa, etapas da travessia).
// Modo simulado: gera jornadas fictícias SÓ NA MEMÓRIA, para ver o dashboard cheio; nada é gravado no banco.

import { respostasPorPergunta } from './respostas-por-pergunta.mjs';
import CATALOGO from './catalogo-perguntas.mjs';

export const MIN_N = 3;
const EXCLUIR_DOMINIOS = String(process.env.ROTA_MEDIAS_EXCLUIR || 'grupor1.com,ivoxmarketing.com,cluber1.com.br,example.com')
  .split(',').map((d) => '@' + d.trim().toLowerCase().replace(/^@/, '')).filter((d) => d.length > 1);
export const contaDaEquipe = (email) => EXCLUIR_DOMINIOS.some((d) => String(email || '').toLowerCase().endsWith(d));

/* ---------- definições (copiadas do app da Rota do Bilhão; ilhas, níveis e DFE de 17/11, maturidade, PESTEL, Retrato e etapas de 19/11/2026) ---------- */
export const ILHAS = [
  { id: 'trocas', nome: 'Ilha das Trocas', curto: 'Trocas', ancoras: ['Geração de demanda', 'Relacionamento com o cliente', 'Posicionamento de marca', 'Preços e promoções', 'Dados e métricas'], eixos: ['Tração', 'Margem', [0, 1], [2, 3, 4]], perfis: { aa: 'Comércio em rota', ab: 'Vende muito, sobra pouco', ba: 'Margem sem vitrine', bb: 'Calmaria' } },
  { id: 'cofre', nome: 'Ilha do Cofre', curto: 'Cofre', ancoras: ['Planejamento e orçamento', 'Eficiência dos processos', 'Controle de custos', 'Crédito e risco', 'Fluxo de caixa'], eixos: ['Controle', 'Caixa', [0, 1, 2], [3, 4]], perfis: { aa: 'Cofre blindado', ab: 'Planilha bonita, caixa curto', ba: 'Caixa no feeling', bb: 'Cofre aberto' } },
  { id: 'tripulacao', nome: 'Ilha da Tripulação', curto: 'Tripulação', ancoras: ['Recrutamento e seleção', 'Treinamento e desenvolvimento', 'Gestão de desempenho', 'Benefícios e remuneração', 'Clima e engajamento'], eixos: ['Estrutura', 'Engajamento', [0, 2, 3], [1, 4]], perfis: { aa: 'Tripulação de elite', ab: 'Regra sem alma', ba: 'Time unido, sem regra', bb: 'Tripulação à deriva' } },
  { id: 'leme', nome: 'Ilha do Leme', curto: 'Leme', ancoras: ['Plataforma e logística', 'Marketing digital e tráfego', 'Experiência do cliente', 'Canais e força de vendas', 'Dados e segmentação'], eixos: ['Alcance', 'Conversão', [0, 1], [2, 3, 4]], perfis: { aa: 'Máquina de vendas', ab: 'Vitrine cheia, venda vazando', ba: 'Atende bem, ninguém vê', bb: 'Sem vento na vela' } },
  { id: 'engrenagem', nome: 'Ilha da Engrenagem', curto: 'Engrenagem', ancoras: ['Processos operacionais', 'Cadeia de suprimentos', 'Logística e distribuição', 'Controle de qualidade', 'Gestão de estoques'], eixos: ['Processo', 'Fluxo', [0, 3], [1, 2, 4]], perfis: { aa: 'Engrenagem azeitada', ab: 'Processo no papel, produto parado', ba: 'Roda no braço', bb: 'Engrenagem travada' } },
];
const QUIZ_ANCORA = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]; // pergunta k da bússola → âncora (igual nas 5 ilhas)
// Maturidade de gestão (app 19/11): 72 perguntas, nota de 1 a 4; área de cada pergunta na ordem do app.
export const MAT_AREAS = [
  { c: 'Estratégia', t: 'Estratégia' }, { c: 'Marketing', t: 'Marketing' }, { c: 'Finanças', t: 'Finanças' },
  { c: 'Operações', t: 'Operações' }, { c: 'Pessoas', t: 'Gestão de Pessoas' },
];
const MAT_AREA_DA_Q = [...Array(16).fill(0), ...Array(16).fill(1), ...Array(16).fill(2), ...Array(12).fill(3), ...Array(12).fill(4)];
const MAT_FAT_PESO = [0.5, 0.7, 0.8, 0.9, 1]; // faturamento → meta = 4 × peso (igual ao app)
export const MAT_NIVEIS = [[1.75, 'Gestão intuitiva'], [2.5, 'Gestão em estruturação'], [3.25, 'Gestão gerencial'], [3.7, 'Gestão estratégica'], [9, 'Alta performance']];
const maturOk = (e) => e.mat && e.mat.fat !== '' && e.mat.fat != null && e.mat.r && typeof e.mat.r === 'object' && MAT_AREA_DA_Q.every((_, i) => e.mat.r[i] >= 1 && e.mat.r[i] <= 4);
function maturCalc(e) { // igual a maturCalc() do app
  const meta = 4 * (MAT_FAT_PESO[+e.mat.fat] ?? MAT_FAT_PESO[4]);
  const areas = MAT_AREAS.map((_, k) => { const v = MAT_AREA_DA_Q.map((a, i) => (a === k ? e.mat.r[i] : null)).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; });
  const geral = MAT_AREA_DA_Q.reduce((s, _, i) => s + e.mat.r[i], 0) / MAT_AREA_DA_Q.length;
  return { meta, areas, geral, nivel: MAT_NIVEIS.findIndex((n) => geral < n[0]) };
}
export const PESTEL = ['Político', 'Econômico', 'Social', 'Tecnológico', 'Ambiental', 'Legal', 'Geopolítico'];
export const NIVEIS = ['Na cabeça do dono', 'Meta no papel', 'Orçamento montado', 'Rotina de acompanhamento', 'Empresa que anda sem o dono'];
const DFE_Q = [ // [dimensão, opções do pior para o melhor]
  ['Família', ['Nenhuma', '1 ou 2', '3 ou 4', '5 ou mais']], ['Família', ['Não lembro', 'Faz mais de um ano', 'Neste ano', 'Nos últimos 3 meses']],
  ['Família', ['Nunca', 'Às vezes', 'Quase sempre', 'Sempre']], ['Equilíbrio', ['Mais de 70', 'De 60 a 70', 'De 50 a 60', 'Até 50']],
  ['Equilíbrio', ['Não sabe', 'Sabe por alto', 'Sabe a meta', 'Participa do plano']], ['Equilíbrio', ['Não cuido', 'Quando sobra tempo', 'Tenho rotina', 'Rotina e check-up em dia']],
  ['Deus', ['Não penso nisso', 'Às vezes', 'Com frequência', 'São a base']], ['Deus', ['Sim', 'Talvez', 'Não', 'Jamais']],
];
const temValor = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');
const retratoOk = (e) => { const R = e.ferr?.retrato || {}; if (Object.values(e.ferr?.retratoSt || {}).filter(Boolean).length >= 4) return true;
  return !!(R.seg && R.cli) && ['r1', 'r2', 'r3', 'r4', 'r5'].filter((k) => temValor(R[k])).length >= 3; };
const DIAGNOSTICO = [ // "Antes de zarpar": o porto só fecha quando os cinco ficam prontos (etapa1Ok do app)
  ['retrato', 'Retrato atual', retratoOk],
  ['pestel', 'PESTEL', (e) => (e.ferr?.pestel?.sel || []).length > 0],
  ['swot', 'SWOT e prioridades', (e) => !!String(e.ferr?.swot?.prio?.[0] || '').trim()],
  ['hotseat', 'Conselho de Bordo', (e) => !!e.ferr?.hot?.decisao],
  ['smart', 'Meta SMART', (e) => !!(e.ferr?.smart?.indicador && e.ferr?.smart?.desejado && e.ferr?.smart?.data)],
];
const ETAPAS = [ // [id, nome, concluiu?] na ordem do app
  ['porto', 'Antes de zarpar', (e) => DIAGNOSTICO.every(([, , ok]) => ok(e))],
  ...DIAGNOSTICO,
  ...ILHAS.map((i) => [i.id, i.nome, (e) => !!e.ilhas?.[i.id]?.selo]),
  ['maturidade', 'Maturidade de gestão', maturOk],
  ['acordo', 'Acordo de 72 horas', (e) => !!String(e.ferr?.acordo?.acao || '').trim()],
  ['plano', 'Plano de 12 meses', (e) => ILHAS.every((i) => String(e.ilhas?.[i.id]?.rumo?.meta || '').trim())],
  ['dfe', 'Deus, Família e Empresa', (e) => dfeOk(e)],
  ['tesouro', 'Tesouro', (e) => !!e.tesouro?.ok],
  ['carta', 'Carta de compromisso', (e) => !!e.ferr?.carta?.ok],
];
const dfeOk = (e) => DFE_Q.every((_, i) => temValor(e.dfe?.['q' + i])) && temValor(e.dfe?.protege);

/* ---------- contas ---------- */
const media = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r0 = (v) => (v == null ? null : Math.round(v));
const corta = (n, v) => (n >= MIN_N ? v : null); // abaixo de MIN_N respostas não mostra o número

function bussola(e, ilha) { // igual a notas()/leitura() do app
  const r = e.diag?.[ilha.id]?.r;
  if (!Array.isArray(r) || r.length !== 10 || !r.every((v) => v >= 0)) return null;
  const s = [0, 0, 0, 0, 0], c = [0, 0, 0, 0, 0];
  r.forEach((v, k) => { s[QUIZ_ANCORA[k]] += v; c[QUIZ_ANCORA[k]]++; });
  const a = s.map((v, k) => (c[k] ? Math.round((v / (c[k] * 3)) * 100) : 0));
  const m = (l) => Math.round(l.reduce((p, k) => p + a[k], 0) / l.length);
  const x = m(ilha.eixos[2]), y = m(ilha.eixos[3]);
  return { a, indice: Math.round(a.reduce((p, v) => p + v, 0) / 5), q: (x >= 60 ? 'a' : 'b') + (y >= 60 ? 'a' : 'b') };
}

export function agregar(lista, { aBordo } = {}) {
  const E = lista.filter((e) => e && typeof e === 'object');
  const total = aBordo ?? E.length;
  const out = { geradoEm: new Date().toISOString(), minN: MIN_N, aBordo: total };

  // travessia: % de quem está a bordo que concluiu cada etapa
  out.etapas = ETAPAS.map(([id, nome, ok]) => { const n = E.filter((e) => { try { return ok(e); } catch { return false; } }).length; return { id, nome, n, pct: total ? Math.round((n / total) * 100) : 0 }; });
  out.concluiram = out.etapas.find((x) => x.id === 'carta').n;
  out.emRota = E.filter((e) => ETAPAS.some(([, , ok]) => { try { return ok(e); } catch { return false; } })).length;

  // nível do planejamento (porto): hoje × meta, 1 a 5
  const P = E.filter((e) => e.porto?.hoje > 0 && e.porto?.meta > 0);
  const dist = (k) => NIVEIS.map((_, i) => P.filter((e) => e.porto[k] === i + 1).length);
  out.porto = { n: P.length, hoje: corta(P.length, r1(media(P.map((e) => e.porto.hoje)))), meta: corta(P.length, r1(media(P.map((e) => e.porto.meta)))),
    distHoje: corta(P.length, dist('hoje')), distMeta: corta(P.length, dist('meta')), niveis: NIVEIS };

  // maturidade de gestão (72 notas de 1 a 4; só quem completou): média por área, meta média e distribuição por nível
  const M = E.filter(maturOk).map(maturCalc), nM = M.length;
  out.maturidade = { n: nM, escala: 4, geral: corta(nM, r1(media(M.map((m) => m.geral)))), meta: corta(nM, r1(media(M.map((m) => m.meta)))),
    areas: MAT_AREAS.map((a, k) => ({ ...a, media: corta(nM, r1(media(M.map((m) => m.areas[k])))) })),
    niveis: MAT_NIVEIS.map(([, nome], k) => ({ nome, n: corta(nM, M.filter((m) => m.nivel === k).length) })) };
  out.maturidade.pilares = out.maturidade.areas; // nome antigo, para a página publicada antes de 19/11 não quebrar

  // bússola das 5 ilhas
  out.ilhas = ILHAS.map((ilha) => {
    const B = E.map((e) => bussola(e, ilha)).filter(Boolean), n = B.length;
    const perfis = Object.fromEntries(Object.keys(ilha.perfis).map((q) => [q, B.filter((b) => b.q === q).length]));
    return { id: ilha.id, nome: ilha.nome, curto: ilha.curto, eixos: ilha.eixos.slice(0, 2), n,
      indice: corta(n, r0(media(B.map((b) => b.indice)))),
      ancoras: ilha.ancoras.map((nome, k) => ({ nome, media: corta(n, r0(media(B.map((b) => b.a[k])))) })),
      perfis: Object.entries(ilha.perfis).map(([q, nome]) => ({ q, nome, n: corta(n, perfis[q]), pct: corta(n, n ? Math.round((perfis[q] / n) * 100) : 0) })) };
  });

  // PESTEL: % que marcou cada fator (até 3 por pessoa)
  const S = E.filter((e) => (e.ferr?.pestel?.sel || []).length > 0);
  out.pestel = { n: S.length, fatores: PESTEL.map((nome, k) => ({ nome, pct: corta(S.length, Math.round((S.filter((e) => e.ferr.pestel.sel.includes(k)).length / (S.length || 1)) * 100)) })) };

  // Deus, Família e Empresa: 0 a 100 (melhor resposta = 100), geral e por dimensão
  const D = E.filter(dfeOk);
  const notaDe = (e, idx) => { const v = idx.map((i) => DFE_Q[i][1].indexOf(e.dfe['q' + i])).filter((x) => x >= 0); return v.length ? (v.reduce((a, b) => a + b, 0) / (v.length * 3)) * 100 : null; };
  const dim = (nome) => DFE_Q.map((q, i) => (q[0] === nome ? i : -1)).filter((i) => i >= 0);
  out.dfe = { n: D.length, geral: corta(D.length, r0(media(D.map((e) => notaDe(e, DFE_Q.map((_, i) => i))).filter((v) => v != null)))),
    dimensoes: ['Deus', 'Família', 'Equilíbrio'].map((nome) => ({ nome, media: corta(D.length, r0(media(D.map((e) => notaDe(e, dim(nome))).filter((v) => v != null)))) })) };

  // respostas por pergunta (pedido do Lucas, 19/11): % de quem escolheu cada opção, por etapa; só múltipla escolha,
  // texto digitado entra como "Outra resposta" sem o texto; menos de MIN_N respostas na pergunta = pct/n null
  out.respostas = respostasPorPergunta(E, CATALOGO, MIN_N);
  return out;
}

/* ---------- números de UMA pessoa (relatório privado da equipe, /api/rota/tripulacao) ---------- */
// Mesmas regras do agregar(), sem MIN_N: só sai pelo endereço protegido por chave, nunca pelo telão.
export function numerosDaPessoa(e) {
  const ok = (f) => { try { return !!f(e); } catch { return false; } };
  const etapas = ETAPAS.filter(([, , f]) => ok(f)).map(([id]) => id);
  const porto = e.porto?.hoje > 0 && e.porto?.meta > 0 ? { hoje: e.porto.hoje, meta: e.porto.meta } : null;
  let maturidade = null;
  if (ok(maturOk)) { const m = maturCalc(e); maturidade = { geral: r1(m.geral), meta: r1(m.meta), nivel: MAT_NIVEIS[m.nivel]?.[1] ?? null, areas: MAT_AREAS.map((a, k) => ({ c: a.c, media: r1(m.areas[k]) })) }; }
  const ilhas = ILHAS.map((ilha) => { const b = bussola(e, ilha);
    return { id: ilha.id, indice: b ? b.indice : null, perfil: b ? { q: b.q, nome: ilha.perfis[b.q] } : null, ancoras: b ? ilha.ancoras.map((nome, k) => ({ nome, nota: b.a[k] })) : null }; });
  let dfe = null;
  if (ok(dfeOk)) {
    const notaDe = (idx) => { const v = idx.map((i) => DFE_Q[i][1].indexOf(e.dfe['q' + i])).filter((x) => x >= 0); return v.length ? r0((v.reduce((a, b) => a + b, 0) / (v.length * 3)) * 100) : null; };
    dfe = { geral: notaDe(DFE_Q.map((_, i) => i)), dimensoes: ['Deus', 'Família', 'Equilíbrio'].map((nome) => ({ nome, media: notaDe(DFE_Q.map((q, i) => (q[0] === nome ? i : -1)).filter((i) => i >= 0)) })) };
  }
  const sel = e.ferr?.pestel?.sel || [];
  const pestel = sel.length ? sel.map((k) => PESTEL[k]).filter(Boolean) : null;
  return { etapas, numeros: { porto, maturidade, ilhas, dfe, pestel } };
}

/* ---------- modo simulado (só memória) ---------- */
// respostas de múltipla escolha com opções reais do catálogo, conforme o quanto a pessoa avançou (só para o telão simulado)
const AVANCO_ETAPA = { porto: 0.04, retrato: 0.45, pestel: 0.45, swot: 0.52, hotseat: 0.52, smart: 0.58, trocas: 0.12, cofre: 0.22, tripulacao: 0.32, leme: 0.42, engrenagem: 0.52, maturidade: 0.35, acordo: 0.66, dfe: 0.7 };
const lerCaminho = (S, c) => c.split('.').reduce((v, k) => (v == null ? undefined : v[k]), S);
const gravarCaminho = (S, c, valor) => { const ks = c.split('.'); let o = S; ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = valor; };
function respostasSimuladas(e, avanco, rnd) {
  for (const etapa of CATALOGO.etapas) {
    if (!(avanco > (AVANCO_ETAPA[etapa.id] ?? 2))) continue;
    for (const p of etapa.perguntas) {
      const caminho = p.id.split('|')[0], vals = p.ops.map((o) => o[1]);
      const atual = lerCaminho(e, caminho);
      const valido = (v) => vals.some((x) => String(x) === String(v));
      if (atual !== undefined && (Array.isArray(atual) ? atual.length && atual.every(valido) : valido(atual))) continue; // já tem resposta válida (ex.: maturidade, PESTEL, DFE)
      const pesos = vals.map((_, k) => 0.4 + ((k * 7 + etapa.id.length) % 5) / 4 + rnd()); // cada pergunta com a sua distribuição
      const sorteia = () => { const s = pesos.reduce((a, b) => a + b, 0); let x = rnd() * s; for (let k = 0; k < vals.length; k++) { x -= pesos[k]; if (x <= 0) return vals[k]; } return vals[vals.length - 1]; };
      if (p.multi) { const v = new Set(); const q = 1 + Math.floor(rnd() * Math.min(3, vals.length)); while (v.size < q) v.add(sorteia()); gravarCaminho(e, caminho, [...v]); }
      else gravarCaminho(e, caminho, sorteia());
    }
  }
}
function sorteio(semente) { let s = semente >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function simular(qtd = 148, semente = 2027) {
  const rnd = sorteio(semente), int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const lim = (v, a, b) => Math.max(a, Math.min(b, v));
  const viesAnc = ILHAS.map(() => Array.from({ length: 5 }, () => (rnd() - 0.5) * 1.5)); // cada âncora tem o seu ponto forte/fraco
  const lista = [];
  for (let p = 0; p < qtd; p++) {
    const forca = rnd(); // empresa mais ou menos estruturada: puxa todas as notas na mesma direção
    const avanco = rnd(); // quanto da travessia a pessoa já fez
    const nota03 = (vies = 0) => lim(Math.round(0.2 + forca * 2.8 + vies + (rnd() - 0.5) * 1.8), 0, 3);
    const e = { t: Date.now(), porto: {}, ilhas: {}, diag: {}, mat: { r: Array(72).fill(0), seg: [], fat: '' }, ferr: { pestel: { sel: [] }, swot: {}, hot: {}, smart: {}, acordo: {}, carta: {}, retratoSt: {} }, dfe: {}, tesouro: {} };
    if (avanco > 0.04) { e.porto = { hoje: lim(Math.round(1 + forca * 2.6 + (rnd() - 0.5)), 1, 5), ok: avanco > 0.1 }; e.porto.meta = lim(e.porto.hoje + int(1, 2), 2, 5); }
    ILHAS.forEach((ilha, k) => {
      if (avanco > 0.12 + k * 0.1) {
        const vies = [0.35, -0.2, 0.2, 0, -0.3][k];
        e.diag[ilha.id] = { r: Array.from({ length: 10 }, (_, j) => nota03(vies + viesAnc[k][Math.floor(j / 2)])) };
        e.ilhas[ilha.id] = { selo: avanco > 0.2 + k * 0.1 ? 1 : 0, rumo: { meta: avanco > 0.75 ? 'meta' : '' } };
      }
    });
    if (avanco > 0.35) { e.mat.fat = int(0, 4); e.mat.r = MAT_AREA_DA_Q.map((a) => lim(Math.round(1.3 + forca * 2.2 + [0.2, 0.1, -0.3, -0.5, 0][a] + (rnd() - 0.5) * 1.2), 1, 4)); }
    if (avanco > 0.45) {
      const pesos = [0.55, 0.9, 0.45, 0.8, 0.2, 0.6, 0.25]; const sel = [];
      while (sel.length < 3) { const i = int(0, 6); if (!sel.includes(i) && rnd() < pesos[i]) sel.push(i); }
      e.ferr.pestel.sel = sel; [0, 1, 2, 3].forEach((i) => (e.ferr.retratoSt[i] = 'ok'));
    }
    if (avanco > 0.52) { e.ferr.swot.prio = ['prioridade']; e.ferr.hot.decisao = 'decisão'; }
    if (avanco > 0.58) e.ferr.smart = { indicador: 'x', desejado: 'y', data: '2027' };
    if (avanco > 0.66) e.ferr.acordo.acao = 'ação';
    if (avanco > 0.7) { DFE_Q.forEach((q, i) => (e.dfe['q' + i] = q[1][lim(Math.round(1 + forca * 1.6 + (rnd() - 0.5) * 1.8 + (q[0] === 'Deus' ? 0.6 : q[0] === 'Equilíbrio' ? -0.5 : 0)), 0, 3)])); e.dfe.protege = ['x']; }
    if (avanco > 0.8) e.tesouro.ok = true;
    if (avanco > 0.86) e.ferr.carta.ok = true;
    respostasSimuladas(e, avanco, rnd);
    lista.push(e);
  }
  return lista;
}
