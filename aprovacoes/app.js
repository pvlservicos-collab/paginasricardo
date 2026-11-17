// Tela de aprovação de acessos (superadmin). Tudo é conferido de novo no servidor (api/aprovacoes/*, lib/aprovacao.mjs).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var gPronto = false;

  function api(metodo, caminho, corpo) {
    var op = { method: metodo, credentials: 'same-origin', headers: {} };
    if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch(caminho, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.erro || 'Não foi possível agora. Tente de novo.'); e.status = r.status; throw e; }
        return j;
      });
    });
  }
  function tela(id) { ['carregando', 'telaLogin', 'telaPedidos'].forEach(function (t) { $(t).hidden = t !== id; }); }
  function el(tag, cls, texto) { var e = document.createElement(tag); if (cls) e.className = cls; if (texto !== undefined) e.textContent = texto; return e; }
  function quando(v) { if (!v) return ''; var d = new Date(v); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  var ROTULO = { pendente: 'Aguardando', aprovado: 'Aprovado', recusado: 'Recusado' };

  /* ---------- login com Google ---------- */
  function googleBotao(clientId) {
    if (!clientId) { $('lErro').textContent = 'Login com Google não configurado.'; return; }
    function monta() {
      if (!(window.google && google.accounts && google.accounts.id)) return;
      if (!gPronto) {
        google.accounts.id.initialize({
          client_id: clientId, ux_mode: 'popup',
          callback: function (r) {
            $('lErro').textContent = '';
            api('POST', '/api/aprovacoes/login', { credential: r.credential }).then(iniciar).catch(function (e) { $('lErro').textContent = e.message; });
          },
        });
        gPronto = true;
      }
      if (!$('gBtn').childElementCount) google.accounts.id.renderButton($('gBtn'), { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'pill', width: Math.min(320, $('gBtn').clientWidth || 320), locale: 'pt-BR' });
    }
    if (document.getElementById('gsi')) { monta(); return; }
    var s = document.createElement('script');
    s.id = 'gsi'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = monta; s.onerror = function () { s.remove(); $('lErro').textContent = 'Não consegui carregar o login do Google. Recarregue a página.'; };
    document.head.appendChild(s);
  }

  /* ---------- pedidos ---------- */
  function linha(sistema, p) {
    var it = el('div', 'item');
    var quem = el('div', 'quem');
    quem.appendChild(el('b', '', p.nome || p.email));
    var det = [p.email];
    if (p.empresa) det.push(p.empresa);
    if (p.origem) det.push(p.origem === 'google' ? 'conta Google' : 'e-mail e senha');
    if (p.pedido_em) det.push('pedido em ' + quando(p.pedido_em));
    if (p.status !== 'pendente' && p.decidido_em) det.push((p.status === 'aprovado' ? 'aprovado' : 'recusado') + ' em ' + quando(p.decidido_em));
    quem.appendChild(el('span', '', det.join(' · ')));
    it.appendChild(quem);
    it.appendChild(el('span', 'selo ' + p.status, ROTULO[p.status] || p.status));
    var acoes = el('div', 'acoes');
    if (p.status !== 'aprovado') acoes.appendChild(botao('Aprovar', 'bt-ok', sistema, p.email, 'aprovar'));
    if (p.status !== 'recusado') acoes.appendChild(botao('Recusar', 'bt-no', sistema, p.email, 'recusar'));
    it.appendChild(acoes);
    return it;
  }
  function botao(texto, cls, sistema, email, acao) {
    var b = el('button', cls, texto); b.type = 'button';
    b.onclick = function () {
      if (acao === 'recusar' && !confirm('Recusar o acesso de ' + email + '?')) return;
      b.disabled = true; $('pErro').textContent = '';
      api('POST', '/api/aprovacoes/pedidos', { sistema: sistema, email: email, acao: acao })
        .then(carregar)
        .catch(function (e) { b.disabled = false; if (e.status === 401) { iniciar(); return; } $('pErro').textContent = e.message; });
    };
    return b;
  }
  function desenha(alvo, sistema, itens) {
    var c = $(alvo); if (!c) return; c.innerHTML = '';
    var ordem = { pendente: 0, aprovado: 1, recusado: 2 };
    itens = (itens || []).slice().sort(function (a, b) { return (ordem[a.status] - ordem[b.status]) || String(b.pedido_em || '').localeCompare(String(a.pedido_em || '')); });
    if (!itens.length) { c.appendChild(el('div', 'vazio', 'Nenhum pedido.')); return; }
    itens.forEach(function (p) { c.appendChild(linha(sistema, p)); });
  }
  function carregar() {
    return api('GET', '/api/aprovacoes/pedidos').then(function (j) {
      desenha('lRota', 'rota', j.rota);
      desenha('lCentral', 'central', j.central);
    }).catch(function (e) { if (e.status === 401) { iniciar(); return; } $('pErro').textContent = e.message; });
  }

  function iniciar() {
    api('GET', '/api/aprovacoes/login').then(function (j) {
      if (!j.logado) { tela('telaLogin'); googleBotao(j.google); return; }
      $('eu').textContent = j.email;
      tela('telaPedidos');
      carregar();
    }).catch(function (e) { tela('telaLogin'); $('lErro').textContent = e.message; });
  }
  $('sair').onclick = function () { api('DELETE', '/api/aprovacoes/login').catch(function () {}).then(function () { location.reload(); }); };
  iniciar();
})();
