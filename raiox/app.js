(() => {
  // API na mesma origem (painel-r1 na Vercel: api/raiox/*). Login por cookie HttpOnly, nada guardado no navegador.
  const API = '/api/raiox';
  const $ = (s, el = document) => el.querySelector(s), $$ = (s, el = document) => [...el.querySelectorAll(s)];
  let papel = null;

  // ---------- rótulos (iguais aos do quiz) ----------
  const REGIMES = {simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real'};
  const SETORES = {comercio_varejo:'Comércio varejista',comercio_atacado:'Atacado/Distribuição',supermercado:'Supermercado',farmacia:'Farmácia',
    autopecas:'Autopeças',posto_combustivel:'Posto de combustível',industria_geral:'Indústria geral',frigorifico:'Frigorífico',grafica:'Gráfica',
    mineracao:'Mineração',energia_renovavel:'Energia renovável',tecnologia:'Tecnologia/Software',servicos_gerais:'Serviços gerais',
    representacao:'Representação comercial',advocacia:'Advocacia',contabilidade:'Contabilidade',consultoria:'Consultoria',publicidade:'Publicidade',
    financeiro:'Serviços financeiros',hospital:'Hospital/Clínica',odontologia:'Odontologia',laboratorio:'Laboratório',estetica:'Estética',
    academia:'Academia',veterinaria:'Veterinária/Petshop',construcao:'Construção civil',incorporadora:'Incorporadora',concretagem:'Concretagem',
    saneamento:'Saneamento',transporte:'Transporte/Logística',educacao:'Educação',hotelaria:'Hotelaria/Turismo',eventos:'Eventos',
    agronegocio:'Agronegócio',outro:'Outro'};
  const FAIXAS = [[50000,'Até R$ 50 mil'],[100000,'R$ 50 a 100 mil'],[200000,'R$ 100 a 200 mil'],[500000,'R$ 200 a 500 mil'],
    [1000000,'R$ 500 mil a 1 mi'],[2000000,'R$ 1 a 2 mi'],[3999999,'R$ 2 a 4 mi'],[Infinity,'Acima de R$ 4 mi']];
  const AUD = {fezRevisao:'Revisão fiscal nos últimos 3 anos',acompanhaDAS:'Acompanha o DAS todo mês',acompanhaDARF:'Confere DARF e DCTF todo mês',
    confereFat:'Confere faturamento × notas',sabeAnexo:'Sabe o Anexo do Simples',usaFatorR:'Conhece o Fator R',
    verificaCreditosPIS:'Verifica créditos de PIS/COFINS',temCertidao:'Certidão negativa em dia',distribuiLucros:'Distribui lucro formalmente'};
  const OPER = {auditoria:'Nunca fez auditoria tributária',divida:'Tem dívida fiscal ativa',interestadual:'Compra ou vende entre estados',
    ativo:'Tem máquinas e equipamentos',lucros:'Distribui lucros aos sócios',ecommerce_op:'Vende fora do estabelecimento',importa:'Importa',
    exporta:'Exporta',filiais:'Filiais em outros estados',subvencao:'Benefício de ICMS estadual',poder_publico:'Presta para o poder público',
    construcao_op:'Obra ou empreitada',pd:'Investe em P&D'};

  const brl = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
  const curto = v => { v = v || 0;
    if(v >= 1e9) return 'R$ ' + (v / 1e9).toFixed(1).replace('.', ',') + ' bi';
    if(v >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1).replace('.', ',') + ' mi';
    if(v >= 1e3) return 'R$ ' + Math.round(v / 1e3).toLocaleString('pt-BR') + ' mil';
    return brl(v); };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const diaBR = d => new Date(d).toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}); // AAAA-MM-DD em Brasília
  const hojeBR = () => diaBR(Date.now());
  const ehTeste = e => Boolean(e.teste); // marcado no servidor (lib/raiox.mjs), que é quem vê nome e e-mail

  // ---------- odômetro ----------
  const DIG = '<div class="dig"><ol>' + [...Array(10)].map((_, i) => `<li>${i}</li>`).join('') + '</ol></div>';
  function montaOdo(el, grupos){
    el.innerHTML = grupos.map(g => (g.virg ? '<span class="virg">,</span>' : '') +
      `<div class="grupo ${g.cls || ''}"><div class="digs">${DIG.repeat(g.n)}</div>${g.rot ? `<small>${g.rot}</small>` : ''}</div>`).join('');
  }
  function poeOdo(el, digitos){ // digitos = string com o mesmo número de casas do odômetro
    const casas = $$('.dig', el), primeiro = digitos.search(/[1-9]/);
    casas.forEach((c, i) => {
      const d = +digitos[i] || 0;
      c.querySelector('ol').style.transform = `translateY(-${d * 10}%)`;
      c.classList.toggle('apagado', primeiro === -1 ? i < casas.length - 1 : i < primeiro);
    });
  }
  const odoTotal = $('#odoTotal'), odoPessoas = $('#odoPessoas');
  // O contador grande não fica parado: a partir do total real, sobe sozinho RITMO reais por minuto
  // (de segundo em segundo) desde que a tela abriu. Os cartões e as abas continuam com os números reais.
  const RITMO = 1000;
  let totalReal = 0;
  const abriu = Date.now();
  function mostraTotal(){
    const v = totalReal + RITMO * (Date.now() - abriu) / 60000;
    const cents = Math.round(v * 100), reais = Math.floor(cents / 100);
    poeOdo(odoTotal, String(Math.min(reais, 999999999999)).padStart(12, '0') + String(cents % 100).padStart(2, '0'));
  }
  setInterval(() => { if(!$('#app').classList.contains('esc')) mostraTotal(); }, 1000);
  montaOdo(odoTotal, [{n:3, rot:'Bilhões'}, {n:3, rot:'Milhões'}, {n:3, rot:'Mil'}, {n:3, rot:'Reais'}, {n:2, rot:'Centavos', cls:'cent', virg:true}]);
  odoPessoas.innerHTML = DIG.repeat(5);
  $$('.dig ol').forEach(o => o.style.height = '1000%'); // cada li = 10% da fita
  $$('.dig li').forEach(li => li.style.height = '10%');

  // ---------- tooltip ----------
  const tip = $('#tip');
  const mostraTip = (ev, html) => { tip.innerHTML = html; tip.classList.add('on');
    const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 10), y = ev.clientY + 16 + tip.offsetHeight > innerHeight ? ev.clientY - tip.offsetHeight - 12 : ev.clientY + 16;
    tip.style.left = x + 'px'; tip.style.top = y + 'px'; };
  const someTip = () => tip.classList.remove('on');

  function barras(el, linhas, {fmt = v => v, tipFn, neutra} = {}){
    if(!linhas.length){ el.innerHTML = '<div class="vazio">Sem dados ainda.</div>'; return; }
    const max = Math.max(...linhas.map(l => l.v)) || 1;
    el.innerHTML = linhas.map((l, i) => `<div class="barra${neutra ? ' neutra' : ''}" data-i="${i}"><span class="n">${esc(l.n)}</span><span class="q">${fmt(l.v, l)}</span><span class="t"><i style="width:${Math.max(l.v / max * 100, 1.5)}%"></i></span></div>`).join('');
    if(tipFn) $$('.barra', el).forEach(b => { b.onmousemove = ev => mostraTip(ev, tipFn(linhas[b.dataset.i])); b.onmouseleave = someTip; });
  }
  const conta = (lista, chave) => { const m = new Map(); lista.forEach(e => { const k = chave(e); if(k != null && k !== '') m.set(k, (m.get(k) || 0) + 1); }); return m; };
  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  // ---------- gráfico de linha (envios por dia) ----------
  function linha(el, lista, dias){
    const fim = new Date(hojeBR() + 'T12:00:00'), n = dias;
    const serie = [...Array(n)].map((_, i) => { const d = new Date(fim); d.setDate(d.getDate() - (n - 1 - i)); const k = d.toISOString().slice(0, 10);
      const doDia = lista.filter(e => diaBR(e.ts) === k); return {k, d, q: doDia.length, v: doDia.reduce((s, e) => s + e.res.total, 0)}; });
    const W = el.clientWidth || 700, H = 230, pl = 34, pr = 10, pt = 12, pb = 26;
    const max = Math.max(4, ...serie.map(s => s.q)), passo = Math.ceil(max / 4);
    const topo = passo * 4;
    const X = i => pl + (n === 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)), Y = q => pt + (1 - q / topo) * (H - pt - pb);
    const pts = serie.map((s, i) => [X(i), Y(s.q)]);
    const caminho = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = caminho + ` L${X(n - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`;
    const cada = Math.ceil(n / 7);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Diagnósticos por dia">
      <defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22C55E" stop-opacity=".35"/><stop offset="1" stop-color="#22C55E" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3, 4].map(j => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${Y(j * passo)}" y2="${Y(j * passo)}"/><text class="eixo" x="${pl - 8}" y="${Y(j * passo) + 3.5}" text-anchor="end">${j * passo}</text>`).join('')}
      ${serie.map((s, i) => i % cada === (n - 1) % cada ? `<text class="eixo" x="${X(i)}" y="${H - 6}" text-anchor="middle">${s.d.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}</text>` : '').join('')}
      <path d="${area}" fill="url(#ga)"/><path d="${caminho}" fill="none" stroke="#22C55E" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <line id="cruz" y1="${pt}" y2="${H - pb}" stroke="rgba(255,255,255,.3)" stroke-dasharray="3 3" style="display:none"/>
      <circle id="ponto" r="5" fill="#22C55E" stroke="#0D0D0D" stroke-width="2" style="display:none"/>
    </svg>`;
    const svg = $('svg', el), cruz = $('#cruz', el), ponto = $('#ponto', el);
    svg.onmousemove = ev => { const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * W;
      const i = Math.max(0, Math.min(n - 1, Math.round((x - pl) / ((W - pl - pr) / Math.max(n - 1, 1)))));
      cruz.setAttribute('x1', X(i)); cruz.setAttribute('x2', X(i)); cruz.style.display = '';
      ponto.setAttribute('cx', X(i)); ponto.setAttribute('cy', Y(serie[i].q)); ponto.style.display = '';
      mostraTip(ev, `<b>${serie[i].d.toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: 'short'})}</b><br>${serie[i].q} diagnóstico${serie[i].q === 1 ? '' : 's'}<br>${curto(serie[i].v)} identificados`); };
    svg.onmouseleave = () => { cruz.style.display = 'none'; ponto.style.display = 'none'; someTip(); };
  }

  // ---------- estado ----------
  let TODOS = [], periodo = 'tudo', aberto = null, semTeste = true;
  const ativos = () => TODOS.filter(e => !e.excluido); // lixeira (só admin recebe) fica fora de todas as contas
  const filtrados = () => {
    let l = semTeste ? ativos().filter(e => !ehTeste(e)) : ativos();
    if(periodo === 'hoje') l = l.filter(e => diaBR(e.ts) === hojeBR());
    else if(periodo !== 'tudo') { const lim = Date.now() - +periodo * 864e5; l = l.filter(e => +new Date(e.ts) >= lim); }
    return l;
  };

  function desenha(){
    const L = filtrados(), N = L.length;
    const total = L.reduce((s, e) => s + (e.res.total || 0), 0);
    totalReal = total; mostraTotal();
    poeOdo(odoPessoas, String(Math.min(N, 99999)).padStart(5, '0'));
    const semT = semTeste ? ativos().filter(e => !ehTeste(e)) : ativos();
    const hoje = semT.filter(e => diaBR(e.ts) === hojeBR()).length;
    $('#hojeTxt').textContent = '+' + hoje + ' hoje';
    $('#mediaTxt').textContent = curto(N ? total / N : 0);
    $('#maiorTxt').textContent = curto(Math.max(0, ...L.map(e => e.res.total || 0)));

    $('#kRec').textContent = curto(L.reduce((s, e) => s + e.res.recuperacao, 0));
    $('#kBen').textContent = curto(L.reduce((s, e) => s + e.res.beneficios, 0));
    $('#kEco').textContent = curto(L.reduce((s, e) => s + e.res.economia, 0));
    const comPct = L.filter(e => e.res.pct > 0 && e.res.pct < 100);
    $('#kPct').textContent = (comPct.length ? Math.round(comPct.reduce((s, e) => s + e.res.pct, 0) / comPct.length) : 0) + '%';
    $('#kDiv').textContent = pct(L.filter(e => +e.perfil.divida).length, N) + '%';

    const dias = periodo === '7' ? 7 : periodo === 'hoje' ? 7 : periodo === '30' ? 30 :
      Math.min(90, Math.max(14, L.length ? Math.ceil((Date.now() - Math.min(...L.map(e => +new Date(e.ts)))) / 864e5) + 1 : 14));
    linha($('#gLinha'), L, dias);
    $('#linhaLeg').textContent = 'últimos ' + dias + ' dias';

    const tipQ = l => `<b>${esc(l.n)}</b><br>${l.v} empresa${l.v === 1 ? '' : 's'} · ${pct(l.v, N)}%<br>${curto(l.soma)} identificados`;
    const agrupa = (fn, ordem) => { const m = new Map(); L.forEach(e => { const k = fn(e); if(!k) return; const o = m.get(k) || {n: k, v: 0, soma: 0}; o.v++; o.soma += e.res.total; m.set(k, o); });
      const arr = [...m.values()]; return ordem ? ordem.map(k => m.get(k)).filter(Boolean) : arr.sort((a, b) => b.v - a.v); };
    barras($('#bFat'), agrupa(e => (FAIXAS.find(([lim]) => +e.perfil.faturamento <= lim) || [])[1], FAIXAS.map(f => f[1])), {tipFn: tipQ});
    barras($('#bReg'), agrupa(e => REGIMES[e.perfil.regime] || e.perfil.regime, Object.values(REGIMES)), {tipFn: tipQ});
    barras($('#bSet'), agrupa(e => SETORES[e.perfil.setor] || e.perfil.setor).slice(0, 8), {tipFn: tipQ});
    barras($('#bUf'), agrupa(e => e.perfil.estado).slice(0, 8), {tipFn: tipQ});

    const opp = new Map(); L.forEach(e => (e.res.top || []).forEach(o => { const x = opp.get(o.nome) || {n: o.nome, v: 0, q: 0}; x.v += o.val; x.q++; opp.set(o.nome, x); }));
    barras($('#bOpp'), [...opp.values()].sort((a, b) => b.v - a.v).slice(0, 8), {fmt: curto, tipFn: l => `<b>${esc(l.n)}</b><br>apareceu em ${l.q} diagnóstico${l.q === 1 ? '' : 's'}<br>${curto(l.v)} somados`});

    const nao = Object.entries(AUD).map(([k, n]) => ({n, v: pct(L.filter(e => !+e.perfil[k]).length, N), q: L.filter(e => !+e.perfil[k]).length})).sort((a, b) => b.v - a.v);
    barras($('#bAud'), N ? nao : [], {fmt: v => v + '%', tipFn: l => `<b>${esc(l.n)}</b><br>${l.q} de ${N} responderam "não"`});
    const op = Object.entries(OPER).map(([k, n]) => ({n, v: pct(L.filter(e => +e.perfil[k]).length, N), q: L.filter(e => +e.perfil[k]).length})).filter(l => l.q).sort((a, b) => b.v - a.v);
    barras($('#bOp'), op, {fmt: v => v + '%', neutra: true, tipFn: l => `<b>${esc(l.n)}</b><br>${l.q} de ${N} empresas`});
    barras($('#bOri'), agrupa(e => { const u = e.utm || {}; return u.source ? u.source + (u.campaign ? ' · ' + u.campaign : '') : (u.fbclid ? 'Meta (sem UTM)' : 'Direto / sem UTM'); }).slice(0, 8), {neutra: true, tipFn: tipQ});

    $('#nLeadsAba').textContent = L.length;
    if(papel === 'admin'){ if(!editando()) tabela(); metricas(L); }
  }

  // ---------- métricas (admin) ----------
  const QUALIF = 200000; // faturamento/mês do público da reunião
  const ehQualif = e => +e.perfil.faturamento >= QUALIF;
  const temWhats = e => ((e.lead || {}).telefone || '').replace(/\D/g, '').length >= 10;
  const tipQtd = (N) => l => `<b>${esc(l.n)}</b><br>${l.v} empresa${l.v === 1 ? '' : 's'} · ${pct(l.v, N)}%`;
  function metricas(L){
    const N = L.length, Q = L.filter(ehQualif), vQ = Q.reduce((s, e) => s + (e.res.total || 0), 0);
    $('#cN').textContent = N.toLocaleString('pt-BR');
    $('#c7').textContent = L.filter(e => +new Date(e.ts) >= Date.now() - 7 * 864e5).length.toLocaleString('pt-BR');
    $('#cDv').textContent = curto(L.reduce((s, e) => s + (+e.perfil.divida ? +e.perfil.passivo_valor || 0 : 0), 0));
    $('#cCarga').textContent = curto(L.reduce((s, e) => s + (e.res.carga || 0), 0));
    $('#cOpp').textContent = (N ? L.reduce((s, e) => s + (e.res.nOpps || 0), 0) / N : 0).toFixed(1).replace('.', ',');
    const comFat = L.filter(e => +e.perfil.faturamento > 0);
    $('#cFat').textContent = curto(comFat.length ? comFat.reduce((s, e) => s + +e.perfil.faturamento, 0) / comFat.length : 0);
    const porFaixa = (el, faixas, valor) => barras($(el), N ? faixas.map(([lim, n]) => ({n, v: 0, lim})).map((f, i, arr) => {
        f.v = L.filter(e => { const x = valor(e); return x != null && x <= f.lim && (i === 0 || x > arr[i - 1].lim); }).length; return f; }) : [],
      {neutra: true, tipFn: tipQtd(N)});
    porFaixa('#bValor', [[50000, 'Até R$ 50 mil'], [200000, 'R$ 50 a 200 mil'], [1000000, 'R$ 200 mil a 1 mi'], [5000000, 'R$ 1 a 5 mi'], [Infinity, 'Acima de R$ 5 mi']], e => e.res.total || 0);
    porFaixa('#bCarga', [[8, 'Até 8%'], [12, '8% a 12%'], [16, '12% a 16%'], [20, '16% a 20%'], [Infinity, 'Acima de 20%']], e => e.res.pct > 0 ? e.res.pct : null);
    const set = new Map(); L.forEach(e => { const k = SETORES[e.perfil.setor] || e.perfil.setor; if(!k) return; const o = set.get(k) || {n: k, q: 0, s: 0}; o.q++; o.s += e.res.total || 0; set.set(k, o); });
    barras($('#bSetMed'), [...set.values()].map(o => ({...o, v: o.s / o.q})).sort((a, b) => b.v - a.v).slice(0, 8),
      {fmt: curto, tipFn: l => `<b>${esc(l.n)}</b><br>${l.q} empresa${l.q === 1 ? '' : 's'}<br>média ${curto(l.v)} · total ${curto(l.s)}`});
    barras($('#bRegQ'), Object.entries(REGIMES).map(([k, n]) => { const x = L.filter(e => e.perfil.regime === k); return {n, v: pct(x.filter(ehQualif).length, x.length), q: x.length, ql: x.filter(ehQualif).length}; }).filter(l => l.q),
      {fmt: v => v + '%', tipFn: l => `<b>${esc(l.n)}</b><br>${l.ql} de ${l.q} faturam R$ 200 mil+/mês`});
    $('#cQ').textContent = Q.length.toLocaleString('pt-BR');
    $('#cQp').textContent = pct(Q.length, N) + '%';
    $('#cQv').textContent = curto(vQ);
    $('#cQm').textContent = curto(Q.length ? vQ / Q.length : 0);
    $('#cW').textContent = pct(L.filter(temWhats).length, N) + '%';
    $('#cDiv').textContent = pct(L.filter(e => +e.perfil.divida).length, N) + '%';
    const hora = ts => +new Date(ts).toLocaleString('en-GB', {timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false}) % 24;
    const faixas = [[0, 6, 'Madrugada (0h–6h)'], [6, 9, 'Manhã cedo (6h–9h)'], [9, 12, 'Manhã (9h–12h)'], [12, 14, 'Almoço (12h–14h)'], [14, 18, 'Tarde (14h–18h)'], [18, 21, 'Noite (18h–21h)'], [21, 24, 'Noite tarde (21h–24h)']];
    barras($('#bHora'), N ? faixas.map(([a, b, n]) => { const x = L.filter(e => { const h = hora(e.ts); return h >= a && h < b; }); return {n, v: x.length, soma: x.reduce((s, e) => s + e.res.total, 0)}; }) : [],
      {neutra: true, tipFn: l => `<b>${esc(l.n)}</b><br>${l.v} diagnóstico${l.v === 1 ? '' : 's'} · ${pct(l.v, N)}%<br>${curto(l.soma)} identificados`});
    const DS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const dia = ts => new Date(diaBR(ts) + 'T12:00:00').getDay();
    barras($('#bDia'), N ? DS.map((n, i) => { const x = L.filter(e => dia(e.ts) === i); return {n, v: x.length, soma: x.reduce((s, e) => s + e.res.total, 0)}; }) : [],
      {neutra: true, tipFn: l => `<b>${esc(l.n)}</b><br>${l.v} diagnóstico${l.v === 1 ? '' : 's'} · ${pct(l.v, N)}%<br>${curto(l.soma)} identificados`});
  }

  // ---------- usuários (admin) ----------
  const req = (metodo, corpo) => fetch(API + '/usuarios', {method: metodo, credentials: 'same-origin', cache: 'no-store',
    headers: corpo ? {'Content-Type': 'application/json'} : {}, body: corpo ? JSON.stringify(corpo) : undefined})
    .then(async r => { const j = await r.json().catch(() => ({})); if(!r.ok) throw new Error(j.erro || 'Não deu certo.'); return j; });
  const msgU = (html, erro) => { const m = $('#uMsg'); m.innerHTML = html; m.classList.toggle('erro', Boolean(erro)); };
  const mostraSenha = (login, senha) => msgU(`Acesso de <b>${esc(login)}</b>: senha <code>${esc(senha)}</code> · copie agora, ela não aparece de novo. Endereço: ${esc(location.origin + location.pathname)}`);
  async function usuarios(){
    try {
      const {usuarios: U} = await req('GET');
      $('#tUsu').innerHTML = U.map(u => `<tr class="${u.ativo ? '' : 'inativo'}"><td class="mono">${esc(u.login)}</td><td>${esc(u.nome)}</td>
        <td><span class="papel ${u.papel}">${u.papel === 'admin' ? 'Admin' : 'Leitor'}</span></td>
        <td class="num" style="text-align:left">${u.ultimo_acesso ? quando(u.ultimo_acesso) : '—'}</td><td>${u.ativo ? 'Ativo' : 'Desativado'}</td>
        <td style="text-align:right;white-space:nowrap">${u.ativo ? `<button class="btn-l" data-senha="${esc(u.login)}" data-papel="${u.papel}" data-nome="${esc(u.nome)}">Nova senha</button>` : ''}
          <button class="btn-l" data-ativo="${u.ativo ? 0 : 1}" data-login="${esc(u.login)}">${u.ativo ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('');
      $$('#tUsu [data-senha]').forEach(b => b.onclick = async () => {
        if(!confirm(`Gerar nova senha para ${b.dataset.senha}? A senha atual para de funcionar.`)) return;
        try { const j = await req('POST', {login: b.dataset.senha, nome: b.dataset.nome, papel: b.dataset.papel, novaSenha: true}); mostraSenha(b.dataset.senha, j.senha); usuarios(); }
        catch(e) { msgU(esc(e.message), true); } });
      $$('#tUsu [data-ativo]').forEach(b => b.onclick = async () => {
        try { await req('PATCH', {login: b.dataset.login, ativo: b.dataset.ativo === '1'}); msgU(''); usuarios(); } catch(e) { msgU(esc(e.message), true); } });
    } catch(e) { msgU(esc(e.message), true); }
  }
  $('#fUsuario').addEventListener('submit', async ev => {
    ev.preventDefault();
    const login = $('#uLogin').value.trim().toLowerCase();
    try { const j = await req('POST', {login, nome: $('#uNome').value.trim(), papel: $('#uPapel').value});
      if(j.senha) mostraSenha(login, j.senha); else msgU(`Acesso de <b>${esc(login)}</b> atualizado.`);
      $('#uLogin').value = ''; $('#uNome').value = ''; usuarios(); }
    catch(e) { msgU(esc(e.message), true); }
  });

  // ---------- tabela de leads (gestão: etapa, anotações, teste, lixeira, ações em massa) ----------
  const quando = ts => new Date(ts).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
  const quandoAno = ts => new Date(ts).toLocaleString('pt-BR', {timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'});
  const faixaDe = f => (FAIXAS.find(([lim]) => +f <= lim) || [])[1] || '';
  const soDig = t => (t || '').replace(/\D/g, '');
  const wa = (t, msg) => { const d = soDig(t); return d ? 'https://wa.me/' + (d.length <= 11 ? '55' + d : d) + (msg ? '?text=' + encodeURIComponent(msg) : '') : ''; };
  const ETAPAS = {novo: 'Novo', contato: 'Em contato', reuniao: 'Reunião marcada', cliente: 'Cliente', perdido: 'Perdido'};
  const opcoesEtapa = atual => Object.entries(ETAPAS).map(([k, n]) => `<option value="${k}"${k === atual ? ' selected' : ''}>${n}</option>`).join('');
  $('#mEtapa').insertAdjacentHTML('beforeend', opcoesEtapa(''));
  const msgWhats = e => `Olá, ${((e.lead.nome || '').trim().split(/\s+/)[0]) || 'tudo bem'}! Aqui é do time do Ricardo Nunes. ` +
    `Vi que você fez o Raio-X Tributário e ele apontou ${brl(e.res.total)} em oportunidades para a sua empresa. Posso te mostrar os próximos passos?`;

  let etapa = 'todos', ordem = 'recente', soQualif = false, soWhats = false, limite = 100;
  const sel = new Set(), rascunho = {};
  const editando = () => { const a = document.activeElement; return Boolean(a && a.closest && a.closest('#tLeads') && /^(TEXTAREA|SELECT|INPUT)$/.test(a.tagName)); };

  // base = filtros de cima (período, testes, qualificados, WhatsApp, busca), antes da etapa
  function baseLeads(lixeira){
    const q = $('#busca').value.trim().toLowerCase();
    let L = lixeira ? TODOS.filter(e => e.excluido) : filtrados();
    if(soQualif) L = L.filter(ehQualif);
    if(soWhats) L = L.filter(temWhats);
    if(q) L = L.filter(e => [e.lead.nome, e.lead.email, e.lead.telefone, soDig(e.lead.telefone), e.perfil.nome, SETORES[e.perfil.setor], e.perfil.estado,
      REGIMES[e.perfil.regime], ETAPAS[e.status], ...(e.notas || []).map(n => n.texto)].join(' ').toLowerCase().includes(q));
    return L;
  }
  function listaLeads(){
    let L = etapa === 'lixeira' ? baseLeads(true) : baseLeads(false).filter(e => etapa === 'todos' || e.status === etapa);
    const f = {recente: (a, b) => +new Date(b.ts) - +new Date(a.ts), antigo: (a, b) => +new Date(a.ts) - +new Date(b.ts),
      valor: (a, b) => (b.res.total || 0) - (a.res.total || 0), fat: (a, b) => (+b.perfil.faturamento || 0) - (+a.perfil.faturamento || 0),
      nome: (a, b) => (a.lead.nome || '').localeCompare(b.lead.nome || '', 'pt-BR')}[ordem];
    return L.slice().sort(f);
  }
  // mesmo e-mail ou WhatsApp em mais de um diagnóstico
  function repetidos(){
    const m = new Map(), chaves = e => [(e.lead.email || '').toLowerCase().trim(), soDig(e.lead.telefone).slice(-9)].filter(k => k.length >= 6);
    ativos().forEach(e => chaves(e).forEach(k => m.set(k, (m.get(k) || 0) + 1)));
    return e => Math.max(1, ...chaves(e).map(k => m.get(k) || 1));
  }

  function desenhaEtapas(){
    const base = baseLeads(false), lixo = TODOS.filter(e => e.excluido).length;
    const btn = (k, n, q, cls = '') => `<button class="${cls}${etapa === k ? ' on' : ''}" data-et="${k}">${n} <b>${q}</b></button>`;
    $('#etapas').innerHTML = btn('todos', 'Todos', base.length) +
      Object.entries(ETAPAS).map(([k, n]) => btn(k, `<span class="st st-${k}">${n}</span>`, base.filter(e => e.status === k).length)).join('') +
      btn('lixeira', 'Lixeira', lixo, 'lixo') +
      (etapa === 'lixeira' && lixo ? '<button class="esvaziar" data-esvaziar>Esvaziar lixeira</button>' : '');
    $$('#etapas [data-et]').forEach(b => b.onclick = () => { etapa = b.dataset.et; sel.clear(); aberto = null; limite = 100; tabela(); });
    const ev = $('#etapas [data-esvaziar]');
    if(ev) ev.onclick = () => { if(confirm(`Apagar de vez os ${lixo} lead(s) da lixeira? Isso não tem volta.`)) acao({acao: 'esvaziar'}, n => `${n} lead(s) apagado(s) de vez.`); };
  }

  function tabela(){
    desenhaEtapas();
    const L = listaLeads(), lixeira = etapa === 'lixeira', rep = repetidos();
    const vis = new Set(L.map(e => e.id));
    [...sel].forEach(id => { if(!vis.has(id)) sel.delete(id); });
    massa();
    $('.mais').classList.toggle('esc', L.length <= limite);
    $('#mais').textContent = `Mostrar mais (${L.length - limite} restantes)`;
    $('#selTodos').checked = L.length > 0 && L.every(e => sel.has(e.id));
    $('#selTodos').indeterminate = sel.size > 0 && !$('#selTodos').checked;
    if(!L.length){ $('#tLeads').innerHTML = `<tr><td colspan="9"><div class="vazio">${lixeira ? 'A lixeira está vazia.' : 'Nenhum lead com esses filtros.'}</div></td></tr>`; return; }
    $('#tLeads').innerHTML = L.slice(0, limite).map(e => {
      const p = e.perfil, l = e.lead, link = wa(l.telefone), r = rep(e);
      let h = `<tr class="lin${sel.has(e.id) ? ' sel' : ''}" data-id="${esc(e.id)}">
        <td class="ck"><input type="checkbox" data-ck="${esc(e.id)}"${sel.has(e.id) ? ' checked' : ''} aria-label="Selecionar"></td>
        <td class="num" style="text-align:left">${quando(e.ts)}</td>
        <td><div class="nome">${esc(l.nome) || '—'}${ehTeste(e) ? '<span class="tag-t">teste</span>' : ''}${r > 1 ? `<span class="tag-r" title="Mesmo e-mail ou WhatsApp em ${r} diagnósticos">repetido ×${r}</span>` : ''}${(e.notas || []).length ? `<span class="tag-n" title="Anotações">✎ ${e.notas.length}</span>` : ''}</div></td>
        <td>${link ? `<a href="${link}" target="_blank" rel="noopener">${esc(l.telefone)}</a>` : '—'}</td>
        <td>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—'}</td>
        <td>${p.nome ? `<div class="nome">${esc(p.nome)}</div>` : ''}${esc(SETORES[p.setor] || p.setor || '—')}<div class="sub">${esc(p.estado || '')} · ${esc(REGIMES[p.regime] || p.regime || '')}</div></td>
        <td>${esc(faixaDe(p.faturamento))}</td>
        <td>${lixeira ? '<span class="st st-perdido">Na lixeira</span>' : `<select class="etapa-sel" data-et-id="${esc(e.id)}" aria-label="Etapa">${opcoesEtapa(e.status)}</select>`}</td>
        <td class="num val">${brl(e.res.total)}</td></tr>`;
      if(aberto === e.id){
        const sinais = Object.entries(OPER).filter(([k]) => +p[k]).map(([, n]) => `<span>${esc(n)}</span>`).join('') || '<span>Nenhum</span>';
        const naoF = Object.entries(AUD).filter(([k]) => !+p[k]).map(([, n]) => `<span>${esc(n)}</span>`).join('') || '<span>Tudo em dia</span>';
        const notas = (e.notas || []).slice().reverse().map(n => `<li><small>${esc(n.por)} · ${quandoAno(n.em)}</small><p>${esc(n.texto)}</p><button data-tirar="${esc(n.id)}" title="Apagar anotação" aria-label="Apagar anotação">×</button></li>`).join('');
        h += `<tr class="det"><td colspan="9"><div class="det-g">
          <div><h4>Oportunidades encontradas (${e.res.nOpps})</h4><ul>${(e.res.top || []).map(o => `<li><span>${esc(o.nome)}</span><span>${brl(o.val)}</span></li>`).join('') || '<li>—</li>'}</ul>
            <h4 style="margin-top:16px">Números</h4><ul>
            <li><span>Imposto estimado por ano</span><span>${brl(e.res.carga)}</span></li>
            <li><span>Economia por ano</span><span>${brl(e.res.economia)}</span></li>
            <li><span>Funcionários CLT · anos de empresa</span><span>${esc(p.funcionarios)} · ${esc(p.anos)}+</span></li>
            ${+p.divida ? `<li><span>Dívida fiscal informada</span><span>${brl(p.passivo_valor)}</span></li>` : ''}</ul></div>
          <div><h4>Como opera</h4><div class="chips">${sinais}</div>
            <h4 style="margin-top:16px">Auditoria do dono: respondeu "não"</h4><div class="chips">${naoF}</div>
            <h4 style="margin-top:16px">Origem</h4><div class="chips">${Object.entries(e.utm || {}).map(([k, v]) => `<span>${esc(k)}: ${esc(v)}</span>`).join('') || '<span>Direto / sem UTM</span>'}</div></div>
          <div class="gest">
            <div><h4>Ações</h4><div class="acoes">
              ${link ? `<a class="btn-l" href="${wa(l.telefone, msgWhats(e))}" target="_blank" rel="noopener">WhatsApp com mensagem pronta</a>` : ''}
              <button class="btn-l" data-copiar>Copiar contato</button>
              ${lixeira ? `<button class="btn-l" data-um="restaurar">Restaurar</button><button class="btn-l perigo" data-um="apagar">Apagar de vez</button>`
                : `<button class="btn-l" data-um="${ehTeste(e) ? 'real' : 'teste'}">${ehTeste(e) ? 'Não é teste' : 'Marcar como teste'}</button>
                   <button class="btn-l perigo" data-um="excluir">Excluir</button>`}
            </div>
            <div class="sub">Chegou em ${quandoAno(e.ts)}${e.gestao ? ` · última mudança por ${esc(e.gestao.por)} em ${quandoAno(e.gestao.em)}` : ''}${e.excluido ? ` · excluído por ${esc(e.excluido.por)} em ${quandoAno(e.excluido.em)}` : ''}${e.testeManual != null ? ' · teste marcado à mão' : ''}</div></div>
            <div><h4>Anotações</h4>${notas ? `<ul class="notas">${notas}</ul>` : ''}
              <form class="nova-nota" data-nota="${esc(e.id)}"><textarea maxlength="2000" placeholder="Ex.: liguei, pediu para retornar na sexta">${esc(rascunho[e.id] || '')}</textarea><button class="btn-r">Salvar anotação</button></form></div>
          </div>
        </div></td></tr>`;
      }
      return h;
    }).join('');

    const T = $('#tLeads'), porId = id => TODOS.find(e => e.id === id);
    $$('tr.lin', T).forEach(tr => tr.onclick = ev => {
      if(ev.target.closest('a,select,input,button,label')) return;
      aberto = aberto === tr.dataset.id ? null : tr.dataset.id; tabela(); });
    $$('[data-ck]', T).forEach(c => c.onchange = () => { c.checked ? sel.add(c.dataset.ck) : sel.delete(c.dataset.ck); tabela(); });
    $$('[data-et-id]', T).forEach(s => s.onchange = () => { const id = s.dataset.etId; s.blur();
      acao({acao: 'status', ids: [id], status: s.value}, () => `Etapa: ${ETAPAS[s.value]}.`); });
    const det = $('tr.det', T);
    if(!det) return;
    const e = porId(aberto);
    $$('[data-um]', det).forEach(b => b.onclick = () => emMassa(b.dataset.um, [aberto]));
    const cp = $('[data-copiar]', det);
    if(cp) cp.onclick = () => {
      const t = [e.lead.nome, e.lead.telefone, e.lead.email, e.perfil.nome].filter(Boolean).join(' · ');
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => avisa('Contato copiado.'), () => prompt('Copie o contato:', t));
    };
    $$('[data-tirar]', det).forEach(b => b.onclick = () => { if(confirm('Apagar esta anotação?')) acao({acao: 'tirarNota', id: aberto, nota: b.dataset.tirar}, () => 'Anotação apagada.'); });
    const f = $('form.nova-nota', det), ta = $('textarea', f);
    ta.oninput = () => { rascunho[aberto] = ta.value; };
    f.onsubmit = ev => { ev.preventDefault(); const texto = ta.value.trim(); if(!texto) return ta.focus();
      const id = aberto; ta.blur();
      acao({acao: 'nota', id, texto}, () => { delete rascunho[id]; return 'Anotação salva.'; }); };
  }

  // barra de ações em massa
  function massa(){
    const lixeira = etapa === 'lixeira';
    $('#massa').classList.toggle('esc', !sel.size);
    $('#nSel').textContent = sel.size;
    $$('#massa .so-ativos').forEach(x => x.classList.toggle('esc', lixeira));
    $$('#massa .so-lixo').forEach(x => x.classList.toggle('esc', !lixeira));
  }
  function emMassa(m, ids){
    const n = ids.length, s = n === 1 ? '' : 's';
    if(m === 'teste') return acao({acao: 'teste', ids, teste: true}, () => `${n} lead${s} marcado${s} como teste.`);
    if(m === 'real') return acao({acao: 'teste', ids, teste: false}, () => `${n} lead${s} marcado${s} como lead de verdade.`);
    if(m === 'restaurar') return acao({acao: 'restaurar', ids}, k => `${k} lead${s} restaurado${s}.`, () => sel.clear());
    if(m === 'excluir') return acao({acao: 'excluir', ids}, k => `${k} lead${s} na lixeira.`, () => { sel.clear(); if(ids.includes(aberto)) aberto = null; },
      () => acao({acao: 'restaurar', ids}, k => `${k} lead${s} de volta.`));
    if(m === 'apagar'){
      if(!confirm(`Apagar de vez ${n} lead${s}? Isso não tem volta.`)) return;
      return acao({acao: 'apagar', ids}, k => `${k} lead${s} apagado${s} de vez.`, () => { sel.clear(); aberto = null; });
    }
  }
  $$('#massa [data-m]').forEach(b => b.onclick = () => {
    const m = b.dataset.m, ids = [...sel];
    if(m === 'limpar'){ sel.clear(); return tabela(); }
    if(m === 'csv') return baixaCSV(listaLeads().filter(e => sel.has(e.id)));
    emMassa(m, ids);
  });
  $('#mEtapa').onchange = () => { const v = $('#mEtapa').value; $('#mEtapa').value = ''; if(!v) return;
    const ids = [...sel]; acao({acao: 'status', ids, status: v}, k => `${k} lead(s) em "${ETAPAS[v]}".`); };
  $('#selTodos').onchange = () => { const L = listaLeads(); if($('#selTodos').checked) L.forEach(e => sel.add(e.id)); else sel.clear(); tabela(); };
  $('#mais').onclick = () => { limite += 100; tabela(); };

  // chama a API, avisa e recarrega. depois() roda antes de redesenhar; desfazer() vira o botão "Desfazer" do aviso.
  async function acao(corpo, msg, depois, desfazer){
    try {
      const r = await fetch(API + '/envios', {method: 'PATCH', credentials: 'same-origin', cache: 'no-store',
        headers: {'Content-Type': 'application/json'}, body: JSON.stringify(corpo)});
      const j = await r.json().catch(() => ({}));
      if(r.status === 401){ entra(null); return; }
      if(!r.ok) throw new Error(j.erro || 'Não deu certo.');
      if(depois) depois();
      avisa(msg ? msg(j.n) : 'Feito.', false, desfazer);
      await carrega();
    } catch(e) { avisa(e.message, true); }
  }
  let tt;
  function avisa(texto, erro, desfazer){
    const t = $('#toast');
    t.innerHTML = `<span>${esc(texto)}</span>${desfazer ? '<button>Desfazer</button>' : ''}`;
    t.classList.toggle('erro', Boolean(erro)); t.classList.add('on');
    if(desfazer) $('button', t).onclick = () => { t.classList.remove('on'); desfazer(); };
    clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), desfazer ? 7000 : 3500);
  }

  function baixaCSV(lista){
    const L = lista || listaLeads(), cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const cab = ['data','nome','email','whatsapp','empresa','setor','estado','regime','faturamento_mes','identificado','recuperacao','beneficios','economia_ano','divida',
      'etapa','teste','anotacoes','utm_source','utm_campaign','utm_content'];
    const linhas = L.map(e => [quandoAno(e.ts), e.lead.nome, e.lead.email, e.lead.telefone, e.perfil.nome, SETORES[e.perfil.setor] || e.perfil.setor, e.perfil.estado,
      REGIMES[e.perfil.regime] || e.perfil.regime, e.perfil.faturamento, Math.round(e.res.total), Math.round(e.res.recuperacao), Math.round(e.res.beneficios),
      Math.round(e.res.economia), +e.perfil.divida ? 'sim' : 'não', e.excluido ? 'lixeira' : ETAPAS[e.status] || '', ehTeste(e) ? 'sim' : 'não',
      (e.notas || []).map(n => `[${quandoAno(n.em)} ${n.por}] ${n.texto}`).join(' | '),
      (e.utm || {}).source, (e.utm || {}).campaign, (e.utm || {}).content].map(cel).join(';'));
    const blob = new Blob(['﻿' + [cab.join(';'), ...linhas].join('\n')], {type: 'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'raiox-tributario-leads-' + hojeBR() + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- dados ----------
  async function carrega(){
    try {
      const r = await fetch(API + '/envios', {credentials: 'same-origin', cache: 'no-store'});
      if(r.status === 401){ entra(null); return; }
      const j = await r.json();
      if(j.papel !== papel){ entra(null); return; } // papel mudou (admin tirou o acesso): pede login de novo
      TODOS = (j.envios || []).filter(e => e && e.res);
      $('#atualizado').textContent = new Date().toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
      desenha();
    } catch(e) { $('#atualizado').textContent = 'sem conexão'; }
  }
  let relogio;
  // u = {nome, papel} logado, ou null para mostrar o login. As abas de admin só aparecem para admin;
  // a API confere de novo (leitor não recebe nome, e-mail nem telefone).
  function entra(u){
    papel = u ? u.papel : null;
    $('#app').classList.toggle('esc', !u); $('#telaLogin').classList.toggle('esc', Boolean(u));
    $$('.so-admin').forEach(x => x.classList.toggle('esc', papel !== 'admin'));
    $('#quem').innerHTML = u ? `<b>${esc(u.nome)}</b> · ${papel === 'admin' ? 'admin' : 'leitor'}` : '';
    clearInterval(relogio);
    if(u){ mostraAba('painel'); TODOS = []; carrega(); relogio = setInterval(carrega, 30000); } else { TODOS = []; $('#lUsuario').focus(); }
  }
  $('#fLogin').addEventListener('submit', async ev => {
    ev.preventDefault(); $('#lErro').textContent = '';
    try {
      const r = await fetch(API + '/login', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin',
        body: JSON.stringify({usuario: $('#lUsuario').value, senha: $('#lSenha').value})});
      const j = await r.json().catch(() => ({}));
      if(!j.ok){ $('#lErro').textContent = j.erro || 'Não deu certo.'; return; }
      $('#lSenha').value = ''; entra(j.usuario);
    } catch { $('#lErro').textContent = 'Sem conexão com o servidor.'; }
  });
  $('#sair').onclick = () => { fetch(API + '/login', {method: 'DELETE', credentials: 'same-origin'}).catch(() => {}); entra(null); };

  // ---------- interações ----------
  const ABAS = {painel: '#abaPainel', leads: '#abaLeads', metricas: '#abaMetricas', usuarios: '#abaUsuarios'};
  function mostraAba(nome){
    if(nome !== 'painel' && papel !== 'admin') nome = 'painel';
    $$('.aba').forEach(x => x.classList.toggle('on', x.dataset.aba === nome));
    Object.entries(ABAS).forEach(([k, sel]) => $(sel).classList.toggle('esc', k !== nome));
    if(nome === 'usuarios') usuarios();
    if(nome === 'metricas' && TODOS.length) desenha(); // a grade dos gráficos precisa estar visível para medir a largura
    scrollTo(0, 0);
  }
  $$('.aba').forEach(b => b.onclick = () => mostraAba(b.dataset.aba));
  $$('.periodo button').forEach(b => b.onclick = () => { periodo = b.dataset.p; $$('.periodo button').forEach(x => x.classList.toggle('on', x.dataset.p === periodo)); desenha(); });
  $$('.semTeste').forEach(c => c.onchange = () => { semTeste = c.checked; $$('.semTeste').forEach(x => x.checked = semTeste); desenha(); });
  $('#busca').oninput = () => { limite = 100; tabela(); };
  $('#csv').onclick = () => baixaCSV();
  $('#ordem').onchange = () => { ordem = $('#ordem').value; tabela(); };
  $('#soQualif').onchange = () => { soQualif = $('#soQualif').checked; limite = 100; tabela(); };
  $('#soWhats').onchange = () => { soWhats = $('#soWhats').checked; limite = 100; tabela(); };
  let rz; addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => TODOS.length && desenha(), 150); });

  // abre direto se já tem sessão
  (async () => {
    try { const r = await fetch(API + '/login', {credentials: 'same-origin', cache: 'no-store'}); const j = await r.json().catch(() => ({})); entra(r.ok && j.usuario ? j.usuario : null); }
    catch { entra(null); }
  })();
})();
