// Dashboard de análise e criação de criativos (interno.grupor1.com/dashboardscriacao).
// Tudo é conferido no servidor (api/criacao/*, lib/criacao.mjs). Esta tela só desenha e manda pedidos.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var S = { eu: null, dados: null, dias: 7, visao: '', maisCamp: false, maisCri: false, projeto: null, vista: 'canvas', filtro: '', exemplo: false, zoom: 0.8, pan: { x: 30, y: 30 }, salvarT: null, arr: null };
  var gPronto = false;
  var ESTILOS = [['hardcopy', 'HardCopy'], ['ugc', 'UGC (celular na mão)'], ['depoimento', 'Depoimento'], ['flagra', 'Flagra (cena do dia a dia)'], ['noticia', 'Notícia'], ['tela', 'Tela gravada'], ['palco', 'Palco / evento'], ['dialogo', 'Diálogo']];
  var VOZES = [['eleven', 'ElevenLabs (voz clonada)'], ['gratis', 'grátis (voz do computador)'], ['propria', 'gravação própria']];
  var ETAPAS = ['copy', 'voz', 'edição', 'revisão', 'vídeo'];
  var NOMES_TIPO = { vencedor: 'Vencedor', variacao: 'Variação', trafego: 'Tráfego', alerta: 'Alerta', analise: 'Análise' };
  var NOMES_FUNIL = { maquina_de_vendas: 'Máquina de Vendas', rgv: 'RGV', distribuicao: 'Distribuição', netflix: 'Netflix', xeque: 'Xeque-Mate', caixa: 'Caixa Forte', ctrl: 'CTRL', op27: 'Operação 2027', rgvprocessos: 'RGV Processos', black: 'Black', outros: 'Outros' };
  function funil(v) { return NOMES_FUNIL[v] || v || '—'; }
  try { S.exemplo = localStorage.getItem('dsc-exemplo') === '1'; S.visao = localStorage.getItem('dsc-visao') || ''; } catch (e) {}

  /* ---------- utilidades ---------- */
  function api(metodo, caminho, corpo) {
    var op = { method: metodo, credentials: 'same-origin', headers: {}, cache: 'no-store' };
    if (corpo !== undefined) { op.headers['Content-Type'] = 'application/json'; op.body = JSON.stringify(corpo); }
    return fetch(caminho, op).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) { var e = new Error(j.erro || 'Não foi possível agora. Tente de novo.'); e.status = r.status; e.pendente = j.pendente; throw e; }
        return j;
      });
    });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function el(tag, cls, texto) { var e = document.createElement(tag); if (cls) e.className = cls; if (texto !== undefined) e.textContent = texto; return e; }
  function tela(id) { ['carregando', 'telaLogin', 'app'].forEach(function (t) { $(t).hidden = t !== id; }); }
  var toastT;
  function toast(msg, erro) { var t = $('toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, erro ? 5000 : 2600); }
  function modal(html, aoAbrir) {
    var m = $('modal'); m.innerHTML = '<div class="cx">' + html + '</div>'; m.hidden = false;
    m.onclick = function (e) { if (e.target === m) fecharModal(); };
    m.querySelectorAll('[data-fechar]').forEach(function (b) { b.onclick = fecharModal; });
    if (aoAbrir) aoAbrir(m);
  }
  function fecharModal() { $('modal').hidden = true; $('modal').innerHTML = ''; }
  var brl = function (n, c) { return 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: c == null ? 2 : c, maximumFractionDigits: c == null ? 2 : c }); };
  var num = function (n, c) { return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: c || 0 }); };
  var pct = function (n, c) { return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: c == null ? 1 : c, maximumFractionDigits: c == null ? 1 : c }) + '%'; };
  function quando(v) { if (!v) return ''; var d = new Date(v); return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function calc(c) {
    var o = {};
    o.ctr = c.impressoes ? 100 * c.cliques_link / c.impressoes : 0;
    o.cpm = c.impressoes ? 1000 * c.gasto / c.impressoes : 0;
    o.cpc = c.cliques_link ? c.gasto / c.cliques_link : 0;
    o.hook = c.impressoes ? 100 * c.views_3s / c.impressoes : 0;
    o.hold = c.views_3s ? 100 * c.thruplays / c.views_3s : 0;
    o.cpl = c.leads ? c.gasto / c.leads : 0;
    o.cpa = c.vendas ? c.gasto / c.vendas : 0;
    o.roas = c.gasto ? c.receita / c.gasto : 0;
    o.connect = c.cliques_link ? 100 * (c.visitantes || 0) / c.cliques_link : 0;
    o.cpaPx = c.compras ? c.gasto / c.compras : 0;
    return o;
  }
  function criativoDe(id) { return (S.dados && S.dados.criativos || []).filter(function (c) { return c.id === id; })[0]; }

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
            api('POST', '/api/criacao/login', { credential: r.credential }).then(iniciar).catch(function (e) { $('lErro').textContent = e.message; });
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

  function iniciar() {
    return api('GET', '/api/criacao/login').then(function (r) {
      if (!r.logado) { tela('telaLogin'); googleBotao(r.google); return; }
      S.eu = { email: r.email, nome: r.nome };
      return carregar(true).then(function () { tela('app'); });
    }).catch(function (e) { tela('telaLogin'); $('lErro').textContent = e.message; });
  }

  /* ---------- dados ---------- */
  function carregar(primeira) {
    var q = '?dias=' + S.dias + (S.visao ? '&visao=' + encodeURIComponent(S.visao) : '') + (S.projeto ? '&projeto=' + encodeURIComponent(S.projeto.id) : '');
    return api('GET', '/api/criacao/dados' + q).then(function (d) {
      S.dados = d;
      if (S.exemplo) aplicarExemplo();
      if (primeira || !S.projeto) return escolherProjeto(d.projetos).then(function () { if (!primeira) return; return carregar(false); });
      desenharTudo();
    });
  }
  function escolherProjeto(lista) {
    var guardado = null; try { guardado = localStorage.getItem('dsc-projeto'); } catch (e) {}
    var p = lista.filter(function (x) { return x.id === guardado; })[0] || lista[0];
    if (p) { S.projeto = { id: p.id, nome: p.nome, estado: normalizar(p.estado) }; desenharTudo(); return Promise.resolve(); }
    var novo = { id: novoId(), nome: 'Exemplo · vem com a máquina', estado: normalizar({}) };
    S.projeto = novo;
    return api('POST', '/api/criacao/dados', { acao: 'projeto', id: novo.id, nome: novo.nome, estado: novo.estado }).then(function () { S.dados.projetos.unshift({ id: novo.id, nome: novo.nome, estado: novo.estado }); desenharTudo(); }).catch(function (e) { toast(e.message, true); desenharTudo(); });
  }
  function normalizar(e) {
    e = e && typeof e === 'object' ? e : {};
    e.oferta = e.oferta || '';
    e.lido = e.lido || null;
    e.publico = typeof e.publico === 'number' ? e.publico : null;
    e.cerebro = e.cerebro || { quem: '', compra: '', provas: '', fala: '', nunca: '' };
    e.voz = e.voz || 'eleven';
    e.criativos = Array.isArray(e.criativos) && e.criativos.length ? e.criativos : [{ n: 1, formato: 'oferta-direta', estilo: 'hardcopy', gancho: null, roteiro: '', aprovado: false, video: '' }];
    e.pos = e.pos || {};
    if (typeof e.zoom === 'number') S.zoom = e.zoom;
    if (e.pan) S.pan = e.pan;
    return e;
  }
  function salvar() {
    clearTimeout(S.salvarT);
    S.salvarT = setTimeout(function () {
      if (!S.projeto) return;
      var p = S.projeto; p.estado.zoom = S.zoom; p.estado.pan = S.pan;
      api('POST', '/api/criacao/dados', { acao: 'projeto', id: p.id, nome: p.nome, estado: p.estado }).catch(function (e) { toast('Não salvou: ' + e.message, true); });
    }, 900);
  }
  function desenharTudo() { desenharTopo(); desenharLado(); desenharCanvas(); desenharMetricas(); desenharSugestoes(); desenharConexao(); desenharChat(); }

  /* ---------- topo: projetos e passos ---------- */
  function desenharTopo() {
    var sel = $('projSel'); sel.innerHTML = '';
    (S.dados.projetos || []).forEach(function (p) { var o = el('option', '', p.nome); o.value = p.id; if (S.projeto && p.id === S.projeto.id) o.selected = true; sel.appendChild(o); });
    if (!S.projeto) return;
    $('projIni').textContent = (S.projeto.nome || 'P').trim().charAt(0).toUpperCase();
    var e = S.projeto.estado, cr = e.criativos;
    var p1 = Boolean(e.lido), p2 = e.publico != null, p3 = cr.length && cr.every(function (c) { return c.aprovado; }), nv = cr.filter(function (c) { return c.video; }).length;
    [[1, p1], [2, p2], [3, p3], [4, nv === cr.length && nv > 0]].forEach(function (x) {
      var s = $('passos').querySelector('[data-p="' + x[0] + '"]'); s.classList.toggle('ok', Boolean(x[1]));
    });
    var atual = !p1 ? 1 : !p2 ? 2 : !p3 ? 3 : 4;
    $('passos').querySelectorAll('.passo').forEach(function (s) { s.classList.toggle('on', Number(s.dataset.p) === atual); });
    $('pVid').textContent = nv + '/' + cr.length;
    $('bLer').textContent = p1 ? 'Ler a oferta de novo →' : 'Ler a oferta →';
    var pronta = p1 && p2 && p3 && nv === cr.length;
    $('projEstado').className = 'estado' + (pronta ? ' pronta' : ''); $('projEstado').lastChild.textContent = pronta ? 'Pronta' : p1 ? 'Em andamento' : 'Rascunho';
    $('avisoEx').hidden = !S.exemplo;
  }
  $('projSel').addEventListener('change', function () {
    var p = (S.dados.projetos || []).filter(function (x) { return x.id === $('projSel').value; })[0];
    if (!p) return;
    S.projeto = { id: p.id, nome: p.nome, estado: normalizar(p.estado) };
    try { localStorage.setItem('dsc-projeto', p.id); } catch (e) {}
    carregar(false);
  });
  $('bNovo').addEventListener('click', function () {
    modal('<h3>Novo projeto</h3><label><b>Nome</b><input id="mNome" maxlength="120" placeholder="Ex.: Turnê Barreiras · novembro"></label><div class="fim"><button type="button" class="bt sec" data-fechar>Cancelar</button><button type="button" class="bt lime" id="mOk">Criar</button></div>', function (m) {
      m.querySelector('#mNome').focus();
      m.querySelector('#mOk').onclick = function () {
        var nome = m.querySelector('#mNome').value.trim(); if (!nome) return;
        var novo = { id: novoId(), nome: nome, estado: normalizar({}) };
        api('POST', '/api/criacao/dados', { acao: 'projeto', id: novo.id, nome: novo.nome, estado: novo.estado }).then(function () {
          S.dados.projetos.unshift({ id: novo.id, nome: novo.nome, estado: novo.estado }); S.projeto = novo; S.zoom = 0.8; S.pan = { x: 30, y: 30 };
          try { localStorage.setItem('dsc-projeto', novo.id); } catch (e) {}
          fecharModal(); carregar(false);
        }).catch(function (e) { toast(e.message, true); });
      };
    });
  });
  $('bExcluir').addEventListener('click', function () {
    if (!S.projeto) return;
    modal('<h3>Excluir “' + esc(S.projeto.nome) + '”?</h3><p class="sub">Apaga o projeto e a conversa dele. Não mexe nas métricas nem nas sugestões.</p><div class="fim"><button type="button" class="bt sec" data-fechar>Cancelar</button><button type="button" class="bt" id="mOk" style="color:var(--vermelho)">Excluir</button></div>', function (m) {
      m.querySelector('#mOk').onclick = function () {
        api('POST', '/api/criacao/dados', { acao: 'excluir-projeto', id: S.projeto.id }).then(function () { fecharModal(); S.projeto = null; try { localStorage.removeItem('dsc-projeto'); } catch (e) {} carregar(true); }).catch(function (e) { toast(e.message, true); });
      };
    });
  });
  $('bLer').addEventListener('click', function () {
    var e = S.projeto.estado;
    if ((e.oferta || '').trim().length < 20) { toast('Escreva a oferta no cartão “Oferta” antes (o que é, para quem, preço, promessa).', true); return; }
    var b = $('bLer'); b.disabled = true; b.textContent = 'Lendo…';
    var cb = e.cerebro, cerebro = ['Quem é você: ' + cb.quem, 'Quem compra: ' + cb.compra, 'Provas reais: ' + cb.provas, 'Como fala: ' + cb.fala, 'Nunca dizer: ' + cb.nunca].filter(function (l) { return l.split(': ')[1]; }).join('\n');
    api('POST', '/api/criacao/dados', { acao: 'ler-oferta', oferta: e.oferta, cerebro: cerebro }).then(function (r) {
      e.lido = { resumo: r.resumo || '', publicos: r.publicos || [], angulos: r.angulos || [], ganchos: r.ganchos || [], nunca_dizer: r.nunca_dizer || [] };
      if (e.publico == null && e.lido.publicos.length) e.publico = 0;
      salvar(); desenharTudo();
      chatLocal('Li a oferta. ' + (e.lido.resumo || '') + '\nEncontrei ' + e.lido.publicos.length + ' públicos, ' + e.lido.angulos.length + ' ângulos e ' + e.lido.ganchos.length + ' ganchos. Escolha o público no cartão “Quem compra” e o gancho em cada criativo.');
      toast('Oferta lida.');
    }).catch(function (e2) { toast(e2.message, true); }).then(function () { b.disabled = false; desenharTopo(); });
  });

  /* ---------- canvas ---------- */
  var POS = { oferta: [40, 110], cerebro: [40, 270], voz: [40, 600], publicos: [360, 110], copy: [680, 110], c: [1000, 110], v: [1340, 110] };
  function pos(id) {
    var p = S.projeto.estado.pos[id]; if (p) return p;
    var m = /^([cv])(\d+)$/.exec(id);
    if (m) return { x: POS[m[1]][0], y: POS[m[1]][1] + (Number(m[2]) - 1) * 470 };
    return { x: POS[id][0], y: POS[id][1] };
  }
  function aplicarZoom() { $('canvas').style.transform = 'translate(' + S.pan.x + 'px,' + S.pan.y + 'px) scale(' + S.zoom + ')'; $('zPct').textContent = Math.round(S.zoom * 100) + '%'; }
  function desenharCanvas() {
    if (!S.projeto) return;
    var e = S.projeto.estado, nos = $('nos'); nos.innerHTML = '';
    var lido = e.lido, cr = e.criativos;
    var cheio = ['quem', 'compra', 'provas', 'fala', 'nunca'].filter(function (k) { return (e.cerebro[k] || '').trim(); }).length;
    var paraAprovar = cr.filter(function (c) { return !c.aprovado; }).length;
    var formatos = (window.FORMATOS || []).map(function (f) { return [f.id, f.nome]; });
    if (!formatos.length) formatos = [['oferta-direta', 'Oferta direta']];
    function no(id, cls, cab, corpo) {
      var d = el('div', 'no' + (cls ? ' ' + cls : '')); d.dataset.id = id; var p = pos(id); d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
      d.innerHTML = '<div class="no-cab">' + cab + '</div><div class="no-corpo">' + corpo + '</div>'; nos.appendChild(d); return d;
    }
    function sel(nome, rotulo, opcoes, valor, largo) {
      return '<label class="pick' + (largo ? ' largo' : '') + '"><small>' + rotulo + '</small><select data-k="' + nome + '">' + opcoes.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (o[0] === valor ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></label>';
    }
    // 1 Oferta
    no('oferta', lido ? 'ok' : 'on', '<i>1</i>Oferta',
      '<textarea data-k="oferta" placeholder="O que é a oferta, para quem, preço, promessa, prova…">' + esc(e.oferta) + '</textarea>' +
      (lido ? '<p style="color:var(--txt)">' + esc(lido.resumo) + '</p>' : '<p>A máquina ainda não leu a oferta deste projeto.</p>'));
    // Cérebro
    no('cerebro', cheio ? 'on' : '', '<i>◐</i>Cérebro<span class="dir">' + cheio + '/5</span>',
      '<p>O seu contexto. A máquina lê antes de toda copy, em todos os projetos.</p><div class="barra-p"><i style="width:' + (cheio * 20) + '%"></i></div>' +
      '<div class="lista-r">' + [['quem', 'Quem é você'], ['compra', 'Quem compra de você'], ['provas', 'Provas reais'], ['fala', 'Como você fala'], ['nunca', 'Nunca dizer']].map(function (k) { var v = (e.cerebro[k[0]] || '').trim(); var n = k[0] === 'nunca' && v ? ' (' + v.split(/\n|;/).filter(Boolean).length + ')' : ''; return '<span class="' + (v ? 'ok' : '') + '">' + k[1] + n + '</span>'; }).join('') + '</div>' +
      (!e.cerebro.provas ? '<p class="dica">Sem prova real, a copy fica com lacuna no lugar do número. Coloque pelo menos um número seu.</p>' : '') +
      '<div class="no-bts"><button type="button" class="bt lime p" data-a="cerebro">Abrir o cérebro</button><button type="button" class="bt sec p" data-a="montar"' + (lido ? '' : ' disabled title="Leia a oferta antes"') + '>Montar com a máquina</button></div>');
    // Voz
    no('voz', '', '<i>♪</i>Voz<span class="dir">' + (e.voz === 'eleven' ? 'ElevenLabs' : e.voz === 'gratis' ? 'grátis' : 'própria') + '</span>',
      '<div class="picks">' + sel('voz', 'Voz dos vídeos', VOZES, e.voz, true) + '</div>' +
      '<p>' + (e.voz === 'eleven' ? 'A máquina narra com a voz clonada no ElevenLabs (chave no servidor).' : e.voz === 'gratis' ? 'Sem voz clonada a máquina usa a voz grátis do computador, mais robótica.' : 'Você grava a narração e cola o vídeo pronto no cartão de vídeo.') + '</p>');
    // 2 Quem compra
    no('publicos', lido ? (e.publico != null ? 'ok' : 'on') : '', '<i>2</i>Quem compra' + (lido ? '<span class="dir">' + lido.publicos.length + ' públicos</span>' : ''),
      lido ? '<div class="lista-r">' + lido.publicos.map(function (p, i) { return '<span class="sel' + (e.publico === i ? ' on' : '') + '" data-pub="' + i + '" title="' + esc(p.dor + ' — ' + p.gatilho) + '">' + esc(p.nome) + '</span>'; }).join('') + '</div>' + (e.publico != null && lido.publicos[e.publico] ? '<p><b style="color:var(--txt)">Dor:</b> ' + esc(lido.publicos[e.publico].dor) + '<br><b style="color:var(--txt)">Gatilho:</b> ' + esc(lido.publicos[e.publico].gatilho) + '</p>' : '')
        : '<p>Os públicos aparecem quando a oferta for lida.</p>');
    // 3 Copy
    no('copy', lido ? (paraAprovar ? 'on' : 'ok') : '', '<i>3</i>Copy' + (lido ? '<span class="dir' + (paraAprovar ? ' lime' : '') + '">' + (paraAprovar ? paraAprovar + ' para aprovar' : 'aprovada') + '</span>' : ''),
      '<div class="lista-r"><span class="' + (lido ? 'ok' : '') + '">Ângulos mais fortes' + (lido ? ' (' + lido.angulos.length + ')' : '') + '</span><span class="' + (lido ? 'ok' : '') + '">Ganchos com nota' + (lido ? ' (' + lido.ganchos.length + ')' : '') + '</span><span class="' + (cr.some(function (c) { return c.gancho != null; }) ? 'on' : '') + '">Roteiros ' + cr.filter(function (c) { return c.roteiro; }).length + '/' + cr.length + '</span><span>Copychief nota 8 ou mais</span><span>Texto do anúncio</span></div>' +
      (lido ? '<div class="no-bts"><button type="button" class="bt sec p" data-a="angulos">Ver ângulos e ganchos</button></div>' : ''));
    // Criativos e vídeos
    cr.forEach(function (c) {
      var id = 'C' + String(c.n).padStart(2, '0');
      var etapa = c.video ? 5 : c.aprovado ? 2 : c.gancho != null ? 1 : 0;
      var gancho = lido && c.gancho != null ? lido.ganchos[c.gancho] : null;
      var d = no('c' + c.n, c.aprovado ? 'ok' : 'on', '<i>' + c.n + '</i>' + id + '<span class="dir' + (c.aprovado ? '' : ' lime') + '">' + (c.aprovado ? 'aprovada' : 'para aprovar') + '</span>' + (cr.length > 1 ? '<button type="button" class="x" data-a="tirar" title="Tirar este criativo">×</button>' : ''),
        '<div class="picks">' + sel('formato', 'Formato', formatos, c.formato) + sel('estilo', 'Estilo', ESTILOS, c.estilo) + '</div>' +
        '<div class="pick"><small>Voz</small><b style="color:var(--txt)">' + esc(VOZES.filter(function (v) { return v[0] === e.voz; })[0][1].split(' (')[0]) + '</b></div>' +
        (lido ? '<p style="margin-top:2px">Gancho:</p><div class="ganchos">' + lido.ganchos.map(function (g, i) { return '<span data-g="' + i + '" class="' + (c.gancho === i ? 'on' : '') + '">' + esc(g) + '</span>'; }).join('') + '</div>' : '<p>Os ganchos aparecem quando a oferta for lida.</p>') +
        '<div class="etapas">' + ETAPAS.map(function (n, i) { return '<span class="' + (i < etapa ? 'ok' : i === etapa ? 'on' : '') + '">' + n + '</span>'; }).join('') + '</div>' +
        '<button type="button" class="lk" data-a="roteiro" style="text-align:left">' + (c.roteiro ? '▸ Ver o roteiro (' + c.roteiro.split(/\n+/).filter(Boolean).length + ' falas)' : '▸ Escrever o roteiro') + '</button>' +
        '<div class="no-bts"><button type="button" class="bt lime p" data-a="aprovar"' + (gancho ? '' : ' disabled title="Escolha um gancho"') + '>' + (c.aprovado ? 'Desaprovar' : 'Aprovar a copy') + '</button><span style="align-self:center">depois gera o vídeo</span></div>' +
        '<div class="no-bts" style="justify-content:flex-end"><button type="button" class="bt sec p" data-a="parecidos">+3 parecidos</button></div>');
      d.dataset.n = c.n;
      var v = no('v' + c.n, c.video ? 'ok' : '', 'Vídeo ' + id + '<span class="dir">9:16</span>',
        '<div class="video9">' + (c.video ? (/\.(mp4|webm|mov)(\?|$)/i.test(c.video) ? '<video src="' + esc(c.video) + '" controls muted playsinline></video>' : '<a href="' + esc(c.video) + '" target="_blank" rel="noopener">Abrir o vídeo</a>') : 'O vídeo aparece aqui') + '</div>' +
        '<div class="no-bts"><a class="bt lime p" href="/fabrica" target="_blank" rel="noopener">Montar na Fábrica</a><button type="button" class="bt sec p" data-a="video">' + (c.video ? 'Trocar link' : 'Colar link') + '</button></div>');
      v.dataset.n = c.n;
    });
    desenharFios(); aplicarZoom();
    if (!e.pan && !S.centralizou) { S.centralizou = true; requestAnimationFrame(centralizar); }
  }
  function desenharFios() {
    var svg = $('fios'); svg.innerHTML = '';
    var cr = S.projeto.estado.criativos, pares = [['cerebro', 'oferta'], ['oferta', 'publicos'], ['publicos', 'copy']];
    cr.forEach(function (c) { pares.push(['copy', 'c' + c.n]); pares.push(['c' + c.n, 'v' + c.n]); pares.push(['voz', 'c' + c.n]); });
    var ns = {}; $('nos').querySelectorAll('.no').forEach(function (n) { ns[n.dataset.id] = n; });
    pares.forEach(function (p) {
      var a = ns[p[0]], b = ns[p[1]]; if (!a || !b) return;
      var x1 = a.offsetLeft + a.offsetWidth, y1 = a.offsetTop + 22, x2 = b.offsetLeft, y2 = b.offsetTop + 22;
      if (p[0] === 'cerebro' || p[0] === 'voz') { x1 = a.offsetLeft + a.offsetWidth; y1 = a.offsetTop + 22; }
      var dx = Math.max(40, Math.abs(x2 - x1) / 2);
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M' + x1 + ' ' + y1 + ' C' + (x1 + dx) + ' ' + y1 + ' ' + (x2 - dx) + ' ' + y2 + ' ' + x2 + ' ' + y2);
      if (a.classList.contains('ok')) path.classList.add('on');
      svg.appendChild(path);
      [[x1, y1], [x2, y2]].forEach(function (c) { var ci = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); ci.setAttribute('cx', c[0]); ci.setAttribute('cy', c[1]); ci.setAttribute('r', 3.5); svg.appendChild(ci); });
    });
  }
  // interações do canvas (delegação)
  $('nos').addEventListener('input', function (ev) {
    var k = ev.target.dataset.k; if (!k) return;
    var e = S.projeto.estado, no = ev.target.closest('.no');
    if (k === 'oferta') { e.oferta = ev.target.value; salvar(); return; }
    if (k === 'voz') { e.voz = ev.target.value; salvar(); desenharCanvas(); return; }
    var c = e.criativos.filter(function (x) { return String(x.n) === no.dataset.n; })[0]; if (!c) return;
    c[k] = ev.target.value; salvar(); desenharCanvas();
  });
  $('nos').addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-a],[data-pub],[data-g]'); if (!t) return;
    var e = S.projeto.estado, no = t.closest('.no'), c = e.criativos.filter(function (x) { return String(x.n) === (no.dataset.n || ''); })[0];
    if (t.dataset.pub != null) { e.publico = Number(t.dataset.pub); salvar(); desenharTudo(); return; }
    if (t.dataset.g != null && c) { c.gancho = c.gancho === Number(t.dataset.g) ? null : Number(t.dataset.g); if (c.gancho == null) c.aprovado = false; salvar(); desenharTudo(); return; }
    var a = t.dataset.a;
    if (a === 'cerebro') return abrirCerebro();
    if (a === 'montar') {
      var l = e.lido; if (!l) return;
      if (!e.cerebro.compra.trim()) e.cerebro.compra = l.publicos.map(function (p) { return p.nome + ' — ' + p.dor; }).join('\n');
      if (!e.cerebro.nunca.trim()) e.cerebro.nunca = (l.nunca_dizer || []).join('\n');
      salvar(); desenharCanvas(); toast('Cérebro preenchido com o que a máquina leu. Confira “Quem é você” e “Provas reais”.'); return;
    }
    if (a === 'angulos') return abrirAngulos();
    if (!c) return;
    if (a === 'aprovar') { c.aprovado = !c.aprovado; salvar(); desenharTudo(); return; }
    if (a === 'tirar') { e.criativos = e.criativos.filter(function (x) { return x !== c; }); salvar(); desenharTudo(); return; }
    if (a === 'parecidos') {
      var max = Math.max.apply(null, e.criativos.map(function (x) { return x.n; })), g = e.lido ? e.lido.ganchos.length : 0;
      for (var i = 1; i <= 3; i++) e.criativos.push({ n: max + i, formato: c.formato, estilo: c.estilo, gancho: g ? ((c.gancho || 0) + i) % g : null, roteiro: '', aprovado: false, video: '' });
      salvar(); desenharTudo(); return;
    }
    if (a === 'roteiro') return abrirRoteiro(c);
    if (a === 'video') {
      modal('<h3>Link do vídeo ' + 'C' + String(c.n).padStart(2, '0') + '</h3><p class="sub">Cole o link do vídeo exportado (Fábrica, Drive, Blob…). Se for .mp4 aparece o player no cartão.</p><label><b>Link</b><input id="mUrl" value="' + esc(c.video || '') + '" placeholder="https://…"></label><div class="fim"><button type="button" class="bt sec" data-fechar>Cancelar</button><button type="button" class="bt lime" id="mOk">Salvar</button></div>', function (m) {
        m.querySelector('#mOk').onclick = function () { var v = m.querySelector('#mUrl').value.trim(); if (v && !/^https?:\/\//i.test(v)) { toast('O link precisa começar com https://', true); return; } c.video = v; salvar(); fecharModal(); desenharTudo(); };
      });
    }
  });
  function abrirCerebro() {
    var cb = S.projeto.estado.cerebro;
    var campos = [['quem', 'Quem é você', 'Quem é o Ricardo / o Grupo R1 para esse público, em 2 ou 3 linhas.'], ['compra', 'Quem compra de você', 'Perfis, dores, situação de quem compra.'], ['provas', 'Provas reais', 'Números, resultados, depoimentos verdadeiros (com nome ou cidade quando puder).'], ['fala', 'Como você fala', 'Tom, palavras que usa, o que soa falso.'], ['nunca', 'Nunca dizer', 'Uma por linha: promessas, termos e temas proibidos.']];
    modal('<h3>Cérebro</h3>' + campos.map(function (k) { return '<label><b>' + k[1] + '</b><textarea data-c="' + k[0] + '" placeholder="' + esc(k[2]) + '">' + esc(cb[k[0]] || '') + '</textarea></label>'; }).join('') + '<div class="fim"><button type="button" class="bt sec" data-fechar>Fechar</button><button type="button" class="bt lime" id="mOk">Salvar</button></div>', function (m) {
      m.querySelector('#mOk').onclick = function () { m.querySelectorAll('[data-c]').forEach(function (t) { cb[t.dataset.c] = t.value; }); salvar(); fecharModal(); desenharCanvas(); };
    });
  }
  function abrirAngulos() {
    var l = S.projeto.estado.lido; if (!l) return;
    modal('<h3>Ângulos e ganchos</h3><pre>' + esc('ÂNGULOS\n' + l.angulos.map(function (a, i) { return (i + 1) + '. ' + a.nome + ' — ' + a.por_que; }).join('\n') + '\n\nGANCHOS\n' + l.ganchos.map(function (g, i) { return (i + 1) + '. ' + g; }).join('\n') + (l.nunca_dizer && l.nunca_dizer.length ? '\n\nNUNCA DIZER\n' + l.nunca_dizer.map(function (n) { return '• ' + n; }).join('\n') : '')) + '</pre><div class="fim"><button type="button" class="bt sec" data-fechar>Fechar</button></div>');
  }
  function abrirRoteiro(c) {
    var id = 'C' + String(c.n).padStart(2, '0'), l = S.projeto.estado.lido;
    modal('<h3>Roteiro ' + id + '</h3><p class="sub">Uma fala por linha. A máquina pode escrever o primeiro rascunho na conversa, aí você cola aqui.</p><label><b>Falas</b><textarea id="mRot" style="min-height:220px">' + esc(c.roteiro || '') + '</textarea></label><div class="fim"><button type="button" class="bt sec" id="mPedir"' + (l ? '' : ' disabled') + '>Pedir à máquina</button><button type="button" class="bt sec" data-fechar>Cancelar</button><button type="button" class="bt lime" id="mOk">Salvar</button></div>', function (m) {
      m.querySelector('#mOk').onclick = function () { c.roteiro = m.querySelector('#mRot').value; salvar(); fecharModal(); desenharTudo(); };
      m.querySelector('#mPedir').onclick = function () {
        var f = (window.FORMATOS || []).filter(function (x) { return x.id === c.formato; })[0];
        var pedido = 'Escreva o roteiro do ' + id + ' (formato ' + (f ? f.nome : c.formato) + ', estilo ' + (ESTILOS.filter(function (x) { return x[0] === c.estilo; })[0] || [])[1] + '), de 30 a 45 segundos, uma fala por linha, começando pelo gancho: "' + (c.gancho != null && l ? l.ganchos[c.gancho] : '') + '".';
        fecharModal(); $('chat').classList.remove('fechado'); enviarChat(pedido);
      };
    });
  }
  // arrastar nós e o palco; zoom
  var palco = $('palco');
  palco.addEventListener('pointerdown', function (ev) {
    if (ev.button !== 0) return;
    var cab = ev.target.closest('.no-cab'), no = ev.target.closest('.no');
    if (ev.target.closest('button,select,textarea,input,a,.ganchos,.lista-r')) return;
    if (cab || (no && !ev.target.closest('.no-corpo'))) { S.arr = { no: no, x: ev.clientX, y: ev.clientY, ox: no.offsetLeft, oy: no.offsetTop }; no.style.zIndex = 5; }
    else if (!no) { S.arr = { pan: true, x: ev.clientX, y: ev.clientY, ox: S.pan.x, oy: S.pan.y }; palco.classList.add('arrasta'); }
    else return;
    palco.setPointerCapture(ev.pointerId);
  });
  palco.addEventListener('pointermove', function (ev) {
    var a = S.arr; if (!a) return;
    if (a.pan) { S.pan = { x: a.ox + ev.clientX - a.x, y: a.oy + ev.clientY - a.y }; aplicarZoom(); return; }
    var x = a.ox + (ev.clientX - a.x) / S.zoom, y = a.oy + (ev.clientY - a.y) / S.zoom;
    a.no.style.left = x + 'px'; a.no.style.top = y + 'px'; a.moveu = true; desenharFios();
  });
  function soltar() {
    var a = S.arr; if (!a) return; S.arr = null; palco.classList.remove('arrasta');
    if (a.pan) { salvar(); return; }
    a.no.style.zIndex = '';
    if (a.moveu) { S.projeto.estado.pos[a.no.dataset.id] = { x: a.no.offsetLeft, y: a.no.offsetTop }; salvar(); }
  }
  palco.addEventListener('pointerup', soltar); palco.addEventListener('pointercancel', soltar);
  palco.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    var r = palco.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
    var z = Math.min(2, Math.max(0.3, S.zoom * (ev.deltaY < 0 ? 1.1 : 0.9)));
    S.pan = { x: mx - (mx - S.pan.x) * z / S.zoom, y: my - (my - S.pan.y) * z / S.zoom }; S.zoom = z; aplicarZoom(); salvar();
  }, { passive: false });
  function zoomPasso(f) { var r = palco.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2, z = Math.min(2, Math.max(0.3, S.zoom * f)); S.pan = { x: mx - (mx - S.pan.x) * z / S.zoom, y: my - (my - S.pan.y) * z / S.zoom }; S.zoom = z; aplicarZoom(); salvar(); }
  $('zMais').onclick = function () { zoomPasso(1.15); };
  $('zMenos').onclick = function () { zoomPasso(1 / 1.15); };
  $('zCentro').onclick = centralizar;
  $('zOrg').onclick = function () { S.projeto.estado.pos = {}; salvar(); desenharCanvas(); centralizar(); };
  $('bMaisCriativo').onclick = function () { var e = S.projeto.estado, max = Math.max.apply(null, e.criativos.map(function (x) { return x.n; })); e.criativos.push({ n: max + 1, formato: 'oferta-direta', estilo: 'hardcopy', gancho: null, roteiro: '', aprovado: false, video: '' }); salvar(); desenharTudo(); };
  function centralizar() {
    var ns = $('nos').querySelectorAll('.no'); if (!ns.length) return;
    var x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    ns.forEach(function (n) { x1 = Math.min(x1, n.offsetLeft); y1 = Math.min(y1, n.offsetTop); x2 = Math.max(x2, n.offsetLeft + n.offsetWidth); y2 = Math.max(y2, n.offsetTop + n.offsetHeight); });
    var r = palco.getBoundingClientRect(), z = Math.min(1.1, Math.max(0.3, Math.min((r.width - 60) / (x2 - x1), (r.height - 90) / (y2 - y1))));
    S.zoom = z; S.pan = { x: (r.width - (x2 - x1) * z) / 2 - x1 * z, y: (r.height - 60 - (y2 - y1) * z) / 2 - y1 * z + 10 }; aplicarZoom(); salvar();
  }

  /* ---------- sugestões (barra esquerda e aba) ---------- */
  function insightsVisiveis() { return (S.dados.insights || []).filter(function (i) { return i.status === 'novo' || i.status === 'aceito'; }); }
  function cartaoSug(i, completo) {
    var d = el('div', 'sug' + (i.prioridade === 'urgente' ? ' urgente' : ''));
    var l1 = el('div', 'sug-l1');
    l1.appendChild(el('span', 'selo ' + i.prioridade, i.prioridade));
    l1.appendChild(el('span', 'selo ' + i.tipo, NOMES_TIPO[i.tipo] || i.tipo));
    if (i.status !== 'novo') l1.appendChild(el('span', 'selo ' + i.status, i.status));
    if (i.origem && i.origem !== 'vps') l1.appendChild(el('span', 'selo', i.origem));
    d.appendChild(l1);
    d.appendChild(el('b', '', (i.acao ? i.acao + ' · ' : '') + i.titulo));
    if (i.texto) d.appendChild(el('p', '', i.texto));
    var c = i.criativo_id ? criativoDe(i.criativo_id) : null;
    if (c || i.criativo_id) d.appendChild(el('div', 'ref', c ? c.nome + (c.praca ? ' · ' + c.praca : '') : i.criativo_id));
    var ac = el('div', 'sug-acoes');
    if (i.status === 'novo') ac.appendChild(botaoSug(i, 'aceito', 'Aceitar'));
    if (i.status !== 'feito') ac.appendChild(botaoSug(i, 'feito', 'Feito'));
    if (i.status !== 'descartado') ac.appendChild(botaoSug(i, 'descartado', 'Descartar'));
    if (completo) { var q = el('small', '', quando(i.criado_em)); q.style.color = 'var(--mut)'; q.style.marginLeft = 'auto'; ac.appendChild(q); }
    d.appendChild(ac);
    return d;
  }
  function botaoSug(i, status, rotulo) {
    var b = el('button', 'bt mini' + (status === 'aceito' ? ' lime' : ''), rotulo); b.type = 'button';
    b.onclick = function () {
      if (S.exemplo && String(i.id).indexOf('ex') === 0) { i.status = status; desenharTudo(); return; }
      b.disabled = true;
      api('POST', '/api/criacao/dados', { acao: 'insight', id: i.id, status: status }).then(function () { i.status = status; desenharTudo(); }).catch(function (e) { toast(e.message, true); b.disabled = false; });
    };
    return b;
  }
  function desenharLado() {
    var lista = $('ladoLista'); lista.innerHTML = '';
    var todos = insightsVisiveis().filter(function (i) { return i.status === 'novo'; });
    var vis = todos.filter(function (i) { return !S.filtro || i.prioridade === S.filtro || i.tipo === S.filtro; });
    $('ladoN').textContent = todos.length;
    if (!vis.length) { var v = el('div', 'sug', ''); v.appendChild(el('p', '', todos.length ? 'Nada nesse filtro.' : S.dados.maquina ? 'Ainda sem sugestões. Quando as métricas chegarem pelo webhook, peça uma análise ou espere a IA da VPS mandar.' : 'Ainda sem sugestões. Elas chegam pelo webhook da IA da VPS.')); lista.appendChild(v); }
    vis.forEach(function (i) { lista.appendChild(cartaoSug(i)); });
    $('ladoAviso').textContent = S.dados.maquina ? '' : 'Máquina (Claude) desligada no servidor: só o webhook alimenta.';
    $('bAnalisar').disabled = !S.dados.maquina || S.exemplo;
  }
  $('ladoChips').addEventListener('click', function (ev) { var b = ev.target.closest('.chip'); if (!b) return; S.filtro = b.dataset.f; $('ladoChips').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('ativo', c === b); }); desenharLado(); });
  $('bAnalisar').addEventListener('click', function () {
    var b = $('bAnalisar'); b.disabled = true; b.textContent = 'Analisando…';
    api('POST', '/api/criacao/dados', { acao: 'analisar', dias: S.dias }).then(function (r) { toast(r.sugestoes + ' sugestões novas.'); return carregar(false); }).catch(function (e) { toast(e.message, true); }).then(function () { b.textContent = 'Pedir análise agora'; b.disabled = false; });
  });
  function desenharSugestoes() {
    var g = $('sugGrade'); g.innerHTML = '';
    var todos = (S.dados.insights || []);
    if (!todos.length) { g.appendChild(el('p', 'sub', 'Nenhuma sugestão ainda.')); return; }
    todos.forEach(function (i) { g.appendChild(cartaoSug(i, true)); });
  }

  /* ---------- métricas ---------- */
  function somar(lista) {
    return lista.reduce(function (a, c) { ['gasto', 'impressoes', 'alcance', 'cliques_link', 'visitantes', 'compras', 'vendas', 'ingressos', 'receita', 'leads'].forEach(function (k) { a[k] = (a[k] || 0) + Number(c[k] || 0); }); return a; }, {});
  }
  function haQuanto(v) { if (!v) return ''; var m = Math.round((Date.now() - new Date(v)) / 60000); return m < 1 ? 'agora' : m < 60 ? 'há ' + m + ' min' : m < 1440 ? 'há ' + Math.round(m / 60) + ' h' : 'há ' + Math.round(m / 1440) + ' d'; }
  function desenharMetricas() {
    var cr = S.dados.criativos || [], ins = S.dados.insights || [], novos = ins.filter(function (i) { return i.status === 'novo'; });
    var fonte = S.dados.fonte || {}, dia = S.dados.diario || [];
    var tot = dia.length ? somar(dia) : somar(cr), t = calc(tot);
    // connect só onde há página de destino (Distribuição impulsiona posts: cliques sem visita contam como 0%)
    var comPagina = somar((S.dados.funis || []).filter(function (f) { return f.visitantes > 0.05 * f.cliques_link && (!S.visao || f.visao === S.visao); }));
    if (comPagina.cliques_link) t.connect = 100 * comPagina.visitantes / comPagina.cliques_link;
    var urg = novos.filter(function (i) { return i.prioridade === 'urgente'; }), trocar = novos.filter(function (i) { return i.tipo === 'variacao' || i.tipo === 'vencedor'; });
    var temDados = cr.some(function (c) { return c.gasto > 0 || c.impressoes > 0; });
    var rotulo = S.visao ? funil(S.visao) : 'Todos os funis';
    var lead = temDados
      ? '<b>' + esc(rotulo) + '</b>: ' + brl(tot.gasto, 0) + ' investidos nos últimos ' + S.dias + ' dias, ' + num(tot.visitantes) + ' visitantes (connect ' + pct(t.connect, 0) + ')' +
        (tot.vendas ? ', <b>' + num(tot.vendas) + '</b> vendas na Guru a ' + brl(t.cpa, 0) : '') + (tot.compras ? ', ' + num(tot.compras) + ' compras no pixel a ' + brl(t.cpaPx, 0) : '') + '.' +
        (urg.length ? ' <b>' + urg.length + '</b> ' + (urg.length === 1 ? 'ação urgente' : 'ações urgentes') + '.' : '') + (trocar.length ? ' ' + trocar.length + ' ' + (trocar.length === 1 ? 'criativo pede' : 'criativos pedem') + ' variação ou escala.' : '')
      : fonte.temR1 === false ? 'Falta ligar o Painel Grupo R1: defina <b>R1_CONSULTA_TOKEN</b> na Vercel.' : 'Sem investimento neste filtro no período.';
    $('metLead').innerHTML = lead;
    var sy = fonte.sincronizado || {};
    $('metQuando').textContent = (fonte.dadosAte ? 'Dados até ' + fonte.dadosAte.split('-').reverse().join('/') : 'Ainda sem dados') + (sy.em ? ' · buscado no Painel R1 ' + haQuanto(sy.em) + ' (a cada 15 min)' : '') + (sy.erro ? ' · erro: ' + sy.erro : '') + ' · a tela se atualiza sozinha a cada minuto.';
    // abas de funil
    var funis = (S.dados.funis || []).filter(function (f) { return f.gasto > 0; });
    $('funisAbas').innerHTML = '<button type="button" class="chip' + (S.visao ? '' : ' ativo') + '" data-v="">Todos</button>' + funis.map(function (f) { return '<button type="button" class="chip' + (S.visao === f.visao ? ' ativo' : '') + '" data-v="' + esc(f.visao) + '">' + esc(funil(f.visao)) + '<em>' + brl(f.gasto / 1000, 0) + 'k</em></button>'; }).join('');
    // quem está acompanhando
    var au = fonte.analiseAuto || {}, vpsOn = fonte.ultimoVps && Date.now() - new Date(fonte.ultimoVps) < 24 * 3600e3;
    $('iaLinha').innerHTML = '<span class="ponto' + (vpsOn ? ' on' : '') + '"></span><span><b>IA da VPS</b> ' + (fonte.ultimoVps ? 'mandou ideias ' + haQuanto(fonte.ultimoVps) : 'ainda não mandou ideias (o endereço de leitura está em Conexão)') + '</span>' +
      '<span class="ponto' + (S.dados.maquina ? ' on' : '') + '"></span><span><b>Claude</b> ' + (S.dados.maquina ? (au.ultima_em ? 'analisou ' + haQuanto(au.ultima_em) + ' (' + (au.ultima_n || 0) + ' ideias)' : 'analisa sozinho a cada 6 h') + ' · cobre enquanto a VPS não manda' : 'desligado') + '</span>' +
      (S.dados.maquina ? '<button type="button" class="bt p" id="bAnalisar">Pedir ideias agora</button>' : '');
    // KPIs
    var k = [['Urgentes', urg.length, urg.length ? 'vermelho' : '', 'dinheiro saindo sem resultado'], ['Para fazer ou trocar', trocar.length, 'lime', 'sugestões de variação e escala'],
      ['Investimento', brl(tot.gasto, 0), '', S.dias + ' dias · CPM ' + brl(t.cpm)], ['Visitantes', num(tot.visitantes), t.connect >= 70 ? 'lime' : t.connect && t.connect < 50 ? 'vermelho' : '', 'connect ' + pct(t.connect, 0) + ' · ' + num(tot.cliques_link) + ' cliques'],
      ['CTR do link', pct(t.ctr, 2), '', 'CPC ' + brl(t.cpc)], ['Compras no pixel', num(tot.compras), '', 'CPA ' + (tot.compras ? brl(t.cpaPx, 0) : '—')],
      ['Vendas Guru', num(tot.vendas), '', 'CPA ' + (tot.vendas ? brl(t.cpa, 0) : '—') + (tot.ingressos ? ' · ' + num(tot.ingressos) + ' ingressos' : '')], ['Receita', brl(tot.receita, 0), t.roas >= 1 ? 'lime' : '', 'ROAS ' + (tot.gasto && tot.receita ? num(t.roas, 2) + 'x' : '—')]];
    $('kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><small>' + x[0] + '</small><b class="' + x[2] + '">' + x[1] + '</b><span>' + x[3] + '</span></div>'; }).join('');
    graficoDia(); tabelaFunis(); tabelaCampanhas();
    var fs = $('fFrente'), atual = fs.value; var frentes = []; cr.forEach(function (c) { if (c.frente && frentes.indexOf(c.frente) < 0) frentes.push(c.frente); });
    fs.innerHTML = '<option value="">Todos os funis</option>' + frentes.map(function (f) { return '<option value="' + esc(f) + '"' + (f === atual ? ' selected' : '') + '>' + esc(funil(f)) + '</option>'; }).join('');
    tabelaFazer(); tabelaCriativos();
  }
  function graficoDia() {
    var dias = (S.dados.diario || []).slice(), g = $('gDia');
    if (!dias.length) { g.innerHTML = '<svg viewBox="0 0 600 200"><text x="300" y="100" text-anchor="middle" class="vazio">sem dados no período</text></svg>'; return; }
    var tot = somar(dias), k2 = tot.vendas ? 'vendas' : tot.compras ? 'compras' : 'visitantes', nome2 = { vendas: 'Vendas Guru', compras: 'Compras no pixel', visitantes: 'Visitantes' }[k2];
    $('gDiaTit').textContent = 'Investimento e ' + { vendas: 'vendas na Guru', compras: 'compras no pixel', visitantes: 'visitantes' }[k2] + ' por dia';
    var W = 600, H = 110, P = 34, bw = Math.max(4, (W - P - 10) / dias.length - 4);
    function bloco(k, rotulo, cls, fmt, y0) {
      var max = Math.max.apply(null, dias.map(function (d) { return Number(d[k]) || 0; })) || 1, s = '';
      s += '<text x="0" y="' + (y0 + 10) + '" font-weight="600">' + rotulo + '</text>';
      s += '<line x1="' + P + '" y1="' + (y0 + H) + '" x2="' + W + '" y2="' + (y0 + H) + '" class="eixo"/>';
      dias.forEach(function (d, i) {
        var v = Number(d[k]) || 0, h = Math.round((H - 18) * v / max), x = P + i * (bw + 4);
        s += '<rect class="' + cls + '" x="' + x + '" y="' + (y0 + H - h) + '" width="' + bw + '" height="' + h + '"><title>' + d.dia.split('-').reverse().join('/') + ': ' + fmt(v) + '</title></rect>';
        if (i === dias.length - 1 || i % Math.ceil(dias.length / 8) === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (y0 + H + 13) + '" text-anchor="middle">' + d.dia.slice(8) + '/' + d.dia.slice(5, 7) + '</text>';
        if (v === max) s += '<text x="' + (x + bw / 2) + '" y="' + (y0 + H - h - 4) + '" text-anchor="middle" font-weight="600" fill="#e6e9e3">' + fmt(v) + '</text>';
      });
      return s;
    }
    g.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + (2 * H + 60) + '">' + bloco('gasto', 'Investimento', 'barra', function (v) { return brl(v, 0); }, 14) + bloco(k2, nome2, 'barra2', function (v) { return num(v); }, H + 44) + '</svg>';
  }
  function resultado(c, m) {
    return '<td class="n">' + num(c.visitantes) + '</td><td class="n' + (c.cliques_link > 30 ? (m.connect >= 70 ? ' bom' : m.connect < 45 ? ' ruim' : '') : '') + '">' + (c.cliques_link ? pct(m.connect, 0) : '—') + '</td><td class="n">' + num(c.compras) + '</td><td class="n">' + num(c.vendas) + '</td>' +
      '<td class="n">' + (c.vendas ? brl(m.cpa, 0) : c.compras ? brl(m.cpaPx, 0) + '<span class="tend" title="CPA do pixel">px</span>' : '—') + '</td><td class="n">' + (c.gasto && c.receita ? num(m.roas, 2) + 'x' : '—') + '</td>';
  }
  function tabelaFunis() {
    var tb = $('tFunis').querySelector('tbody'), fs = (S.dados.funis || []).filter(function (f) { return f.gasto > 0 || f.impressoes > 0; });
    if (!fs.length) { tb.innerHTML = '<tr class="vazio"><td colspan="8">Sem dados no período.</td></tr>'; return; }
    tb.innerHTML = fs.map(function (f) { var m = calc(f); return '<tr data-v="' + esc(f.visao) + '" class="' + (S.visao === f.visao ? 'on' : '') + '"><td>' + esc(funil(f.visao)) + '</td><td class="n">' + brl(f.gasto, 0) + '</td><td class="n">' + pct(m.ctr, 2) + '</td><td class="n">' + (f.cliques_link ? pct(m.connect, 0) : '—') + '</td><td class="n">' + num(f.compras) + '</td><td class="n">' + num(f.vendas) + '</td><td class="n">' + (f.vendas ? brl(m.cpa, 0) : f.compras ? brl(m.cpaPx, 0) : '—') + '</td><td class="n">' + (f.receita ? num(m.roas, 2) + 'x' : '—') + '</td></tr>'; }).join('');
  }
  function tabelaCampanhas() {
    var tb = $('tCampanhas').querySelector('tbody'), cs = S.dados.campanhas || [];
    $('bMaisCamp').hidden = cs.length <= 15;
    $('bMaisCamp').textContent = S.maisCamp ? 'mostrar menos' : 'ver todas (' + cs.length + ')';
    if (!cs.length) { tb.innerHTML = '<tr class="vazio"><td colspan="11">Sem campanhas no período.</td></tr>'; return; }
    tb.innerHTML = (S.maisCamp ? cs : cs.slice(0, 15)).map(function (c) { var m = calc(c); return '<tr><td><div class="nome" title="' + esc(c.campanha) + '">' + esc(c.campanha || '(sem nome)') + '</div><span style="color:var(--sub);font-size:11px">' + num(c.anuncios) + ' anúncios</span></td><td>' + esc([funil(c.visao), c.praca].filter(Boolean).join(' · ')) + '</td><td class="n">' + brl(c.gasto, 0) + '</td><td class="n">' + pct(m.ctr, 2) + '</td><td class="n">' + brl(m.cpm) + '</td>' + resultado(c, m) + '</tr>'; }).join('');
  }
  function tabelaFazer() {
    var tb = $('tFazer').querySelector('tbody'); tb.innerHTML = '';
    var ft = $('fTipo').value, fp = $('fPrio').value, ff = $('fFrente').value;
    var lista = insightsVisiveis().filter(function (i) {
      if (ft && i.tipo !== ft) return false; if (fp && i.prioridade !== fp) return false;
      if (ff) { var c = i.criativo_id ? criativoDe(i.criativo_id) : null; if (!c || c.frente !== ff) return false; }
      return true;
    });
    if (!lista.length) { tb.innerHTML = '<tr class="vazio"><td colspan="5">Nada para fazer com esses filtros.</td></tr>'; return; }
    lista.forEach(function (i) {
      var c = i.criativo_id ? criativoDe(i.criativo_id) : null, tr = el('tr');
      tr.innerHTML = '<td><span class="selo ' + i.prioridade + '">' + i.prioridade + '</span></td><td class="acao"><b>' + esc(i.acao || NOMES_TIPO[i.tipo] || i.tipo) + '</b><span>' + esc(NOMES_TIPO[i.tipo] || i.tipo) + (c && c.tipo ? ' · ' + c.tipo : '') + '</span></td><td><div class="nome" title="' + esc(c ? c.nome : i.criativo_id || '') + '">' + esc(c ? c.nome : i.criativo_id || '—') + '</div>' + (c && (c.frente || c.praca) ? '<span style="color:var(--sub);font-size:11px">' + esc([c.frente, c.praca].filter(Boolean).join(' · ')) + '</span>' : '') + '</td><td class="porque"><b style="color:var(--txt)">' + esc(i.titulo) + '</b><br>' + esc(i.texto || '') + '</td>';
      var td = el('td'), ac = el('div', 'sug-acoes'); if (i.status === 'novo') ac.appendChild(botaoSug(i, 'aceito', 'Aceitar')); ac.appendChild(botaoSug(i, 'feito', 'Feito')); ac.appendChild(botaoSug(i, 'descartado', 'Descartar')); td.appendChild(ac); tr.appendChild(td);
      tb.appendChild(tr);
    });
  }
  ['fTipo', 'fPrio', 'fFrente'].forEach(function (id) { $(id).addEventListener('change', tabelaFazer); });
  function tabelaCriativos() {
    var tb = $('tCriativos').querySelector('tbody'); tb.innerHTML = '';
    var todos = (S.dados.criativos || []).filter(function (c) { return c.gasto > 0 || c.impressoes > 0; });
    $('bMaisCri').hidden = todos.length <= 30;
    $('bMaisCri').textContent = S.maisCri ? 'mostrar menos' : 'ver todos (' + todos.length + ')';
    var cr = S.maisCri ? todos : todos.slice(0, 30);
    if (!cr.length) { tb.innerHTML = '<tr class="vazio"><td colspan="13">Nenhum criativo com dados no período.</td></tr>'; return; }
    var porC = {}; (S.dados.serie || []).forEach(function (m) { (porC[m.criativo_id] = porC[m.criativo_id] || []).push(m); });
    cr.forEach(function (c) {
      var m = calc(c), tr = el('tr'), serie = porC[c.id] || [], max = Math.max.apply(null, serie.map(function (x) { return x.gasto; }).concat([1]));
      var sp = '<svg class="spark" viewBox="0 0 90 22">' + serie.map(function (x, i) { var h = Math.max(1, 20 * x.gasto / max), w = Math.max(2, 90 / Math.max(7, serie.length) - 2); return '<rect x="' + (i * (w + 2)) + '" y="' + (22 - h) + '" width="' + w + '" height="' + h + '" rx="1"><title>' + x.dia + ': ' + brl(x.gasto) + '</title></rect>'; }).join('') + '</svg>';
      var u = serie.slice(-3).reduce(function (a, x) { return { im: a.im + Number(x.impressoes || 0), cl: a.cl + Number(x.cliques_link || 0) }; }, { im: 0, cl: 0 });
      var ctr3 = u.im > 500 ? 100 * u.cl / u.im : null, tend = ctr3 == null || !m.ctr ? '' : ctr3 > m.ctr * 1.1 ? '<span class="tend sobe" title="CTR dos últimos 3 dias: ' + pct(ctr3, 2) + '">▲</span>' : ctr3 < m.ctr * 0.85 ? '<span class="tend cai" title="CTR dos últimos 3 dias: ' + pct(ctr3, 2) + ' (fadiga?)">▼</span>' : '';
      var nome = c.previa && /^https:\/\//.test(c.previa) ? '<a href="' + esc(c.previa) + '" target="_blank" rel="noopener">' + esc(c.nome) + '</a>' : esc(c.nome);
      tr.innerHTML = '<td><div class="nome" title="' + esc(c.nome) + '">' + nome + '</div><span style="color:var(--sub);font-size:11px">' + esc(c.tipo || '') + (c.anuncios > 1 ? ' · ' + c.anuncios + ' anúncios' : '') + '</span></td><td>' + esc([funil(c.frente), c.praca].filter(Boolean).join(' · ') || '—') + '</td>' +
        '<td class="n">' + brl(c.gasto, 0) + '</td><td class="n">' + num(c.impressoes) + '</td><td class="n">' + pct(m.ctr, 2) + tend + '</td><td class="n">' + brl(m.cpm) + '</td>' + resultado(c, m) + '<td>' + sp + '</td>';
      tb.appendChild(tr);
    });
  }
  $('bMaisCamp').addEventListener('click', function () { S.maisCamp = !S.maisCamp; tabelaCampanhas(); });
  $('bMaisCri').addEventListener('click', function () { S.maisCri = !S.maisCri; tabelaCriativos(); });
  function mudarFunil(v) { S.visao = v || ''; try { localStorage.setItem('dsc-visao', S.visao); } catch (e) {} carregar(false); }
  $('funisAbas').addEventListener('click', function (ev) { var b = ev.target.closest('.chip'); if (b) mudarFunil(b.dataset.v); });
  $('tFunis').addEventListener('click', function (ev) { var r = ev.target.closest('tr[data-v]'); if (r) mudarFunil(S.visao === r.dataset.v ? '' : r.dataset.v); });
  $('bSync').addEventListener('click', function () {
    var b = $('bSync'); b.disabled = true; b.textContent = 'Buscando no Painel R1…';
    api('POST', '/api/criacao/dados', { acao: 'sincronizar' }).then(function (r) { toast(r.recente ? 'Já estava atualizado.' : num(r.linhas) + ' linhas atualizadas.'); return carregar(false); })
      .catch(function (e) { toast(e.message, true); }).then(function () { b.disabled = false; b.textContent = 'Atualizar agora'; });
  });
  $('iaLinha').addEventListener('click', function (ev) {
    var b = ev.target.closest('#bAnalisar'); if (!b) return;
    b.disabled = true; b.textContent = 'A máquina está lendo…';
    api('POST', '/api/criacao/dados', { acao: 'analisar', dias: S.dias, visao: S.visao }).then(function (r) { toast(r.sugestoes + ' ideias novas.'); return carregar(false); })
      .catch(function (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Pedir ideias agora'; });
  });
  $('periodo').addEventListener('click', function (ev) { var b = ev.target.closest('.chip'); if (!b) return; S.dias = Number(b.dataset.d); $('periodo').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('ativo', c === b); }); carregar(false); });

  /* ---------- conexão ---------- */
  function desenharConexao() {
    var url = location.origin + '/api/criacao/webhook';
    $('whUrl').textContent = 'POST ' + url;
    $('whLeitura').textContent = "curl '" + url + "?resumo=1&dias=7' -H 'Authorization: Bearer SUA_CHAVE'\n# filtrar um funil: &visao=xeque | rgv | maquina_de_vendas | caixa | ctrl | op27 | …";
    $('whCurl').textContent = "curl -X POST '" + url + "' \\\n  -H 'Authorization: Bearer SUA_CHAVE' -H 'Content-Type: application/json' \\\n  -d '{\"tipo\":\"insights\",\"itens\":[{\"tipo\":\"analise\",\"prioridade\":\"normal\",\"titulo\":\"Teste do webhook\",\"texto\":\"Chegou.\"}]}'";
    var ev = $('whEventos'); ev.innerHTML = '';
    var lista = (S.dados.eventos || []);
    if (!lista.length) ev.appendChild(el('p', 'mini', 'Nada recebido ainda.'));
    lista.forEach(function (e) { var d = el('div', 'evento'); d.innerHTML = '<span><b>' + esc(e.tipo) + '</b> · ' + esc(e.resumo || '') + ' <span style="color:var(--mut)">(' + esc(e.origem || '') + ')</span></span><small>' + quando(e.recebido_em) + '</small>'; ev.appendChild(d); });
    $('chkExemplo').checked = S.exemplo;
    if (!desenharConexao.feito) { desenharConexao.feito = true; fetch('/api/criacao/webhook', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { $('whEstado').textContent = j.configurado ? 'chave configurada, pronto para receber' : 'SEM CHAVE — defina CRIACAO_WEBHOOK_CHAVE na Vercel'; }).catch(function () { $('whEstado').textContent = '?'; }); }
  }
  $('chkExemplo').addEventListener('change', function () { S.exemplo = $('chkExemplo').checked; try { localStorage.setItem('dsc-exemplo', S.exemplo ? '1' : '0'); } catch (e) {} carregar(false); });

  /* ---------- dados de exemplo (só no navegador) ---------- */
  function aplicarExemplo() {
    var semente = 7; function rnd() { semente = (semente * 48271) % 2147483647; return semente / 2147483647; }
    var pracas = [['Turnê', 'Barreiras'], ['Turnê', 'Paraguai'], ['Turnê', 'Chapecó'], ['Turnê', 'Montes Claros'], ['RGV', 'Nacional'], ['Xeque-Mate', 'Nacional'], ['Captações', 'Belo Horizonte'], ['Captações', 'Goiânia']];
    var tipos = ['VID', 'VID', 'IMG', 'VID', 'CAR'], cr = [], serie = [], hoje = new Date();
    for (var i = 0; i < 14; i++) {
      var p = pracas[i % pracas.length], t = tipos[i % tipos.length], id = 'ex' + (1000 + i);
      var nome = '[' + (p[0] === 'Turnê' ? 'CNE' : p[0].toUpperCase().replace('-', '')) + '][PERP][' + t + '][AD' + String(i + 1).padStart(2, '0') + '][19102026][' + p[1].toUpperCase() + ']';
      var c = { id: id, nome: nome, tipo: t === 'IMG' ? 'imagem' : t === 'CAR' ? 'carrossel' : 'video', frente: p[0], praca: p[1], campanha: p[0] + ' PERP', conjunto: i % 2 ? 'Frio' : 'Remarketing', status: 'ativo', gasto: 0, impressoes: 0, alcance: 0, cliques: 0, cliques_link: 0, views_3s: 0, thruplays: 0, leads: 0, vendas: 0, receita: 0, dias: 0 };
      var forca = 0.4 + rnd() * 1.2, hook = 0.18 + rnd() * 0.25, hold = 0.2 + rnd() * 0.3, ctr = 0.008 + rnd() * 0.02;
      for (var d = S.dias - 1; d >= 0; d--) {
        var dia = new Date(hoje.getTime() - d * 86400e3).toISOString().slice(0, 10);
        var gasto = Math.round((60 + rnd() * 180) * forca * 100) / 100, imp = Math.round(gasto / (8 + rnd() * 10) * 1000), v3 = Math.round(imp * hook), tp = Math.round(v3 * hold), cl = Math.round(imp * ctr), leads = Math.round(cl * (0.08 + rnd() * 0.12) * forca), vendas = rnd() < 0.5 ? Math.round(leads * 0.06 * rnd()) : 0, rec = vendas * 497;
        serie.push({ criativo_id: id, dia: dia, gasto: gasto, impressoes: imp, cliques_link: cl, views_3s: v3, thruplays: tp, leads: leads, vendas: vendas, receita: rec });
        c.gasto += gasto; c.impressoes += imp; c.alcance += Math.round(imp * 0.8); c.cliques += Math.round(cl * 1.4); c.cliques_link += cl; c.views_3s += v3; c.thruplays += tp; c.leads += leads; c.vendas += vendas; c.receita += rec; c.dias++;
      }
      c.gasto = Math.round(c.gasto * 100) / 100; cr.push(c);
    }
    cr.sort(function (a, b) { return b.gasto - a.gasto; });
    var ins = [
      ['urgente', 'trafego', 'Acelerar a praça', cr[1].praca + ' vende 1,0 ingresso por dia e precisa de 10,1', 'Faltam 131 ingressos. No ritmo atual não bate a meta; sobe orçamento nos 2 criativos com melhor CPL e abre público lookalike de compradores.', cr[1].id],
      ['urgente', 'variacao', 'Fazer variações', cr[0].nome.slice(0, 40) + ' entrou em fadiga', 'Frequência 3,4 e CTR caiu 38% em 5 dias com o maior gasto da conta. Troca o gancho e o primeiro frame; mantém a oferta.', cr[0].id],
      ['alta', 'vencedor', 'Escalar', cr[2].nome.slice(0, 40) + ' é o vencedor da semana', 'CPL 41% abaixo da média da conta, hook 33% e hold 48%. Aumenta 30% ao dia por 3 dias e duplica para público frio.', cr[2].id],
      ['alta', 'variacao', 'Fazer variações', '3 variações do vencedor no formato Notícia', 'O vencedor é HardCopy; o mesmo gancho em Notícia e Tweet costuma render 20% a mais nessa frente.', cr[2].id],
      ['alta', 'alerta', 'Pausar', cr[13].nome.slice(0, 40) + ' gasta sem lead', brl(cr[13].gasto, 0) + ' no período, CTR ' + pct(calc(cr[13]).ctr, 2) + ' e nenhum lead. Pausa e reaproveita o orçamento no vencedor.', cr[13].id],
      ['normal', 'trafego', 'Testar', 'Remarketing de 7 dias com depoimento', 'Quem viu 50% do vídeo e não converteu: 2.300 pessoas. Vale um conjunto com o POV + Depoimento.', null],
      ['normal', 'analise', 'Observar', cr[3].praca + ' está abaixo do ritmo', 'Ritmo de 3,2 ingressos por dia contra 5 necessários. Ainda dá para recuperar com mais 2 criativos locais.', cr[3].id],
      ['normal', 'vencedor', 'Escalar', 'Carrossel de captação com CPL baixo', 'CPL ' + brl(calc(cr[5]).cpl) + ' e 2 vendas no período. Ótimo para abrir em Goiânia.', cr[5].id],
    ].map(function (x, i) { return { id: 'ex' + i, prioridade: x[0], tipo: x[1], acao: x[2], titulo: x[3], texto: x[4], criativo_id: x[5], origem: 'exemplo', status: 'novo', criado_em: new Date(hoje.getTime() - i * 3600e3).toISOString() }; });
    S.dados.criativos = cr; S.dados.serie = serie; S.dados.insights = ins.concat(S.dados.insights || []);
    if (!(S.dados.eventos || []).length) S.dados.eventos = [{ origem: 'exemplo', tipo: 'metricas', itens: 14 * S.dias, resumo: 'dados de exemplo (só neste navegador)', recebido_em: hoje.toISOString() }];
  }

  /* ---------- conversa ---------- */
  var chatLocalMsgs = [];
  function chatLocal(texto) { chatLocalMsgs.push({ papel: 'maquina', texto: texto, quem: 'tela', criado_em: new Date().toISOString() }); desenharChat(); }
  function desenharChat() {
    var box = $('chatMsgs'); box.innerHTML = '';
    var msgs = (S.dados.conversa || []).concat(chatLocalMsgs).sort(function (a, b) { return new Date(a.criado_em) - new Date(b.criado_em); });
    $('chatQuem').textContent = S.dados.maquina ? 'Claude · até a IA da VPS' : 'IA da VPS (webhook)';
    if (!msgs.length) { box.innerHTML = '<p class="chat-vazio">Aqui aparece tudo o que a máquina responde e pergunta. Você fala com ela pela caixa.</p>'; return; }
    msgs.forEach(function (m) { var d = el('div', 'msg ' + (m.papel === 'voce' ? 'voce' : 'maquina')); d.textContent = m.texto; if (m.papel !== 'voce') d.appendChild(el('small', '', (m.quem || 'máquina') + ' · ' + quando(m.criado_em))); box.appendChild(d); });
    box.scrollTop = box.scrollHeight;
  }
  function contextoProjeto() {
    var e = S.projeto.estado, l = e.lido;
    return ['Projeto: ' + S.projeto.nome, 'Oferta: ' + (e.oferta || '(vazia)'), l ? 'Resumo lido: ' + l.resumo : 'Oferta ainda não lida', l && e.publico != null && l.publicos[e.publico] ? 'Público escolhido: ' + l.publicos[e.publico].nome + ' — ' + l.publicos[e.publico].dor : '',
      'Cérebro: ' + Object.keys(e.cerebro).map(function (k) { return e.cerebro[k] ? k + ': ' + e.cerebro[k] : ''; }).filter(Boolean).join(' | '),
      'Criativos: ' + e.criativos.map(function (c) { return 'C' + String(c.n).padStart(2, '0') + ' formato ' + c.formato + ' estilo ' + c.estilo + (l && c.gancho != null ? ' gancho "' + l.ganchos[c.gancho] + '"' : '') + (c.aprovado ? ' (aprovado)' : ''); }).join('; ')].filter(Boolean).join('\n');
  }
  function enviarChat(texto) {
    if (!texto || !S.projeto) return;
    var inp = $('chatIn'); inp.value = '';
    S.dados.conversa = (S.dados.conversa || []).concat([{ papel: 'voce', texto: texto, criado_em: new Date().toISOString() }]); desenharChat();
    var pensando = el('div', 'msg maquina pensando', 'a máquina está pensando…'); $('chatMsgs').appendChild(pensando); $('chatMsgs').scrollTop = 1e9;
    api('POST', '/api/criacao/dados', { acao: 'conversa', projeto_id: S.projeto.id, texto: texto, contexto: contextoProjeto(), dias: S.dias }).then(function (r) {
      pensando.remove();
      if (r.resposta) S.dados.conversa.push({ papel: 'maquina', texto: r.resposta, quem: 'claude', criado_em: new Date().toISOString() });
      else if (r.aviso) chatLocal(r.aviso);
      desenharChat();
    }).catch(function (e) { pensando.remove(); chatLocal('Não consegui responder: ' + e.message); });
  }
  $('chatForm').addEventListener('submit', function (ev) { ev.preventDefault(); enviarChat($('chatIn').value.trim()); });

  /* ---------- navegação ---------- */
  document.querySelectorAll('.rb[data-vista]').forEach(function (b) {
    b.addEventListener('click', function () {
      S.vista = b.dataset.vista;
      document.querySelectorAll('.rb[data-vista]').forEach(function (x) { x.classList.toggle('ativo', x === b); });
      ['canvas', 'metricas', 'sugestoes', 'conexao'].forEach(function (v) { $('v' + v.charAt(0).toUpperCase() + v.slice(1)).hidden = v !== S.vista; });
      $('topo').hidden = S.vista !== 'canvas';
      if (S.vista === 'canvas') desenharFios();
    });
  });
  $('bLado').addEventListener('click', function () { $('lado').classList.toggle('fechado'); });
  $('bChat').addEventListener('click', function () { $('chat').classList.toggle('fechado'); });
  $('sair').addEventListener('click', function () { api('DELETE', '/api/criacao/login').then(function () { location.reload(); }); });
  window.addEventListener('resize', function () { if (S.vista === 'canvas') desenharFios(); });
  setInterval(function () {
    var a = document.activeElement;
    if (S.eu && !document.hidden && !S.arr && $('modal').hidden && !(a && /TEXTAREA|INPUT|SELECT/.test(a.tagName))) carregar(false);
  }, 60000);

  iniciar();
})();
