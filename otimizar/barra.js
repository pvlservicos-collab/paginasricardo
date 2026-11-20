// Barra lateral do terminal de otimização, para a Central (interno.grupor1.com/central, aba LPs).
// Pedido do Lucas (20/11/2026). A Central carrega este arquivo com <script src="/otimizar/barra.js" defer>.
//  - botão "Otimizar com Claude" na barra de ações da aba LPs + "⚡ Otimizar" em cada cartão de página;
//  - a barra abre à direita com o terminal (/otimizar/terminal.html) num iframe;
//  - /otimizar redireciona para /central?otimizar=1#lps → abre a aba LPs com a barra aberta.
(function () {
  'use strict';
  if (window.__otimizarBarra) return; window.__otimizarBarra = true;
  var LARG = 'min(520px, 100vw)', aberta = false, frame = null, pendente = null;

  var css = document.createElement('style');
  css.textContent = [
    '#otz-barra{position:fixed;top:0;right:0;height:100vh;height:100dvh;width:' + LARG + ';z-index:2147482000;background:#0d1117;border-left:1px solid #262c36;',
    'box-shadow:-18px 0 50px rgba(0,0,0,.45);transform:translateX(105%);transition:transform .22s ease;display:flex;flex-direction:column}',
    '#otz-barra.aberta{transform:none}',
    '#otz-barra .otz-top{display:flex;align-items:center;gap:10px;padding:8px 10px;border-bottom:1px solid #262c36;background:#161b22;color:#d7dde5;font:600 13px/1.2 ui-monospace,Menlo,Consolas,monospace}',
    '#otz-barra .otz-top b{color:#57d39b}#otz-barra .otz-top span{flex:1}',
    '#otz-barra .otz-top button,#otz-barra .otz-top a{background:transparent;border:1px solid #262c36;color:#8b949e;border-radius:7px;padding:4px 9px;cursor:pointer;font:inherit;font-weight:400;text-decoration:none}',
    '#otz-barra .otz-top button:hover,#otz-barra .otz-top a:hover{color:#d7dde5;border-color:#8b949e}',
    '#otz-barra iframe{flex:1;width:100%;border:0;background:#0d1117}',
    'body.otz-com-barra{margin-right:' + LARG + '}',
    '@media (max-width:900px){body.otz-com-barra{margin-right:0}}',
    '.otz-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(87,211,155,.55);background:rgba(87,211,155,.12);color:#57d39b;border-radius:10px;',
    'padding:8px 12px;font:600 13px/1 inherit;font-family:inherit;cursor:pointer;white-space:nowrap}',
    '.otz-btn:hover{background:rgba(87,211,155,.22)}',
    '.otz-mini{position:absolute;top:8px;right:8px;z-index:3;border:1px solid rgba(87,211,155,.6);background:rgba(13,17,23,.88);color:#57d39b;border-radius:8px;',
    'padding:4px 8px;font:600 11px/1 inherit;font-family:inherit;cursor:pointer;opacity:.92}',
    '.otz-mini:hover{opacity:1;background:#0d1117}',
  ].join('');
  document.head.appendChild(css);

  var barra = document.createElement('aside');
  barra.id = 'otz-barra'; barra.setAttribute('aria-label', 'Terminal de otimização');
  barra.innerHTML = '<div class="otz-top"><b>&gt;_</b><span>Otimizar · Claude na VPS</span>' +
    '<a href="/otimizar/terminal.html" target="_blank" rel="noopener" title="Abrir em tela cheia">⤢</a>' +
    '<button type="button" data-otz="fechar" title="Fechar">✕</button></div>';
  document.body.appendChild(barra);
  barra.querySelector('[data-otz="fechar"]').addEventListener('click', function () { fechar(); });

  function mandar(texto) {
    if (!texto) return;
    try { frame.contentWindow.postMessage({ tipo: 'otimizar-texto', texto: texto }, location.origin); } catch (e) {}
  }
  function abrir(texto) {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'Terminal de otimização'; frame.src = '/otimizar/terminal.html?barra=1';
      frame.addEventListener('load', function () { if (pendente) { mandar(pendente); pendente = null; } });
      barra.appendChild(frame);
      if (texto) pendente = texto;
    } else if (texto) mandar(texto);
    aberta = true; barra.classList.add('aberta'); document.body.classList.add('otz-com-barra');
    try { sessionStorage.setItem('otz-aberta', '1'); } catch (e) {}
  }
  function fechar() {
    aberta = false; barra.classList.remove('aberta'); document.body.classList.remove('otz-com-barra');
    try { sessionStorage.removeItem('otz-aberta'); } catch (e) {}
  }
  window.otimizarAbrir = abrir;
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && aberta && document.activeElement !== frame) fechar(); });

  // botão na barra de ações da aba LPs
  function botaoPrincipal() {
    var alvo = document.querySelector('#tLps .barra-acoes');
    if (!alvo || alvo.querySelector('.otz-btn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'otz-btn';
    b.innerHTML = '<span aria-hidden="true">⚡</span> Otimizar com Claude';
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
      b.title = 'Otimizar esta página com o Claude';
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); abrir('Otimiza a página ' + a.href); });
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
