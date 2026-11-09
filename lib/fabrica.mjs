// Fábrica de Formatos (/fabrica): a parte que precisa de servidor.
// - A IA é o Gemini com a chave do servidor (GEMINI_API_KEY); o navegador nunca vê a chave.
//   Modelo: GEMINI_MODELO ou o padrão abaixo (aparece na tela de Configurações).
// - Organizações (marcas) e prompts editados ficam no banco (tabela fabrica_dados), iguais para toda a equipe.
// - O vídeo nunca passa inteiro por aqui: o navegador monta os MP4 sozinho (WebCodecs). Para o raio-x, ele faz
//   uma cópia pequena do vídeo e manda em partes de até 3 MB (limite das funções da Vercel); as partes ficam no
//   Blob por instantes, juntam-se aqui e vão para o Gemini. Depois são apagadas.
import crypto from 'node:crypto';
import { put, del, list } from '@vercel/blob';
import { sql, usandoBanco, TOKEN_BLOB } from './store.mjs';

export const MODELO_PADRAO = 'gemini-3.7-flash'; // aceita vídeo; testado com a chave do Ricardo em 09/11/2026
const GEM = 'https://generativelanguage.googleapis.com';
const chave = () => String(process.env.GEMINI_API_KEY || '').trim();
export const modelo = () => String(process.env.GEMINI_MODELO || '').trim() || MODELO_PADRAO;
const falha = (msg, status = 400) => Object.assign(new Error(msg), { status });
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const PASTA_TMP = 'fabrica-tmp/';
export const MAX_PARTE = 3 * 1024 * 1024;
const MAX_PARTES = 40; // ~120 MB de cópia para análise (sobra muito: a cópia tem ~2 MB por minuto)

/* ---------------- banco ---------------- */
let pronto = null;
function preparar() {
  if (!usandoBanco) throw falha('Banco de dados não conectado.', 503);
  if (!pronto) {
    pronto = sql`create table if not exists fabrica_dados (
      chave text primary key,
      valor jsonb not null,
      atualizado_em timestamptz not null default now(),
      atualizado_por text
    )`.catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}
async function ler(k, padrao) {
  await preparar();
  const [r] = await sql`select valor from fabrica_dados where chave = ${k}`;
  if (!r) return padrao;
  return typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor;
}
export async function salvar(k, valor, quem) {
  if (!['marcas', 'prompts'].includes(k)) throw falha('Dado inválido.');
  if (k === 'marcas' && !Array.isArray(valor)) throw falha('Organizações inválidas.');
  if (k === 'prompts' && (!valor || typeof valor !== 'object' || Array.isArray(valor))) throw falha('Prompts inválidos.');
  await preparar();
  await sql`insert into fabrica_dados (chave, valor, atualizado_por) values (${k}, ${JSON.stringify(valor)}::jsonb, ${String(quem || '').slice(0, 80)})
    on conflict (chave) do update set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`;
}

export async function estado() {
  const k = chave();
  return {
    ia: { provedor: k ? 'gemini' : 'manual', modelo: modelo(), chave: k ? '••••' + k.slice(-4) : '', variavel: 'GEMINI_API_KEY' },
    marcas: await ler('marcas', []),
    prompts: await ler('prompts', {}),
  };
}

/* ---------------- Gemini ---------------- */
async function lerResposta(r, quem) {
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch { /* não-JSON */ }
  if (!r.ok) throw falha(`${quem} (${r.status}): ${j?.error?.message || txt.slice(0, 300) || r.statusText}`, r.status === 429 ? 429 : 502);
  return j;
}
function exigirChave() {
  const k = chave();
  if (!k) throw falha('A chave do Gemini não está configurada no servidor (variável GEMINI_API_KEY).', 503);
  return k;
}
async function gerar({ prompt, video = null }) {
  const k = exigirChave();
  const parts = [];
  if (video) parts.push({ file_data: { mime_type: video.mime, file_uri: video.uri } });
  parts.push({ text: prompt });
  const r = await fetch(`${GEM}/v1beta/models/${encodeURIComponent(modelo())}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': k },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0.9 } }),
    signal: AbortSignal.timeout(240000),
  });
  const j = await lerResposta(r, 'Gemini');
  const cand = j.candidates?.[0];
  const t = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  if (!t) throw falha(`O Gemini não devolveu texto (${cand?.finishReason || j.promptFeedback?.blockReason || 'sem motivo'}).`, 502);
  return t;
}
export function jsonDe(t) {
  const s = String(t || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b < a) throw falha('A IA não devolveu JSON: ' + s.slice(0, 200), 502);
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw falha('A IA devolveu um JSON inválido. Tente de novo.', 502); }
}

export async function testar() {
  jsonDe(await gerar({ prompt: 'Responda somente com este JSON: {"ok": true}' }));
  return { msg: `Chave funcionando com o modelo ${modelo()}.` };
}

/* ---------------- vídeo para o raio-x ---------------- */
const idValido = (id) => { if (!/^[a-z0-9]{8,40}$/.test(String(id || ''))) throw falha('Envio inválido.'); return id; };
export async function receberParte(id, n, buf) {
  idValido(id);
  if (!Number.isInteger(n) || n < 0 || n >= MAX_PARTES) throw falha('Parte inválida.');
  if (!buf.length || buf.length > MAX_PARTE) throw falha('Parte grande demais.', 413);
  if (!TOKEN_BLOB) throw falha('Conecte um Vercel Blob ao projeto.', 503);
  await put(`${PASTA_TMP}${id}/${String(n).padStart(3, '0')}.bin`, buf, { access: 'public', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/octet-stream', token: TOKEN_BLOB });
  return { ok: true, n };
}
// junta as partes, manda para o Gemini (Files API) e apaga as partes. Devolve o arquivo (name, uri, state).
export async function enviarVideo({ id, partes, mime }) {
  idValido(id);
  const k = exigirChave();
  const n = Number(partes);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PARTES) throw falha('Envio incompleto.');
  if (!/^video\/(mp4|webm|quicktime)$/.test(String(mime))) throw falha('Tipo de vídeo inválido.');
  const { blobs } = await list({ prefix: `${PASTA_TMP}${id}/`, token: TOKEN_BLOB, limit: 100 });
  blobs.sort((a, b) => a.pathname.localeCompare(b.pathname));
  if (blobs.length !== n) throw falha(`Chegaram ${blobs.length} de ${n} partes do vídeo. Tente de novo.`);
  try {
    const pedacos = [];
    for (const b of blobs) {
      const r = await fetch(b.url, { cache: 'no-store' });
      if (!r.ok) throw falha('Não consegui ler uma parte do vídeo.', 502);
      pedacos.push(Buffer.from(await r.arrayBuffer()));
    }
    const buf = Buffer.concat(pedacos);
    const r1 = await fetch(`${GEM}/upload/v1beta/files`, {
      method: 'POST',
      headers: {
        'x-goog-api-key': k, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(buf.length), 'X-Goog-Upload-Header-Content-Type': mime, 'content-type': 'application/json',
      },
      body: JSON.stringify({ file: { display_name: `fabrica-${id}` } }),
    });
    if (!r1.ok) await lerResposta(r1, 'Gemini (envio)');
    const url = r1.headers.get('x-goog-upload-url');
    if (!url) throw falha('O Gemini não devolveu o endereço de envio do vídeo.', 502);
    const r2 = await fetch(url, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body: buf });
    const f = (await lerResposta(r2, 'Gemini (envio)')).file;
    return { name: f.name, uri: f.uri, mime: f.mimeType || mime, state: f.state, bytes: buf.length };
  } finally {
    await del(blobs.map((b) => b.url), { token: TOKEN_BLOB }).catch(() => {});
  }
}
// o Gemini leva alguns segundos processando o vídeo; o navegador pergunta até ficar ACTIVE
export async function situacaoArquivo(nome) {
  if (!/^files\/[a-z0-9-]{1,80}$/.test(String(nome || ''))) throw falha('Arquivo inválido.');
  const k = exigirChave();
  const f = await lerResposta(await fetch(`${GEM}/v1beta/${nome}`, { headers: { 'x-goog-api-key': k } }), 'Gemini');
  return { name: f.name, uri: f.uri, mime: f.mimeType, state: f.state };
}

/* ---------------- raio-x e textos ---------------- */
function instrRaiox(ids) {
  return `RESPONDA APENAS com um JSON válido (sem markdown), exatamente neste formato:
{
  "transcricao": "fala completa do vídeo, palavra por palavra",
  "resumo": "1 ou 2 frases sobre o que o vídeo comunica",
  "gancho": "a ideia ou frase que prende nos primeiros segundos",
  "promessa": "a principal promessa ou benefício",
  "dores": ["dor 1", "dor 2"],
  "publico": "quem o vídeo atinge",
  "tom": "tom do vídeo",
  "tipo": "tipo de vídeo",
  "rosto": {"x": 0.5, "y": 0.35},
  "formatos": {"<id>": {"status": "encaixa" ou "adaptar", "motivo": "frase curta"}}
}
"rosto" é a posição média do rosto principal em frações do quadro (0 a 1, x da esquerda, y do topo). Use null se não houver rosto.
Inclua em "formatos" TODOS estes ids: ${ids.join(', ')}.
Escreva tudo em português do Brasil.`;
}
function instrCampos(campos) {
  return `RESPONDA APENAS com um JSON válido (sem markdown, sem comentários) com exatamente estas chaves:
${campos.map((c) => `- "${c.k}": ${c.rotulo} — no máximo ${c.max} caracteres${c.dest ? '. Pode envolver de 1 a 3 palavras-chave com *asteriscos* para destacá-las na cor da marca' : ''}`).join('\n')}
Escreva em português do Brasil. NUNCA ultrapasse o limite de caracteres de cada campo.`;
}
const texto = (v, max) => String(v ?? '').slice(0, max);

export async function raiox({ uri, mime, prompt, ids }) {
  if (!/^https:\/\/generativelanguage\.googleapis\.com\//.test(String(uri || ''))) throw falha('Vídeo inválido.');
  const lista = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[a-z0-9-]{1,40}$/.test(x)).slice(0, 60);
  const r = jsonDe(await gerar({ prompt: texto(prompt, 60000) + '\n\n' + instrRaiox(lista), video: { uri, mime: String(mime || 'video/mp4') } }));
  r.formatos = r.formatos && typeof r.formatos === 'object' ? r.formatos : {};
  for (const id of lista) {
    const f = r.formatos[id] || {};
    r.formatos[id] = { status: f.status === 'encaixa' ? 'encaixa' : 'adaptar', motivo: texto(f.motivo, 300) };
  }
  if (r.rosto && !(Number.isFinite(+r.rosto.x) && Number.isFinite(+r.rosto.y))) r.rosto = null;
  r.provedor = 'gemini'; r.modelo = modelo();
  return r;
}

export async function textos({ prompt, campos }) {
  const cs = (Array.isArray(campos) ? campos : []).slice(0, 20)
    .map((c) => ({ k: String(c.k || ''), rotulo: texto(c.rotulo, 80), max: Math.max(1, Math.min(600, +c.max || 60)), dest: Boolean(c.dest) }))
    .filter((c) => /^[A-Za-z0-9_]{1,30}$/.test(c.k));
  if (!cs.length) throw falha('Formato sem campos.');
  const j = jsonDe(await gerar({ prompt: texto(prompt, 60000) + '\n\n' + instrCampos(cs) }));
  const out = {};
  for (const c of cs) if (j[c.k] != null) out[c.k] = String(j[c.k]);
  return { textos: out };
}

export const novoId = () => Date.now().toString(36) + crypto.randomBytes(5).toString('hex');
