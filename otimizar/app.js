// Marquinhos (/otimizar) — conversa com o Claude Code da VPS pela fila do banco (api/otimizar.js). Login do painel.
// Em tela cheia (/otimizar/terminal.html) ou dentro da barra da Central (?barra=1, ver otimizar/barra.js).
(function () {
  'use strict';
  var API = '/api/otimizar';
  var $ = function (id) { return document.getElementById(id); };
  var tela = $('tela'), form = $('form'), entrada = $('entrada'), bEnviar = $('b-enviar'), bParar = $('b-parar'), bNova = $('b-nova');
  var stEl = $('status'), atalhos = $('atalhos');
  var barra = /[?&]barra=1/.test(location.search);
  var atual = null; // pedido em andamento: { id, digitando, grupo }
  if (barra) document.body.classList.add('barra');

  // a Central manda o pedido pronto (botão "⚡ Otimizar" do cartão)
  window.addEventListener('message', function (e) {
    if (e.origin !== location.origin || !e.data || e.data.tipo !== 'otimizar-texto') return;
    entrada.value = String(e.data.texto || ''); ajustar(); entrada.focus();
  });
  $('b-fechar').addEventListener('click', function () { try { parent.postMessage({ tipo: 'otimizar-fechar' }, location.origin); } catch (e) {} });

  // chave da Central (quem já abriu interno.grupor1.com): entra sem login
  function chaveCentral() {
    try { var c = JSON.parse(localStorage.getItem('r1int') || 'null'); return c && c.chave && (!c.exp || c.exp > Date.now()) ? String(c.chave) : ''; } catch (e) { return ''; }
  }
  function chamar(metodo, corpo, qs) {
    var h = corpo ? { 'Content-Type': 'application/json' } : {}, k = chaveCentral();
    if (k) h['X-Central-Chave'] = k;
    return fetch(API + (qs || ''), {
      method: metodo, credentials: 'same-origin',
      headers: h, body: corpo ? JSON.stringify(corpo) : undefined,
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { semLogin(); throw new Error('login'); }
        if (!r.ok) throw new Error(j.erro || 'Erro ' + r.status);
        return j;
      });
    });
  }

  /* ---------- desenho ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // markdown mínimo e seguro: escapa tudo e só então liga **negrito**, `código` e links
  function md(s) {
    return esc(s)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
      .replace(/(https?:\/\/[^\s<>"')]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function rolar() { tela.scrollTop = tela.scrollHeight; }
  function por(el) { tela.insertBefore(el, atual && atual.digitando && atual.digitando.parentNode === tela ? atual.digitando : null); rolar(); return el; }
  function bolha(classe, texto) { var d = document.createElement('div'); d.className = 'msg ' + classe; d.innerHTML = md(texto); return por(d); }
  function meta(texto) { var d = document.createElement('div'); d.className = 'meta'; d.textContent = texto; return por(d); }
  function novoGrupo() {
    var d = document.createElement('details'); d.className = 'passos';
    d.innerHTML = '<summary><span class="seta">›</span><span class="n">trabalhando</span><span class="ult"></span></summary><div class="lista"></div>';
    d.n = 0; por(d); return d;
  }
  function passo(ctx, c) {
    if (!ctx.grupo) ctx.grupo = novoGrupo();
    var g = ctx.grupo, lista = g.querySelector('.lista');
    if (c.t === 'cmd') {
      g.n++; g.querySelector('.n').textContent = g.n + (g.n === 1 ? ' passo' : ' passos');
      g.querySelector('.ult').textContent = c.v.split('\n')[0];
      var p = document.createElement('div'); p.className = 'passo'; p.textContent = c.v; lista.appendChild(p);
    } else {
      var d = document.createElement('details'); d.className = 'saida';
      var linhas = String(c.v).split('\n');
      d.innerHTML = '<summary></summary><pre></pre>';
      d.querySelector('summary').textContent = (c.t === 'erro' ? '✕ ' : '↳ ') + linhas[0].slice(0, 120) + (linhas.length > 1 ? '  (+' + (linhas.length - 1) + ')' : '');
      d.querySelector('pre').textContent = c.v;
      if (c.t === 'erro') d.querySelector('summary').style.color = 'var(--erro)';
      lista.appendChild(d);
    }
    rolar();
  }
  // ctx guarda o grupo de passos aberto do pedido; texto do Marquinhos fecha o grupo
  function pedaco(ctx, c) {
    if (c.t === 'texto') { ctx.grupo = null; bolha('ele', c.v); }
    else if (c.t === 'cmd' || c.t === 'saida') passo(ctx, c);
    else if (c.t === 'erro') { if (ctx.grupo && ctx.grupo.n) passo(ctx, c); else bolha('erro', c.v); }
    else if (c.t === 'fim') { ctx.grupo = null; meta(c.v.replace(/^—\s*/, '')); }
  }
  function digitando(texto) {
    var d = document.createElement('div'); d.className = 'digitando';
    d.innerHTML = '<span class="p"><i></i><i></i><i></i></span><span class="t"></span>'; d.querySelector('.t').textContent = texto;
    tela.appendChild(d); rolar(); return d;
  }

  function ocupado(sim) { bEnviar.disabled = sim; bParar.hidden = !sim; bNova.disabled = sim; atalhos.querySelectorAll('button').forEach(function (b) { b.disabled = sim; }); }
  function acompanhar(id, cursor) {
    if (!atual || atual.id !== id) return;
    chamar('GET', null, '?id=' + encodeURIComponent(id) + '&cursor=' + cursor).then(function (j) {
      if (!atual || atual.id !== id) return;
      (j.chunks || []).forEach(function (c) { pedaco(atual, c); });
      var t = atual.digitando.querySelector('.t');
      t.textContent = j.estado === 'pendente' ? 'na fila…' : j.estado === 'parar' ? 'parando…' : 'trabalhando…';
      if (j.estado === 'pronto') { atual.digitando.remove(); atual = null; ocupado(false); entrada.focus(); return; }
      setTimeout(function () { acompanhar(id, j.total); }, 1500);
    }).catch(function (e) { if (e.message !== 'login') setTimeout(function () { acompanhar(id, cursor); }, 3000); });
  }
  function enviar(texto) {
    var ola = tela.querySelector('.ola'); if (ola) ola.remove();
    bolha('eu', texto); ocupado(true);
    var dg = digitando('enviando…');
    atual = { id: null, digitando: dg, grupo: null };
    chamar('POST', { texto: texto }).then(function (j) { atual.id = j.id; acompanhar(j.id, 0); })
      .catch(function (e) { dg.remove(); atual = null; if (e.message !== 'login') bolha('erro', 'Não consegui enviar: ' + e.message); ocupado(false); });
  }

  /* ---------- entrada ---------- */
  function ajustar() { entrada.style.height = 'auto'; entrada.style.height = Math.min(260, Math.max(92, entrada.scrollHeight)) + 'px'; }
  form.addEventListener('submit', function (ev) {
    ev.preventDefault(); var t = entrada.value.trim(); if (!t || atual) return;
    entrada.value = ''; ajustar(); enviar(t);
  });
  entrada.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  entrada.addEventListener('input', ajustar);
  bParar.addEventListener('click', function () { if (atual && atual.id) { chamar('POST', { acao: 'parar', id: atual.id }).catch(function () {}); atual.digitando.querySelector('.t').textContent = 'parando…'; } });
  bNova.addEventListener('click', function () {
    if (atual || !confirm('Começar uma conversa nova? O Marquinhos esquece o que foi falado nesta.')) return;
    chamar('POST', { acao: 'nova' }).then(function () { tela.innerHTML = ''; boasVindas(); }).catch(function (e) { bolha('erro', e.message); });
  });
  // mensagens rápidas: um clique já manda (o que estiver escrito na caixa vai junto)
  [['⚡ Otimiza isso aqui:', 'Otimiza isso aqui:'], ['📊 Mede a nota', 'Mede a nota do PageSpeed (celular, mediana de 3) desta página:'],
   ['↩︎ Desfaz a última', 'Desfaz a última otimização desta página:'], ['🧠 O que você já aprendeu?', 'Resume em tópicos curtos o que você já aprendeu otimizando as nossas páginas (o que funciona e o que não funciona).']]
    .forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = a[0];
      b.addEventListener('click', function () {
        if (atual) return;
        var extra = entrada.value.trim(); entrada.value = ''; ajustar();
        enviar(a[1] + (extra ? ' ' + extra : ''));
      });
      atalhos.appendChild(b);
    });

  /* ---------- estados ---------- */
  function boasVindas() {
    var d = document.createElement('div'); d.className = 'ola';
    d.innerHTML = '<img src="/otimizar/marquinhos.webp" alt="" width="88" height="88"><h2>Oi! Eu sou o Marquinhos.</h2>' +
      '<p>Me manda o link da página que eu meço, otimizo, publico com backup e meço de novo. GTM e Pixel continuam na abertura, e mudança no visual eu pergunto antes.</p>';
    tela.appendChild(d);
  }
  var mostrouLogin = false;
  function semLogin() {
    if (mostrouLogin) return; mostrouLogin = true;
    form.parentNode.hidden = true;
    tela.innerHTML = '<div class="ola"><img src="/otimizar/marquinhos.webp" alt="" width="84" height="84"><h2>Entre para falar comigo</h2>' +
      '<p id="login-msg">Abra a Central (interno.grupor1.com) uma vez neste navegador e eu libero sozinho. Ou entre com a conta Google do Grupo R1:</p><div id="g-botao" style="display:flex;justify-content:center;margin-top:16px;min-height:44px"></div>' +
      '<p style="margin-top:18px;font-size:13px">Admin do painel? <a href="/painel" target="_blank" rel="noopener" style="color:var(--ciano)">Entrar no painel ↗</a> e depois ' +
      '<button class="ic" type="button" id="b-recarregar" style="display:inline-flex;width:auto;height:30px;padding:0 12px;vertical-align:middle">recarregar</button></p></div>';
    $('b-recarregar').addEventListener('click', function () { location.reload(); });
    var msg = $('login-msg');
    fetch('/api/criacao/login', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.logado && j.email) msg.textContent = j.email + ' ainda não está liberado para usar o Marquinhos. Peça para o Pedro liberar.';
      if (!j.google) { msg.textContent = 'Login com Google indisponível agora.'; return; }
      var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = function () {
        google.accounts.id.initialize({ client_id: j.google, callback: function (resp) {
          msg.textContent = 'Entrando…';
          fetch('/api/criacao/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential: resp.credential }) })
            .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.erro || 'Não deu para entrar.'); }); })
            .then(function () { location.reload(); })
            .catch(function (e) { msg.textContent = e.message; });
        } });
        google.accounts.id.renderButton($('g-botao'), { theme: 'filled_blue', shape: 'pill', size: 'large', text: 'signin_with', locale: 'pt-BR' });
      };
      document.head.appendChild(s);
    }).catch(function () { msg.textContent = 'Não consegui carregar o login agora.'; });
  }
  function status() {
    chamar('GET').then(function (j) {
      if (!j.pode) { tela.innerHTML = '<div class="ola"><h2>Sem acesso</h2><p>' + esc(j.voce || '') + ' ainda não pode usar o Marquinhos. Peça para um admin do painel.</p></div>'; form.parentNode.hidden = true; return; }
      var v = j.vps || {}, s = stEl.querySelector('em');
      stEl.className = 'status ' + (!v.online || !v.logado ? 'erro' : v.ocupado ? 'ocupado' : 'ok');
      s.textContent = !v.online ? 'fora do ar' : !v.logado ? 'sem login do Claude' : v.ocupado ? 'trabalhando' + (v.fila ? ' · ' + v.fila + ' na fila' : '') : 'online · otimizador de páginas';
      setTimeout(status, 15000);
    }).catch(function (e) { if (e.message !== 'login') setTimeout(status, 15000); });
  }

  chamar('GET', null, '?historico=1').then(function (j) {
    var itens = j.itens || [];
    if (!itens.length) boasVindas();
    itens.forEach(function (it) {
      bolha('eu', it.texto);
      var ctx = { grupo: null }; (it.chunks || []).forEach(function (c) { pedaco(ctx, c); });
      if (it.estado !== 'pronto') {
        ocupado(true);
        atual = { id: it.id, digitando: digitando('trabalhando…'), grupo: ctx.grupo };
        var mostrados = (it.chunks || []).length; setTimeout(function () { acompanhar(it.id, mostrados); }, 500);
      }
    });
    status(); entrada.focus();
  }).catch(function () {});
})();
