// Gestão de membros da Central R1. Tudo é conferido de novo no servidor (api/central/*).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var eu = null, membros = [], protecao = false, endereco = 'https://interno.grupor1.com/centralr1';

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
  function tela(id) {
    ['carregando', 'telaLogin', 'telaSemAcesso', 'telaAdmin'].forEach(function (t) { $(t).hidden = t !== id; });
  }
  function quando(v) {
    if (!v) return '—';
    var d = new Date(v);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  function el(tag, attrs, texto) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  /* ---------- início ---------- */
  function iniciar() {
    api('GET', '/api/central/login').then(function (j) {
      if (!j.logado) { tela('telaLogin'); $('lUser').focus(); return; }
      eu = j.membro;
      if (eu.papel !== 'admin') { tela('telaSemAcesso'); return; }
      $('eu').textContent = eu.nome;
      tela('telaAdmin');
      carregar();
    }).catch(function (e) { tela('telaLogin'); $('lErro').textContent = e.message; });
  }

  $('fLogin').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('lBtn').disabled = true; $('lErro').textContent = '';
    api('POST', '/api/central/login', { usuario: $('lUser').value, senha: $('lSenha').value })
      .then(function () { $('lSenha').value = ''; iniciar(); })
      .catch(function (e) { $('lErro').textContent = e.message; })
      .then(function () { $('lBtn').disabled = false; });
  });

  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('[data-sair]')) return;
    api('DELETE', '/api/central/login').catch(function () {}).then(function () { location.reload(); });
  });

  /* ---------- lista ---------- */
  function carregar() {
    return api('GET', '/api/central/membros').then(function (j) {
      membros = j.membros || []; protecao = Boolean(j.protecao); endereco = j.endereco || endereco;
      desenharProtecao(); desenharMembros();
    }).catch(function (e) {
      if (e.status === 401) { tela('telaLogin'); return; }
      $('mErro').textContent = e.message;
    });
  }

  function desenharProtecao() {
    $('pEstado').textContent = protecao ? 'Ligada' : 'Desligada';
    $('pEstado').className = 'selo ' + (protecao ? 'lig' : 'des');
    $('pTexto').textContent = protecao
      ? 'As páginas do interno.grupor1.com só abrem para quem tem conta ativa aqui. Quem não está logado vê a tela de entrada.'
      : 'As páginas do interno.grupor1.com ainda abrem como antes, sem pedir este login. Crie as contas da equipe e depois ligue.';
    $('pBtn').textContent = protecao ? 'Desligar proteção' : 'Ligar proteção';
    $('pBtn').className = protecao ? 'btn perigo' : 'pri';
  }

  $('pBtn').addEventListener('click', function () {
    var ligar = !protecao;
    var ativos = membros.filter(function (m) { return m.ativo; }).length;
    var msg = ligar
      ? 'Ligar a proteção agora? A partir disso, só as ' + ativos + ' conta(s) ativa(s) daqui conseguem abrir as páginas do interno.grupor1.com.'
      : 'Desligar a proteção? As páginas do interno.grupor1.com voltam a abrir sem este login.';
    if (!confirm(msg)) return;
    $('pBtn').disabled = true;
    api('POST', '/api/central/membros', { acao: 'protecao', ligada: ligar })
      .then(function (j) { protecao = j.protecao; desenharProtecao(); })
      .catch(function (e) { alert(e.message); })
      .then(function () { $('pBtn').disabled = false; });
  });

  function desenharMembros() {
    var tb = $('tMembros').querySelector('tbody');
    tb.textContent = '';
    var ativos = membros.filter(function (m) { return m.ativo; }).length;
    $('mConta').textContent = '(' + ativos + ' ativo' + (ativos === 1 ? '' : 's') + ' de ' + membros.length + ')';
    if (!membros.length) { var tr0 = el('tr'); tr0.appendChild(el('td', { colspan: '6' }, 'Nenhum membro ainda.')); tb.appendChild(tr0); return; }
    membros.forEach(function (m) {
      var sou = eu && m.login === eu.login;
      var tr = el('tr', m.ativo ? {} : { class: 'off' });
      var tdNome = el('td', { 'data-r': 'Nome' }, m.nome);
      if (sou) tdNome.appendChild(el('span', { class: 'voce' }, ' (você)'));
      tr.appendChild(tdNome);
      tr.appendChild(el('td', { 'data-r': 'E-mail' }, m.login));
      tr.appendChild(el('td', { 'data-r': 'Papel' }, m.papel === 'admin' ? 'Admin' : 'Membro'));
      tr.appendChild(el('td', { 'data-r': 'Situação' }, m.ativo ? 'Ativo' : 'Desativado'));
      tr.appendChild(el('td', { 'data-r': 'Último acesso' }, quando(m.ultimo_acesso)));
      var ac = el('td', { class: 'acoes' });
      ac.appendChild(botao('Nova senha', function () { gerarSenha(m); }));
      if (!sou) {
        ac.appendChild(botao(m.papel === 'admin' ? 'Tornar membro' : 'Tornar admin', function () { alterar(m, { papel: m.papel === 'admin' ? 'membro' : 'admin' }); }));
        ac.appendChild(botao(m.ativo ? 'Desativar' : 'Ativar', function () {
          if (m.ativo && !confirm('Desativar ' + m.nome + '? O acesso cai na hora.')) return;
          alterar(m, { ativo: !m.ativo });
        }));
        ac.appendChild(botao('Excluir', function () { excluir(m); }, 'perigo'));
      }
      tr.appendChild(ac);
      tb.appendChild(tr);
    });
  }
  function botao(texto, fn, classe) { var b = el('button', { type: 'button', class: classe || '' }, texto); b.addEventListener('click', fn); return b; }

  function alterar(m, d) {
    $('mErro').textContent = '';
    d.login = m.login;
    api('PATCH', '/api/central/membros', d).then(carregar).catch(function (e) { $('mErro').textContent = e.message; });
  }
  function excluir(m) {
    if (!confirm('Excluir ' + m.nome + ' (' + m.login + ') de vez? Para só bloquear, use Desativar.')) return;
    $('mErro').textContent = '';
    api('DELETE', '/api/central/membros?login=' + encodeURIComponent(m.login)).then(carregar).catch(function (e) { $('mErro').textContent = e.message; });
  }
  function gerarSenha(m) {
    var aviso = m.login === (eu && eu.login) ? ' Você vai precisar entrar de novo com a senha nova.' : ' A senha atual para de funcionar e as sessões abertas caem.';
    if (!confirm('Gerar uma senha nova para ' + m.nome + '?' + aviso)) return;
    api('POST', '/api/central/membros', { acao: 'senha', login: m.login })
      .then(function (j) { mostrarSenha('Senha nova de ' + m.nome, j.login, j.senha); carregar(); })
      .catch(function (e) { $('mErro').textContent = e.message; });
  }

  /* ---------- criar ---------- */
  $('fNovo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    $('nErro').textContent = ''; $('nBtn').disabled = true;
    var nome = $('nNome').value.trim();
    api('POST', '/api/central/membros', { nome: nome, login: $('nLogin').value.trim(), papel: $('nPapel').value })
      .then(function (j) {
        $('nNome').value = ''; $('nLogin').value = ''; $('nPapel').value = 'membro';
        mostrarSenha('Acesso criado para ' + nome, j.login, j.senha);
        carregar();
      })
      .catch(function (e) { $('nErro').textContent = e.message; })
      .then(function () { $('nBtn').disabled = false; });
  });

  /* ---------- senha mostrada uma vez ---------- */
  function mostrarSenha(titulo, login, senha) {
    $('sTitulo').textContent = titulo;
    $('sEnd').textContent = endereco; $('sLogin').textContent = login; $('sSenha').textContent = senha;
    $('sOk').textContent = '';
    $('cSenha').hidden = false;
    $('cSenha').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  $('sCopiar').addEventListener('click', function () {
    var txt = 'Seu acesso à Central R1\n' + $('sEnd').textContent + '\nE-mail: ' + $('sLogin').textContent + '\nSenha: ' + $('sSenha').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(
      function () { $('sOk').textContent = 'Copiado. Envie por um canal privado (ex.: WhatsApp direto).'; },
      function () { $('sOk').textContent = 'Não consegui copiar sozinho: selecione e copie à mão.'; });
  });
  $('sFechar').addEventListener('click', function () {
    $('cSenha').hidden = true; $('sSenha').textContent = ''; $('sLogin').textContent = '';
  });

  iniciar();
})();
