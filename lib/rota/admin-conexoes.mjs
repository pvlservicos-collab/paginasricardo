// Administração das Conexões da Rota (pedido do Lucas, 20/11/2026): a equipe mantém a lista e os logos sozinha,
// por uma tela privada, sem passar pelo desenvolvedor. Usado por api/rota/admin/conexoes.js e api/rota/admin/logo.js.
//  - chave: Authorization: Bearer <ROTA_CONEXOES_CHAVE> (variável de ambiente; 24+ caracteres; sem ela ninguém entra);
//  - formato da lista: o mesmo que o app lê em GET /api/rota/conexoes (n, s, ci, uf, m[{c,t,e}], l, mo);
//  - logos: l = 140x140 com fundo branco; mo = silhueta cinza-clara (#ececec) em fundo transparente, 96 px de altura,
//    igual aos cxr1-mono-*.webp que já existiam no lp.grupor1.com.
import { timingSafeEqual, createHash } from 'node:crypto';
import sharp from 'sharp';
import { sql } from '../store.mjs';
import { prepararRota } from './base.mjs';

export function chaveConfere(request) {
  const chave = process.env.ROTA_CONEXOES_CHAVE || '';
  const veio = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1]?.trim();
  if (chave.length < 24 || !veio) return false;
  const a = createHash('sha256').update(chave).digest(), b = createHash('sha256').update(veio).digest();
  return timingSafeEqual(a, b);
}

/* ---------------- formato da lista ---------------- */
const CAMPOS = new Set(['n', 's', 'ci', 'uf', 'm', 'l', 'mo']);
const CAMPOS_M = new Set(['c', 't', 'e']);
const texto = (v, max) => typeof v === 'string' && v.length <= max;
const listaTextos = (v, maxItens, max) => Array.isArray(v) && v.length <= maxItens && v.every((x) => texto(x, max));
const urlOk = (v) => v === '' || (texto(v, 500) && /^https:\/\/[^\s"'<>]+$/i.test(v));

// Devolve { lista } normalizada (textos sem espaço nas pontas, campos ausentes viram vazios) ou { erros: [...] }.
export function validarConexoes(entrada) {
  const erros = [];
  const bruto = Array.isArray(entrada) ? entrada : entrada?.membros;
  if (!Array.isArray(bruto)) return { erros: ['Mande a lista completa: um array de empresas (ou { "membros": [...] }).'] };
  if (!bruto.length) return { erros: ['A lista está vazia. Para não apagar tudo por engano, ela precisa ter pelo menos 1 empresa.'] };
  if (bruto.length > 5000) return { erros: ['Lista grande demais (máximo 5000 empresas).'] };
  const nomes = new Map();
  const lista = bruto.map((x, i) => {
    const onde = `item ${i + 1}${x && typeof x.n === 'string' ? ` (${x.n})` : ''}`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) { erros.push(`${onde}: precisa ser um objeto.`); return null; }
    const extras = Object.keys(x).filter((k) => !CAMPOS.has(k));
    if (extras.length) erros.push(`${onde}: campo desconhecido ${extras.join(', ')} (aceitos: n, s, ci, uf, m, l, mo).`);
    const n = typeof x.n === 'string' ? x.n.trim() : '';
    if (!n || n.length > 150) erros.push(`${onde}: "n" (nome da empresa) é obrigatório, até 150 letras.`);
    const chave = n.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (n && nomes.has(chave)) erros.push(`${onde}: nome repetido (igual ao item ${nomes.get(chave) + 1}).`);
    nomes.set(chave, i);
    const s = x.s ?? [];
    if (!listaTextos(s, 20, 150)) erros.push(`${onde}: "s" (segmentos) precisa ser uma lista de textos (até 20, cada um até 150 letras).`);
    const ci = x.ci ?? '', uf = x.uf ?? '';
    if (!texto(ci, 100)) erros.push(`${onde}: "ci" (cidade) precisa ser texto até 100 letras.`);
    if (!texto(uf, 3) || (uf && !/^[A-Za-z]{2,3}$/.test(uf))) erros.push(`${onde}: "uf" precisa ser a sigla do estado (2 letras; 3 para país, ex.: EUA) ou vazio.`);
    const l = x.l ?? '', mo = x.mo ?? '';
    if (!urlOk(l)) erros.push(`${onde}: "l" (logo) precisa ser um endereço https ou vazio.`);
    if (!urlOk(mo)) erros.push(`${onde}: "mo" (logo monocromático) precisa ser um endereço https ou vazio.`);
    const m = x.m ?? [];
    if (!Array.isArray(m) || m.length > 30) { erros.push(`${onde}: "m" (contatos) precisa ser uma lista (até 30).`); return null; }
    const contatos = m.map((p, j) => {
      const ondeC = `${onde}, contato ${j + 1}`;
      if (!p || typeof p !== 'object' || Array.isArray(p)) { erros.push(`${ondeC}: precisa ser um objeto { c, t, e }.`); return null; }
      const ex = Object.keys(p).filter((k) => !CAMPOS_M.has(k));
      if (ex.length) erros.push(`${ondeC}: campo desconhecido ${ex.join(', ')} (aceitos: c, t, e).`);
      const c = typeof p.c === 'string' ? p.c.trim() : '';
      if (!c || c.length > 150) erros.push(`${ondeC}: "c" (nome do contato) é obrigatório, até 150 letras.`);
      const t = p.t ?? [], e = p.e ?? [];
      if (!listaTextos(t, 10, 40)) erros.push(`${ondeC}: "t" (telefones) precisa ser uma lista de textos (até 10, cada um até 40 letras).`);
      if (!listaTextos(e, 10, 150) || !e.every((v) => !v.trim() || v.includes('@'))) erros.push(`${ondeC}: "e" (e-mails) precisa ser uma lista de e-mails.`);
      return { c, t: Array.isArray(t) ? t.map((v) => String(v).trim()).filter(Boolean) : [], e: Array.isArray(e) ? e.map((v) => String(v).trim()).filter(Boolean) : [] };
    });
    return {
      n, s: Array.isArray(s) ? s.map((v) => String(v).trim()).filter(Boolean) : [], ci: String(ci).trim(), uf: String(uf).trim().toUpperCase(),
      m: contatos, l: String(l).trim(), mo: String(mo).trim(),
    };
  });
  return erros.length ? { erros: erros.slice(0, 50), total: erros.length } : { lista };
}

/* ---------------- versões anteriores (para desfazer) ---------------- */
let tabela;
export function prepararVersoes() {
  tabela ??= (async () => {
    await prepararRota();
    await sql`create table if not exists rota_conexoes_versoes (
      id bigserial primary key,
      em timestamptz not null default now(),
      total int not null,
      valor text not null
    )`;
  })().catch((e) => { tabela = undefined; throw e; });
  return tabela;
}

/* ---------------- logos ---------------- */
const LADO = 140, ALTURA_MONO = 96, LARGURA_MONO_MAX = 360, CINZA = 236;

// cor média de um quadradinho 4x4 num canto (RGBA cru)
function canto(px, w, h, cx, cy) {
  const s = [0, 0, 0, 0];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const xx = cx ? w - 1 - x : x, yy = cy ? h - 1 - y : y, i = (yy * w + xx) * 4;
    for (let k = 0; k < 4; k++) s[k] += px[i + k];
  }
  return s.map((v) => v / 16);
}

// Gera { l, mo } (Buffers WebP) a partir de PNG/JPG/WebP.
export async function gerarLogos(buf) {
  const base = sharp(buf, { limitInputPixels: 40e6 }).rotate();
  const { data: px, info } = await base.clone()
    .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const cantos = [canto(px, w, h, 0, 0), canto(px, w, h, 1, 0), canto(px, w, h, 0, 1), canto(px, w, h, 1, 1)];
  const transparente = cantos.filter((c) => c[3] < 128).length >= 2;
  // fundo = mediana dos cantos (um canto com desenho não estraga)
  const med = (k) => cantos.map((c) => c[k]).sort((a, b) => a - b).slice(1, 3).reduce((a, b) => a + b, 0) / 2;
  const fundo = [med(0), med(1), med(2)];
  const fundoClaro = !transparente && fundo.every((v) => v >= 235);

  // ---- l: 140x140. Sem fundo ou fundo branco: fundo branco, recorta a sobra e deixa margem. Fundo colorido: mantém o
  //      fundo e completa o quadrado com a mesma cor (faixa branca ao lado de um logo escuro fica estranha no app).
  let fonte = await base.clone().flatten({ background: '#ffffff' }).png().toBuffer();
  if (transparente || fundoClaro) fonte = await sharp(fonte).trim({ background: '#ffffff', threshold: 12 }).png().toBuffer().catch(() => fonte);
  const margem = transparente || fundoClaro ? 10 : 0;
  const cor = transparente || fundoClaro ? '#ffffff' : { r: Math.round(fundo[0]), g: Math.round(fundo[1]), b: Math.round(fundo[2]) };
  const l = await sharp(fonte)
    .resize({ width: LADO - 2 * margem, height: LADO - 2 * margem, fit: 'contain', background: cor })
    .extend({ top: margem, bottom: margem, left: margem, right: margem, background: cor })
    .webp({ quality: 88 }).toBuffer();

  // ---- mo: o desenho (o que difere do fundo) vira cinza-claro com transparência; o fundo some.
  const alfa = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = px[i + 3] / 255;
    let v;
    if (transparente) v = a;
    else {
      const d = Math.hypot(px[i] - fundo[0], px[i + 1] - fundo[1], px[i + 2] - fundo[2]);
      v = Math.min(1, Math.max(0, (d - 24) / 72)) * a;
    }
    const b = Math.round(v * 255);
    alfa[y * w + x] = b;
    if (b > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) throw Object.assign(new Error('Não achei o desenho do logo (imagem vazia ou de uma cor só).'), { status: 422 });
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const o = (y * cw + x) * 4;
    out[o] = out[o + 1] = out[o + 2] = CINZA;
    out[o + 3] = alfa[(y + y0) * w + (x + x0)];
  }
  const mo = await sharp(out, { raw: { width: cw, height: ch, channels: 4 } })
    .resize({ width: LARGURA_MONO_MAX, height: ALTURA_MONO, fit: 'inside' })
    .webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  return { l, mo };
}
