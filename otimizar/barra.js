// Barra lateral do Marquinhos (terminal de otimização) na Central (interno.grupor1.com/central, aba LPs).
// Pedido do Lucas (20/11/2026). A Central carrega este arquivo com <script src="/otimizar/barra.js" defer>.
//  - botão "Otimizar com o Marquinhos" na barra de ações da aba LPs + "⚡ Otimizar" em cada cartão de página;
//  - a barra ocupa a altura toda à direita e empurra a Central para o lado (no celular, cobre a tela);
//  - /otimizar redireciona para /central?otimizar=1#lps → abre a aba LPs com a barra aberta.
(function () {
  'use strict';
  if (window.__otimizarBarra) return; window.__otimizarBarra = true;
  var LARG = 'min(460px, calc(100vw - 24px))', aberta = false, frame = null, pendente = null;

  var css = document.createElement('style');
  css.textContent = [
    // cartão azul no estilo dos alertas da Central: flutua a 12 px das bordas, com borda luminosa e brilho
    '#otz-barra{position:fixed;top:12px;right:12px;bottom:12px;width:' + LARG + ';z-index:2147482000;border-radius:26px;overflow:hidden;background:#071233;',
    'border:1px solid rgba(120,160,255,.45);box-shadow:0 0 0 1px rgba(91,140,255,.15),0 24px 70px rgba(10,40,160,.45),0 0 90px rgba(59,130,246,.28);',
    'transform:translateX(calc(100% + 24px));transition:transform .3s cubic-bezier(.2,.8,.2,1);display:flex}',
    '#otz-barra.aberta{transform:none}',
    '#otz-barra iframe{flex:1;width:100%;height:100%;border:0;background:#071233}',
    'html.otz-com-barra body{margin-right:calc(' + LARG + ' + 24px);transition:margin-right .3s cubic-bezier(.2,.8,.2,1)}',
    'html.otz-com-barra{overflow-x:hidden}',
    '[data-otz-empurrado]{transition:translate .3s cubic-bezier(.2,.8,.2,1),right .3s cubic-bezier(.2,.8,.2,1)}',
    '@media (max-width:900px){html.otz-com-barra body{margin-right:0}#otz-barra{top:0;right:0;bottom:0;width:100vw;border-radius:0}}',
    '.otz-btn{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(140,172,255,.4);background:linear-gradient(135deg,rgba(63,111,240,.35),rgba(106,162,255,.2));',
    'color:#e8eeff;border-radius:999px;padding:7px 14px 7px 7px;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap;',
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 4px 16px rgba(63,111,240,.25)}',
    '.otz-btn:hover{border-color:#6aa2ff;box-shadow:0 0 0 3px rgba(91,140,255,.2),0 4px 16px rgba(63,111,240,.35)}',
    '.otz-btn img{width:24px;height:24px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px rgba(106,162,255,.6)}',
    '.otz-mini{position:absolute;top:8px;right:8px;z-index:3;border:1px solid rgba(140,172,255,.5);background:rgba(10,24,56,.82);color:#e8eeff;border-radius:999px;',
    'padding:5px 10px;font:600 11px/1 inherit;font-family:inherit;cursor:pointer;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}',
    '.otz-mini:hover{background:#3f6ff0;border-color:#6aa2ff}',
  ].join('');
  document.head.appendChild(css);

  var barra = document.createElement('aside');
  barra.id = 'otz-barra'; barra.setAttribute('aria-label', 'Marquinhos · otimização de páginas');
  document.body.appendChild(barra);

  function mandar(texto) {
    if (!texto) return;
    try { frame.contentWindow.postMessage({ tipo: 'otimizar-texto', texto: texto }, location.origin); } catch (e) {}
  }
  function abrir(texto) {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Marquinhos'; frame.src = '/otimizar/terminal.html?barra=1&v=4';
      frame.addEventListener('load', function () { if (pendente) { mandar(pendente); pendente = null; } });
      barra.appendChild(frame);
      if (texto) pendente = texto;
    } else if (texto) mandar(texto);
    aberta = true; barra.classList.add('aberta'); document.documentElement.classList.add('otz-com-barra'); empurrar();
    try { sessionStorage.setItem('otz-aberta', '1'); } catch (e) {}
  }
  function fechar() {
    aberta = false; barra.classList.remove('aberta'); document.documentElement.classList.remove('otz-com-barra'); soltar();
    try { sessionStorage.removeItem('otz-aberta'); } catch (e) {}
  }
  // A margem do body não move o que é position:fixed (popup de alerta, widget do Monge Auro, fundos de modal).
  // Esses são deslocados à parte: o que está centralizado recentraliza no espaço que sobra, o que encosta à direita
  // vai para a esquerda da barra e o que ocupa a largura toda encolhe.
  function soltar() {
    document.querySelectorAll('[data-otz-empurrado]').forEach(function (el) {
      el.style.translate = el.getAttribute('data-otz-tr') || ''; el.style.right = el.getAttribute('data-otz-r') || '';
      el.removeAttribute('data-otz-empurrado'); el.removeAttribute('data-otz-tr'); el.removeAttribute('data-otz-r');
    });
  }
  function empurrar() {
    if (!aberta) return;
    if (innerWidth <= 900) { soltar(); return; }
    var w = barra.offsetWidth + 24, vw = innerWidth;
    document.body.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *').forEach(function (el) {
      if (el === barra || barra.contains(el) || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
      var cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none') return;
      if (!el.hasAttribute('data-otz-empurrado')) {
        el.setAttribute('data-otz-empurrado', ''); el.setAttribute('data-otz-tr', el.style.translate || ''); el.setAttribute('data-otz-r', el.style.right || '');
      }
      el.style.translate = el.getAttribute('data-otz-tr'); el.style.right = el.getAttribute('data-otz-r');
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (r.left <= 2 && r.width < vw * 0.5) return; // menu da esquerda: fica onde está
      if (r.width >= vw * 0.9) { el.style.right = w + 'px'; return; }
      var meio = (r.left + r.right) / 2;
      if (Math.abs(meio - vw / 2) < 40) el.style.translate = (-w / 2) + 'px 0';
      else if (r.right > vw - w) el.style.translate = (-w) + 'px 0';
    });
  }
  setInterval(empurrar, 700); // alertas e widgets aparecem depois
  window.addEventListener('resize', empurrar);

  window.otimizarAbrir = abrir;
  window.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.tipo === 'otimizar-fechar') fechar(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberta) fechar(); });

  // botão na barra de ações da aba LPs
  function botaoPrincipal() {
    var alvo = document.querySelector('#tLps .barra-acoes');
    if (!alvo || alvo.querySelector('.otz-btn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'otz-btn';
    b.innerHTML = '<img src="/otimizar/marquinhos.webp" alt="" width="24" height="24">Otimizar com o Marquinhos';
    b.addEventListener('click', function () { aberta ? fechar() : abrir(); });
    alvo.appendChild(b);
  }
  // "⚡ Otimizar" em cada cartão de página (o link do cartão é a página)
  function botoesCartoes() {
    document.querySelectorAll('#lpsBox article.lpc').forEach(function (c) {
      if (c.querySelector('.otz-mini')) return;
      var a = c.querySelector('a.tel[href^="http"]'); if (!a) return;
      if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'otz-mini'; b.textContent = '⚡ Otimizar';
      b.title = 'Otimizar esta página com o Marquinhos';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); abrir('Otimiza isso aqui: ' + a.href); });
      c.appendChild(b);
    });
  }
  botaoPrincipal(); botoesCartoes();
  new MutationObserver(function () { botaoPrincipal(); botoesCartoes(); })
    .observe(document.getElementById('tLps') || document.body, { childList: true, subtree: true });

  // /otimizar → /central?otimizar=1#lps : abre já com a barra
  var p = new URLSearchParams(location.search), pedir = p.has('otimizar'), lembrada = false;
  try { lembrada = sessionStorage.getItem('otz-aberta') === '1'; } catch (e) {}
  if (pedir) {
    if (location.hash !== '#lps') location.hash = '#lps';
    p.delete('otimizar');
    history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '') + location.hash);
  }
  if (pedir || lembrada) abrir();
})();
