// /otimizar — conversa com o Claude Code da VPS pela fila do banco (api/otimizar.js). Login do painel.
(function () {
  'use strict';
  var API = '/api/otimizar';
  var tela = document.getElementById('tela'), form = document.getElementById('form'), entrada = document.getElementById('entrada');
  var bEnviar = document.getElementById('b-enviar'), bParar = document.getElementById('b-parar'), bNova = document.getElementById('b-nova');
  var stEl = document.getElementById('status'), atalhos = document.getElementById('atalhos');
  var atual = null; // { id, cursor, pensando }
  // dentro da barra lateral da Central (otimizar/barra.js): layout compacto e pedido vindo do cartão da página
  if (/[?&]barra=1/.test(location.search)) document.body.classList.add('barra');
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.tipo !== 'otimizar-texto') return;
    entrada.value = String(e.data.texto || ''); entrada.dispatchEvent(new Event('input')); entrada.focus();
  });

  function chamar(metodo, corpo, qs) {
    return fetch(API + (qs || ''), {
      method: metodo, credentials: 'same-origin',
      headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { semLogin(); throw new Error('login'); }
        if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
        return j;
      });
    });
  }
  function semLogin() {
    tela.innerHTML = '<p class="l vazio">Entre no painel primeiro. O terminal usa o mesmo login do Painel de Páginas.</p>' +
      '<p class="l"><a href="/painel" target="_blank" rel="noopener">Entrar no painel (abre outra aba) →</a></p><p class="l"><button class="btn" type="button" id="b-recarregar">Já entrei</button></p>';
    document.getElementById('b-recarregar').addEventListener('click', function () { location.reload(); });
    form.hidden = true; atalhos.hidden = true;
  }
  function rolar() { tela.scrollTop = tela.scrollHeight; }
  function linha(classe, texto) {
    var p = document.createElement('p'); p.className = 'l ' + classe;
    // links clicáveis, o resto como texto
    String(texto).split(/(https?:\/\/[^\s<>"')]+)/).forEach(function (pedaco, i) {
      if (i % 2) { var a = document.createElement('a'); a.href = pedaco; a.target = '_blank'; a.rel = 'noopener'; a.textContent = pedaco; p.appendChild(a); }
      else p.appendChild(document.createTextNode(pedaco));
    });
    tela.appendChild(p); rolar(); return p;
  }
  function saida(texto) {
    var d = document.createElement('details'); d.className = 'saida';
    var s = document.createElement('summary'), linhas = String(texto).split('\n');
    s.textContent = linhas[0].slice(0, 140) + (linhas.length > 1 ? '  (+' + (linhas.length - 1) + ' linhas)' : '');
    var pre = document.createElement('pre'); pre.textContent = texto;
    d.appendChild(s); d.appendChild(pre); tela.appendChild(d); rolar();
  }
  function pedaco(c) {
    if (c.t === 'texto') linha('texto', c.v);
    else if (c.t === 'cmd') linha('cmd', c.v);
    else if (c.t === 'saida') saida(c.v);
    else if (c.t === 'erro') linha('erro', c.v);
    else if (c.t === 'fim') linha('fim', c.v);
  }

  function ocupado(sim) {
    bEnviar.disabled = sim; bParar.hidden = !sim; bNova.disabled = sim;
  }
  function acompanhar(id, cursor) {
    if (!atual || atual.id !== id) return;
    chamar('GET', null, '?id=' + encodeURIComponent(id) + '&cursor=' + cursor).then(function (j) {
      if (!atual || atual.id !== id) return;
      if (j.chunks && j.chunks.length) { atual.pensando.remove(); j.chunks.forEach(pedaco); tela.appendChild(atual.pensando); rolar(); }
      if (j.estado === 'pendente') atual.pensando.textContent = 'na fila…';
      else if (j.estado === 'rodando') atual.pensando.textContent = 'trabalhando';
      else if (j.estado === 'parar') atual.pensando.textContent = 'parando…';
      if (j.estado === 'pronto') { atual.pensando.remove(); atual = null; ocupado(false); entrada.focus(); return; }
      setTimeout(function () { acompanhar(id, j.total); }, 1500);
    }).catch(function (e) { if (e.message !== 'login') setTimeout(function () { acompanhar(id, cursor); }, 3000); });
  }
  function enviar(texto) {
    linha('eu', texto); ocupado(true);
    var p = document.createElement('p'); p.className = 'l pensando'; p.textContent = 'enviando'; tela.appendChild(p); rolar();
    chamar('POST', { texto: texto }).then(function (j) {
      atual = { id: j.id, pensando: p }; acompanhar(j.id, 0);
    }).catch(function (e) { p.remove(); if (e.message !== 'login') linha('erro', 'Não consegui enviar: ' + e.message); ocupado(false); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); var t = entrada.value.trim(); if (!t || atual) return;
    entrada.value = ''; entrada.style.height = 'auto'; enviar(t);
  });
  entrada.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  entrada.addEventListener('input', function () { entrada.style.height = 'auto'; entrada.style.height = Math.min(200, entrada.scrollHeight) + 'px'; });
  bParar.addEventListener('click', function () { if (atual) { chamar('POST', { acao: 'parar', id: atual.id }).catch(function () {}); atual.pensando.textContent = 'parando…'; } });
  bNova.addEventListener('click', function () {
    if (atual || !confirm('Começar uma conversa nova? O Claude esquece o que foi falado nesta.')) return;
    chamar('POST', { acao: 'nova' }).then(function () { tela.innerHTML = ''; boasVindas(); }).catch(function (e) { linha('erro', e.message); });
  });
  [['Otimizar uma página', 'Otimiza a página '], ['Só medir a nota', 'Mede a nota do PageSpeed (3 rodadas, celular) da página '], ['Desfazer a última otimização', 'Desfaz a última otimização da página ']]
    .forEach(function (a) { var b = document.createElement('button'); b.type = 'button'; b.textContent = a[0]; b.addEventListener('click', function () { entrada.value = a[1]; entrada.focus(); }); atalhos.appendChild(b); });

  function boasVindas() {
    var d = document.createElement('div'); d.className = 'l vazio';
    d.innerHTML = '<b>Terminal de otimização.</b> Mande o link ou o slug da página e o que você quer. O Claude roda na VPS com as técnicas de PageSpeed que já deram certo aqui:\n' +
      '• mede antes (3 rodadas, celular), otimiza, guarda backup, publica e mede depois;\n• GTM e Pixel continuam carregando na abertura (rastreamento vem antes da nota);\n• mudança que altera o visual, ele pergunta antes.';
    tela.appendChild(d);
  }
  function status() {
    chamar('GET').then(function (j) {
      if (!j.pode) { tela.innerHTML = '<p class="l erro">Sem acesso ao terminal (' + (j.voce || '') + '). Peça para um admin do painel.</p>'; form.hidden = true; atalhos.hidden = true; return; }
      var v = j.vps || {}, s = stEl.querySelector('span');
      stEl.className = 'status ' + (!v.online ? 'erro' : !v.logado ? 'erro' : v.ocupado ? 'ocupado' : 'ok');
      s.textContent = !v.online ? 'VPS desligada' : !v.logado ? 'Claude sem login na VPS' : v.ocupado ? 'trabalhando' + (v.fila ? ' · ' + v.fila + ' na fila' : '') : 'pronto';
      setTimeout(status, 15000);
    }).catch(function (e) { if (e.message !== 'login') setTimeout(status, 15000); });
  }

  chamar('GET', null, '?historico=1').then(function (j) {
    var itens = j.itens || [];
    if (!itens.length) boasVindas();
    itens.forEach(function (it) {
      linha('eu', it.texto); (it.chunks || []).forEach(pedaco);
      if (it.estado !== 'pronto') {
        ocupado(true);
        var p = document.createElement('p'); p.className = 'l pensando'; p.textContent = 'trabalhando'; tela.appendChild(p);
        atual = { id: it.id, pensando: p };
        // os pedaços já mostrados não se repetem
        var mostrados = (it.chunks || []).length; setTimeout(function () { acompanhar(it.id, mostrados); }, 500);
      }
    });
    status(); entrada.focus();
  }).catch(function () {});
})();
