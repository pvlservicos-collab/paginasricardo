// Médias da tripulação — o que o telão do evento mostra em membros.cluber1.com.br/rotadobilhao/medias.
// Junta as jornadas (rota_estados) e devolve SÓ números agregados, nunca o dado de uma pessoa:
//  - empresários da equipe/teste ficam de fora (EXCLUIR_DOMINIOS);
//  - cada bloco só mostra média com pelo menos MIN_N respostas (com menos, dá para adivinhar quem respondeu).
// As regras de cálculo são as mesmas do app (bússola das ilhas, pilares, Deus-Família-Empresa, etapas da travessia).
// Modo simulado: gera jornadas fictícias SÓ NA MEMÓRIA, para ver o dashboard cheio; nada é gravado no banco.

export const MIN_N = 3;
const EXCLUIR_DOMINIOS = String(process.env.ROTA_MEDIAS_EXCLUIR || 'grupor1.com,ivoxmarketing.com,cluber1.com.br,example.com')
  .split(',').map((d) => '@' + d.trim().toLowerCase().replace(/^@/, '')).filter((d) => d.length > 1);
export const contaDaEquipe = (email) => EXCLUIR_DOMINIOS.some((d) => String(email || '').toLowerCase().endsWith(d));

/* ---------- definições (copiadas do app da Rota do Bilhão, 17/11/2026) ---------- */
export const ILHAS = [
  { id: 'trocas', nome: 'Ilha das Trocas', curto: 'Trocas', ancoras: ['Geração de demanda', 'Relacionamento com o cliente', 'Posicionamento de marca', 'Preços e promoções', 'Dados e métricas'], eixos: ['Tração', 'Margem', [0, 1], [2, 3, 4]], perfis: { aa: 'Comércio em rota', ab: 'Vende muito, sobra pouco', ba: 'Margem sem vitrine', bb: 'Calmaria' } },
  { id: 'cofre', nome: 'Ilha do Cofre', curto: 'Cofre', ancoras: ['Planejamento e orçamento', 'Eficiência dos processos', 'Controle de custos', 'Crédito e risco', 'Fluxo de caixa'], eixos: ['Controle', 'Caixa', [0, 1, 2], [3, 4]], perfis: { aa: 'Cofre blindado', ab: 'Planilha bonita, caixa curto', ba: 'Caixa no feeling', bb: 'Cofre aberto' } },
  { id: 'tripulacao', nome: 'Ilha da Tripulação', curto: 'Tripulação', ancoras: ['Recrutamento e seleção', 'Treinamento e desenvolvimento', 'Gestão de desempenho', 'Benefícios e remuneração', 'Clima e engajamento'], eixos: ['Estrutura', 'Engajamento', [0, 2, 3], [1, 4]], perfis: { aa: 'Tripulação de elite', ab: 'Regra sem alma', ba: 'Time unido, sem regra', bb: 'Tripulação à deriva' } },
  { id: 'leme', nome: 'Ilha do Leme', curto: 'Leme', ancoras: ['Plataforma e logística', 'Marketing digital e tráfego', 'Experiência do cliente', 'Canais e força de vendas', 'Dados e segmentação'], eixos: ['Alcance', 'Conversão', [0, 1], [2, 3, 4]], perfis: { aa: 'Máquina de vendas', ab: 'Vitrine cheia, venda vazando', ba: 'Atende bem, ninguém vê', bb: 'Sem vento na vela' } },
  { id: 'engrenagem', nome: 'Ilha da Engrenagem', curto: 'Engrenagem', ancoras: ['Processos operacionais', 'Cadeia de suprimentos', 'Logística e distribuição', 'Controle de qualidade', 'Gestão de estoques'], eixos: ['Processo', 'Fluxo', [0, 3], [1, 2, 4]], perfis: { aa: 'Engrenagem azeitada', ab: 'Processo no papel, produto parado', ba: 'Roda no braço', bb: 'Engrenagem travada' } },
];
const QUIZ_ANCORA = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]; // pergunta k da bússola → âncora (igual nas 5 ilhas)
export const PILARES = [
  { c: 'Modelo', t: 'Modelo de Negócio e Recorrência' }, { c: 'Comercial', t: 'Máquina Comercial e Expansão' },
  { c: 'Governança', t: 'Governança, Finanças e Capital' }, { c: 'Valor', t: 'Valor da Empresa, Alianças e Aquisições' },
  { c: 'Tecnologia', t: 'Tecnologia, IA e Eficiência' }, { c: 'Liderança', t: 'Liderança, Cultura e Sociedade' },
];
export const PESTEL = ['Político', 'Econômico', 'Social', 'Tecnológico', 'Ambiental', 'Legal'];
export const NIVEIS = ['Na cabeça do dono', 'Meta no papel', 'Orçamento montado', 'Rotina de acompanhamento', 'Empresa que anda sem o dono'];
const DFE_Q = [ // [dimensão, opções do pior para o melhor]
  ['Família', ['Nenhuma', '1 ou 2', '3 ou 4', '5 ou mais']], ['Família', ['Não lembro', 'Faz mais de um ano', 'Neste ano', 'Nos últimos 3 meses']],
  ['Família', ['Nunca', 'Às vezes', 'Quase sempre', 'Sempre']], ['Equilíbrio', ['Mais de 70', 'De 60 a 70', 'De 50 a 60', 'Até 50']],
  ['Equilíbrio', ['Não sabe', 'Sabe por alto', 'Sabe a meta', 'Participa do plano']], ['Equilíbrio', ['Não cuido', 'Quando sobra tempo', 'Tenho rotina', 'Rotina e check-up em dia']],
  ['Deus', ['Não penso nisso', 'Às vezes', 'Com frequência', 'São a base']], ['Deus', ['Sim', 'Talvez', 'Não', 'Jamais']],
];
const temValor = (v) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== '');
const ETAPAS = [ // [id, nome, concluiu?]
  ['porto', 'Antes de zarpar', (e) => !!e.porto?.ok],
  ...ILHAS.map((i) => [i.id, i.nome, (e) => !!e.ilhas?.[i.id]?.selo]),
  ['maturidade', 'Maturidade dos 6 pilares', (e) => Array.isArray(e.matur?.r) && e.matur.r.length === 18 && e.matur.r.every((v) => v > 0)],
  ['retrato', 'Retrato atual', (e) => Object.values(e.ferr?.retratoSt || {}).filter(Boolean).length >= 4],
  ['pestel', 'PESTEL', (e) => (e.ferr?.pestel?.sel || []).length > 0],
  ['swot', 'SWOT e prioridades', (e) => !!String(e.ferr?.swot?.prio?.[0] || '').trim()],
  ['smart', 'Meta SMART', (e) => !!(e.ferr?.smart?.indicador && e.ferr?.smart?.desejado && e.ferr?.smart?.data)],
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

  // maturidade dos 6 pilares (18 notas de 1 a 5; só quem completou)
  const M = E.filter((e) => Array.isArray(e.matur?.r) && e.matur.r.length === 18 && e.matur.r.every((v) => v >= 1 && v <= 5));
  out.maturidade = { n: M.length, geral: corta(M.length, r1(media(M.map((e) => media(e.matur.r))))),
    pilares: PILARES.map((p, k) => ({ ...p, media: corta(M.length, r1(media(M.map((e) => media(e.matur.r.slice(k * 3, k * 3 + 3)))))) })) };

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
  return out;
}

/* ---------- modo simulado (só memória) ---------- */
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
    const e = { t: Date.now(), porto: {}, ilhas: {}, diag: {}, matur: { r: Array(18).fill(0) }, ferr: { pestel: { sel: [] }, swot: {}, smart: {}, acordo: {}, carta: {}, retratoSt: {} }, dfe: {}, tesouro: {} };
    if (avanco > 0.04) { e.porto = { hoje: lim(Math.round(1 + forca * 2.6 + (rnd() - 0.5)), 1, 5), ok: avanco > 0.1 }; e.porto.meta = lim(e.porto.hoje + int(1, 2), 2, 5); }
    ILHAS.forEach((ilha, k) => {
      if (avanco > 0.12 + k * 0.1) {
        const vies = [0.35, -0.2, 0.2, 0, -0.3][k];
        e.diag[ilha.id] = { r: Array.from({ length: 10 }, (_, j) => nota03(vies + viesAnc[k][Math.floor(j / 2)])) };
        e.ilhas[ilha.id] = { selo: avanco > 0.2 + k * 0.1 ? 1 : 0, rumo: { meta: avanco > 0.75 ? 'meta' : '' } };
      }
    });
    if (avanco > 0.35) e.matur.r = Array.from({ length: 18 }, (_, j) => lim(Math.round(1.6 + forca * 2.6 + [0.3, 0.1, -0.4, -0.7, -0.2, 0.2][Math.floor(j / 3)] + (rnd() - 0.5) * 1.4), 1, 5));
    if (avanco > 0.45) {
      const pesos = [0.55, 0.9, 0.45, 0.8, 0.2, 0.6]; const sel = [];
      while (sel.length < 3) { const i = int(0, 5); if (!sel.includes(i) && rnd() < pesos[i]) sel.push(i); }
      e.ferr.pestel.sel = sel; [0, 1, 2, 3].forEach((i) => (e.ferr.retratoSt[i] = 'ok'));
    }
    if (avanco > 0.52) e.ferr.swot.prio = ['prioridade'];
    if (avanco > 0.58) e.ferr.smart = { indicador: 'x', desejado: 'y', data: '2027' };
    if (avanco > 0.66) e.ferr.acordo.acao = 'ação';
    if (avanco > 0.7) { DFE_Q.forEach((q, i) => (e.dfe['q' + i] = q[1][lim(Math.round(1 + forca * 1.6 + (rnd() - 0.5) * 1.8 + (q[0] === 'Deus' ? 0.6 : q[0] === 'Equilíbrio' ? -0.5 : 0)), 0, 3)])); e.dfe.protege = ['x']; }
    if (avanco > 0.8) e.tesouro.ok = true;
    if (avanco > 0.86) e.ferr.carta.ok = true;
    lista.push(e);
  }
  return lista;
}
