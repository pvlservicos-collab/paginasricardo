// RD Station Marketing para os leads dos Raio-X (API de Conversões, com a Chave de API / token público da conta).
//
// - Configurada pela aba Integrações do painel (/raioxtributariodash), só admin. A chave fica no banco
//   (tabela raiox_config) e nunca volta para o navegador: a tela mostra só o final dela.
// - Cada diagnóstico com e-mail vira uma conversão no RD (uma vez por lead), com nome, e-mail, celular,
//   faturamento, número de funcionários, estado e UTMs. Testes e leads na lixeira não vão.
// - Faturamento e funcionários vão para campos personalizados (cf_...). Se o RD recusar esses campos
//   (ainda não criados lá), o lead vai sem eles e a tela avisa quais criar.
// - O envio acontece depois de responder ao quiz (waitUntil): o visitante não espera o RD.
import { sql } from './store.mjs';
import { prepararRaiox, PROJETOS, projetoDe, ehTeste } from './raiox.mjs';

const API = 'https://api.rd.services/platform/conversions';
const CAMPOS_PADRAO = { faturamento: 'cf_faturamento', funcionarios: 'cf_numero_de_funcionarios' };
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const EMAIL = /^[^\s@]{1,80}@[^\s@]{1,80}\.[^\s@]{2,20}$/;
const ehCampo = (v) => v === '' || /^cf_[a-z0-9_]{1,60}$/.test(v);
const ehIdentificador = (v) => /^[A-Za-z0-9 ._-]{2,80}$/.test(v);

/* ---------------- configuração ---------------- */
function normalizar(v = {}) {
  const projetos = {};
  for (const p of PROJETOS) {
    const x = (v.projetos || {})[p.id] || {};
    projetos[p.id] = { ativo: x.ativo !== false, identificador: x.identificador || p.rd };
  }
  return { ligado: Boolean(v.ligado && v.token), token: v.token || '', campos: { ...CAMPOS_PADRAO, ...(v.campos || {}) }, projetos, ultimo: v.ultimo || null };
}

export async function lerConfig() {
  await prepararRaiox();
  const [r] = await sql`select valor from raiox_config where chave = 'rd'`;
  return normalizar(r ? (typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor) : {});
}

async function gravarConfig(c, quem) {
  await sql`insert into raiox_config (chave, valor, atualizado_por) values ('rd', ${JSON.stringify(c)}::jsonb, ${String(quem || '').slice(0, 80)})
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`;
  cache = null;
}

let cache = null;
const configRapida = async () => {
  if (!cache || Date.now() - cache.em > 30e3) cache = { em: Date.now(), c: await lerConfig() };
  return cache.c;
};

// O que a tela recebe: sem a chave, só o final dela, e quantos leads de cada projeto ainda não foram.
export async function situacaoRD() {
  const c = await lerConfig();
  const linhas = await sql`select dados->>'url' as url, dados->'lead'->>'email' as email, dados, teste_manual, rd_em, rd_status
    from raiox_envios where excluido_em is null`;
  const pendentes = Object.fromEntries(PROJETOS.map((p) => [p.id, 0]));
  const enviados = Object.fromEntries(PROJETOS.map((p) => [p.id, 0]));
  for (const l of linhas) {
    const e = typeof l.dados === 'string' ? JSON.parse(l.dados) : l.dados;
    if (!EMAIL.test(String(l.email || '').trim()) || (l.teste_manual ?? ehTeste(e))) continue;
    const id = projetoDe(l.url).id;
    if (l.rd_status && l.rd_status.startsWith('ok')) enviados[id]++; else pendentes[id]++;
  }
  return {
    ligado: c.ligado, temChave: Boolean(c.token), chave: c.token ? '••••' + c.token.slice(-4) : '',
    campos: c.campos, projetos: c.projetos, ultimo: c.ultimo, pendentes, enviados,
    lista: PROJETOS.map((p) => ({ id: p.id, nome: p.nome, pagina: p.pagina })),
  };
}

/* ---------------- montar e enviar ---------------- */
const FAIXA_FUNC = { '1-9': '1 a 9', '10-20': '10 a 20', '21-50': '21 a 50', '51-100': '51 a 100', '100+': 'Mais de 100' };
export function textoFaturamento(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) return 'R$ ' + Math.round(+v).toLocaleString('pt-BR') + ' por mês';
  return String(v).slice(0, 120);
}
export function textoFuncionarios(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' || /^\d+$/.test(String(v))) return String(+v);
  return FAIXA_FUNC[v] || String(v).slice(0, 60);
}
function celular(t) {
  const d = String(t || '').replace(/\D/g, '');
  if (d.length < 10) return '';
  return '+' + (d.length <= 11 ? '55' + d : d);
}

export function payloadRD(e, c) {
  const projeto = projetoDe(e.url), l = e.lead || {}, p = e.perfil || {}, u = e.utm || {};
  const pl = {
    conversion_identifier: c.projetos[projeto.id].identificador,
    email: String(l.email || '').trim().toLowerCase(),
    name: l.nome, mobile_phone: celular(l.telefone), state: p.estado || p.uf,
    traffic_source: u.source, traffic_medium: u.medium, traffic_campaign: u.campaign, traffic_value: u.term || u.content,
    tags: ['raio-x', projeto.id],
  };
  if (c.campos.faturamento) pl[c.campos.faturamento] = textoFaturamento(p.faturamento);
  if (c.campos.funcionarios) pl[c.campos.funcionarios] = textoFuncionarios(p.funcionarios);
  for (const k of Object.keys(pl)) if (pl[k] == null || pl[k] === '') delete pl[k];
  return pl;
}

async function postar(token, payload) {
  const r = await fetch(`${API}?api_key=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ event_type: 'CONVERSION', event_family: 'CDP', payload }),
    signal: AbortSignal.timeout(12000),
  });
  return { ok: r.ok, status: r.status, texto: (await r.text().catch(() => '')).slice(0, 500) };
}

function explicar(r) {
  if (r.status === 401 || r.status === 403) return 'O RD não aceitou a chave. Confira a Chave de API (token público) da conta.';
  if (r.status === 429) return 'O RD pediu para esperar (limite de envios). Tente de novo em alguns minutos.';
  let msg = '';
  try { msg = (JSON.parse(r.texto).errors || []).map((x) => x.error_message || x.error_type).join('; '); } catch {}
  return `RD respondeu ${r.status}${msg || r.texto ? ': ' + (msg || r.texto).slice(0, 200) : ''}`;
}

// Envia um diagnóstico. Se o RD recusar os campos personalizados, tenta de novo sem eles.
export async function enviarAoRD(e, c) {
  const payload = payloadRD(e, c);
  const r = await postar(c.token, payload);
  if (r.ok) return { ok: true, status: 'ok' };
  const cfs = Object.keys(payload).filter((k) => k.startsWith('cf_'));
  if ([400, 422].includes(r.status) && cfs.length) {
    const sem = { ...payload };
    cfs.forEach((k) => delete sem[k]);
    const r2 = await postar(c.token, sem);
    if (r2.ok) return { ok: true, status: 'ok-sem-campos', aviso: `O RD recebeu o lead, mas recusou os campos ${cfs.join(', ')}. Crie-os no RD (Campos personalizados) ou ajuste os nomes aqui. Resposta: ${explicar(r)}` };
  }
  return { ok: false, status: 'erro', erro: explicar(r) };
}

async function guardarUltimo(r) {
  try {
    const c = await lerConfig();
    c.ultimo = { em: new Date().toISOString(), ok: r.ok, status: r.status, msg: r.aviso || r.erro || null };
    await gravarConfig(c, 'sistema');
  } catch { /* não atrapalha o envio */ }
}

// Envia um lead pelo id, uma vez só (reserva a linha antes de chamar o RD). forcar = reenviar mesmo se já foi.
async function enviarLinha(id, c, { forcar = false } = {}) {
  const [l] = await sql`select dados, teste_manual, excluido_em, rd_status from raiox_envios where id = ${id}`;
  if (!l) return { pulou: 'não encontrado' };
  const e = typeof l.dados === 'string' ? JSON.parse(l.dados) : l.dados;
  const projeto = projetoDe(e.url);
  if (!c.projetos[projeto.id].ativo) return { pulou: 'projeto desligado' };
  if (!EMAIL.test(String(e.lead?.email || '').trim())) return { pulou: 'sem e-mail' };
  if (l.excluido_em) return { pulou: 'na lixeira' };
  if (!forcar && (l.teste_manual ?? ehTeste(e))) return { pulou: 'teste' };
  const reserva = forcar
    ? await sql`update raiox_envios set rd_em = now(), rd_status = 'enviando' where id = ${id} returning id`
    : await sql`update raiox_envios set rd_em = now(), rd_status = 'enviando' where id = ${id}
        and (rd_status is null or rd_status like 'erro%' or (rd_status = 'enviando' and rd_em < now() - interval '10 minutes')) returning id`;
  if (!reserva.length) return { pulou: 'já enviado' };
  let r;
  try { r = await enviarAoRD(e, c); } catch (x) { r = { ok: false, status: 'erro', erro: 'Sem resposta do RD: ' + x.message }; }
  const status = r.ok ? r.status : ('erro: ' + r.erro).slice(0, 300);
  await sql`update raiox_envios set rd_status = ${status}, rd_em = ${r.ok ? new Date().toISOString() : null} where id = ${id}`;
  return r;
}

// Chamado depois de cada diagnóstico salvo (api/raiox/envio.js).
export async function rdDoEnvio(id) {
  try {
    const c = await configRapida();
    if (!c.ligado) return;
    const r = await enviarLinha(id, c);
    if (r.pulou) return;
    if (!r.ok || r.aviso) console.error(JSON.stringify({ tipo: 'erro', onde: 'rdstation', status: r.status, msg: r.erro || r.aviso }));
    await guardarUltimo(r);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', onde: 'rdstation', msg: e.message }));
  }
}

/* ---------------- ações da aba Integrações ---------------- */
// Confere a chave sem criar contato: um pedido sem e-mail é recusado pelo RD com 400 quando a chave vale
// (e com 401 quando não vale, porque o RD confere a chave antes do resto).
async function conferirChave(token) {
  const r = await postar(token, { conversion_identifier: 'teste-conexao-painel' });
  if (r.status === 401 || r.status === 403) throw falha('O RD não aceitou essa chave. Copie de novo a Chave de API (token público) da conta.', 400);
  if (r.status >= 500 || r.status === 0) throw falha('O RD não respondeu agora. Tente de novo em instantes.', 502);
}

export async function salvarRD(d, quem) {
  const c = await lerConfig();
  const token = String(d.token || '').trim();
  if (token) {
    if (!/^[A-Za-z0-9_-]{16,120}$/.test(token)) throw falha('Essa chave não parece a do RD (só letras e números, sem espaços).');
    await conferirChave(token);
    c.token = token;
  }
  if (d.campos && typeof d.campos === 'object') {
    for (const k of ['faturamento', 'funcionarios']) {
      if (d.campos[k] === undefined) continue;
      const v = String(d.campos[k] || '').trim().toLowerCase();
      if (!ehCampo(v)) throw falha('Campo personalizado do RD começa com cf_ (ex.: cf_faturamento). Deixe em branco para não enviar.');
      c.campos[k] = v;
    }
  }
  if (d.projetos && typeof d.projetos === 'object') {
    for (const p of PROJETOS) {
      const x = d.projetos[p.id];
      if (!x) continue;
      if (x.ativo !== undefined) c.projetos[p.id].ativo = Boolean(x.ativo);
      if (x.identificador !== undefined) {
        const v = String(x.identificador || '').trim() || p.rd;
        if (!ehIdentificador(v)) throw falha('Identificador da conversão: letras, números, espaço, ponto, hífen ou _.');
        c.projetos[p.id].identificador = v;
      }
    }
  }
  if (d.ligado !== undefined) c.ligado = Boolean(d.ligado);
  if (c.ligado && !c.token) throw falha('Cole a Chave de API do RD para ligar.');
  await gravarConfig(c, quem);
  return situacaoRD();
}

// Lead de teste de verdade (aparece no RD como "Teste integração painel"; dá para apagar lá depois).
export async function testeRD() {
  const c = await lerConfig();
  if (!c.token) throw falha('Cole a Chave de API do RD primeiro.');
  const e = {
    url: 'https://ricardonunes.grupor1.com/raioxtributario',
    lead: { nome: 'Teste integração painel', email: 'teste-integracao-raiox@grupor1.com', telefone: '' },
    perfil: { faturamento: 'Teste (300 mil por mês)', funcionarios: '10-20', uf: 'SP' },
    utm: { source: 'painel', medium: 'teste' },
  };
  const r = await enviarAoRD(e, { ...c, projetos: { ...c.projetos, tributario: { ativo: true, identificador: 'teste-integracao-painel' } } });
  await guardarUltimo(r);
  if (!r.ok) throw falha(r.erro, 502);
  return { ok: true, aviso: r.aviso || null, email: e.lead.email };
}

// Manda ao RD os leads que ainda não foram (ou deram erro). Até "max" por vez (a função tem 60 s).
export async function enviarPendentes(projetoId, max = 60) {
  const c = await lerConfig();
  if (!c.token) throw falha('Cole a Chave de API do RD primeiro.');
  const linhas = await sql`select id, dados->>'url' as url from raiox_envios
    where excluido_em is null and (rd_status is null or rd_status like 'erro%' or (rd_status = 'enviando' and rd_em < now() - interval '10 minutes'))
    order by recebido_em`;
  const alvo = linhas.filter((l) => !projetoId || projetoDe(l.url).id === projetoId);
  let enviados = 0, avisos = 0, erros = 0, ultimoErro = null, feitos = 0;
  const prazo = Date.now() + 45e3;
  for (const l of alvo) {
    if (feitos >= max || Date.now() > prazo) break;
    const r = await enviarLinha(l.id, c);
    if (r.pulou) continue;
    feitos++;
    if (r.ok) { enviados++; if (r.aviso) { avisos++; ultimoErro = r.aviso; } } else { erros++; ultimoErro = r.erro; if (/chave|limite/.test(r.erro)) break; }
    await new Promise((ok) => setTimeout(ok, 250)); // o RD limita os envios por minuto
  }
  if (feitos) await guardarUltimo(erros ? { ok: false, status: 'erro', erro: ultimoErro } : { ok: true, status: avisos ? 'ok-sem-campos' : 'ok', aviso: avisos ? ultimoErro : null });
  const s = await situacaoRD();
  return { enviados, erros, avisos, ultimoErro, restantes: projetoId ? s.pendentes[projetoId] : Object.values(s.pendentes).reduce((a, b) => a + b, 0), situacao: s };
}

// Botão "Enviar ao RD" de um lead (reenvia mesmo se já foi).
export async function enviarUm(id) {
  const c = await lerConfig();
  if (!c.token) throw falha('Ligue o RD Station na aba Integrações primeiro.');
  if (!/^[a-z0-9]{6,40}$/.test(String(id || ''))) throw falha('Lead inválido.');
  const r = await enviarLinha(id, { ...c, projetos: Object.fromEntries(Object.entries(c.projetos).map(([k, v]) => [k, { ...v, ativo: true }])) }, { forcar: true });
  if (r.pulou) throw falha('Não enviado: ' + r.pulou + '.');
  await guardarUltimo(r);
  if (!r.ok) throw falha(r.erro, 502);
  return r;
}
