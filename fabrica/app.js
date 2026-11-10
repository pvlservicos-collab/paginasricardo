/* global R, FORMATOS, FMT, RAIOX_PADRAO */
'use strict';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const main = $('#main');

/* Servidor: /api/fabrica do painel (login do painel). A chave da IA fica só no servidor. */
async function api(acao, body, extra = '') {
  const r = await fetch(`/api/fabrica?acao=${acao}${extra}`, body === undefined ? { credentials: 'same-origin', cache: 'no-store' }
    : { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { semLogin(); throw new Error('Faça login no painel para continuar.'); }
  if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`);
  return j;
}
function semLogin() {
  main.innerHTML = `<section class="painel estreito"><h1>Entre no painel primeiro</h1><p class="sub">A Fábrica de Formatos usa o mesmo login do Painel de Páginas.</p>
    <div class="acoes"><a class="btn pri" href="/painel">Entrar no painel →</a></div></section>`;
}

/* ---------------- criativos guardados neste navegador (IndexedDB) ----------------
   O vídeo nunca sai do computador inteiro: ele fica guardado aqui, junto com o andamento do projeto. */
const DB = (() => {
  let abre;
  const db = () => abre || (abre = new Promise((ok, falha) => {
    const r = indexedDB.open('fabrica-de-formatos', 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('projetos')) d.createObjectStore('projetos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('videos')) d.createObjectStore('videos', { keyPath: 'id' }); // Biblioteca
    };
    r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
  }));
  const tx = async (loja, modo, fn) => { const d = await db(); return new Promise((ok, falha) => { const t = d.transaction(loja, modo); const st = t.objectStore(loja); const r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => falha(t.error); }); };
  return {
    get: id => tx('projetos', 'readonly', st => st.get(id)),
    put: reg => tx('projetos', 'readwrite', st => st.put(reg)),
    del: id => tx('projetos', 'readwrite', st => st.delete(id)),
    todos: () => tx('projetos', 'readonly', st => st.getAll()),
    // Biblioteca: todos os vídeos exportados neste navegador
    videos: () => tx('videos', 'readonly', st => st.getAll()),
    guardarVideo: reg => tx('videos', 'readwrite', st => st.put(reg)),
    apagarVideo: id => tx('videos', 'readwrite', st => st.delete(id)),
  };
})();
const ARQUIVOS = new Map(); // id do projeto -> File do vídeo
const MAX_GUARDADOS = 6;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2200); }
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem storage */ } } };

/* ---------------- estado ---------------- */
const PASSOS = [['criativo', 'Criativo'], ['marca', 'Marca'], ['formatos', 'Formatos'], ['revisao', 'Revisão'], ['exportar', 'Exportar']];
const FONTES_TITULO = ['Anton', 'Bebas Neue', 'Oswald', 'Archivo Black', 'Montserrat', 'Poppins', 'Inter', 'Roboto Condensed', 'Bricolage Grotesque', 'Playfair Display'];
const FONTES_TEXTO = ['Inter', 'Montserrat', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'DM Sans', 'Nunito', 'Bricolage Grotesque'];
const PREV = ['live', 'tweet', 'fofoca-1', 'noticia', 'oferta-direta'];
const novaMarca = () => ({
  id: 'm' + Date.now().toString(36), nome: 'Minha marca', arroba: '@minhamarca', pessoa: '', verificado: true, mostrarLogo: true, mostrarArroba: true,
  logo: '', logoZoom: 1, logoX: 0, logoY: 0, logoModo: 'cobrir', logoFundo: '#FFFFFF',
  primaria: '#E0261B', secundaria: '#F0287A', destaque: '#22C55E', escuro: '#0E0E10', claro: '#FFFFFF',
  fonteTitulo: 'Anton', fonteTexto: 'Inter', nicho: '', publico: '', oferta: '', tom: '', cta: '', instrucoes: ''
});
const S = { passo: 'criativo', ia: null, marcas: [], prompts: {}, proj: null, filtro: 'todos', abaPrev: 0, promptSel: '_raiox', rxRodando: false, rxErro: null, rxEtapa: '', stages: new Set(), jobs: {} };
const temIA = () => S.ia && S.ia.provedor === 'gemini';

/* vídeo único usado para desenhar todas as prévias */
const V = document.createElement('video');
V.muted = true; V.loop = true; V.playsInline = true; V.preload = 'auto';
V.style.cssText = 'position:fixed;width:2px;height:2px;opacity:0;pointer-events:none;left:0;bottom:0';
document.body.appendChild(V);
['loadeddata', 'seeked', 'pause', 'play'].forEach(e => V.addEventListener(e, () => S.stages.forEach(s => { s.dirty = true; })));

/* ---------------- marca / textos ---------------- */
const logoCache = new Map();
const aoCarregarLogo = new Set(); // telas que desenham logos fora do palco de prévia
function logoImg(m) {
  if (!m.logo) return null;
  let im = logoCache.get(m.logo);
  if (!im) { im = new Image(); im.onload = () => { rebuildAll(); aoCarregarLogo.forEach(fn => fn()); }; im.src = m.logo; logoCache.set(m.logo, im); }
  return im.complete && im.naturalWidth ? im : null;
}
function marca() {
  return S.marcas.find(m => m.id === S.proj?.marcaId) || S.marcas.find(m => m.id === ls.get('marca')) || S.marcas[0];
}
function Bobj() {
  const m = marca() || novaMarca(); const ar = String(m.arroba || '').trim();
  return { ...m, arroba: ar ? (ar.startsWith('@') ? ar : '@' + ar) : '', logo: logoImg(m), fT: m.fonteTitulo || 'Anton', fX: m.fonteTexto || 'Inter' };
}
function pf(id) {
  S.proj.formatos = S.proj.formatos || {};
  return S.proj.formatos[id] || (S.proj.formatos[id] = { textos: {}, frames: [], incluir: true, aprovado: false });
}
function Tobj(f, B) {
  const t = S.proj?.formatos?.[f.id]?.textos || {}; const o = {};
  f.campos.forEach(c => { o[c.k] = t[c.k] != null ? t[c.k] : (typeof c.ex === 'function' ? c.ex(B) : c.ex); });
  return o;
}
const Fobj = f => S.proj?.formatos?.[f.id]?.frames || [];
const face = () => S.proj?.raiox?.rosto || null;
const statusDe = id => S.proj?.raiox?.formatos?.[id]?.status || FMT[id].encaixa;

const salvarMarcas = debounce(() => api('marcas', { valor: S.marcas }).catch(e => toast(e.message)), 500);
const salvarProj = debounce(() => {
  if (!S.proj) return;
  const arquivo = ARQUIVOS.get(S.proj.id);
  const extras = Object.fromEntries([...EXTRAS].map(([id, x]) => [id, x.arquivo]));
  DB.put({ id: S.proj.id, proj: JSON.parse(JSON.stringify(S.proj)), arquivo, extras, criado: S.proj.criado }).catch(e => toast('Não consegui guardar o projeto neste navegador: ' + e.message));
}, 600);

/* ---------------- prompts ---------------- */
const promptDe = k => S.prompts[k] || (k === '_raiox' ? RAIOX_PADRAO : FMT[k].prompt);
const preencher = (tpl, v) => String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (v[k] != null ? v[k] : ''));
function vars(B) {
  const rx = S.proj?.raiox || {};
  const bloco = linhas => linhas.filter(l => l[1] && String(l[1]).trim()).map(l => `${l[0]}: ${l[1]}`).join('\n');
  const tr = rx.transcricao || S.proj?.transcricaoManual || '';
  const dores = Array.isArray(rx.dores) ? rx.dores.join('; ') : (rx.dores || '');
  const cores = `cor principal ${B.primaria}, secundária ${B.secundaria}, destaque ${B.destaque}, fundo escuro ${B.escuro}, fundo claro ${B.claro}`;
  const crit = bloco([['TRANSCRIÇÃO DO CRIATIVO', tr], ['RESUMO', rx.resumo], ['GANCHO', rx.gancho], ['PROMESSA', rx.promessa], ['DORES', dores], ['PÚBLICO QUE O VÍDEO ATINGE', rx.publico], ['TOM DO VÍDEO', rx.tom], ['TIPO DE VÍDEO', rx.tipo]]);
  return {
    marca_bloco: 'DADOS DA MARCA\n' + bloco([['MARCA', B.nome + (B.arroba ? ` (${B.arroba})` : '')], ['PESSOA QUE APARECE / ASSINA', B.pessoa], ['NICHO', B.nicho], ['PÚBLICO', B.publico], ['OFERTA / PRODUTO', B.oferta], ['TOM DE VOZ', B.tom], ['CTA PADRÃO', B.cta], ['IDENTIDADE VISUAL', `${cores}; títulos em ${B.fT}, textos em ${B.fX}`], ['INSTRUÇÕES DA MARCA', B.instrucoes]]),
    criativo_bloco: 'DADOS DO CRIATIVO\n' + (crit || 'Sem raio-x do vídeo: baseie-se nos dados da marca.'),
    marca: B.nome, arroba: B.arroba, pessoa: B.pessoa || B.nome, nicho: B.nicho || '', publico: B.publico || 'o público da marca',
    oferta: B.oferta || '(não informada)', tom: B.tom || 'natural, direto e próximo', cta: B.cta || 'clicar no botão do anúncio', instrucoes: B.instrucoes || '',
    cores, fonteTitulo: B.fT, fonteTexto: B.fX, transcricao: tr, resumo: rx.resumo || '', gancho: rx.gancho || '', promessa: rx.promessa || '', dores, tipo: rx.tipo || '',
    formatos: FORMATOS.map(f => `- ${f.id}: ${f.nome} — ${f.desc}`).join('\n')
  };
}
const VARS = [
  ['marca_bloco', 'Todos os dados da marca organizados'], ['criativo_bloco', 'Tudo o que o raio-x descobriu do vídeo'],
  ['marca', 'Nome da marca'], ['arroba', '@ do Instagram'], ['pessoa', 'Nome da pessoa'], ['nicho', 'Nicho'], ['publico', 'Público'],
  ['oferta', 'Oferta / produto'], ['tom', 'Tom de voz'], ['cta', 'CTA padrão'], ['instrucoes', 'Instruções extras'], ['cores', 'Cores da marca'],
  ['fonteTitulo', 'Fonte de títulos'], ['fonteTexto', 'Fonte de textos'], ['transcricao', 'Fala do vídeo'], ['resumo', 'Resumo do vídeo'],
  ['gancho', 'Gancho'], ['promessa', 'Promessa'], ['dores', 'Dores'], ['tipo', 'Tipo de vídeo'], ['formatos', 'Lista de formatos (raio-x)']
];

/* ---------------- palco de prévia ---------------- */
const OBS = new IntersectionObserver(es => es.forEach(e => { const s = e.target._stage; if (s) { s.visivel = e.isIntersecting; s.dirty = true; } }));
/* segundo vídeo (espaço de baixo) dos formatos de tela dividida: id do formato -> { arquivo, video } */
const EXTRAS = new Map();
const DOIS_VIDEOS = id => FMT[id] && FMT[id].slots(Bobj(), Tobj(FMT[id], Bobj())).length > 1;
function ligarExtra(id, arquivo) {
  const ant = EXTRAS.get(id); if (ant) { URL.revokeObjectURL(ant.video.src); ant.video.remove(); EXTRAS.delete(id); }
  if (!arquivo) return;
  const v = document.createElement('video');
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
  v.style.cssText = V.style.cssText; v.src = URL.createObjectURL(arquivo);
  ['loadeddata', 'seeked'].forEach(e => v.addEventListener(e, () => S.stages.forEach(s => { s.dirty = true; })));
  document.body.appendChild(v); v.play().catch(() => {});
  EXTRAS.set(id, { arquivo, video: v });
}
const desl = f => S.proj?.formatos?.[f.id]?.desl || {};
class Stage {
  constructor(canvas, f, { editavel = false } = {}) {
    this.c = canvas; this.f = f; this.k = canvas.width / 1080; this.visivel = true; this.editavel = editavel; this.caixas = []; this.foco = null;
    this.b = document.createElement('canvas'); this.t = document.createElement('canvas');
    this.b.width = this.t.width = canvas.width; this.b.height = this.t.height = canvas.height;
    canvas._stage = this; S.stages.add(this); OBS.observe(canvas);
    this.rebuild(); R.fontes(Bobj()).then(() => this.rebuild());
  }
  rebuild() {
    const B = Bobj(), T = Tobj(this.f, B);
    this.slots = this.f.slots(B, T);
    const pinta = (cv, fn, preto) => {
      const x = cv.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
      if (preto) { x.fillStyle = '#000'; x.fillRect(0, 0, cv.width, cv.height); }
      x.setTransform(this.k, 0, 0, this.k, 0, 0);
      try { if (fn) fn(x, B, T); } catch (e) { console.error(this.f.id, e); }
    };
    this.caixas = R.comCampos(R.mapaCampos(this.f, T), desl(this.f), () => { pinta(this.b, this.f.base, true); pinta(this.t, this.f.topo, false); });
    this.dirty = true;
  }
  draw() {
    const x = this.c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.b, 0, 0);
    x.setTransform(this.k, 0, 0, this.k, 0, 0);
    const fr = Fobj(this.f), fc = face(), ex = EXTRAS.get(this.f.id);
    this.slots.forEach((s, i) => (i === 1 && ex ? R.slot(x, ex.video, s, fr[i], null) : R.slot(x, V, s, fr[i], fc)));
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.t, 0, 0);
    if (this.editavel) {
      // contorno dos textos que dá para arrastar
      x.save(); x.lineWidth = 2;
      for (const cx of this.caixas) {
        x.setLineDash(cx.k === this.foco ? [] : [6, 5]);
        x.strokeStyle = cx.k === this.foco ? '#F2B544' : 'rgba(255,255,255,.75)';
        x.strokeRect(cx.x, cx.y, cx.w, cx.h);
      }
      x.restore();
    }
  }
  caixaEm(px, py) { for (let i = this.caixas.length - 1; i >= 0; i--) { const b = this.caixas[i]; if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b; } return null; }
}
(function loop() {
  for (const s of S.stages) {
    if (!s.c.isConnected) { S.stages.delete(s); OBS.unobserve(s.c); continue; }
    if (s.visivel && (s.dirty || !V.paused || (EXTRAS.has(s.f.id) && !EXTRAS.get(s.f.id).video.paused))) { s.draw(); s.dirty = false; }
  }
  requestAnimationFrame(loop);
})();
async function rebuildAll() { await R.fontes(Bobj()); S.stages.forEach(s => s.rebuild()); }

/* ---------------- navegação ---------------- */
function irPara(p) { S.passo = p; ls.set('passo', p); render(); window.scrollTo(0, 0); }
function render() {
  $('#passos').innerHTML = PASSOS.map(([k, t], i) => `<button data-passo="${k}" class="${S.passo === k ? 'on' : ''}"><i>${i + 1}</i>${t}</button>`).join('');
  $('#b-config').classList.toggle('pri', S.passo === 'config');
  $('#b-biblioteca').classList.toggle('pri', S.passo === 'biblioteca');
  ({ config: viewConfig, criativo: viewCriativo, marca: viewMarca, formatos: viewFormatos, revisao: viewRevisao, exportar: viewExportar, prompts: viewPrompts, biblioteca: viewBiblioteca }[S.passo] || viewCriativo)();
}
$('#passos').onclick = e => { const b = e.target.closest('[data-passo]'); if (b) irPara(b.dataset.passo); };
$('#b-config').onclick = () => irPara('config');
$('#b-prompts').onclick = () => irPara('prompts');
$('#b-biblioteca').onclick = () => irPara('biblioteca');
function semProj() {
  main.innerHTML = `<section class="painel estreito"><h1>Suba um criativo primeiro</h1><p class="sub">Os formatos são montados em cima do vídeo que você enviar.</p><div class="acoes"><button class="btn pri" id="ir-c">Adicionar criativo →</button></div></section>`;
  $('#ir-c').onclick = () => irPara('criativo');
}

/* ---------------- 0. configurações ---------------- */
function viewConfig() {
  const ia = S.ia || {};
  main.innerHTML = `<section class="painel estreito">
    <h1>Configurações</h1><p class="sub">A IA assiste o criativo (raio-x) e escreve os textos de cada formato. A chave fica guardada no servidor do painel e nunca aparece no navegador.</p>
    <div class="cfg-ia">
      <div><span>IA</span><b>Google Gemini</b></div>
      <div><span>Modelo</span><b class="mono">${h(ia.modelo || '—')}</b></div>
      <div><span>Chave</span><b class="mono">${ia.chave ? `${h(ia.variavel)} ${h(ia.chave)}` : 'não configurada'}</b></div>
    </div>
    ${ia.chave ? '' : `<div class="aviso" style="margin-top:14px">Sem chave do Gemini no servidor, os formatos vêm com textos de exemplo e você escreve tudo na revisão. Para ligar a IA, cadastre a variável <b>${h(ia.variavel || 'GEMINI_API_KEY')}</b> no projeto da Vercel.</div>`}
    <p class="dica" style="margin-top:12px">Para trocar o modelo, cadastre a variável <b>GEMINI_MODELO</b> na Vercel (ex.: gemini-3.8-flash). Os vídeos são montados neste computador, no próprio navegador (use Chrome ou Edge atualizados).</p>
    <div id="c-status" class="status"></div>
    <div class="acoes"><button class="btn sec" id="c-testar" ${ia.chave ? '' : 'disabled'}>Testar chave</button><button class="btn pri" id="c-seguir">Continuar →</button></div>
  </section>`;
  $('#c-testar').onclick = async () => {
    const st = $('#c-status'); st.className = 'status'; st.innerHTML = '<span class="spin"></span> Testando...';
    try { const r = await api('testar', {}); st.className = 'status ok'; st.textContent = '✓ ' + r.msg; }
    catch (e) { st.className = 'status erro'; st.textContent = e.message; }
  };
  $('#c-seguir').onclick = () => irPara(S.proj ? 'marca' : 'criativo');
}

/* ---------------- 1. criativo ---------------- */
const fmtDur = s => { s = Math.round(s || 0); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function proporcao(w, h) {
  const r = w / h;
  for (const [n, v] of [['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9], ['3:4', 3 / 4]]) if (Math.abs(r - v) < 0.03) return n;
  return r < 1 ? 'vertical' : 'horizontal';
}
let urlVideo = null;
function abrirProj(p, arquivo, extras = {}) {
  [...EXTRAS.keys()].forEach(id => ligarExtra(id, null));
  Object.entries(extras || {}).forEach(([id, a]) => a && ligarExtra(id, a));
  S.proj = p; p.formatos = p.formatos || {}; p.selecionados = p.selecionados || [];
  if (!p.marcaId && marca()) p.marcaId = marca().id;
  S.rxErro = null; S.jobs = {}; ls.set('proj', p.id);
  ARQUIVOS.set(p.id, arquivo);
  if (urlVideo) URL.revokeObjectURL(urlVideo);
  urlVideo = URL.createObjectURL(arquivo); p.url = urlVideo;
  V.src = urlVideo; V.play().catch(() => {});
}
async function abrirGuardado(id) {
  const reg = await DB.get(id);
  if (!reg || !reg.arquivo) throw new Error('Esse criativo não está mais guardado neste navegador.');
  abrirProj(reg.proj, reg.arquivo, reg.extras);
}
function viewCriativo() {
  const p = S.proj;
  main.innerHTML = `<div class="grade2">
    <section class="painel"><h1>Adicione seu criativo</h1><p class="sub">Envie o vídeo que já vende. Ele vai ser adaptado para os formatos de anúncio.</p>
      <label class="drop" id="drop"><input type="file" id="arq" accept="video/*" hidden><div class="ico">⬆</div><b>Arraste o vídeo aqui</b><span>ou clique para escolher (MP4, MOV)</span></label>
      <div id="up-status" class="status"></div>
      <p class="dica" style="margin-top:10px">O vídeo fica neste computador: os formatos são montados aqui mesmo, no navegador. Só uma cópia pequena vai para a IA fazer o raio-x.</p>
      ${p ? `<label class="campo" style="margin-top:14px"><span>Transcrição da fala <em>(opcional)</em></span><textarea id="tr" rows="4" placeholder="Cole aqui o que é falado no vídeo. Só é usada se a IA estiver desligada.">${h(p.transcricaoManual || '')}</textarea></label>` : ''}
      <div id="recentes" class="recentes"></div>
    </section>
    <section class="painel"><h2>Vídeo de origem</h2>
      ${p ? `<video src="${p.url}" controls playsinline class="previa"></video>
        <div class="info"><div class="nome-l"><b id="p-nome" title="${h(p.nome)}">${h(p.nome)}</b><button class="lapis" id="p-renomear" title="Renomear (é o nome usado nos arquivos exportados)" aria-label="Renomear">✎</button></div><span>${proporcao(p.largura, p.altura)} • ${p.largura} × ${p.altura} • ${fmtDur(p.duracao)}${p.raiox ? ' • raio-x feito' : ''}</span></div>
        <div class="acoes"><button class="btn pri" id="seguir">Continuar para marca →</button></div>`
      : '<div class="vazio">Nenhum vídeo ainda</div>'}
    </section></div>`;
  const drop = $('#drop'), arq = $('#arq');
  arq.onchange = () => arq.files[0] && enviar(arq.files[0]);
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('sobre'); };
  drop.ondragleave = () => drop.classList.remove('sobre');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('sobre'); const f = e.dataTransfer.files[0]; if (f) enviar(f); };
  if (p) {
    $('#seguir').onclick = () => irPara('marca');
    $('#p-renomear').onclick = () => {
      const el = $('#p-nome').parentElement;
      el.innerHTML = `<input id="p-nome-in" maxlength="80" value="${h(p.nome)}"><button class="lapis" id="p-ok" aria-label="Salvar nome">✓</button>`;
      const inp = $('#p-nome-in'); inp.focus(); inp.select();
      const ok = () => { const v = inp.value.trim(); if (v) { p.nome = v; salvarProj(); toast('Nome salvo'); } viewCriativo(); };
      $('#p-ok').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') viewCriativo(); };
    };
    $('#tr').oninput = e => { p.transcricaoManual = e.target.value; salvarProj(); };
  }
  DB.todos().then(regs => {
    const outros = (regs || []).filter(x => x.id !== p?.id && x.arquivo).sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
    if (!outros.length || !$('#recentes')) return;
    $('#recentes').innerHTML = '<h3>Criativos recentes neste computador</h3>' + outros.map(x => `<button data-id="${x.id}"><span>${h(x.proj.nome)}</span><small>${new Date(x.criado).toLocaleDateString('pt-BR')} • ${fmtDur(x.proj.duracao)}</small></button>`).join('');
    $$('#recentes [data-id]').forEach(b => b.onclick = async () => {
      try { await abrirGuardado(b.dataset.id); viewCriativo(); } catch (e) { toast(e.message); }
    });
  }).catch(() => {});
}
const videoPronto = () => window.Video ? Promise.resolve(window.Video) : new Promise(ok => window.addEventListener('video-pronto', () => ok(window.Video), { once: true }));
async function enviar(file) {
  const st = $('#up-status'); st.className = 'status'; st.innerHTML = '<span class="spin"></span> Lendo o vídeo...';
  try {
    const Vd = await videoPronto();
    const meta = await Vd.info(file);
    if (!meta.duracao) throw new Error('Não consegui ler a duração do vídeo.');
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const p = { id, nome: file.name.replace(/\.[^.]+$/, ''), arquivo: file.name, largura: meta.largura, altura: meta.altura, duracao: meta.duracao, audio: meta.audio, criado: new Date().toISOString(), formatos: {}, selecionados: [] };
    abrirProj(p, file);
    await DB.put({ id, proj: JSON.parse(JSON.stringify(p)), arquivo: file, criado: p.criado });
    // guarda só os últimos criativos neste navegador
    const regs = (await DB.todos()).sort((a, b) => String(b.criado).localeCompare(String(a.criado)));
    for (const r of regs.slice(MAX_GUARDADOS)) await DB.del(r.id);
    toast('Vídeo carregado'); viewCriativo();
  } catch (e) { st.className = 'status erro'; st.textContent = e.message; }
}

/* ---------------- 2. marca ---------------- */
function viewMarca() {
  if (!S.marcas.length) { S.marcas.push(novaMarca()); salvarMarcas(); }
  const m = marca();
  const inp = (k, rot, ph = '') => `<label class="campo"><span>${rot}</span><input data-m="${k}" value="${h(m[k])}" placeholder="${h(ph)}"></label>`;
  const tog = (k, rot) => `<label class="tog"><input type="checkbox" data-m="${k}" ${m[k] ? 'checked' : ''}>${rot}</label>`;
  const cor = (k, rot) => `<label class="cor">${rot}<div><input type="color" data-m="${k}" value="${h(m[k])}"><input type="text" data-hex="${k}" value="${h(m[k])}" maxlength="7"></div></label>`;
  const sel = (k, rot, ops) => `<label class="campo"><span>${rot}</span><select data-m="${k}">${ops.map(o => `<option ${o === m[k] ? 'selected' : ''} style="font-family:'${o}'">${o}</option>`).join('')}</select></label>`;
  const rng = (k, rot, a, b) => `<div class="rng"><span>${rot}</span><input type="range" data-m="${k}" min="${a}" max="${b}" step="0.01" value="${m[k] ?? 0}"></div>`;
  main.innerHTML = `<div class="grade2 marca">
  <section class="painel"><h1>Quem assina os anúncios</h1><p class="sub">A identidade da organização entra nos formatos (cores, fontes, foto, @) e em todos os prompts da IA.</p>
    <h3>Marcas cadastradas</h3>
    <label class="campo"><span>Marca selecionada</span><select id="m-sel">${S.marcas.map(x => `<option value="${x.id}" ${x.id === m.id ? 'selected' : ''}>${h(x.nome)}</option>`).join('')}</select></label>
    <div class="linha"><button class="btn sec p" id="m-nova">+ Nova marca</button><button class="btn sec p" id="m-dup">Duplicar</button><button class="btn sec p perigo" id="m-del">Excluir</button></div>
    <h3>Identidade da marca</h3>
    <div class="logo-l"><div class="logo-prev" id="logo-prev"></div><div>
      <div class="linha"><label class="btn sec p">+ Trocar imagem<input type="file" id="m-logo" accept="image/*" hidden></label><button class="btn sec p" id="m-aj">Ajustar</button>${m.logo ? '<button class="btn sec p" id="m-rm">Remover</button>' : ''}</div>
      <p class="dica">Foto de perfil ou logo (PNG ou JPG). Depois de escolher, posicione e ajuste o tamanho.</p></div></div>
    <div id="aj" class="aj" hidden>${rng('logoZoom', 'Tamanho', 0.5, 3)}${rng('logoX', 'Horizontal', -1, 1)}${rng('logoY', 'Vertical', -1, 1)}
      <label class="campo"><span>Logo no círculo</span><select data-m="logoModo"><option value="cobrir" ${m.logoModo !== 'caber' ? 'selected' : ''}>Preencher o círculo (foto)</option><option value="caber" ${m.logoModo === 'caber' ? 'selected' : ''}>Caber inteira (logo larga)</option></select></label>
      ${cor('logoFundo', 'Fundo do círculo')}</div>
    <div class="g2" style="margin-top:16px">${inp('nome', 'Nome da marca')}${inp('arroba', '@ do Instagram', '@suamarca')}</div>
    ${inp('pessoa', 'Nome da pessoa que aparece <em>(Tweet, Meet)</em>', 'Ex.: Nay Mendes')}
    <div class="toggles">${tog('mostrarLogo', 'Mostrar logo')}${tog('mostrarArroba', 'Mostrar @')}${tog('verificado', 'Selo de verificado')}</div>
    <h3>Cores</h3><div class="cores">${cor('primaria', 'Principal')}${cor('secundaria', 'Secundária')}${cor('destaque', 'Destaque')}${cor('escuro', 'Fundo escuro')}${cor('claro', 'Fundo claro')}</div>
    <h3>Fontes</h3><div class="g2">${sel('fonteTitulo', 'Títulos', FONTES_TITULO)}${sel('fonteTexto', 'Textos', FONTES_TEXTO)}</div>
    <h3>Sobre o negócio <em>(vai para os prompts)</em></h3>
    ${inp('nicho', 'Nicho / segmento', 'Ex.: imobiliária em Manaus')}${inp('publico', 'Público', 'Ex.: famílias que querem sair do aluguel')}
    ${inp('oferta', 'Oferta / produto', 'Ex.: apartamentos de 2 quartos com entrada facilitada')}${inp('tom', 'Tom de voz', 'Ex.: próximo, direto, sem juridiquês')}
    ${inp('cta', 'Chamada padrão (CTA)', 'Ex.: Chama no WhatsApp')}
    <label class="campo"><span>Instruções extras para a IA</span><textarea data-m="instrucoes" rows="3" placeholder="Ex.: nunca prometer aprovação de financiamento; sempre citar o bairro">${h(m.instrucoes)}</textarea></label>
  </section>
  <section class="painel sticky"><h2>Assim aparece no anúncio</h2>
    <div class="abas" id="abas">${PREV.map((id, i) => `<button data-i="${i}" class="${i === S.abaPrev ? 'on' : ''}">${FMT[id].nome}</button>`).join('')}</div>
    <div class="tela"><canvas id="cv-prev" width="540" height="960"></canvas></div>
    <div class="acoes"><button class="btn pri" id="m-seguir">Escolher formatos →</button></div>
  </section></div>`;

  new Stage($('#cv-prev'), FMT[PREV[S.abaPrev]]);
  aoCarregarLogo.clear(); aoCarregarLogo.add(() => { if (S.passo === 'marca') logoPrev(); });
  $('#m-sel').onchange = e => escolher(e.target.value);
  const logoPrev = () => {
    const el = $('#logo-prev'); if (!el) return;
    if (!m.logo) { el.textContent = '+'; return; }
    el.innerHTML = '<canvas width="168" height="168"></canvas>';
    const B = Bobj(); R.avatar($('canvas', el).getContext('2d'), 84, 84, 84, { ...B, mostrarLogo: true });
  };
  logoPrev();
  const mudou = debounce(() => { rebuildAll(); logoPrev(); }, 60);
  $$('[data-m]').forEach(el => {
    el.oninput = el.onchange = () => {
      const k = el.dataset.m;
      m[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (el.type === 'color') { const t = $(`[data-hex="${k}"]`); if (t) t.value = el.value; }
      if (k === 'nome') { const o = $(`#m-sel option[value="${m.id}"]`); if (o) o.textContent = m.nome; }
      salvarMarcas(); mudou();
    };
  });
  $$('[data-hex]').forEach(el => el.oninput = () => {
    if (/^#[0-9a-f]{6}$/i.test(el.value)) { m[el.dataset.hex] = el.value; $(`[data-m="${el.dataset.hex}"]`).value = el.value; salvarMarcas(); mudou(); }
  });
  $('#abas').onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; S.abaPrev = +b.dataset.i; viewMarca(); };
  $('#m-aj').onclick = () => { $('#aj').hidden = !$('#aj').hidden; };
  $('#m-logo').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 600 / Math.max(im.width, im.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k);
        cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
        m.logo = cv.toDataURL('image/png'); m.logoZoom = 1; m.logoX = 0; m.logoY = 0;
        salvarMarcas(); viewMarca(); rebuildAll();
      };
      im.src = rd.result;
    };
    rd.readAsDataURL(f);
  };
  if ($('#m-rm')) $('#m-rm').onclick = () => { m.logo = ''; salvarMarcas(); viewMarca(); rebuildAll(); };
  const escolher = id => { ls.set('marca', id); if (S.proj) { S.proj.marcaId = id; salvarProj(); } viewMarca(); rebuildAll(); };
  $('#m-nova').onclick = () => { const n = novaMarca(); S.marcas.push(n); salvarMarcas(); escolher(n.id); };
  $('#m-dup').onclick = () => { const n = { ...m, id: 'm' + Date.now().toString(36), nome: m.nome + ' (cópia)' }; S.marcas.push(n); salvarMarcas(); escolher(n.id); };
  $('#m-del').onclick = () => {
    if (S.marcas.length < 2) return toast('Precisa existir pelo menos uma organização');
    if (!confirm(`Excluir a organização "${m.nome}"?`)) return;
    S.marcas = S.marcas.filter(x => x.id !== m.id); salvarMarcas(); escolher(S.marcas[0].id);
  };
  $('#m-seguir').onclick = () => irPara('formatos');
}

/* ---------------- 3. formatos ---------------- */
function rxHTML() {
  if (S.rxRodando) return `<span class="spin"></span> Raio-x: ${h(S.rxEtapa || 'começando...')}`;
  if (S.rxErro) return `Raio-x falhou: ${h(S.rxErro)} <button class="link" id="rx-de-novo">Tentar de novo</button>`;
  const nE = FORMATOS.filter(f => statusDe(f.id) === 'encaixa').length;
  if (S.proj.raiox) return `<span class="ok">✓ Raio-x concluído</span> • <span class="n-e">${nE} encaixam</span> • <span class="n-a">${FORMATOS.length - nE} precisam de ajuste</span> <button class="link" id="rx-de-novo">refazer</button>`;
  if (!temIA()) return 'Sem IA: indicação padrão de cada formato';
  return `Raio-x ainda não feito <button class="link" id="rx-de-novo">fazer agora</button>`;
}
function viewFormatos() {
  if (!S.proj) return semProj();
  const sel = new Set(S.proj.selecionados);
  const nE = FORMATOS.filter(f => statusDe(f.id) === 'encaixa').length;
  const lista = FORMATOS.filter(f => S.filtro === 'todos' || statusDe(f.id) === S.filtro);
  const rx = S.proj.raiox;
  main.innerHTML = `<section class="painel">
    <div class="topo-cat"><div><h1>Catálogo de formatos</h1><p class="sub" style="margin:0">Escolha como o seu criativo vai aparecer.</p></div><div class="rx ${S.rxErro ? 'erro' : ''}" id="rx">${rxHTML()}</div></div>
    <div class="linha entre"><div class="abas" id="filtro">${[['todos', `Todos (${FORMATOS.length})`], ['encaixa', `Encaixa (${nE})`], ['adaptar', `Adaptar (${FORMATOS.length - nE})`]].map(([k, t]) => `<button data-f="${k}" class="${S.filtro === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="linha"><button class="btn sec p" id="s-rec">Selecionar recomendados</button><button class="btn sec p" id="s-all">Selecionar todos</button><button class="btn sec p" id="s-none">Limpar</button></div></div>
    ${painelRaiox(rx)}
    <div class="cat">${lista.map(f => `<div class="card ${sel.has(f.id) ? 'on' : ''}" data-id="${f.id}"><div class="faixa-rev">✓ Marcado para revisão</div><div class="tela"><canvas width="270" height="480"></canvas><span class="chk">✓</span></div>
      <div class="card-n"><b>${h(f.nome)}</b><span class="pill ${statusDe(f.id)}">${statusDe(f.id) === 'encaixa' ? 'Encaixa' : 'Adaptar'}</span></div>
      <p class="motivo">${h(rx?.formatos?.[f.id]?.motivo || f.desc)}</p>
      <button class="btn sec p editar-card" data-editar="${f.id}">✎ Editar</button></div>`).join('')}</div>
  </section>
  <div class="rodape"><span id="n-sel"></span><button class="btn pri" id="gerar">Gerar textos →</button></div>`;
  const conta = () => { const n = S.proj.selecionados.length; $('#n-sel').textContent = `${n} ${n === 1 ? 'formato selecionado' : 'formatos selecionados'}`; $('#gerar').disabled = !n; };
  conta();
  $$('.card').forEach(el => {
    new Stage($('canvas', el), FMT[el.dataset.id]);
    el.onclick = e => {
      if (e.target.closest('[data-editar]')) { e.stopPropagation(); return abrirEditor(el.dataset.id); }
      const id = el.dataset.id, s = new Set(S.proj.selecionados);
      s.has(id) ? s.delete(id) : s.add(id);
      S.proj.selecionados = FORMATOS.map(f => f.id).filter(x => s.has(x));
      el.classList.toggle('on', s.has(id)); conta(); salvarProj();
    };
  });
  const marcar = ids => { S.proj.selecionados = ids; salvarProj(); viewFormatos(); };
  $('#s-rec').onclick = () => marcar(FORMATOS.filter(f => statusDe(f.id) === 'encaixa').map(f => f.id));
  $('#s-all').onclick = () => marcar(FORMATOS.map(f => f.id));
  $('#s-none').onclick = () => marcar([]);
  $('#filtro').onclick = e => { const b = e.target.closest('[data-f]'); if (b) { S.filtro = b.dataset.f; viewFormatos(); } };
  $('#rx').onclick = e => { if (e.target.id === 'rx-de-novo') rodarRaiox(); };
  $('#gerar').onclick = gerarTextos;
  const rp = $('.raiox-p'); if (rp) rp.ontoggle = () => ls.set('rxAberto', rp.open ? '1' : '0');
  if (!rx && temIA() && !S.rxRodando && !S.rxErro) rodarRaiox();
}
/* o que a IA viu no criativo (aparece em cima do catálogo depois do raio-x) */
function painelRaiox(rx) {
  if (!rx) return '';
  const li = (t, v) => (v && String(v).trim() ? `<div><span>${t}</span><p>${h(Array.isArray(v) ? v.join('; ') : v)}</p></div>` : '');
  return `<details class="raiox-p" ${ls.get('rxAberto') === '0' ? '' : 'open'}><summary>O que a IA viu no criativo ${rx.modelo ? `<small>${h(rx.modelo)}</small>` : ''}</summary>
    <p class="dica">O Gemini assistiu o vídeo inteiro (fala, texto na tela e enquadramento). Com isso ele marcou cada formato: <b>Encaixa</b> = funciona com a moldura e os textos; <b>Adaptar</b> = vale ajustar texto ou enquadramento antes (use ✎ Editar). O rosto que ele achou centraliza o vídeo automaticamente.</p>
    <div class="raiox-g">${li('Resumo', rx.resumo)}${li('Gancho', rx.gancho)}${li('Promessa', rx.promessa)}${li('Dores', rx.dores)}${li('Público', rx.publico)}${li('Tom', rx.tom)}${li('Tipo de vídeo', rx.tipo)}</div>
    ${rx.transcricao ? `<details class="trans"><summary>Transcrição da fala</summary><p>${h(rx.transcricao)}</p></details>` : ''}
  </details>`;
}

/* editor de um formato: prévia grande com os textos arrastáveis, campos, enquadramento e o vídeo de baixo */
function abrirEditor(id) {
  const f = FMT[id], st = pf(id), m = $('#modal');
  st.desl = st.desl || {};
  const B = Bobj(), T = Tobj(f, B), slots = f.slots(B, T), ex = EXTRAS.get(id);
  const fr = i => st.frames[i] || {};
  const rngF = (i, k, rot, a, b) => `<div class="rng"><span>${rot}</span><input type="range" data-fr="${i}:${k}" min="${a}" max="${b}" step="0.01" value="${fr(i)[k] ?? (k === 'zoom' ? 1 : 0.5)}"></div>`;
  m.innerHTML = `<div class="mod-fundo"><div class="mod editor">
    <div class="ed-tela"><div class="tela"><canvas width="540" height="960"></canvas></div><p class="dica">Arraste os textos com o mouse para mudar de lugar.</p></div>
    <div class="ed-lado">
      <div class="linha entre"><h2>${h(f.nome)} <span class="pill ${statusDe(id)}">${statusDe(id) === 'encaixa' ? 'Encaixa' : 'Adaptar'}</span></h2><button class="btn sec p" id="ed-x">Fechar</button></div>
      ${S.proj.raiox?.formatos?.[id]?.motivo ? `<p class="motivo">IA: ${h(S.proj.raiox.formatos[id].motivo)}</p>` : ''}
      <div class="campos">${f.campos.map(c => {
        const v = T[c.k] ?? '';
        const campo = c.max > 60 ? `<textarea data-k="${c.k}" rows="${c.max > 140 ? 4 : 2}">${h(v)}</textarea>` : `<input data-k="${c.k}" value="${h(v)}">`;
        return `<label class="campo"><span>${h(c.rotulo)}<small data-cont="${c.k}" class="${len(v) > c.max ? 'over' : ''}">${len(v)}/${c.max}</small></span>${campo}</label>`;
      }).join('')}</div>
      <div class="linha"><button class="btn sec p" id="ed-pos">↺ Textos no lugar original</button>${temIA() ? '<button class="btn sec p" id="ed-ia">↻ Reescrever com IA</button>' : ''}</div>
      <h3>Enquadramento do vídeo</h3>
      ${slots.map((sl, i) => `<div class="slot"><b>${slots.length > 1 ? (i === 0 ? 'Vídeo de cima' : 'Vídeo de baixo') : 'Vídeo'} <button class="link" data-auto="${i}">automático</button></b>${rngF(i, 'zoom', 'Zoom', 1, 3)}${rngF(i, 'px', 'Horizontal', 0, 1)}${rngF(i, 'py', 'Vertical', 0, 1)}</div>`).join('')}
      ${slots.length > 1 ? `<div class="extra"><b>Outro vídeo no espaço de baixo</b><p class="dica">${ex ? 'Usando: ' + h(ex.arquivo.name) : 'Hoje o mesmo vídeo aparece em cima e embaixo.'}</p>
        <div class="linha"><label class="btn sec p">${ex ? 'Trocar vídeo' : '+ Adicionar vídeo'}<input type="file" id="ed-v2" accept="video/*" hidden></label>${ex ? '<button class="btn sec p" id="ed-v2x">Remover</button>' : ''}</div></div>` : ''}
    </div></div></div>`;
  const cv = $('canvas', m), stage = new Stage(cv, f, { editavel: true });
  const fechar = () => { m.innerHTML = ''; document.removeEventListener('keydown', esc); if (S.passo === 'formatos') viewFormatos(); else if (S.passo === 'revisao') viewRevisao(); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  $('#ed-x').onclick = fechar;
  $('.mod-fundo', m).onclick = e => { if (e.target.classList.contains('mod-fundo')) fechar(); };
  const redesenha = debounce(() => stage.rebuild(), 80);
  $$('[data-k]', m).forEach(inp => inp.oninput = () => {
    const c = f.campos.find(x => x.k === inp.dataset.k);
    st.textos[c.k] = inp.value;
    const ct = $(`[data-cont="${c.k}"]`, m); ct.textContent = `${len(inp.value)}/${c.max}`; ct.classList.toggle('over', len(inp.value) > c.max);
    redesenha(); salvarProj();
  });
  $$('[data-fr]', m).forEach(r => r.oninput = () => { const [i, k] = r.dataset.fr.split(':'); st.frames[i] = { ...(st.frames[i] || {}), [k]: +r.value }; stage.dirty = true; salvarProj(); });
  $$('[data-auto]', m).forEach(b => b.onclick = e => { e.preventDefault(); const i = +b.dataset.auto; st.frames[i] = {}; stage.dirty = true; salvarProj(); $$(`[data-fr^="${i}:"]`, m).forEach(r => { r.value = r.dataset.fr.endsWith('zoom') ? 1 : 0.5; }); });
  $('#ed-pos').onclick = () => { st.desl = {}; stage.rebuild(); salvarProj(); };
  if ($('#ed-ia')) $('#ed-ia').onclick = async e => {
    const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Escrevendo...';
    try { await escreverFormato(id); salvarProj(); abrirEditor(id); } catch (err) { alert(err.message); b.disabled = false; b.textContent = '↻ Reescrever com IA'; }
  };
  if ($('#ed-v2')) $('#ed-v2').onchange = async e => {
    const a = e.target.files[0]; if (!a) return;
    try { const Vd = await videoPronto(); await Vd.info(a); ligarExtra(id, a); salvarProj(); abrirEditor(id); toast('Vídeo de baixo adicionado'); }
    catch (err) { alert(err.message); }
  };
  if ($('#ed-v2x')) $('#ed-v2x').onclick = () => { ligarExtra(id, null); salvarProj(); abrirEditor(id); };
  // arrastar textos: posição do mouse -> pixels do canvas -> espaço 1080x1920
  let arr = null;
  const ponto = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; };
  cv.onpointerdown = e => {
    const [px, py] = ponto(e), b = stage.caixaEm(px, py); if (!b) return;
    arr = { k: b.k, x: px, y: py, base: { ...(st.desl[b.k] || { dx: 0, dy: 0 }) } };
    stage.foco = b.k; stage.dirty = true; cv.setPointerCapture(e.pointerId); e.preventDefault();
  };
  cv.onpointermove = e => {
    const [px, py] = ponto(e);
    if (!arr) { cv.style.cursor = stage.caixaEm(px, py) ? 'move' : 'default'; return; }
    st.desl[arr.k] = { dx: arr.base.dx + (px - arr.x) / stage.k, dy: arr.base.dy + (py - arr.y) / stage.k };
    stage.rebuild();
  };
  cv.onpointerup = () => { if (arr) { arr = null; salvarProj(); } };
}

const PARTE = 3 * 1024 * 1024; // limite das funções da Vercel é ~4,5 MB por envio
const dormir = ms => new Promise(ok => setTimeout(ok, ms));
// manda a cópia leve do vídeo para o Gemini (via painel) e devolve { uri, mime }. Reaproveita por 40 h (o Gemini guarda 48 h).
async function videoNoGemini(etapa) {
  const g = S.proj.gemini;
  if (g && g.uri && Date.now() - new Date(g.em).getTime() < 40 * 3600e3) return g;
  const Vd = await videoPronto();
  etapa('preparando uma cópia leve do vídeo...');
  const { blob, mime } = await Vd.copiaAnalise(ARQUIVOS.get(S.proj.id), x => etapa(`preparando uma cópia leve do vídeo... ${Math.round(x * 100)}%`));
  const id = Array.from(crypto.getRandomValues(new Uint8Array(10)), b => b.toString(16).padStart(2, '0')).join('');
  const partes = Math.max(1, Math.ceil(blob.size / PARTE));
  for (let n = 0; n < partes; n++) {
    etapa(`enviando o vídeo para a IA... ${Math.round(n / partes * 100)}%`);
    const r = await fetch(`/api/fabrica?acao=parte&id=${id}&n=${n}`, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/octet-stream' }, body: blob.slice(n * PARTE, (n + 1) * PARTE) });
    if (r.status === 401) { semLogin(); throw new Error('Faça login no painel para continuar.'); }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `Falha ao enviar o vídeo (${r.status}).`);
  }
  etapa('a IA está recebendo o vídeo...');
  let f = await api('enviar-video', { id, partes, mime });
  for (let i = 0; i < 90 && f.state === 'PROCESSING'; i++) {
    etapa('a IA está processando o vídeo...');
    await dormir(2000);
    f = await api('arquivo', undefined, '&nome=' + encodeURIComponent(f.name));
  }
  if (f.state !== 'ACTIVE') throw new Error(`O Gemini não conseguiu processar o vídeo (${f.state}).`);
  S.proj.gemini = { uri: f.uri, mime: f.mime || mime, em: new Date().toISOString() }; salvarProj();
  return S.proj.gemini;
}
async function rodarRaiox() {
  if (S.rxRodando || !S.proj) return;
  S.rxRodando = true; S.rxErro = null; S.rxEtapa = '';
  const etapa = t => { S.rxEtapa = t; if ($('#rx')) { $('#rx').className = 'rx'; $('#rx').innerHTML = rxHTML(); } };
  etapa('começando...');
  const pid = S.proj.id;
  try {
    let v;
    try { v = await videoNoGemini(etapa); }
    catch (e) { if (S.proj.gemini) { S.proj.gemini = null; v = await videoNoGemini(etapa); } else throw e; }
    etapa('a IA está assistindo o criativo...');
    let r;
    try { r = await api('raiox', { uri: v.uri, mime: v.mime, prompt: preencher(promptDe('_raiox'), vars(Bobj())), ids: FORMATOS.map(f => f.id) }); }
    catch (e) {
      // o arquivo pode ter expirado no Gemini: manda de novo uma vez
      if (!/not found|expired|PERMISSION|404|403/i.test(e.message)) throw e;
      S.proj.gemini = null; v = await videoNoGemini(etapa); etapa('a IA está assistindo o criativo...');
      r = await api('raiox', { uri: v.uri, mime: v.mime, prompt: preencher(promptDe('_raiox'), vars(Bobj())), ids: FORMATOS.map(f => f.id) });
    }
    if (S.proj?.id === pid) { S.proj.raiox = r; salvarProj(); }
  } catch (e) { S.rxErro = e.message; }
  S.rxRodando = false;
  if (S.passo === 'formatos') viewFormatos();
  S.stages.forEach(s => { s.dirty = true; });
}
async function pool(itens, n, fn) {
  const fila = [...itens];
  await Promise.all(Array.from({ length: Math.min(n, fila.length) }, async () => { while (fila.length) await fn(fila.shift()); }));
}
function overlay(t) {
  const el = document.createElement('div'); el.className = 'ov';
  el.innerHTML = `<div class="ov-c"><div class="spin g"></div><b>${h(t)}</b><p></p><div class="barra"><i></i></div></div>`;
  document.body.appendChild(el);
  return {
    msg: (a, b) => { $('b', el).textContent = a; $('p', el).textContent = b || ''; },
    prog: (x, b) => { $('.barra i', el).style.width = Math.round(x * 100) + '%'; if (b != null) $('p', el).textContent = b; },
    fechar: () => el.remove()
  };
}
async function escreverFormato(id) {
  const f = FMT[id];
  const r = await api('textos', { prompt: preencher(promptDe(id), vars(Bobj())), campos: f.campos.map(c => ({ k: c.k, rotulo: c.rotulo, max: c.max, dest: !!c.dest })) });
  const st = pf(id); st.textos = { ...st.textos, ...r.textos }; st.ia = true;
}
async function gerarTextos() {
  const ids = [...S.proj.selecionados]; if (!ids.length) return;
  ids.forEach(pf);
  if (!temIA()) { salvarProj(); return irPara('revisao'); }
  const ov = overlay('Preparando...');
  const erros = [];
  try {
    if (!S.proj.raiox) {
      ov.msg('Lendo o criativo...', 'A IA está assistindo o vídeo e identificando as particularidades.');
      S.rxErro = null; await rodarRaiox();
      if (S.rxErro) erros.push('Raio-x: ' + S.rxErro);
    }
    ov.msg('Escrevendo os textos de cada formato...', `0 de ${ids.length}`);
    let feitos = 0;
    await pool(ids, 3, async id => {
      try { await escreverFormato(id); } catch (e) { erros.push(`${FMT[id].nome}: ${e.message}`); }
      feitos++; ov.prog(feitos / ids.length, `${feitos} de ${ids.length}`);
    });
    salvarProj();
  } finally { ov.fechar(); }
  if (erros.length) alert('Alguns formatos ficaram com o texto de exemplo (você pode editar ou tentar de novo na revisão):\n\n' + erros.join('\n'));
  irPara('revisao');
}

/* ---------------- 4. revisão ---------------- */
const len = s => [...String(s ?? '')].length;
function cardRev(f, B) {
  const st = pf(f.id), T = Tobj(f, B), slots = f.slots(B, T);
  const fr = i => st.frames[i] || {};
  const rngF = (i, k, rot, a, b) => `<div class="rng"><span>${rot}</span><input type="range" data-fr="${i}:${k}" min="${a}" max="${b}" step="0.01" value="${fr(i)[k] ?? (k === 'zoom' ? 1 : 0.5)}"></div>`;
  return `<article class="rv ${st.incluir === false ? 'fora' : 'aprovado'}" id="rv-${f.id}" data-id="${f.id}">
    <div class="tela"><canvas width="360" height="640"></canvas></div>
    <div class="rv-c">
      <div class="linha entre"><h2>${h(f.nome)} <span class="pill ${statusDe(f.id)}">${statusDe(f.id) === 'encaixa' ? 'Encaixa' : 'Adaptar'}</span></h2></div>
      <div class="campos">${f.campos.map(c => {
        const v = T[c.k] ?? '';
        const campo = c.max > 60 ? `<textarea data-k="${c.k}" rows="${c.max > 140 ? 4 : 2}">${h(v)}</textarea>` : `<input data-k="${c.k}" value="${h(v)}">`;
        return `<label class="campo"><span>${h(c.rotulo)} ${st.ia ? '<i class="tag">IA</i>' : ''}<small data-cont="${c.k}" class="${len(v) > c.max ? 'over' : ''}">${len(v)}/${c.max}</small></span>${campo}</label>`;
      }).join('')}</div>
      <details class="enq"><summary>Enquadramento do vídeo</summary>${slots.map((s, i) => `<div class="slot"><b>${slots.length > 1 ? `Vídeo ${i + 1}` : 'Vídeo'} <button class="link" data-auto="${i}">automático</button></b>${rngF(i, 'zoom', 'Zoom', 1, 3)}${rngF(i, 'px', 'Horizontal', 0, 1)}${rngF(i, 'py', 'Vertical', 0, 1)}</div>`).join('')}</details>
      <div class="linha"><button class="btn sec p" data-editar-tela>✎ Editar na tela</button><button class="btn sec p" data-ia ${temIA() ? '' : 'hidden'}>↻ Reescrever com IA</button><button class="btn sec p" data-ampliar>⤢ Ampliar prévia</button><label class="inc btn sec p"><input type="checkbox" data-inc ${st.incluir !== false ? 'checked' : ''}> Aprovado para exportar</label></div>
    </div></article>`;
}
function viewRevisao() {
  if (!S.proj) return semProj();
  const ids = S.proj.selecionados;
  if (!ids.length) {
    main.innerHTML = '<section class="painel estreito"><h1>Nenhum formato escolhido</h1><p class="sub">Escolha os formatos no catálogo.</p><div class="acoes"><button class="btn pri" id="ir-f">Ir para o catálogo →</button></div></section>';
    $('#ir-f').onclick = () => irPara('formatos'); return;
  }
  const B = Bobj();
  main.innerHTML = `<section class="painel"><h1>Revise seus formatos</h1><p class="sub" style="margin:0">Confira os textos e o enquadramento. Todos já vêm aprovados para exportar: desmarque o que não quiser. Palavras entre *asteriscos* ficam na cor de destaque da marca.</p></section>
    <div class="rev">${ids.map(id => cardRev(FMT[id], B)).join('')}</div>
    <div class="rodape"><button class="btn sec" id="voltar">← Formatos</button><span id="n-inc"></span><button class="btn pri" id="exportar">Exportar vídeos →</button></div>`;
  const conta = () => { const n = ids.filter(id => pf(id).incluir !== false).length; $('#n-inc').textContent = `${n} de ${ids.length} aprovados para exportar`; $('#exportar').disabled = !n; };
  conta();
  $$('.rv').forEach(el => {
    const id = el.dataset.id, f = FMT[id], st = pf(id);
    const stage = new Stage($('canvas', el), f);
    const redesenha = debounce(() => stage.rebuild(), 120);
    $$('[data-k]', el).forEach(inp => inp.oninput = () => {
      const c = f.campos.find(x => x.k === inp.dataset.k);
      st.textos[c.k] = inp.value;
      const ct = $(`[data-cont="${c.k}"]`, el); ct.textContent = `${len(inp.value)}/${c.max}`; ct.classList.toggle('over', len(inp.value) > c.max);
      redesenha(); salvarProj();
    });
    $$('[data-fr]', el).forEach(r => r.oninput = () => {
      const [i, k] = r.dataset.fr.split(':');
      st.frames[i] = { ...(st.frames[i] || {}), [k]: +r.value };
      stage.dirty = true; salvarProj();
    });
    $$('[data-auto]', el).forEach(b => b.onclick = e => {
      e.preventDefault(); const i = +b.dataset.auto;
      st.frames[i] = {}; stage.dirty = true; salvarProj();
      $$(`[data-fr^="${i}:"]`, el).forEach(r => { r.value = r.dataset.fr.endsWith('zoom') ? 1 : 0.5; });
    });
    $('[data-inc]', el).onchange = e => { st.incluir = e.target.checked; el.classList.toggle('fora', !st.incluir); el.classList.toggle('aprovado', st.incluir); conta(); salvarProj(); };
    $('[data-editar-tela]', el).onclick = () => abrirEditor(id);
    $('[data-ampliar]', el).onclick = () => ampliar(f);
    $('[data-ia]', el).onclick = async e => {
      const b = e.target; b.disabled = true; b.innerHTML = '<span class="spin"></span> Escrevendo...';
      try {
        await escreverFormato(id); salvarProj(); editarFormato(id);
      } catch (err) { alert(err.message); b.disabled = false; b.textContent = '↻ Reescrever com IA'; }
    };
  });
  $('#voltar').onclick = () => irPara('formatos');
  $('#exportar').onclick = exportar;
}
function editarFormato(id) {
  S.passo = 'revisao'; ls.set('passo', 'revisao'); render();
  const el = $('#rv-' + id); if (el) el.scrollIntoView({ block: 'center' });
}
function ampliar(f) {
  const m = $('#modal');
  m.innerHTML = `<div class="mod-fundo"><div class="mod"><div class="tela"><canvas width="720" height="1280"></canvas></div>
    <div class="linha centro"><button class="btn sec p" id="md-play">${V.paused ? '▶ Tocar' : '❚❚ Pausar'}</button><button class="btn sec p" id="md-som">${V.muted ? '🔇 Ligar som' : '🔊 Desligar som'}</button><button class="btn pri p" id="md-x">Fechar</button></div></div></div>`;
  new Stage($('canvas', m), f);
  const fechar = () => { m.innerHTML = ''; V.muted = true; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  $('#md-x').onclick = fechar;
  $('.mod-fundo', m).onclick = e => { if (e.target.classList.contains('mod-fundo')) fechar(); };
  $('#md-play').onclick = e => { if (V.paused) { V.play(); e.target.textContent = '❚❚ Pausar'; } else { V.pause(); e.target.textContent = '▶ Tocar'; } };
  $('#md-som').onclick = e => { V.muted = !V.muted; e.target.textContent = V.muted ? '🔇 Ligar som' : '🔊 Desligar som'; if (!V.muted) V.play(); };
}

/* ---------------- 5. exportar ----------------
   Os vídeos são montados aqui no navegador (fabrica/video.js), um formato por vez, e baixados direto. */
const limparNome = s => String(s).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'video';
let fila = Promise.resolve();
async function exportar() {
  const ids = S.proj.selecionados.filter(id => pf(id).incluir !== false);
  if (!ids.length) return toast('Nenhum formato marcado para entrega');
  await R.fontes(Bobj());
  const B = Bobj(), pid = S.proj.id;
  ids.forEach(id => {
    const f = FMT[id], antigo = S.jobs[id];
    if (antigo && (antigo.status === 'fila' || antigo.status === 'gerando')) return;
    if (antigo?.url) URL.revokeObjectURL(antigo.url);
    // camadas e enquadramento congelados no momento do clique (editar depois não muda o que já está na fila)
    const T = Tobj(f, B), camadas = R.fixas(f, B, T, JSON.parse(JSON.stringify(desl(f)))), frames = JSON.parse(JSON.stringify(Fobj(f))), rosto = face();
    const extra = EXTRAS.get(id)?.arquivo || null;
    const job = S.jobs[id] = { id, nome: f.nome, status: 'fila', progresso: 0, url: null, arquivo: limparNome(`${f.nome} - ${S.proj.nome}`) + '.mp4', erro: null };
    fila = fila.then(async () => {
      if (S.proj?.id !== pid || S.jobs[id] !== job) return;
      job.status = 'gerando'; atualizarExport();
      try {
        const Vd = await videoPronto();
        const desenhar = (ctx, amostra, amostra2) => {
          ctx.drawImage(camadas.base, 0, 0);
          camadas.slots.forEach((sl, i) => (i === 1 && amostra2 ? R.slot(ctx, amostra2, sl, frames[i], null) : R.slot(ctx, amostra, sl, frames[i], rosto)));
          ctx.drawImage(camadas.topo, 0, 0);
        };
        const blob = await Vd.exportar(ARQUIVOS.get(pid), desenhar, x => { job.progresso = Math.min(99, Math.round(x * 100)); atualizarExport(); }, { extra });
        job.url = URL.createObjectURL(blob); job.tamanho = blob.size; job.status = 'ok'; job.progresso = 100;
        DB.guardarVideo({ id: `${pid}:${id}`, projetoId: pid, projetoNome: S.proj?.nome || '', formatoId: id, formatoNome: f.nome, marcaNome: B.nome || '', arquivo: job.arquivo, blob, tamanho: blob.size, criado: new Date().toISOString() })
          .catch(e => toast('Não consegui guardar na Biblioteca: ' + e.message));
      } catch (e) { job.status = 'erro'; job.erro = e.message; console.error('[exportar]', id, e); }
      atualizarExport();
    });
  });
  irPara('exportar');
}
const ST = { fila: 'Na fila', gerando: 'Gerando', ok: '✓ Concluído', erro: 'Erro' };
const mb = n => (n / 1048576).toFixed(1).replace('.', ',') + ' MB';
function viewExportar() {
  if (!S.proj) return semProj();
  main.innerHTML = `<section class="painel"><div class="linha entre"><div><h1 id="ex-tit">Seus vídeos</h1><p class="sub" id="ex-sub" style="margin:0"></p></div><button class="btn sec" id="baixar-todos" disabled>↓ Baixar todos</button></div>
    <div class="barra"><i id="ex-bar"></i></div><div id="ex-lista" class="ex-lista"></div>
    <p class="dica">Os vídeos são montados neste computador. Deixe esta aba aberta até terminar.</p>
    <div class="acoes"><button class="btn sec" id="ex-voltar">← Voltar à edição</button></div></section>`;
  $('#ex-voltar').onclick = () => irPara('revisao');
  $('#ex-lista').onclick = e => {
    const b = e.target.closest('[data-editar]'); if (b) return abrirEditor(b.dataset.editar);
    const v = e.target.closest('[data-ver]'); if (v) visualizar(S.jobs[v.dataset.ver]);
  };
  $('#baixar-todos').onclick = async () => {
    for (const j of Object.values(S.jobs).filter(x => x.status === 'ok')) { baixar(j); await dormir(700); }
  };
  atualizarExport();
}
/* ---------------- biblioteca: todos os vídeos exportados neste navegador ---------------- */
let urlsBib = [];
async function viewBiblioteca() {
  urlsBib.forEach(u => URL.revokeObjectURL(u)); urlsBib = [];
  main.innerHTML = '<section class="painel"><h1>Biblioteca</h1><p class="sub"><span class="spin"></span> Carregando os vídeos...</p></section>';
  let vids = [];
  try { vids = (await DB.videos()).sort((a, b) => String(b.criado).localeCompare(String(a.criado))); }
  catch (e) { main.innerHTML = `<section class="painel"><h1>Biblioteca</h1><p class="sub">Não consegui abrir a Biblioteca: ${h(e.message)}</p></section>`; return; }
  if (S.passo !== 'biblioteca') return;
  const total = vids.reduce((a, v) => a + (v.tamanho || 0), 0);
  const criativos = [...new Set(vids.map(v => v.projetoNome).filter(Boolean))];
  const filtro = S.bibFiltro || '';
  const lista = filtro ? vids.filter(v => v.projetoNome === filtro) : vids;
  main.innerHTML = `<section class="painel">
    <div class="linha entre"><div><h1>Biblioteca</h1><p class="sub" style="margin:0">${vids.length} ${vids.length === 1 ? 'vídeo exportado' : 'vídeos exportados'} · ${mb(total)} · guardados neste navegador</p></div>
      <div class="linha">${criativos.length > 1 ? `<select id="bib-f"><option value="">Todos os criativos</option>${criativos.map(c => `<option ${c === filtro ? 'selected' : ''}>${h(c)}</option>`).join('')}</select>` : ''}<button class="btn sec" id="bib-todos" ${lista.length ? '' : 'disabled'}>↓ Baixar todos</button></div></div>
    ${lista.length ? `<div class="bib">${lista.map(v => {
      const u = URL.createObjectURL(v.blob); urlsBib.push(u);
      return `<article class="bib-item" data-id="${h(v.id)}"><div class="tela"><video src="${u}#t=0.6" preload="metadata" muted playsinline></video><button class="bib-play" data-ver aria-label="Visualizar">▶</button></div>
        <b title="${h(v.arquivo)}">${h(v.formatoNome)}</b><small title="${h(v.projetoNome)}">${h(v.projetoNome)}${v.marcaNome ? ' · ' + h(v.marcaNome) : ''}</small>
        <small>${new Date(v.criado).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${mb(v.tamanho || 0)}</small>
        <div class="linha"><button class="btn sec p" data-ver>▶ Visualizar</button><a class="btn sec p" href="${u}" download="${h(v.arquivo)}">↓ Baixar</a><button class="btn sec p perigo" data-apagar title="Excluir da Biblioteca">✕</button></div></article>`;
    }).join('')}</div>` : '<div class="vazio" style="margin-top:20px">Nenhum vídeo exportado ainda. Os vídeos aparecem aqui assim que terminam de ser gerados.</div>'}
  </section>`;
  const porId = id => lista.find(v => v.id === id);
  const urlDe = el => $('a[download]', el).href;
  $$('.bib-item').forEach(el => {
    $$('[data-ver]', el).forEach(b => b.onclick = () => visualizar({ status: 'ok', url: urlDe(el), arquivo: porId(el.dataset.id).arquivo }));
    $('[data-apagar]', el).onclick = async () => {
      const v = porId(el.dataset.id);
      if (!confirm(`Excluir "${v.arquivo}" da Biblioteca?`)) return;
      await DB.apagarVideo(v.id); toast('Vídeo excluído'); viewBiblioteca();
    };
  });
  if ($('#bib-f')) $('#bib-f').onchange = e => { S.bibFiltro = e.target.value; viewBiblioteca(); };
  $('#bib-todos').onclick = async () => { for (const el of $$('.bib-item')) { $('a[download]', el).click(); await dormir(700); } };
}

/* toca o vídeo pronto numa janela por cima da tela */
function visualizar(j) {
  if (!j || j.status !== 'ok') return;
  const m = $('#modal');
  m.innerHTML = `<div class="mod-fundo"><div class="mod ver"><video src="${j.url}" controls autoplay playsinline></video>
    <div class="linha centro"><b class="ver-nome">${h(j.arquivo)}</b><a class="btn sec p" href="${j.url}" download="${h(j.arquivo)}">↓ Baixar</a><button class="btn pri p" id="ver-x">Fechar</button></div></div></div>`;
  const fechar = () => { m.innerHTML = ''; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  $('#ver-x').onclick = fechar;
  $('.mod-fundo', m).onclick = e => { if (e.target.classList.contains('mod-fundo')) fechar(); };
}
function baixar(j) { const a = document.createElement('a'); a.href = j.url; a.download = j.arquivo; document.body.appendChild(a); a.click(); a.remove(); }
function atualizarExport() {
  if (S.passo !== 'exportar' || !S.proj || !$('#ex-lista')) return;
  const lista = Object.values(S.jobs), box = $('#ex-lista');
  if (!lista.length) {
    $('#ex-tit').textContent = 'Nenhum vídeo gerado ainda';
    $('#ex-sub').textContent = 'Revise os formatos e clique em "Exportar vídeos".';
    box.innerHTML = ''; return;
  }
  const rodando = lista.some(j => j.status === 'fila' || j.status === 'gerando');
  const ok = lista.filter(j => j.status === 'ok').length;
  $('#ex-tit').textContent = rodando ? 'Preparando seus vídeos' : 'Seus vídeos estão prontos';
  $('#ex-sub').textContent = rodando ? `Gerando um formato por vez · ${ok} de ${lista.length} prontos.` : `${ok} ${ok === 1 ? 'formato pronto' : 'formatos prontos'} para baixar.`;
  $('#ex-bar').style.width = Math.round(lista.reduce((a, j) => a + (j.status === 'ok' || j.status === 'erro' ? 100 : j.progresso), 0) / lista.length) + '%';
  $('#baixar-todos').disabled = !ok;
  lista.forEach(j => {
    let row = $(`[data-job="${j.id}"]`, box);
    if (!row) {
      row = document.createElement('div'); row.className = 'ex'; row.dataset.job = j.id;
      row.innerHTML = `<div class="tela"><canvas width="108" height="192"></canvas></div><div><b>${h(j.nome)}</b><small data-arq></small></div><span class="st" data-st></span><div class="linha"><button class="btn sec p" data-ver="${j.id}">▶ Visualizar</button><a class="btn sec p" data-baixar>↓ Baixar</a><button class="btn sec p" data-editar="${j.id}">✎ Editar</button></div>`;
      box.appendChild(row);
      if (FMT[j.id]) new Stage($('canvas', row), FMT[j.id]);
    }
    const st = $('[data-st]', row);
    st.className = 'st ' + j.status;
    st.textContent = j.status === 'gerando' ? `Gerando ${j.progresso}%` : ST[j.status];
    $('[data-arq]', row).innerHTML = j.status === 'erro' ? `<span class="erro-msg">${h(j.erro)}</span>` : h(j.arquivo + (j.tamanho ? ' · ' + mb(j.tamanho) : ''));
    const a = $('[data-baixar]', row);
    if (j.status === 'ok') { a.href = j.url; a.download = j.arquivo; a.removeAttribute('aria-disabled'); } else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
    $('[data-ver]', row).disabled = j.status !== 'ok';
  });
}

/* ---------------- prompts ---------------- */
function viewPrompts() {
  const sel = S.promptSel;
  const nome = sel === '_raiox' ? 'Raio-x do criativo' : FMT[sel].nome;
  const itens = [['_raiox', 'Raio-x do criativo'], ...FORMATOS.map(f => [f.id, f.nome])];
  main.innerHTML = `<div class="grade-p"><aside class="painel lista-p">${itens.map(([k, n]) => `<button data-p="${k}" class="${k === sel ? 'on' : ''}"><span>${h(n)}</span>${S.prompts[k] ? '<i class="tag">editado</i>' : ''}</button>`).join('')}</aside>
    <section class="painel"><h1>${h(nome)}</h1>
      <p class="sub">Este prompt é preenchido com a identidade da organização selecionada (<b>${h(marca()?.nome || '')}</b>) e com o raio-x do vídeo. Clique numa variável para inserir no cursor.</p>
      <div class="vars">${VARS.map(([k, d]) => `<button data-v="${k}" title="${h(d)}">{{${k}}}</button>`).join('')}</div>
      <textarea id="p-txt" rows="20" class="mono">${h(promptDe(sel))}</textarea>
      <p class="dica">${sel === '_raiox' ? 'O formato da resposta (JSON) é acrescentado automaticamente no final.' : 'Os campos e o formato da resposta (JSON) são acrescentados automaticamente: ' + FMT[sel].campos.map(c => `${c.k} (máx. ${c.max})`).join(', ') + '.'}</p>
      <div class="acoes"><button class="btn sec" id="p-reset">Restaurar padrão</button><button class="btn sec" id="p-ver">Ver preenchido</button><button class="btn pri" id="p-salvar">Salvar prompt</button></div>
      <pre id="p-prev" class="mono prev" hidden></pre>
    </section></div>`;
  $('.lista-p').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { S.promptSel = b.dataset.p; viewPrompts(); } };
  const ta = $('#p-txt');
  $('.vars').onclick = e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const ins = `{{${b.dataset.v}}}`, a = ta.selectionStart, z = ta.selectionEnd;
    ta.value = ta.value.slice(0, a) + ins + ta.value.slice(z); ta.focus(); ta.selectionStart = ta.selectionEnd = a + ins.length;
  };
  const gravar = async () => { await api('prompts', { valor: S.prompts }); };
  $('#p-salvar').onclick = async () => {
    const padrao = sel === '_raiox' ? RAIOX_PADRAO : FMT[sel].prompt;
    if (ta.value.trim() === padrao.trim()) delete S.prompts[sel]; else S.prompts[sel] = ta.value;
    await gravar(); toast('Prompt salvo'); viewPrompts();
  };
  $('#p-reset').onclick = async () => { if (!confirm('Voltar este prompt para o padrão?')) return; delete S.prompts[sel]; await gravar(); toast('Prompt restaurado'); viewPrompts(); };
  $('#p-ver').onclick = () => { const p = $('#p-prev'); p.hidden = !p.hidden; p.textContent = preencher(ta.value, vars(Bobj())); };
}

/* ---------------- início ---------------- */
(async function iniciar() {
  try {
    const e = await api('estado');
    S.ia = e.ia; S.marcas = e.marcas || []; S.prompts = e.prompts || {};
  } catch (err) {
    if (/login/i.test(err.message)) return; // a tela de "entre no painel" já apareceu
    main.innerHTML = `<section class="painel estreito"><h1>Não consegui falar com o servidor</h1><p class="sub">${h(err.message)}. Recarregue a página em instantes.</p></section>`; return;
  }
  if (!S.marcas.length) { S.marcas.push(novaMarca()); salvarMarcas(); }
  const pid = ls.get('proj');
  if (pid) { try { await abrirGuardado(pid); } catch { /* criativo não está mais guardado neste navegador */ } }
  S.passo = !temIA() && !ls.get('viuConfig') ? 'config' : (ls.get('passo') || 'criativo');
  ls.set('viuConfig', '1');
  if (!S.proj && !['config', 'prompts', 'marca'].includes(S.passo)) S.passo = 'criativo';
  render();
})();
