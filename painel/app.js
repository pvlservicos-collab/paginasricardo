// Painel de Páginas · Grupo R1
// Roda só em /painel. As páginas publicadas não carregam nada daqui.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('pt-BR'));
const pct = (n) => (n == null ? '—' : (n * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
const kb = (bytes) => (bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' KB';
const CORES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

const I = {
  grade: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  funil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 4h18l-7 8.5V19l-4 2v-8.5z"/></svg>',
  metricas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 20h18M7 16V10M12 16V5M17 16v-4"/></svg>',
  mais: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pulso: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  codigo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 7-5 5 5 5M16 7l5 5-5 5"/></svg>',
  ajuste: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  pontos: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>',
  cima: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  baixo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  fechar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  imagens: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  imagem: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  alerta: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  sair: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/></svg>',
  globo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
};

const E = {
  cfg: null, usuario: null, rastreio: {}, podeGravar: false, usandoGitHub: false, temRedis: false, temHubspot: false,
  deploy: {}, publicando: false, versao: Date.now().toString(36),
  dominiosStatus: {}, imagens: null, otimizar: true, filtroGrupo: (() => { try { return localStorage.getItem('r1-filtro-grupo') || 'todos'; } catch { return 'todos'; } })(),
  status: {}, verificando: false, metricas: null, dias: 7, copias: null, psi: {},
  vista: 'grade', previa: 'celular', funilPrevia: true,
};

const ehAdmin = () => E.usuario?.papel === 'admin';
const EM_OBRA = ['funil', 'metricas']; // funções em construção: só o admin abre

/* ================= API ================= */
async function api(caminho, { method = 'GET', body } = {}) {
  const r = await fetch('/api/' + caminho, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && caminho !== 'login') { telaLogin(); throw new Error('Sessão expirada.'); }
  if (!r.ok) throw new Error(d.erro || `Erro ${r.status}`);
  return d;
}

function toast(msg, tipo = '') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), tipo === 'bad' ? 7000 : 4200);
}

/* ================= login ================= */
function telaLogin() {
  $('#app').innerHTML = `
  <div class="login"><form id="f-login" autocomplete="on">
    <div class="marca"><i>R1</i><span>Painel de Páginas</span></div>
    <h1>Entrar</h1><p>Gestão das páginas do Ricardo Nunes.</p>
    <label class="campo"><span>E-mail ou usuário</span><input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="160" required autofocus></label>
    <label class="campo"><span>Senha</span><input name="senha" type="password" autocomplete="current-password" maxlength="200" required></label>
    <div class="erro-msg" id="login-erro"></div>
    <button class="bt bt-ouro bt-cheio" type="submit">Entrar</button>
  </form></div>`;
  $('#f-login').onsubmit = async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const bt = $('button', ev.target);
    bt.disabled = true;
    try {
      await api('login', { method: 'POST', body: { usuario: f.get('usuario'), senha: f.get('senha') } });
      iniciar();
    } catch (e) {
      $('#login-erro').textContent = e.message;
      bt.disabled = false;
    }
  };
}

/* ================= carga ================= */
async function carregarPaginas(copias = false) {
  const d = await api('paginas' + (copias ? '?copias=1' : ''));
  Object.assign(E, { cfg: d.config, usuario: d.usuario, rastreio: d.rastreio || {}, hosts: d.hosts || {}, hostPadrao: d.hostPadrao || location.host, podeGravar: d.podeGravar, usandoGitHub: d.usandoGitHub, usandoBanco: d.usandoBanco, temRedis: d.temRedis, temHubspot: d.temHubspot, deploy: d.deploy });
  if (d.copias) E.copias = d.copias;
  E.publicando = Boolean(d.deploy.publicado && d.deploy.atual && d.deploy.publicado !== d.deploy.atual);
  return d;
}

async function verificarStatus() {
  if (E.verificando) return;
  E.verificando = true;
  E.cfg.paginas.forEach((p) => (E.status[p.slug] = { ...(E.status[p.slug] || {}), estado: 'verificando' }));
  renderVista(false);
  try {
    const d = await api('status');
    d.resultados.forEach((r) => (E.status[r.slug] = r));
    const fora = d.resultados.filter((r) => r.estado === 'fora');
    if (fora.length) toast(`${fora.length} página(s) fora do ar.`, 'bad');
  } catch (e) {
    toast('Não consegui verificar o status: ' + e.message, 'bad');
  }
  E.verificando = false;
  renderVista(false);
}

async function carregarMetricas() {
  try {
    E.metricas = await api('metricas?dias=' + E.dias);
  } catch (e) {
    E.metricas = { erro: e.message, paginas: [], dias: [], avisos: [] };
  }
  renderVista(false);
}

async function carregarPsi() {
  try { E.psi = (await api('pagespeed')).notas || {}; } catch {}
}

/* ================= publicação ================= */
let vigia = null;
function depoisDeSalvar(msg) {
  if (!E.usandoGitHub) {
    E.versao = Date.now().toString(36);
    toast(msg + ' Já está no ar.', 'ok');
    return carregarPaginas(E.vista === 'funil').then(() => { render(); verificarStatus(); });
  }
  toast(msg + ' Publicando na Vercel (≈30 s)…', 'ok');
  E.publicando = true;
  return carregarPaginas(E.vista === 'funil').then(() => {
    E.publicando = true;
    render();
    vigiarDeploy();
  });
}

function vigiarDeploy() {
  clearInterval(vigia);
  let voltas = 0;
  vigia = setInterval(async () => {
    voltas++;
    try {
      const d = await api('paginas');
      E.deploy = d.deploy;
      if (!d.deploy.publicado || d.deploy.publicado === d.deploy.atual || voltas > 40) {
        clearInterval(vigia);
        E.publicando = false;
        E.versao = Date.now().toString(36);
        toast(voltas > 40 ? 'O deploy está demorando. Confira na Vercel.' : 'Publicado! As páginas já estão atualizadas.', voltas > 40 ? 'bad' : 'ok');
        render();
        verificarStatus();
      }
    } catch {}
  }, 8000);
}

/* ================= estrutura ================= */
function iniciar() {
  E.vista = (location.hash.slice(1) || 'grade').split('?')[0];
  if (!['grade', 'lista', 'imagens', 'funil', 'metricas'].includes(E.vista)) E.vista = 'grade';
  $('#app').innerHTML = '<div class="boot">Carregando páginas…</div>';
  carregarPaginas(E.vista === 'funil')
    .then(() => {
      render();
      verificarStatus();
      if (ehAdmin()) carregarMetricas();
      carregarDominios();
      if (E.vista === 'imagens') carregarImagens();
      carregarPsi();
      if (E.publicando) vigiarDeploy();
    })
    .catch((e) => { if (e.message !== 'Sessão expirada.') $('#app').innerHTML = `<div class="boot">${h(e.message)}</div>`; });
}

window.addEventListener('hashchange', () => {
  const v = location.hash.slice(1) || 'grade';
  if (v === E.vista || !E.cfg) return;
  E.vista = v;
  if (v === 'funil' && !E.copias && ehAdmin()) carregarPaginas(true).then(render);
  if (v === 'imagens' && !E.imagens) carregarImagens();
  render();
});

function render() {
  const nav = [['grade', 'Páginas'], ['lista', 'Lista'], ['imagens', 'Imagens'], ['funil', 'Funil'], ['metricas', 'Métricas']];
  const dep = E.publicando
    ? '<b><span class="ponto pulsa"></span>Publicando…</b>A Vercel está gerando a nova versão.'
    : E.usandoGitHub
      ? `<b><span class="ponto"></span>Tudo publicado</b><span class="mono">${h((E.deploy.atual || '').slice(0, 7))}</span>`
      : E.usandoBanco
        ? '<b><span class="ponto"></span>Tudo publicado</b>Banco de dados · cada alteração entra no ar em segundos.'
        : `<b><span class="ponto"></span>${E.podeGravar ? 'Modo local' : 'Somente leitura'}</b>${E.podeGravar ? 'Alterações gravadas na pasta.' : 'Conecte o banco Postgres na Vercel.'}`;
  $('#app').innerHTML = `
  <div class="app">
    <aside class="lado">
      <div class="marca"><i>R1</i><span>Páginas</span></div>
      <nav class="nav">${nav.map(([k, n]) => `<a href="#${k}" class="${E.vista === k ? 'on' : ''}">${I[k]}${n}${EM_OBRA.includes(k) ? '<em class="em-obra">em construção</em>' : ''}</a>`).join('')}</nav>
      <div class="fim">
        <div class="quem"><b>${h(E.usuario?.nome || '')}</b><span>${ehAdmin() ? 'Administrador' : 'Editor'}</span></div>
        <div class="deploy">${dep}</div>
        <button class="bt bt-sm" data-acao="claude" title="Publicar e editar páginas pelo Claude">${I.codigo}<span>Conectar ao Claude</span></button>
        <button class="bt bt-sm" data-acao="dominio" title="Domínios, pixels e Clarity">${I.globo}<span>Domínios e pixels</span></button>
        <button class="bt bt-sm" data-acao="sair">${I.sair}<span>Sair</span></button>
      </div>
    </aside>
    <main class="principal" id="conteudo"></main>
  </div>`;
  renderVista();
}

function avisosGerais() {
  if (!E.podeGravar) return `<div class="aviso">${I.alerta}<div><b>Modo somente leitura.</b> Para ativar/desativar, trocar URL e editar o HTML pelo painel, conecte um banco Postgres (Neon) ao projeto em Vercel → Storage e faça um Redeploy.</div></div>`;
  return '';
}

function renderVista(rolarTopo = true) {
  const c = $('#conteudo');
  if (!c) return;
  const scroll = window.scrollY;
  const v = EM_OBRA.includes(E.vista) && !ehAdmin() ? vistaEmObra : ({ grade: vistaGrade, lista: vistaLista, imagens: vistaImagens, funil: vistaFunil, metricas: vistaMetricas }[E.vista] || vistaGrade);
  c.innerHTML = avisosGerais() + v();
  $$('.nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + E.vista));
  ajustarTelas();
  if (!rolarTopo) window.scrollTo(0, scroll);
}

/* ================= peças ================= */
const ESTADOS = { online: 'No ar', fora: 'Fora do ar', pendente: 'Publicando', inativa: 'Desativada', redireciona: 'Redireciona', verificando: 'Verificando' };
function pill(p) {
  const s = E.status[p.slug];
  let estado = s?.estado || (p.ativa ? 'verificando' : 'inativa');
  if (!s && !E.verificando) estado = p.ativa ? 'pendente' : 'inativa';
  const tit = s?.http ? `HTTP ${s.http} · ${s.ms} ms${s.kb ? ' · ' + s.kb + ' KB' : ''}` : s?.erro || '';
  return `<span class="pill ${estado}" title="${h(tit)}">${ESTADOS[estado] || estado}</span>`;
}

const metricaDe = (slug) => E.metricas?.paginas?.find((m) => m.slug === slug);
const urlPublica = (p) => `https://${E.hosts?.[p.slug] || E.hostPadrao || location.host}/${p.url}`;
const srcPrevia = (p) => `/${p.url}?v=${E.versao}&r1previa=1`;

function notaPsi(slug, estrategia = 'mobile') {
  const n = E.psi[`${slug}:${estrategia}`]?.performance;
  if (n == null) return '<span class="mut">—</span>';
  const cls = n >= 90 ? 'boa' : n >= 50 ? 'media' : 'ruim';
  return `<span class="nota ${cls}" title="${h(E.psi[`${slug}:${estrategia}`].em || '')}">${n}</span>`;
}

function acoesPagina(p, { compacto = false } = {}) {
  const off = E.podeGravar ? '' : 'disabled';
  return `
    <label class="chave" title="${p.ativa ? 'Página no ar' : 'Página desativada'}"><input type="checkbox" data-acao="ativa" data-slug="${p.slug}" ${p.ativa ? 'checked' : ''} ${off}><i></i>${compacto ? '' : p.ativa ? 'Ativa' : 'Desativada'}</label>
    <span class="esp"></span>
    <button class="bt bt-sm" data-acao="editar" data-slug="${p.slug}" title="Editar HTML">${I.codigo}${compacto ? '' : 'HTML'}</button>
    <button class="bt bt-sm" data-acao="config" data-slug="${p.slug}" title="Configurar título e URL">${I.ajuste}${compacto ? '' : 'Ajustes'}</button>
    <div class="menu"><button class="bt bt-sm bt-icone" data-acao="menu" aria-label="Mais ações">${I.pontos}</button>
      <div class="menu-lista">
        <a href="${urlPublica(p)}" target="_blank" rel="noopener">${I.abrir}Abrir página</a>
        <button data-acao="duplicar" data-slug="${p.slug}" ${off}>Duplicar</button>
        <button data-acao="copiar-url" data-slug="${p.slug}">Copiar link</button>
        <button class="perigo" data-acao="excluir" data-slug="${p.slug}" ${off}>Excluir</button>
      </div>
    </div>`;
}

function topo(titulo, sub, acoes = '') {
  return `<div class="topo"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="acoes">${acoes}</div></div>`;
}

const botoesPadrao = () => `
  <button class="bt" data-acao="status" ${E.verificando ? 'disabled' : ''}>${I.pulso}${E.verificando ? 'Verificando…' : 'Verificar status'}</button>
  ${ehAdmin() ? `<button class="bt" data-acao="rastreio-dominio">${I.globo}Rastreamento por domínio</button>` : ''}
  <button class="bt" data-acao="grupos">${I.grade}Grupos</button>
  <button class="bt" data-acao="massa" ${E.podeGravar ? '' : 'disabled'}>${I.mais}Adicionar em massa</button>
  <button class="bt bt-ouro" data-acao="nova" ${E.podeGravar ? '' : 'disabled'}>${I.mais}Nova página</button>`;

/* ================= grupos (só organização do painel) ================= */
const grupoDe = (p) => (E.cfg.grupos || []).find((g) => g.id === p.grupo);
// Divide as páginas em seções por grupo, respeitando o filtro escolhido no topo.
function secoesPorGrupo(ps) {
  const grupos = E.cfg.grupos || [];
  if (!grupos.length) return [{ id: null, titulo: null, paginas: ps }];
  const f = E.filtroGrupo || 'todos';
  const secs = grupos.map((g) => ({ id: g.id, titulo: g.titulo, paginas: ps.filter((p) => p.grupo === g.id) }));
  secs.push({ id: 'sem', titulo: 'Sem grupo', paginas: ps.filter((p) => !grupoDe(p)) });
  const escolhidas = f === 'todos' ? secs.filter((x) => x.paginas.length || x.id !== 'sem') : secs.filter((x) => x.id === f);
  return escolhidas.length ? escolhidas : secs;
}
function filtrosGrupo() {
  const grupos = E.cfg.grupos || [];
  if (!grupos.length) return '';
  const f = E.filtroGrupo || 'todos';
  const n = (id) => E.cfg.paginas.filter((p) => (id === 'sem' ? !grupoDe(p) : p.grupo === id)).length;
  const chip = (id, t, qtd) => `<button class="chip ${f === id ? 'on' : ''}" data-acao="filtro-grupo" data-v="${h(id)}">${h(t)} <b>${qtd}</b></button>`;
  return `<div class="chips">${chip('todos', 'Todos', E.cfg.paginas.length)}${grupos.map((g) => chip(g.id, g.titulo, n(g.id))).join('')}${chip('sem', 'Sem grupo', n('sem'))}</div>`;
}
const tituloSecao = (x) => (x.titulo == null ? '' : `<div class="grupo-tit"><h2>${h(x.titulo)}</h2><span class="mut">${x.paginas.length} página(s)</span>${x.id !== 'sem' && E.podeGravar ? `<button class="bt bt-sm" data-acao="grupo-editar" data-v="${h(x.id)}">Editar grupo</button>` : ''}</div>`);
const vazioSecao = '<div class="vazio-grupo mut">Nenhuma página neste grupo ainda. Use “Editar grupo” ou a lista suspensa de grupo em cada página.</div>';

/* ================= vista: grade ================= */
function cardPagina(p, lw, lh) {
  const m = metricaDe(p.slug);
  return `<article class="card ${p.ativa ? '' : 'desligada'}">
      <div class="tela" data-w="${lw}" data-h="${lh}" style="${E.previa === 'celular' ? 'height:340px' : 'aspect-ratio:16/10'}">
        <iframe src="${srcPrevia(p)}" width="${lw}" height="${lh}" loading="lazy" tabindex="-1" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Prévia de ${h(p.titulo)}"></iframe>
        <span class="rotulo">${pill(p)}</span>
        <div class="cobre"><a class="bt bt-sm" href="${urlPublica(p)}" target="_blank" rel="noopener">${I.abrir}Abrir</a><span class="mono mut">${E.status[p.slug]?.ms ? E.status[p.slug].ms + ' ms' : ''}</span></div>
      </div>
      <div class="card-corpo">
        <div class="card-tit"><div><h3>${h(p.titulo)}</h3><a href="${urlPublica(p)}" target="_blank" rel="noopener">/${h(p.url)}</a></div></div>
        ${tagsRastreio(p)}
        ${ehAdmin() ? `<div class="mini">
          <div><span>Visitas ${E.dias}d</span><b class="num">${fmt(m?.visitas)}</b></div>
          <div><span>Leads</span><b class="num">${fmt(m?.leads)}</b></div>
          <div><span>Conversão</span><b class="num">${pct(m?.conversao)}</b></div>
        </div>` : ''}
        <div class="card-acoes">${acoesPagina(p)}</div>
      </div>
    </article>`;
}

function vistaGrade() {
  const ps = E.cfg.paginas;
  const no = ps.filter((p) => E.status[p.slug]?.estado === 'online').length;
  const sub = `${ps.length} página(s) · ${no} no ar · ${ps.filter((p) => !p.ativa).length} desativada(s)`;
  const seg = `<div class="seg"><button data-acao="previa" data-v="celular" class="${E.previa === 'celular' ? 'on' : ''}">Celular</button><button data-acao="previa" data-v="computador" class="${E.previa === 'computador' ? 'on' : ''}">Computador</button></div>`;
  if (!ps.length) return topo('Páginas', '', botoesPadrao()) + '<div class="vazio-geral">Nenhuma página ainda. Clique em “Nova página” ou “Adicionar em massa”.</div>';
  const [lw, lh] = E.previa === 'celular' ? [390, 844] : [1280, 800];
  return topo('Páginas', sub, seg + botoesPadrao()) + filtrosGrupo() +
    secoesPorGrupo(ps).map((x) => tituloSecao(x) + (x.paginas.length ? `<div class="grade">${x.paginas.map((p) => cardPagina(p, lw, lh)).join('')}</div>` : vazioSecao)).join('');
}

/* ================= vista: lista ================= */
function linhaPagina(p) {
  const m = metricaDe(p.slug), st = E.status[p.slug];
  return `<tr>
        <td><b>${h(p.titulo)}</b><br><a class="mono mut" href="${urlPublica(p)}" target="_blank" rel="noopener">/${h(p.url)}</a>${tagsRastreio(p)}</td>
        <td>${pill(p)}</td>
        <td class="dir mono">${st?.ms ? st.ms + ' ms' : '—'}</td>
        <td class="dir num">${fmt(m?.visitas)}</td>
        <td class="dir num">${fmt(m?.leads)}</td>
        <td class="dir num">${pct(m?.conversao)}</td>
        <td class="dir">${notaPsi(p.slug, 'mobile')}</td>
        <td class="dir">${notaPsi(p.slug, 'desktop')}</td>
        <td><div class="card-acoes">${acoesPagina(p, { compacto: true })}</div></td>
      </tr>`;
}

function vistaLista() {
  const ps = E.cfg.paginas;
  const cab = `<thead><tr><th>Página</th><th>Status</th><th class="dir">Resposta</th><th class="dir">Visitas ${E.dias}d</th><th class="dir">Leads</th><th class="dir">Conv.</th><th class="dir">Google celular</th><th class="dir">Google PC</th><th></th></tr></thead>`;
  return topo('Lista', 'Todas as páginas com status, números e nota do Google.', botoesPadrao()) + filtrosGrupo() +
    secoesPorGrupo(ps).map((x) => tituloSecao(x) + (x.paginas.length ? `<div class="tabela-wrap"><table>${cab}<tbody>${x.paginas.map(linhaPagina).join('')}</tbody></table></div>` : vazioSecao)).join('');
}

/* ================= janela de grupos ================= */
function abrirGrupos() {
  const grupos = E.cfg.grupos || [];
  const n = (id) => E.cfg.paginas.filter((p) => p.grupo === id).length;
  const md = modal({
    titulo: 'Grupos de páginas',
    corpo: `<p class="mut" style="margin-top:0">Junte várias páginas sob um título para ver tudo organizado. Não muda nada nas páginas no ar.</p>
      ${grupos.length ? `<ul class="cad-lista">${grupos.map((g) => `<li><b>${h(g.titulo)}</b><span class="mut">${n(g.id)} página(s)</span><button class="bt bt-sm" data-grupo-editar="${h(g.id)}">Editar</button>${E.podeGravar ? `<button class="bt bt-sm bt-icone bt-perigo" data-grupo-excluir="${h(g.id)}" title="Excluir grupo" aria-label="Excluir grupo">${I.fechar}</button>` : ''}</li>`).join('')}</ul>` : '<p class="mut">Nenhum grupo ainda.</p>'}`,
    pe: `<button class="bt" data-fechar>Fechar</button><button class="bt bt-ouro" id="grupo-novo" ${E.podeGravar ? '' : 'disabled'}>${I.mais}Novo grupo</button>`,
  });
  $('#grupo-novo', md.el).onclick = () => abrirGrupo(null);
  md.el.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-grupo-editar]'), ex = e.target.closest('[data-grupo-excluir]');
    if (ed) abrirGrupo(ed.dataset.grupoEditar);
    if (ex) {
      const g = grupos.find((x) => x.id === ex.dataset.grupoExcluir);
      if (!(await confirmar('Excluir grupo', `Excluir o grupo <b>${h(g.titulo)}</b>? As páginas continuam existindo, só saem do grupo.`, 'Excluir', true))) { abrirGrupos(); return; }
      try { await api('paginas', { method: 'POST', body: { acao: 'grupo', tipo: 'excluir', id: g.id } }); await carregarPaginas(); render(); toast('Grupo excluído.'); abrirGrupos(); }
      catch (err) { toast(err.message, 'bad'); }
    }
  });
}

// Criar (id = null) ou editar um grupo: título + quais páginas entram nele.
function abrirGrupo(id, jaMarcadas = []) {
  const g = id ? (E.cfg.grupos || []).find((x) => x.id === id) : null;
  return new Promise((ok) => {
    const md = modal({
      titulo: g ? 'Editar grupo' : 'Novo grupo',
      corpo: `<label class="campo"><span>Título do grupo</span><input id="grupo-titulo" maxlength="80" value="${h(g?.titulo || '')}" placeholder="Ex.: Black Friday · Outubro"></label>
        <div class="grupo-paginas"><span class="mut">Páginas do grupo</span>${E.cfg.paginas.map((p) => {
          const marcada = g ? p.grupo === g.id : jaMarcadas.includes(p.slug);
          const outro = !marcada && grupoDe(p) ? ` <em class="mut">(hoje em ${h(grupoDe(p).titulo)})</em>` : '';
          return `<label class="chave"><input type="checkbox" value="${h(p.slug)}" ${marcada ? 'checked' : ''}><i></i>${h(p.titulo)} <span class="mono mut">/${h(p.url)}</span>${outro}</label>`;
        }).join('')}</div>`,
      pe: `<button class="bt" data-fechar>Cancelar</button><button class="bt bt-ouro" id="grupo-salvar" ${E.podeGravar ? '' : 'disabled'}>Salvar grupo</button>`,
      aoFechar: () => ok(null),
    });
    $('#grupo-titulo', md.el).focus();
    $('#grupo-salvar', md.el).onclick = async (e) => {
      const titulo = $('#grupo-titulo', md.el).value.trim();
      if (!titulo) { toast('Dê um título ao grupo.'); return; }
      const paginas = $$('.grupo-paginas input:checked', md.el).map((c) => c.value);
      e.target.disabled = true;
      try {
        const r = await api('paginas', { method: 'POST', body: { acao: 'grupo', tipo: g ? 'renomear' : 'criar', id: g?.id, titulo, paginas } });
        md.fechar();
        await carregarPaginas();
        render();
        toast(g ? 'Grupo atualizado.' : `Grupo “${titulo}” criado.`, 'ok');
        ok(r.id);
      } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
    };
  });
}

/* ================= vista: funil ================= */
function vistaFunil() {
  const ps = E.cfg.paginas;
  if (!E.copias) { carregarPaginas(true).then(() => renderVista(false)); return topo('Funil', '') + '<div class="carregando">Lendo a copy das páginas…</div>'; }
  const seg = `<label class="chave"><input type="checkbox" data-acao="funil-previa" ${E.funilPrevia ? 'checked' : ''}><i></i>Prévia ao vivo</label>`;
  return topo('Funil', 'Todas as páginas, uma abaixo da outra. Coloque o criativo à direita para comparar com a copy.', seg + botoesPadrao()) +
  `<div class="funil">${ps.map((p, i) => {
    const c = E.copias[p.slug] || {};
    const m = metricaDe(p.slug);
    const img = p.criativo?.imagem ? `<img src="/api/criativo?arquivo=${encodeURIComponent(p.criativo.imagem)}" alt="Criativo de ${h(p.titulo)}" loading="lazy">` : `<div class="dica">${I.imagem}Arraste o criativo aqui<br>ou clique para escolher</div>`;
    return `${i ? '<div class="conector"><i></i></div>' : ''}
    <section class="etapa ${p.ativa ? '' : 'desligada'}" data-slug="${p.slug}">
      <div class="etapa-n">
        <b>${i + 1}</b>
        <button class="bt bt-icone" data-acao="subir" data-slug="${p.slug}" ${i === 0 || !E.podeGravar ? 'disabled' : ''} aria-label="Subir">${I.cima}</button>
        <button class="bt bt-icone" data-acao="descer" data-slug="${p.slug}" ${i === ps.length - 1 || !E.podeGravar ? 'disabled' : ''} aria-label="Descer">${I.baixo}</button>
      </div>
      <div class="etapa-pre">
        <div class="celular" data-w="390" data-h="760">${E.funilPrevia ? `<iframe src="${srcPrevia(p)}" width="390" height="760" loading="lazy" sandbox="allow-scripts" referrerpolicy="no-referrer" title="Prévia de ${h(p.titulo)}"></iframe>` : '<div class="vazio">Prévia desligada</div>'}</div>
        <div class="linha">${pill(p)}<a class="bt bt-sm" href="${urlPublica(p)}" target="_blank" rel="noopener">${I.abrir}Abrir</a></div>
      </div>
      <div>
        <div class="bloco-tit"><h4>Copy da página</h4><span class="mono mut">/${h(p.url)}</span></div>
        <div class="copy">
          <div><b style="font-family:var(--fd);font-size:16px">${h(p.titulo)}</b></div>
          ${c.topo ? `<div class="topo-faixa">${h(c.topo)}</div>` : ''}
          <div class="h1">${h(c.h1 || '(sem H1)')}</div>
          ${c.sub ? `<div class="sub">${h(c.sub)}</div>` : ''}
          ${c.ctas?.length ? `<div class="ctas">${c.ctas.slice(0, 4).map((t) => `<span>${h(t)}</span>`).join('')}</div>` : ''}
          ${c.h2?.length ? `<ul>${c.h2.slice(0, 7).map((t) => `<li>${h(t)}</li>`).join('')}</ul>` : ''}
          <div class="funil-mets"><span>Visitas <b>${fmt(m?.visitas)}</b></span><span>Leads <b>${fmt(m?.leads)}</b></span><span>Conv. <b>${pct(m?.conversao)}</b></span>${c.tamanho ? `<span>HTML <b>${kb(c.tamanho)}</b></span>` : ''}</div>
          ${p.notas ? `<div class="mut" style="font-size:13px">📝 ${h(p.notas)}</div>` : ''}
          <div class="card-acoes">${acoesPagina(p, { compacto: true })}</div>
        </div>
      </div>
      <div class="criativo">
        <div class="bloco-tit"><h4>Criativo do anúncio</h4>${p.criativo?.imagem && E.podeGravar ? `<button class="bt bt-sm bt-perigo" data-acao="tirar-criativo" data-slug="${p.slug}">Remover</button>` : ''}</div>
        <div class="criativo-img" data-acao="escolher-criativo" data-slug="${p.slug}" tabindex="0" role="button" aria-label="Escolher imagem do criativo">${img}</div>
        <input type="file" accept="image/*" hidden data-arquivo="${p.slug}">
        <label class="campo"><span>Copy do anúncio</span><textarea data-copy="${p.slug}" placeholder="Cole aqui o texto do anúncio para comparar com a página">${h(p.criativo?.texto || '')}</textarea></label>
        <label class="campo"><span>Link do anúncio (opcional)</span><input data-link="${p.slug}" value="${h(p.criativo?.link || '')}" placeholder="https://www.facebook.com/ads/library/?id=..."></label>
        <div class="acoes" style="margin-top:10px">${/^https?:[/][/]/i.test(p.criativo?.link || '') ? `<a class="bt bt-sm" href="${h(p.criativo.link)}" target="_blank" rel="noopener">${I.abrir}Ver anúncio</a>` : ''}<button class="bt bt-sm bt-ouro" data-acao="salvar-criativo" data-slug="${p.slug}" ${E.podeGravar ? '' : 'disabled'}>Salvar copy</button></div>
      </div>
    </section>`;
  }).join('')}</div>`;
}

/* ================= vista: métricas ================= */
function vistaMetricas() {
  const M = E.metricas;
  const seg = `<div class="seg">${[7, 14, 30].map((d) => `<button data-acao="dias" data-v="${d}" class="${E.dias === d ? 'on' : ''}">${d} dias</button>`).join('')}</div>`;
  if (!M) return topo('Métricas', '', seg) + '<div class="carregando">Carregando números…</div>';
  const ps = E.cfg.paginas;
  const tot = M.paginas.reduce((a, m) => ({ v: a.v + m.visitas, l: a.l + (m.leads || 0) }), { v: 0, l: 0 });
  const online = ps.filter((p) => E.status[p.slug]?.estado === 'online').length;
  const avisos = (M.avisos || []).map((a) => `<div class="aviso">${I.alerta}<div>${h(a)}</div></div>`).join('') + (M.erro ? `<div class="aviso">${I.alerta}<div>${h(M.erro)}</div></div>` : '');

  return topo('Métricas', 'Visitas contadas no servidor (sem nenhum script nas páginas) e leads do HubSpot.', seg) + avisos + `
  <div class="kpis">
    <div class="kpi"><span>Visitas</span><b class="num">${fmt(tot.v)}</b><small>últimos ${E.dias} dias</small></div>
    <div class="kpi"><span>Leads</span><b class="num">${M.temHubspot ? fmt(tot.l) : '—'}</b><small>${M.temHubspot ? 'inscrições no HubSpot' : 'HubSpot não conectado'}</small></div>
    <div class="kpi"><span>Conversão</span><b class="num">${M.temHubspot && tot.v ? pct(tot.l / tot.v) : '—'}</b><small>leads ÷ visitas</small></div>
    <div class="kpi"><span>No ar</span><b class="num">${online}/${ps.filter((p) => p.ativa).length}</b><small>páginas ativas respondendo</small></div>
  </div>
  <div class="painel-bloco"><h3>Visitas por dia</h3>${M.temRedis ? grafico(M) : '<p class="mut" style="margin:0">O gráfico aparece assim que o contador de visitas estiver ligado (veja o aviso acima).</p>'}</div>
  <div class="tabela-wrap"><table>
    <thead><tr><th>Página</th><th class="dir">Visitas</th><th class="dir">Leads</th><th class="dir">Conv.</th><th>Celular</th><th>Principais origens</th><th class="dir">Google celular</th><th class="dir">Google PC</th></tr></thead>
    <tbody>${ps.map((p) => {
      const m = metricaDe(p.slug) || {};
      const d = m.dispositivos || {};
      const totD = (d.celular || 0) + (d.computador || 0);
      const cel = totD ? (d.celular || 0) / totD : null;
      return `<tr>
        <td><b>${h(p.titulo)}</b><br><span class="mono mut">/${h(p.url)}</span></td>
        <td class="dir num">${fmt(m.visitas)}</td>
        <td class="dir num">${fmt(m.leads)}</td>
        <td class="dir num">${pct(m.conversao)}</td>
        <td>${cel == null ? '<span class="mut">—</span>' : `<div style="display:flex;align-items:center;gap:8px"><div class="barrinha"><i style="width:${Math.round(cel * 100)}%"></i></div><span class="num">${pct(cel)}</span></div>`}</td>
        <td><div class="fontes">${(m.fontes || []).slice(0, 3).map(([f, n]) => `<span><b>${h(f)}</b> ${fmt(n)}</span>`).join('') || '<span>—</span>'}</div></td>
        <td class="dir">${notaPsi(p.slug, 'mobile')} <button class="bt bt-sm" data-acao="psi" data-slug="${p.slug}" data-v="mobile">Medir</button></td>
        <td class="dir">${notaPsi(p.slug, 'desktop')} <button class="bt bt-sm" data-acao="psi" data-slug="${p.slug}" data-v="desktop">Medir</button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>
  <p class="mut" style="font-size:12.5px;margin-top:10px">Celular e origens somam desde o início da contagem. A medição do Google leva até 1 minuto por página.</p>`;
}

function grafico(M) {
  const dias = M.dias || [];
  const series = M.paginas.map((m, i) => ({ m, p: E.cfg.paginas.find((p) => p.slug === m.slug), cor: CORES[i % CORES.length] })).filter((s) => s.p);
  const max = Math.max(1, ...series.flatMap((s) => s.m.serieVisitas));
  const W = 900, H = 240, pl = 40, pr = 12, pt = 12, pb = 26;
  const x = (i) => pl + (dias.length < 2 ? 0 : (i * (W - pl - pr)) / (dias.length - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - v / max);
  const passos = 4;
  const grade = Array.from({ length: passos + 1 }, (_, k) => {
    const v = Math.round((max * k) / passos);
    return `<line class="eixo" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  }).join('');
  const rot = dias.map((d, i) => (dias.length <= 14 || i % Math.ceil(dias.length / 10) === 0) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${d.slice(8)}/${d.slice(5, 7)}</text>` : '').join('');
  const linhas = series.map((s) => {
    const pts = s.m.serieVisitas.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    const bol = s.m.serieVisitas.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.2" fill="${s.cor}"><title>${h(s.p.titulo)} · ${dias[i]}: ${v} visita(s)</title></circle>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${s.cor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${bol}`;
  }).join('');
  return `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Visitas por dia por página">${grade}${rot}${linhas}</svg>
    <div class="legenda">${series.map((s) => `<span><i style="background:${s.cor}"></i>${h(s.p.titulo)}</span>`).join('')}</div></div>`;
}

/* ================= prévias em escala ================= */
const ro = new ResizeObserver((itens) => {
  for (const it of itens) {
    const el = it.target, f = $('iframe', el);
    if (f) f.style.transform = `scale(${el.clientWidth / Number(el.dataset.w)})`;
  }
});
function ajustarTelas() {
  ro.disconnect();
  $$('.tela,.celular').forEach((el) => ro.observe(el));
}

/* ================= modais ================= */
function modal({ titulo, corpo, pe = '', largo = false, aoFechar }) {
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${h(titulo)}"><div class="modal-caixa ${largo ? 'largo' : ''}">
    <div class="modal-topo"><h2>${titulo}</h2><button class="bt bt-icone" data-fechar aria-label="Fechar">${I.fechar}</button></div>
    <div class="modal-corpo">${corpo}</div>${pe ? `<div class="modal-pe">${pe}</div>` : ''}</div></div>`;
  const m = $('.modal', raiz);
  const fechar = (forcar) => {
    if (!forcar && aoFechar && aoFechar() === false) return;
    raiz.innerHTML = '';
    document.removeEventListener('keydown', esc);
  };
  const esc = (e) => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc);
  m.addEventListener('mousedown', (e) => { if (e.target === m) fechar(); });
  $$('[data-fechar]', m).forEach((b) => (b.onclick = () => fechar()));
  return { el: m, fechar: () => fechar(true) };
}

function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
  return new Promise((ok) => {
    const md = modal({
      titulo, corpo: `<p style="margin:0">${texto}</p>`,
      pe: `<button class="bt" data-fechar>Cancelar</button><button class="bt ${perigo ? 'bt-perigo' : 'bt-ouro'}" data-sim>${rotulo}</button>`,
      aoFechar: () => ok(false),
    });
    $('[data-sim]', md.el).onclick = () => { md.fechar(); ok(true); };
  });
}

async function abrirEditor(slug) {
  const p = E.cfg.paginas.find((x) => x.slug === slug);
  const md = modal({
    titulo: `HTML · ${h(p.titulo)}`, largo: true,
    corpo: '<div class="carregando">Carregando o HTML…</div>',
    pe: `<span class="info" id="ed-info"></span>
      <label class="bt solta">Carregar arquivo .html<input type="file" accept=".html,.htm,text/html" hidden id="ed-arq"></label>
      <button class="bt" id="ed-copiar">Copiar tudo</button>
      <button class="bt" id="ed-ver">Pré-visualizar</button>
      <button class="bt bt-ouro" id="ed-salvar" ${E.podeGravar ? '' : 'disabled'}>Salvar e publicar</button>`,
    aoFechar: () => (ta && ta.value !== original ? confirm('Descartar as alterações no HTML?') : true),
  });
  let ta = null, original = '';
  try {
    const d = await api('pagina?slug=' + encodeURIComponent(slug));
    original = d.html;
    $('.modal-corpo', md.el).innerHTML = `<div class="editor">
      <div class="barra">Apague tudo e cole o HTML novo (Ctrl/Cmd + A, depois Ctrl/Cmd + V). A página publicada continua 100% estática.</div>
      <textarea id="ed-ta" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea></div>`;
    ta = $('#ed-ta', md.el);
    ta.value = original;
    original = ta.value; // o textarea normaliza quebras de linha (\r\n → \n)
  } catch (e) {
    $('.modal-corpo', md.el).innerHTML = `<div class="aviso">${h(e.message)}</div>`;
    return;
  }
  const info = () => {
    const bytes = new Blob([ta.value]).size, antes = new Blob([original]).size;
    const dif = bytes - antes;
    $('#ed-info').textContent = `${kb(bytes)}${dif ? ` (${dif > 0 ? '+' : '−'}${kb(Math.abs(dif))})` : ''}${ta.value !== original ? ' · alterado' : ''}`;
  };
  ta.addEventListener('input', info);
  info();
  $('#ed-arq').onchange = async (e) => { const f = e.target.files[0]; if (f) { ta.value = await f.text(); info(); toast(`“${f.name}” carregado. Confira e salve.`); } };
  $('#ed-copiar').onclick = async () => { await navigator.clipboard.writeText(ta.value); toast('HTML copiado.'); };
  $('#ed-ver').onclick = () => previaIsolada(ta.value);
  $('#ed-salvar').onclick = async (e) => {
    if (ta.value === original) { toast('Nada mudou no HTML.'); return; }
    e.target.disabled = true; e.target.textContent = 'Salvando…';
    try {
      await api('pagina', { method: 'PUT', body: { slug, html: ta.value } });
      original = ta.value;
      md.fechar();
      depoisDeSalvar(`HTML de /${p.url} salvo.`);
    } catch (err) {
      toast(err.message, 'bad');
      e.target.disabled = false; e.target.textContent = 'Salvar e publicar';
    }
  };
}

function abrirConfig(slug) {
  const p = E.cfg.paginas.find((x) => x.slug === slug);
  const outras = E.cfg.paginas.filter((x) => x.slug !== slug);
  const dom = (E.cfg.dominio || location.origin).replace(/^https?:\/\//, '');
  const md = modal({
    titulo: 'Ajustes da página',
    corpo: `<form id="f-cfg">
      <label class="campo"><span>Nome no painel</span><input name="titulo" value="${h(p.titulo)}" required></label>
      <label class="campo"><span>URL da página</span><div class="prefixo"><b>${h(dom)}/</b><input name="url" value="${h(p.url)}" required spellcheck="false"></div><small>Só letras minúsculas, números e hífen. Ex.: black10x-v6</small></label>
      <label class="campo" id="manter" hidden><span></span><label class="chave"><input type="checkbox" name="manter" checked><i></i>Manter a URL antiga levando para a nova (não quebra anúncios ativos)</label></label>
      <label class="campo"><span>Situação</span><label class="chave"><input type="checkbox" name="ativa" ${p.ativa ? 'checked' : ''}><i></i>Página ativa (no ar)</label></label>
      <label class="campo"><span>Quando desativada, levar o visitante para</span><select name="redir"><option value="">Mostrar “página indisponível”</option>${outras.map((o) => `<option value="${h(o.url)}" ${p.redirecionarInativaPara === o.url ? 'selected' : ''}>/${h(o.url)} · ${h(o.titulo)}</option>`).join('')}</select></label>
      <label class="campo"><span>Anotações</span><textarea name="notas" rows="3" placeholder="Ex.: versão com hero de mosaico, rodando no conjunto X">${h(p.notas || '')}</textarea></label>
    </form>`,
    pe: `<button class="bt" data-fechar>Cancelar</button><button class="bt bt-ouro" id="cfg-salvar" ${E.podeGravar ? '' : 'disabled'}>Salvar e publicar</button>`,
  });
  const f = $('#f-cfg', md.el);
  f.url.addEventListener('input', () => { $('#manter', md.el).hidden = f.url.value.trim() === p.url; });
  $('#cfg-salvar', md.el).onclick = async (e) => {
    if (!f.reportValidity()) return;
    e.target.disabled = true;
    try {
      await api('pagina', { method: 'PATCH', body: { slug, titulo: f.titulo.value, url: f.url.value, ativa: f.ativa.checked, manterRedirecionamento: f.manter.checked, redirecionarInativaPara: f.redir.value, notas: f.notas.value } });
      md.fechar();
      depoisDeSalvar('Ajustes salvos.');
    } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
  };
}

function abrirNova() {
  const md = modal({
    titulo: 'Nova página', largo: true,
    corpo: `<form id="f-nova" class="editor">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <label class="campo"><span>Nome no painel</span><input name="titulo" required placeholder="Black 10X · v6"></label>
        <label class="campo"><span>URL</span><div class="prefixo"><b>/</b><input name="url" required placeholder="black10x-v6" spellcheck="false"></div></label>
      </div>
      <label class="campo"><span>Domínio</span><select name="dominio" class="sel">${opcoesDominio()}</select></label>
      <label class="chave" style="margin-bottom:6px"><input type="checkbox" name="ativa" checked><i></i>Publicar já ativa</label>
      <textarea name="html" placeholder="Cole aqui o HTML da página (pode ser o bloco do WordPress, como as atuais)" spellcheck="false" required></textarea>
    </form>`,
    pe: `<label class="bt solta">Carregar arquivo .html<input type="file" accept=".html,.htm,text/html" hidden id="nova-arq"></label><button class="bt" data-fechar>Cancelar</button><button class="bt bt-ouro" id="nova-salvar">Criar e publicar</button>`,
  });
  const f = $('#f-nova', md.el);
  f.titulo.addEventListener('input', () => { if (!f.url.dataset.mexeu) f.url.value = f.titulo.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); });
  f.url.addEventListener('input', () => (f.url.dataset.mexeu = 1));
  $('#nova-arq', md.el).onchange = async (e) => {
    const a = e.target.files[0];
    if (!a) return;
    f.html.value = await a.text();
    if (!f.url.value) { f.url.value = a.name.replace(/\.html?$/i, ''); f.titulo.value ||= f.url.value; }
  };
  $('#nova-salvar', md.el).onclick = async (e) => {
    if (!f.reportValidity()) return;
    e.target.disabled = true;
    try {
      await api('paginas', { method: 'POST', body: { acao: 'criar', titulo: f.titulo.value, url: f.url.value, html: f.html.value, ativa: f.ativa.checked, dominio: f.dominio.value } });
      md.fechar();
      depoisDeSalvar(`Página /${f.url.value} criada.`);
    } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
  };
}

function abrirDominio() {
  const md = modal({ titulo: 'Domínios, pixels, Clarity e GTM', largo: false, corpo: '<div id="cad-listas"></div>', pe: '<button class="bt" data-fechar>Fechar</button>' });
  const pinta = () => {
    const c = E.cfg;
    const bloco = (tipo, titulo, itens, padrao, dica) => `<div class="cad-bloco"><div class="bloco-tit"><h4>${titulo}</h4>${tipo !== 'dominio' || ehAdmin() ? `<button class="bt bt-sm" data-cad-add="${tipo}">${I.mais}Adicionar</button>` : ''}</div>
      ${itens.length ? `<ul class="cad-lista">${itens.map((x) => `<li><span class="mono">${h(x.id)}</span>${x.nome ? `<span class="mut">${h(x.nome)}</span>` : ''}${x.id === padrao ? '<em class="cad-padrao">padrão</em>' : ehAdmin() ? `<button class="bt bt-sm" data-cad-padrao="${tipo}" data-id="${h(x.id)}">Tornar padrão</button>` : ''}${ehAdmin() ? `<button class="bt bt-sm bt-icone bt-perigo" data-cad-del="${tipo}" data-id="${h(x.id)}" title="Remover" aria-label="Remover">${I.fechar}</button>` : ''}</li>`).join('')}</ul>` : '<p class="mut" style="margin:6px 0 0">Nenhum cadastrado.</p>'}
      <small class="mut">${dica}</small></div>`;
    $('#cad-listas', md.el).innerHTML =
      bloco('dominio', 'Domínios', (c.dominios || []).map((d) => ({ id: d })), (c.dominio || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || c.dominios?.[0], 'O domínio também precisa estar em Vercel → Settings → Domains, com o DNS apontado. Cada página escolhe o seu na lista suspensa.') +
      bloco('pixel', 'Pixels da Meta', c.pixels || [], c.pixelMeta, 'O padrão vai nas páginas novas. Cada página escolhe o seu na lista suspensa azul.') +
      bloco('clarity', 'Microsoft Clarity', c.clarities || [], c.clarity, 'O padrão vai nas páginas novas. Cada página escolhe o seu na lista suspensa branca.') +
      bloco('gtm', 'Google Tag Manager', c.gtms || [], c.gtm, 'Carrega sem travar a página (no 1º toque/rolagem ou 6 s após abrir). Cada página escolhe o seu na lista suspensa verde.');
  };
  pinta();
  const recarregar = async (msg) => { await carregarPaginas(E.vista === 'funil'); pinta(); render(); toast(msg, 'ok'); };
  md.el.addEventListener('click', async (e) => {
    const add = e.target.closest('[data-cad-add]'), pad = e.target.closest('[data-cad-padrao]'), del = e.target.closest('[data-cad-del]');
    try {
      if (add) { const id = await abrirCadastro(add.dataset.cadAdd); if (id) await recarregar('Cadastrado.'); abrirDominio(); }
      if (pad) { await api('paginas', { method: 'POST', body: { acao: 'cadastrar', tipo: pad.dataset.cadPadrao, id: pad.dataset.id, padrao: true } }); await recarregar('Padrão alterado.'); }
      if (del && await confirmar('Remover', `Remover <b>${h(del.dataset.id)}</b> da lista? (só dá se nenhuma página estiver usando)`, 'Remover', true)) {
        await api('paginas', { method: 'POST', body: { acao: 'descadastrar', tipo: del.dataset.cadDel, id: del.dataset.id } });
        await recarregar('Removido.');
        abrirDominio();
      }
    } catch (err) { toast(err.message, 'bad'); }
  });
}

/* ================= criativo ================= */
async function reduzirImagem(arquivo) {
  if (arquivo.type === 'image/gif') {
    if (arquivo.size > 3.4 * 1024 * 1024) throw new Error('GIF muito grande (máx. 3,4 MB).');
    return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(arquivo); });
  }
  const bmp = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/webp', 0.86);
}

async function enviarCriativo(slug, arquivo) {
  if (!arquivo || !arquivo.type.startsWith('image/')) { toast('Escolha uma imagem (JPG, PNG, WEBP ou GIF). Para vídeo, cole o link do anúncio.', 'bad'); return; }
  if (!E.podeGravar) { toast('Modo somente leitura.', 'bad'); return; }
  const caixa = $(`.criativo-img[data-slug="${slug}"]`);
  try {
    const dataUrl = await reduzirImagem(arquivo);
    if (caixa) caixa.innerHTML = `<img src="${dataUrl}" alt="">`;
    await api('criativo', { method: 'POST', body: { slug, dataUrl } });
    await carregarPaginas(true);
    toast('Criativo salvo.', 'ok');
    renderVista(false);
  } catch (e) { toast(e.message, 'bad'); renderVista(false); }
}

/* ================= pixel e Clarity de cada página ================= */
// Listas suspensas em cada página: domínio (cinza), pixel (azul) e Clarity (branca), com "+ Adicionar…".
// Se o código da própria página já traz um pixel/Clarity, ele aparece fixo (não dá para trocar pelo painel).
function tagsRastreio(p) {
  const r = { pixel: [], clarity: [], gtm: [], ...(E.rastreio[p.slug] || {}) };
  const off = E.podeGravar ? '' : 'disabled';
  const fixos = (tipo) => r[tipo].filter((x) => x.origem === 'pagina');
  const pd = padraoDaPagina(p);
  const sel = (tipo, rotulo, lista, padrao, classe) => {
    if (fixos(tipo).length) return fixos(tipo).map((x) => `<span class="tag ${classe}" title="Está no código da página">${rotulo} ${h(x.id)}</span>`).join('');
    const atual = p[tipo] === 'nenhum' ? 'nenhum' : (p[tipo] || padrao || 'nenhum');
    const opcoes = lista.map((x) => `<option value="${h(x.id)}" ${x.id === atual ? 'selected' : ''}>${rotulo} ${h(x.id)}${lista.length > 1 && x.nome ? ' · ' + h(x.nome) : ''}</option>`).join('');
    return `<select class="tag-sel ${classe} ${atual === 'nenhum' ? 'vazio' : ''}" data-sel="${tipo}" data-slug="${p.slug}" ${off} title="${rotulo} desta página">${opcoes}<option value="nenhum" ${atual === 'nenhum' ? 'selected' : ''}>Sem ${rotulo.toLowerCase()}</option><option value="__novo">+ Adicionar ${rotulo.toLowerCase()}…</option></select>`;
  };
  const host = E.hosts?.[p.slug] || E.hostPadrao || location.host;
  const doms = E.cfg.dominios?.length ? E.cfg.dominios : [host];
  const dom = `<select class="tag-sel tag-dom" data-sel="dominio" data-slug="${p.slug}" ${off} title="Domínio onde a página fica no ar">${doms.map((d) => opcaoDominio(d, d === host)).join('')}${ehAdmin() ? '<option value="__novo">+ Adicionar domínio…</option>' : ''}</select>`;
  const grupos = E.cfg.grupos || [];
  const grp = `<select class="tag-sel tag-grupo ${p.grupo ? '' : 'vazio'}" data-sel="grupo" data-slug="${p.slug}" ${off} title="Grupo da página no painel"><option value="">Sem grupo</option>${grupos.map((g) => `<option value="${h(g.id)}" ${g.id === p.grupo ? 'selected' : ''}>Grupo: ${h(g.titulo)}</option>`).join('')}<option value="__novo">+ Novo grupo…</option></select>`;
  return `<div class="tags">${grp}${dom}${sel('pixel', 'Pixel', E.cfg.pixels || [], pd.pixel, 'tag-px')}${sel('clarity', 'Clarity', E.cfg.clarities || [], pd.clarity, 'tag-cl')}${sel('gtm', 'GTM', E.cfg.gtms || [], pd.gtm, 'tag-gtm')}</div>`;
}

// Cadastrar pixel, Clarity ou domínio (da opção "+ Adicionar…"). Devolve o ID cadastrado ou null.
function abrirCadastro(tipo) {
  const info = {
    pixel: ['Adicionar pixel da Meta', 'ID do pixel', '554651949023828', 'Gerenciador de Eventos → Fontes de dados → o número do pixel.'],
    clarity: ['Adicionar Clarity', 'ID do projeto Clarity', 'yy6pgr4e6u', 'clarity.microsoft.com → Configurações → ID do projeto (ou cole o código de instalação).'],
    gtm: ['Adicionar Google Tag Manager', 'ID do contêiner', 'GTM-XXXXXXX', 'tagmanager.google.com → o ID que começa com GTM-. Se o GTM também tiver o pixel da Meta, desligue o pixel da página para não contar em dobro.'],
    dominio: ['Adicionar domínio', 'Domínio', 'lp.seudominio.com.br', 'Ele também precisa estar em Vercel → Settings → Domains (com o DNS apontado). Peça ao administrador se não souber.'],
  }[tipo];
  return new Promise((ok) => {
    const md = modal({
      titulo: info[0],
      corpo: `<label class="campo"><span>${info[1]}</span><input id="cad-id" placeholder="${info[2]}" spellcheck="false" autocapitalize="none" maxlength="${tipo === 'clarity' ? 200 : 253}"></label>
        ${tipo !== 'dominio' ? '<label class="campo"><span>Nome (opcional)</span><input id="cad-nome" placeholder="Ex.: Pixel campanha Black" maxlength="60"></label>' : ''}
        <label class="chave"><input type="checkbox" id="cad-padrao"><i></i>Usar como padrão das páginas novas</label>
        <small class="mut" style="display:block;margin-top:10px">${info[3]}</small>`,
      pe: '<button class="bt" data-fechar>Cancelar</button><button class="bt bt-ouro" id="cad-ok">Adicionar</button>',
      aoFechar: () => ok(null),
    });
    $('#cad-id', md.el).focus();
    $('#cad-ok', md.el).onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api('paginas', { method: 'POST', body: { acao: 'cadastrar', tipo, id: $('#cad-id', md.el).value, nome: $('#cad-nome', md.el)?.value || '', padrao: $('#cad-padrao', md.el).checked } });
        const lista = tipo === 'pixel' ? r.pixels : tipo === 'clarity' ? r.clarities : tipo === 'gtm' ? r.gtms : r.dominios.map((d) => ({ id: d }));
        md.fechar();
        ok(lista[lista.length - 1]?.id || null);
      } catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
    };
  });
}

async function trocarSeletor(t) {
  const { sel: tipo, slug } = t.dataset;
  const p = E.cfg.paginas.find((x) => x.slug === slug);
  let valor = t.value;
  if (tipo === 'grupo' && valor === '__novo') { await abrirGrupo(null, [slug]); renderVista(false); return; }
  if (valor === '__novo') {
    valor = await abrirCadastro(tipo);
    if (!valor) { renderVista(false); return; }
  }
  try {
    await api('pagina', { method: 'PATCH', body: { slug, [tipo]: valor } });
    await carregarPaginas(E.vista === 'funil');
    renderVista(false);
    toast(tipo === 'grupo' ? `/${p.url} ${valor ? 'mudou de grupo' : 'saiu do grupo'}.` : tipo === 'dominio' ? `/${p.url} agora fica em ${valor}.` : `${{ pixel: 'Pixel', clarity: 'Clarity', gtm: 'GTM' }[tipo]} de /${p.url} atualizado. Já está no ar.`, 'ok');
  } catch (e) { toast(e.message, 'bad'); renderVista(false); }
}

// Opção de domínio com a situação: no ar (pode escolher) ou DNS pendente (bloqueado até apontar).
function opcaoDominio(d, selecionado) {
  const st = E.dominiosStatus[d];
  const pendente = st === false;
  return `<option value="${h(d)}" ${selecionado ? 'selected' : ''} ${pendente && !selecionado ? 'disabled' : ''}>${st === true ? '● ' : pendente ? '○ ' : ''}${h(d)}${pendente ? ' · DNS pendente' : ''}${d === E.hostPadrao ? ' (padrão)' : ''}</option>`;
}
const opcoesDominio = (sel) => {
  const doms = E.cfg.dominios?.length ? E.cfg.dominios : [E.hostPadrao || location.host];
  const escolhido = sel || (E.dominiosStatus[E.hostPadrao] === false ? doms.find((d) => E.dominiosStatus[d]) : E.hostPadrao) || E.hostPadrao;
  return doms.map((d) => opcaoDominio(d, d === escolhido)).join('');
};
async function carregarDominios() {
  try {
    const r = await api('paginas?dominios=1');
    E.dominiosStatus = Object.fromEntries(r.dominios.map((x) => [x.dominio, x.noAr]));
    renderVista(false);
  } catch {}
}

// Pixel/Clarity/GTM que a página recebe se não escolher outro: o do domínio dela ou o padrão do painel.
function padraoDaPagina(p) {
  const host = E.hosts?.[p.slug] || E.hostPadrao;
  const d = (E.cfg.porDominio || {})[host] || {};
  return { pixel: d.pixel || E.cfg.pixelMeta, clarity: d.clarity || E.cfg.clarity, gtm: d.gtm || E.cfg.gtm };
}

/* ================= rastreamento por domínio ================= */
function abrirRastreioDominios() {
  const c = E.cfg;
  const doms = c.dominios || [];
  const dl = (id, lista) => `<datalist id="${id}">${lista.map((x) => `<option value="${h(x.id)}">${h(x.nome || '')}</option>`).join('')}<option value="nenhum">desligar neste domínio</option></datalist>`;
  const linha = (d) => {
    const v = (c.porDominio || {})[d] || {};
    const n = c.paginas.filter((p) => (E.hosts?.[p.slug] || E.hostPadrao) === d).length;
    const st = E.dominiosStatus[d];
    const campo = (k, rotulo, lista, global, ex) => `<label class="campo"><span>${rotulo}</span><input data-c="${k}" list="dl-${k}" value="${h(v[k] || '')}" placeholder="padrão: ${h(global || 'nenhum')}" spellcheck="false" autocapitalize="none" maxlength="200" ${E.podeGravar ? '' : 'disabled'}><small class="mut">${ex}</small></label>`;
    return `<div class="rd-linha" data-dominio="${h(d)}">
      <div class="rd-dom"><b>${h(d)}</b><span class="rd-st ${st === true ? 'ok' : st === false ? 'pend' : ''}">${st === true ? 'no ar' : st === false ? 'DNS pendente' : 'verificando…'}</span><small class="mut">${n} página(s)${d === E.hostPadrao ? ' · domínio padrão' : ''}</small></div>
      <div class="rd-campos">
        ${campo('pixel', 'Pixel da Meta', c.pixels, c.pixelMeta, 'ID do pixel')}
        ${campo('gtm', 'Google Tag Manager', c.gtms, c.gtm, 'GTM-XXXXXXX')}
        ${campo('clarity', 'Microsoft Clarity', c.clarities, c.clarity, 'ID do projeto')}
      </div>
      <button class="bt bt-sm bt-ouro" data-rd-salvar ${E.podeGravar ? '' : 'disabled'}>Salvar</button>
    </div>`;
  };
  const md = modal({
    titulo: 'Rastreamento por domínio', largo: true,
    corpo: `<p class="mut" style="margin-top:0">O que você colocar aqui vale para <b>todas as páginas do domínio</b>. Deixe em branco para seguir o padrão do painel, ou escreva <b>nenhum</b> para desligar. Se uma página escolher outro pixel/GTM/Clarity na própria lista dela, a escolha da página vale. IDs novos entram sozinhos nas listas.</p>
      ${dl('dl-pixel', c.pixels || [])}${dl('dl-gtm', c.gtms || [])}${dl('dl-clarity', c.clarities || [])}
      <div class="rd-lista">${doms.map(linha).join('')}</div>`,
    pe: '<button class="bt" data-fechar>Fechar</button>',
  });
  md.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-rd-salvar]');
    if (!b) return;
    const l = b.closest('.rd-linha'), dominio = l.dataset.dominio;
    const corpo = { acao: 'rastreio-dominio', dominio };
    $$('input[data-c]', l).forEach((i) => (corpo[i.dataset.c] = i.value.trim()));
    b.disabled = true; b.textContent = 'Salvando…';
    try {
      await api('paginas', { method: 'POST', body: corpo });
      await carregarPaginas(E.vista === 'funil');
      render();
      const n = E.cfg.paginas.filter((p) => (E.hosts?.[p.slug] || E.hostPadrao) === dominio).length;
      toast(`Rastreamento de ${dominio} salvo: vale para ${n} página(s). Já está no ar.`, 'ok');
      b.textContent = 'Salvo ✓';
      setTimeout(() => { b.disabled = false; b.textContent = 'Salvar'; }, 1500);
    } catch (err) { toast(err.message, 'bad'); b.disabled = false; b.textContent = 'Salvar'; }
  });
}

/* ================= conectar ao Claude ================= */
function abrirClaude() {
  const url = `${location.origin}/api/mcp`;
  const md = modal({
    titulo: 'Conectar ao Claude',
    corpo: `<p style="margin-top:0">Com o conector, o Claude publica, edita e exclui páginas por você, e cuida das imagens.</p>
      <label class="campo"><span>Endereço do conector</span><div class="prefixo"><input id="mcp-url" value="${h(url)}" readonly></div></label>
      <button class="bt bt-sm" id="mcp-copiar" style="margin:6px 0 14px">Copiar endereço</button>
      <ol class="passos"><li>No Claude: <b>Configurações → Conectores → Adicionar conector personalizado</b>.</li><li>Nome: <b>Páginas R1</b> · URL: o endereço acima → <b>Adicionar</b>.</li><li>Clique em <b>Conectar</b> e entre com o seu usuário deste painel.</li><li>Na conversa, ative o conector no botão de ferramentas e peça, por exemplo: “publique esta página em …”.</li></ol>
      <small class="mut">O tutorial completo está no PDF da pasta do projeto. O Claude age com as mesmas permissões do seu usuário; para desligar, remova o conector no Claude ou troque a sua senha.</small>`,
    pe: '<button class="bt" data-fechar>Fechar</button>',
  });
  $('#mcp-copiar', md.el).onclick = async () => { await navigator.clipboard.writeText(url); toast('Endereço copiado.'); };
}

/* ================= imagens do site (Vercel Blob) ================= */
async function carregarImagens() {
  try { E.imagens = (await api('imagens')).imagens; }
  catch (e) { E.imagens = []; toast(e.message, 'bad'); }
  if (E.vista === 'imagens') renderVista(false);
}

function vistaImagens() {
  const acoes = `<label class="chave" title="JPG e PNG viram WEBP (bem mais leves), no máximo 2400 px de largura"><input type="checkbox" id="img-otimizar" ${E.otimizar ? 'checked' : ''}><i></i>Otimizar (WebP)</label>
    <button class="bt bt-ouro" data-acao="img-escolher" ${E.podeGravar ? '' : 'disabled'}>${I.mais}Subir imagens</button>
    <input type="file" id="img-arq" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple hidden>`;
  const lista = E.imagens;
  const corpo = !lista ? '<div class="carregando">Carregando imagens…</div>'
    : !lista.length ? '<div class="vazio-geral">Nenhuma imagem ainda.</div>'
    : `<div class="img-grade">${lista.map((i) => `<figure class="img-card">
        <a class="img-mini" href="${h(i.url)}" target="_blank" rel="noopener"><img src="${h(i.url)}" alt="" loading="lazy" decoding="async"></a>
        <figcaption><b title="${h(i.nome)}">${h(i.nome)}</b><span class="mut">${kb(i.tamanho)} · ${new Date(i.em).toLocaleDateString('pt-BR')}</span></figcaption>
        <div class="img-acoes"><button class="bt bt-sm" data-acao="img-copiar" data-v="${h(i.url)}">Copiar link</button>${ehAdmin() ? `<button class="bt bt-sm bt-icone bt-perigo" data-acao="img-apagar" data-v="${h(i.nome)}" aria-label="Apagar" title="Apagar">${I.fechar}</button>` : ''}</div>
      </figure>`).join('')}</div>`;
  return topo('Imagens', `${lista ? lista.length + ' imagem(ns) no Vercel Blob · ' : ''}use o link nas páginas (ex.: &lt;img src="/wp-content/uploads/…"&gt;)`, acoes) +
    `<div class="img-drop" data-acao="img-escolher" tabindex="0" role="button">${I.imagem}<span><b>Arraste imagens aqui</b>, cole com Ctrl+V ou clique para escolher</span><small class="mut">JPG, PNG, WEBP, GIF ou AVIF · até 4 MB cada</small></div>
    <div id="img-fila"></div>${corpo}`;
}

// JPG/PNG → WEBP (qualidade 0,85, até 2400 px). Só troca se ficar menor.
async function otimizarImagem(arq) {
  if (!E.otimizar || !/^image\/(jpeg|png)$/.test(arq.type)) return arq;
  try {
    const bmp = await createImageBitmap(arq);
    const esc = Math.min(1, 2400 / bmp.width);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * esc); c.height = Math.round(bmp.height * esc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const webp = await new Promise((ok) => c.toBlob(ok, 'image/webp', 0.85));
    return webp && webp.size < arq.size ? new File([webp], arq.name.replace(/\.[a-z0-9]+$/i, '') + '.webp', { type: 'image/webp' }) : arq;
  } catch { return arq; }
}

async function subirImagens(arquivos) {
  const imgs = arquivos.filter((f) => f && f.type.startsWith('image/'));
  if (!imgs.length) { toast('Escolha arquivos de imagem.'); return; }
  if (!E.podeGravar) { toast('Modo somente leitura.', 'bad'); return; }
  const fila = $('#img-fila');
  let ok = 0;
  for (const original of imgs) {
    const linha = document.createElement('div');
    linha.className = 'img-linha';
    linha.textContent = `Enviando ${original.name}…`;
    fila?.prepend(linha);
    try {
      const arq = await otimizarImagem(original);
      if (arq.size > 4 * 1024 * 1024) throw new Error('maior que 4 MB');
      const r = await fetch('/api/imagens', { method: 'POST', headers: { 'Content-Type': arq.type, 'X-Nome': encodeURIComponent(arq.name) }, body: arq, credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { telaLogin(); return; }
      if (!r.ok) throw new Error(d.erro || `erro ${r.status}`);
      linha.classList.add('feita');
      linha.innerHTML = `✔ ${h(original.name)} → <span class="mono">${h(d.url)}</span> (${kb(d.tamanho)})`;
      ok++;
    } catch (e) {
      linha.classList.add('erro');
      linha.textContent = `✘ ${original.name}: ${e.message}`;
    }
  }
  if (ok) {
    toast(`${ok} imagem(ns) enviada(s). Clique em “Copiar link” para usar nas páginas.`, 'ok');
    const filaHtml = fila?.innerHTML || '';
    await carregarImagens();
    if ($('#img-fila')) $('#img-fila').innerHTML = filaHtml;
  }
}

/* ================= em construção ================= */
function vistaEmObra() {
  const nome = E.vista === 'funil' ? 'Funil' : 'Métricas';
  return topo(nome, '') + `<div class="em-obra-tela"><div class="em-obra-icone">🚧</div><h2>${nome} em construção</h2><p>Esta parte do painel ainda está sendo preparada. Por enquanto, use <a href="#grade">Páginas</a> e <a href="#lista">Lista</a>.</p></div>`;
}

/* ================= prévia isolada ================= */
// Abre o HTML numa aba própria pelo servidor (/api/previa), que entrega a página isolada:
// os scripts dela rodam, mas sem acesso ao painel nem à sessão.
function previaIsolada(html) {
  const f = document.createElement('form');
  f.method = 'POST'; f.action = '/api/previa'; f.target = '_blank'; f.hidden = true;
  const t = document.createElement('textarea');
  t.name = 'html'; t.value = html;
  f.append(t);
  document.body.append(f);
  f.submit();
  f.remove();
}

/* ================= adicionar em massa ================= */
const slugDe = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9/]+/g, '-').replace(/-{2,}/g, '-').replace(/^[-/]+|[-/]+$/g, '');
const tituloDoCodigo = (c) => (/<title[^>]*>([^<]{1,120})<\/title>/i.exec(c || '')?.[1] || '').trim();

function abrirMassa() {
  let enviando = false;
  const linha = (n) => `<div class="massa-linha" data-n="${n}">
      <div class="massa-esq">
        <span class="massa-n">${n}</span>
        <label class="campo"><span>Slug (URL)</span><div class="prefixo"><b>/</b><input data-slug-in placeholder="black10x-v6" spellcheck="false" autocapitalize="none" maxlength="120"></div></label>
        <div class="massa-st" data-st></div>
      </div>
      <textarea data-cod placeholder="Cole aqui o código da página (pode colar a resposta do Claude inteira, com o \`\`\`html)" spellcheck="false" autocomplete="off" autocapitalize="off"></textarea>
    </div>`;
  const md = modal({
    titulo: 'Adicionar páginas em massa', largo: true,
    corpo: `<div class="massa">
      <label class="campo massa-dom"><span>Publicar no domínio</span><select id="massa-dom" class="sel">${opcoesDominio()}</select></label>
      <p class="massa-dica">Escreva o slug à esquerda e cole o código à direita. Linhas vazias são ignoradas. O código é limpo sozinho (tira o \`\`\`html do Claude) e a página sai ocupando a tela toda, com o pixel e o Clarity do painel.</p>
      <div class="massa-lista">${[1, 2, 3, 4, 5, 6, 7].map(linha).join('')}</div>
      <button class="bt bt-sm" id="massa-mais">${I.mais}Mais uma linha</button>
    </div>`,
    pe: `<label class="chave"><input type="checkbox" id="massa-ativa" checked><i></i>Publicar já ativas</label><span class="esp"></span><button class="bt" data-fechar>Fechar</button><button class="bt bt-ouro" id="massa-salvar">Publicar todas</button>`,
    aoFechar: () => !enviando && (![...$$('[data-cod]', md.el)].some((t) => t.value.trim() && !t.closest('.massa-linha').classList.contains('feita')) || confirm('Fechar sem publicar o que foi colado?')),
  });
  md.el.querySelector('.modal-caixa').classList.add('cheio');
  const lista = $('.massa-lista', md.el);
  $('#massa-mais', md.el).onclick = () => { lista.insertAdjacentHTML('beforeend', linha(lista.children.length + 1)); lista.lastElementChild.querySelector('input').focus(); };
  // ao colar o código, sugere o slug pelo <title> se ainda estiver vazio
  lista.addEventListener('input', (e) => {
    const l = e.target.closest('.massa-linha');
    if (e.target.matches('[data-cod]')) {
      const s = $('[data-slug-in]', l);
      if (!s.value && !s.dataset.mexeu) { const t = tituloDoCodigo(e.target.value); if (t) s.value = slugDe(t); }
    }
    if (e.target.matches('[data-slug-in]')) e.target.dataset.mexeu = 1;
  });
  $('#massa-salvar', md.el).onclick = async (e) => {
    const linhas = $$('.massa-linha', md.el).filter((l) => !l.classList.contains('feita') && ($('[data-cod]', l).value.trim() || $('[data-slug-in]', l).value.trim()));
    if (!linhas.length) { toast('Cole pelo menos um código.'); return; }
    enviando = true; e.target.disabled = true;
    let ok = 0, falhas = 0;
    for (const l of linhas) {
      const st = $('[data-st]', l), codigo = $('[data-cod]', l).value, slug = slugDe($('[data-slug-in]', l).value);
      l.classList.remove('erro');
      if (!slug || !codigo.trim()) { st.textContent = !slug ? 'Falta o slug.' : 'Falta o código.'; l.classList.add('erro'); falhas++; continue; }
      st.textContent = 'Publicando…';
      try {
        const r = await api('paginas', { method: 'POST', body: { acao: 'criar', url: slug, titulo: tituloDoCodigo(codigo) || slug, html: codigo, ativa: $('#massa-ativa', md.el).checked, dominio: $('#massa-dom', md.el).value } });
        l.classList.add('feita');
        st.innerHTML = `✔ No ar: <a href="https://${h($('#massa-dom', md.el).value)}/${h(r.url)}" target="_blank" rel="noopener">${h($('#massa-dom', md.el).value)}/${h(r.url)}</a>`;
        $$('input,textarea', l).forEach((x) => (x.readOnly = true));
        ok++;
      } catch (err) { st.textContent = err.message; l.classList.add('erro'); falhas++; }
    }
    enviando = false; e.target.disabled = false;
    toast(`${ok} página(s) publicada(s)${falhas ? ` · ${falhas} com problema (veja em vermelho)` : ''}.`, falhas ? 'bad' : 'ok');
    if (ok) { E.versao = Date.now().toString(36); await carregarPaginas(); render(); verificarStatus(); }
  };
}

/* ================= cliques ================= */
document.addEventListener('click', async (ev) => {
  const alvo = ev.target.closest('[data-acao]');
  $$('.menu.abre').forEach((m) => { if (!m.contains(ev.target)) m.classList.remove('abre'); });
  if (!alvo) return;
  const { acao, slug, v } = alvo.dataset;
  const p = slug && E.cfg?.paginas.find((x) => x.slug === slug);

  switch (acao) {
    case 'menu': alvo.parentElement.classList.toggle('abre'); break;
    case 'sair': await api('login', { method: 'DELETE' }).catch(() => {}); telaLogin(); break;
    case 'status': verificarStatus(); break;
    case 'nova': abrirNova(); break;
    case 'massa': abrirMassa(); break;
    case 'grupos': abrirGrupos(); break;
    case 'rastreio-dominio': abrirRastreioDominios(); break;
    case 'grupo-editar': abrirGrupo(v); break;
    case 'filtro-grupo': E.filtroGrupo = v; try { localStorage.setItem('r1-filtro-grupo', v); } catch {} renderVista(false); break;
    case 'claude': abrirClaude(); break;
    case 'img-escolher': $('#img-arq').click(); break;
    case 'img-copiar': await navigator.clipboard.writeText(v); toast('Link copiado: ' + v); break;
    case 'img-apagar':
      if (await confirmar('Apagar imagem', `Apagar <b>${h(v)}</b> do Blob? Se alguma página usar essa imagem, o painel não deixa.`, 'Apagar', true)) {
        try { await api('imagens?nome=' + encodeURIComponent(v), { method: 'DELETE' }); E.imagens = E.imagens.filter((i) => i.nome !== v); renderVista(false); toast('Imagem apagada.'); }
        catch (e) { toast(e.message, 'bad'); }
      }
      break;
    case 'dominio': abrirDominio(); break;
    case 'editar': abrirEditor(slug); break;
    case 'config': abrirConfig(slug); break;
    case 'previa': E.previa = v; renderVista(false); break;
    case 'dias': if (!ehAdmin()) break; E.dias = Number(v); E.metricas = null; renderVista(false); carregarMetricas(); break;
    case 'copiar-url': {
      await navigator.clipboard.writeText(urlPublica(p));
      toast('Link copiado.');
      break;
    }
    case 'duplicar':
      try { await api('pagina', { method: 'POST', body: { slug } }); depoisDeSalvar(`Cópia de “${p.titulo}” criada (desativada).`); }
      catch (e) { toast(e.message, 'bad'); }
      break;
    case 'excluir':
      if (await confirmar('Excluir página', `Excluir <b>${h(p.titulo)}</b> (/${h(p.url)})? Ela sai do ar.`, 'Excluir', true)) {
        try { await api('pagina?slug=' + encodeURIComponent(slug), { method: 'DELETE' }); depoisDeSalvar('Página excluída.'); }
        catch (e) { toast(e.message, 'bad'); }
      }
      break;
    case 'subir': case 'descer': {
      const ordem = E.cfg.paginas.map((x) => x.slug);
      const i = ordem.indexOf(slug), j = acao === 'subir' ? i - 1 : i + 1;
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      E.cfg.paginas.sort((a, b) => ordem.indexOf(a.slug) - ordem.indexOf(b.slug));
      renderVista(false);
      try { await api('paginas', { method: 'POST', body: { acao: 'ordem', ordem } }); toast('Ordem do funil salva.', 'ok'); }
      catch (e) { toast(e.message, 'bad'); }
      break;
    }
    case 'escolher-criativo': $(`input[data-arquivo="${slug}"]`).click(); break;
    case 'tirar-criativo':
      try { await api('criativo?slug=' + encodeURIComponent(slug), { method: 'DELETE' }); await carregarPaginas(true); renderVista(false); toast('Criativo removido.'); }
      catch (e) { toast(e.message, 'bad'); }
      break;
    case 'salvar-criativo':
      try {
        await api('pagina', { method: 'PATCH', body: { slug, criativo: { texto: $(`[data-copy="${slug}"]`).value, link: $(`[data-link="${slug}"]`).value } } });
        await carregarPaginas(true);
        toast('Copy do anúncio salva.', 'ok');
        renderVista(false);
      } catch (e) { toast(e.message, 'bad'); }
      break;
    case 'psi': {
      alvo.disabled = true; alvo.textContent = 'Medindo…';
      try {
        const d = await api(`pagespeed?slug=${encodeURIComponent(slug)}&estrategia=${v}`);
        E.psi[`${slug}:${v}`] = d.resultado;
        toast(`${p.titulo} (${v === 'mobile' ? 'celular' : 'PC'}): performance ${d.resultado.performance} · LCP ${d.resultado.lcp}`, d.resultado.performance >= 90 ? 'ok' : '');
      } catch (e) { toast(e.message, 'bad'); }
      renderVista(false);
      break;
    }
  }
});

document.addEventListener('change', async (ev) => {
  const t = ev.target;
  if (t.matches('[data-acao="ativa"]')) {
    const p = E.cfg.paginas.find((x) => x.slug === t.dataset.slug);
    const ativa = t.checked;
    if (!ativa && !(await confirmar('Desativar página', `Desativar <b>${h(p.titulo)}</b>? Quem abrir /${h(p.url)} verá “página indisponível”${p.redirecionarInativaPara ? ` (ou será levado para /${h(p.redirecionarInativaPara)})` : ''}. Para levar a outra página, use “Ajustes”.`, 'Desativar', true))) {
      t.checked = true;
      return;
    }
    try { await api('pagina', { method: 'PATCH', body: { slug: p.slug, ativa } }); depoisDeSalvar(ativa ? `/${p.url} ativada.` : `/${p.url} desativada.`); }
    catch (e) { t.checked = !ativa; toast(e.message, 'bad'); }
  }
  if (t.matches('[data-acao="funil-previa"]')) { E.funilPrevia = t.checked; renderVista(false); }
  if (t.matches('input[data-arquivo]')) enviarCriativo(t.dataset.arquivo, t.files[0]);
  if (t.matches('#img-arq')) { subirImagens([...t.files]); t.value = ''; }
  if (t.matches('#img-otimizar')) E.otimizar = t.checked;
  if (t.matches('select[data-sel]')) trocarSeletor(t);
});

document.addEventListener('keydown', (ev) => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches('.criativo-img')) { ev.preventDefault(); ev.target.click(); }
});
['dragover', 'dragleave', 'drop'].forEach((tipo) => document.addEventListener(tipo, (ev) => {
  const zona = ev.target.closest?.('.img-drop');
  if (zona) { ev.preventDefault(); zona.classList.toggle('arrasta', tipo === 'dragover'); if (tipo === 'drop') subirImagens([...ev.dataTransfer.files]); return; }
  const caixa = ev.target.closest?.('.criativo-img');
  if (!caixa) return;
  ev.preventDefault();
  caixa.classList.toggle('arrasta', tipo === 'dragover');
  if (tipo === 'drop') enviarCriativo(caixa.dataset.slug, ev.dataTransfer.files[0]);
}));
document.addEventListener('paste', (ev) => {
  // colar uma imagem (Ctrl+V) com o mouse sobre um criativo
  if (E.vista === 'imagens' && !ev.target.closest('input,textarea')) {
    const fs = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (fs.length) { ev.preventDefault(); subirImagens(fs); return; }
  }
  const caixa = $('.criativo-img:hover');
  const img = [...(ev.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
  if (caixa && img) { ev.preventDefault(); enviarCriativo(caixa.dataset.slug, img); }
});

/* ================= início ================= */
api('login').then((d) => (d.logado ? iniciar() : telaLogin())).catch(() => telaLogin());
