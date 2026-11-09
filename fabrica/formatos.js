/* Os 18 formatos. Cada um tem:
   campos  -> textos editáveis (k, rótulo, máximo de caracteres, exemplo; dest = aceita *destaque*)
   slots   -> onde o vídeo entra (x, y, largura, altura, raio) no espaço 1080x1920
   base    -> o que fica atrás do vídeo     topo -> o que fica na frente
   prompt  -> prompt padrão (editável na aba Prompts). Variáveis {{...}} vêm da marca e do raio-x. */
(function () {
  const F = [];
  const def = f => F.push(f);
  const FULL = () => [{ x: 0, y: 0, w: 1080, h: 1920, r: 0 }];
  const claro = B => B.claro || '#ffffff';
  const escuro = B => B.escuro || '#0e0e10';
  const fundo = (c, cor) => { c.fillStyle = cor; c.fillRect(0, 0, 1080, 1920); };

  const P = (titulo, como, oque, extra) => `{{marca_bloco}}

{{criativo_bloco}}

FORMATO: ${titulo}
Como o anúncio funciona: ${como}

O que escrever:
${oque}

Fale com: {{publico}}. Tom de voz da marca: {{tom}}.${extra ? '\n' + extra : ''}

Regras:
- O texto precisa conversar com o que é dito no vídeo. Não invente fatos, números, depoimentos, prazos ou promessas que a marca não faz.
- Siga as políticas de anúncios da Meta: não afirme nem insinue características pessoais de quem lê (saúde, dívidas, peso, religião, origem, situação financeira; evite "você está endividado?"), não prometa ganho garantido ou resultado irreal, não use "antes e depois" de corpo.
- Português do Brasil natural, sem clichês de anúncio. Emoji só quando o campo pedir.
- Respeite as instruções da marca.
Chamada final da marca, quando couber: {{cta}}`;

  /* 1 ------------------------------------------------------------------ */
  def({
    id: 'caixinha', nome: 'Caixinha', encaixa: 'adaptar',
    desc: 'Caixinha de perguntas do Instagram por cima do vídeo em tela cheia; o vídeo é a resposta.',
    campos: [
      { k: 'cabecalho', rotulo: 'Cabeçalho da caixinha', max: 30, ex: 'Faça uma pergunta' },
      { k: 'pergunta', rotulo: 'Pergunta', max: 90, dest: true, ex: 'Vale mesmo a pena *começar agora* ou é melhor esperar?' }
    ],
    slots: FULL,
    topo: (c, B, T) => { R.pergunta(c, B, 150, 330, 780, T.cabecalho, T.pergunta, { avatar: B.mostrarLogo }); },
    prompt: P('CAIXINHA DE PERGUNTAS (stories do Instagram)',
      'o vídeo roda em tela cheia e por cima aparece a caixinha de perguntas, como se um seguidor tivesse perguntado. O vídeo é a resposta.',
      '- "cabecalho": o topo da caixinha. Normalmente "Faça uma pergunta" ou variação curta.\n- "pergunta": pergunta curta, forte ou polêmica, escrita como um seguidor real escreveria (informal, primeira pessoa). Tem que ser respondida pelo que é falado no vídeo.')
  });

  /* 2 ------------------------------------------------------------------ */
  def({
    id: 'choquei', nome: 'Choquei', encaixa: 'encaixa',
    desc: 'Post de página de fofoca: perfil no topo, manchete apelativa e o vídeo como mídia do post, com o selo da marca.',
    campos: [{ k: 'manchete', rotulo: 'Manchete', max: 140, dest: true, ex: 'Ninguém esperava por isso: *VEJA O QUE ELE FALOU AO VIVO*' }],
    base: (c, B, T) => {
      fundo(c, claro(B)); const on = R.on(claro(B));
      R.avatar(c, 115, 300, 54, B);
      R.nome(c, B.nome, 192, B.mostrarArroba ? 282 : 300, 38, on, B.fX, B.verificado);
      if (B.mostrarArroba) R.text(c, B.arroba, { x: 192, y: 302, w: 760, h: 44, size: 30, font: B.fX, weight: 400, color: '#777', valign: 'middle' });
      R.text(c, T.manchete, { x: 60, y: 390, w: 960, h: 320, size: 46, min: 28, font: B.fX, weight: 500, hiWeight: 800, color: on, hi: on, lh: 1.25, valign: 'bottom' });
    },
    slots: () => [{ x: 60, y: 740, w: 960, h: 900, r: 0 }],
    topo: (c, B) => { if (B.mostrarLogo) R.avatar(c, 540, 1640, 78, B, { ring: '#fff', ringW: 8 }); },
    prompt: P('CHOQUEI (post de página de fofoca)',
      'imita um post de página de fofoca/entretenimento: nome da página no topo, legenda apelativa e o vídeo como a mídia do post.',
      '- "manchete": legenda de página de fofoca. Comece com uma frase de contexto em tom normal e termine com a parte bombástica em CAIXA ALTA entre *asteriscos* (ex.: Olha isso: *VEJA O QUE ELE FALOU SOBRE ...*). Curiosidade alta, sem entregar o final.')
  });

  /* 3 ------------------------------------------------------------------ */
  def({
    id: 'meme', nome: 'Meme', encaixa: 'adaptar',
    desc: 'Fundo preto, texto de POV/meme no topo, vídeo no meio e chamada embaixo.',
    campos: [
      { k: 'pov', rotulo: 'Texto do meme (POV)', max: 100, dest: true, ex: 'POV: você finalmente entendeu como funciona *de verdade*' },
      { k: 'cta', rotulo: 'Chamada', max: 40, ex: 'Toque no botão e use ↓' }
    ],
    base: (c, B, T) => {
      fundo(c, escuro(B)); const on = R.on(escuro(B));
      R.text(c, T.pov, { x: 70, y: 290, w: 940, h: 340, size: 56, min: 34, font: B.fX, weight: 800, color: on, hi: R.hiOn(escuro(B), B), align: 'center', valign: 'bottom' });
      R.text(c, T.cta, { x: 70, y: 1500, w: 940, h: 120, size: 42, min: 28, font: B.fX, weight: 500, color: on, align: 'center', valign: 'middle' });
    },
    slots: () => [{ x: 0, y: 660, w: 1080, h: 800, r: 0 }],
    prompt: P('MEME / POV',
      'fundo preto com um texto de meme em cima do vídeo, como um post de humor. O vídeo vira a "reação" ou a cena do meme.',
      '- "pov": frase de meme começando com "POV:" ou "Quando...", engraçada e identificável para o público, ligada ao assunto do vídeo.\n- "cta": chamada curta com seta para o botão (ex.: "Toque no botão e use ↓").')
  });

  /* 4 ------------------------------------------------------------------ */
  def({
    id: 'cinema', nome: 'Cinema', encaixa: 'adaptar',
    desc: 'Fundo preto com o vídeo em faixa larga (letterbox), título e subtítulo em cima.',
    campos: [
      { k: 'titulo', rotulo: 'Título', max: 40, dest: true, ex: 'Você precisa *ver isso*' },
      { k: 'subtitulo', rotulo: 'Subtítulo', max: 50, ex: 'Assista até o final' }
    ],
    base: (c, B, T) => {
      fundo(c, escuro(B)); const on = R.on(escuro(B));
      R.text(c, T.titulo, { x: 60, y: 470, w: 960, h: 140, size: 62, min: 36, font: B.fX, weight: 800, color: on, hi: R.hiOn(escuro(B), B), align: 'center', valign: 'bottom' });
      R.text(c, T.subtitulo, { x: 60, y: 618, w: 960, h: 110, size: 44, min: 28, font: B.fX, weight: 400, color: on, align: 'center', valign: 'top' });
    },
    slots: () => [{ x: 40, y: 760, w: 1000, h: 600, r: 28 }],
    prompt: P('CINEMA',
      'tela preta com o vídeo numa faixa larga, como um trailer. Pouco texto, muito impacto.',
      '- "titulo": pergunta ou frase curta de impacto (máx. 6 palavras).\n- "subtitulo": complemento curto que convida a ver o vídeo.')
  });

  /* 5 ------------------------------------------------------------------ */
  def({
    id: 'noticia', nome: 'Notícia', encaixa: 'adaptar',
    desc: 'Matéria de portal: tarja de editoria na cor da marca, chapéu, manchete, linha fina e o vídeo como mídia da matéria.',
    campos: [
      { k: 'categoria', rotulo: 'Editoria (tarja)', max: 24, ex: 'NEGÓCIOS' },
      { k: 'chapeu', rotulo: 'Chapéu', max: 30, ex: 'Especialista revela:' },
      { k: 'manchete', rotulo: 'Manchete', max: 140, dest: true, ex: 'método simples chama a atenção de quem quer resultado sem complicação' },
      { k: 'linhaFina', rotulo: 'Linha fina', max: 140, ex: 'No vídeo, o especialista explica o passo a passo e responde às dúvidas mais comuns.' },
      { k: 'cta', rotulo: 'Chamada', max: 90, ex: 'Clique no botão para ver a matéria completa' }
    ],
    base: (c, B, T) => {
      fundo(c, claro(B)); const on = R.on(claro(B));
      c.fillStyle = B.primaria; c.fillRect(0, 0, 1080, 250);
      R.text(c, T.categoria, { x: 60, y: 60, w: 960, h: 190, size: 58, min: 30, font: B.fX, weight: 800, color: R.on(B.primaria), align: 'center', valign: 'middle', upper: true, maxLines: 1 });
      const oA = { x: 70, w: 940, size: 56, min: 34, font: B.fX, weight: 800, color: R.hiOn(claro(B), B), maxLines: 1, lh: 1.1 };
      const oB = { x: 70, w: 940, size: 54, min: 30, font: B.fX, weight: 800, color: on, hi: R.hiOn(claro(B), B), lh: 1.1 };
      const oC = { x: 70, w: 940, size: 30, min: 22, font: B.fX, weight: 400, color: R.mix(on, claro(B), 0.35), lh: 1.3 };
      /* mede o bloco inteiro e encosta ele no vídeo */
      const hA = R.text(c, T.chapeu, { ...oA, y: 0, dry: true }).height;
      const hB = R.text(c, T.manchete, { ...oB, y: 0, h: 430, dry: true }).height;
      const hC = R.text(c, T.linhaFina, { ...oC, y: 0, h: 160, dry: true }).height;
      let y = Math.max(290, 975 - (hA + 2 + hB + 22 + hC));
      y = R.text(c, T.chapeu, { ...oA, y }).bottom + 2;
      y = R.text(c, T.manchete, { ...oB, y, h: Math.max(140, 975 - y - hC - 22) }).bottom + 22;
      R.text(c, T.linhaFina, { ...oC, y, h: Math.max(60, 985 - y) });
      R.text(c, T.cta, { x: 70, y: 1660, w: 940, h: 150, size: 36, min: 24, font: B.fX, weight: 800, color: on, align: 'center', valign: 'middle', upper: true });
    },
    slots: () => [{ x: 70, y: 1010, w: 940, h: 620, r: 24 }],
    prompt: P('NOTÍCIA (matéria de portal)',
      'imita uma matéria de portal de notícias. Tarja de editoria no topo, chapéu, manchete jornalística e o vídeo como a mídia da matéria. Funciona muito bem com público mais velho.',
      '- "categoria": editoria curta em caixa alta ligada ao nicho (ex.: MERCADO IMOBILIÁRIO, ECONOMIA, SAÚDE).\n- "chapeu": 2 a 4 palavras terminando com dois pontos (ex.: "Especialista revela:", "Prazo apertado:").\n- "manchete": manchete jornalística em terceira pessoa, informativa e com curiosidade, sem cara de anúncio.\n- "linhaFina": frase de apoio com um detalhe concreto do vídeo.\n- "cta": chamada em tom de matéria (ex.: "Clique no botão para ler a matéria completa").',
      'Escreva como jornalista, não como vendedor.')
  });

  /* 6 ------------------------------------------------------------------ */
  def({
    id: 'tela-dividida', nome: 'Tela dividida', encaixa: 'encaixa',
    desc: 'Vídeo em cima e embaixo com uma tarja reta na cor da marca no meio.',
    campos: [{ k: 'headline', rotulo: 'Headline da tarja', max: 60, ex: 'Presta atenção nisso' }],
    base: (c, B) => fundo(c, escuro(B)),
    slots: () => [{ x: 0, y: 0, w: 1080, h: 1000, r: 0 }, { x: 0, y: 1110, w: 1080, h: 810, r: 0 }],
    topo: (c, B, T) => {
      c.fillStyle = B.primaria; c.fillRect(0, 1000, 1080, 110);
      R.text(c, T.headline, { x: 40, y: 1000, w: 1000, h: 110, size: 52, min: 28, font: B.fX, weight: 800, color: R.on(B.primaria), align: 'center', valign: 'middle', upper: true, maxLines: 2 });
    },
    prompt: P('TELA DIVIDIDA',
      'o vídeo aparece em duas metades (em cima e embaixo) com uma tarja colorida no meio, como uma legenda gritada.',
      '- "headline": frase curta e urgente em caixa alta (máx. 8 palavras) que resume o gancho do vídeo.')
  });

  /* 7 ------------------------------------------------------------------ */
  def({
    id: 'tela-dividida-2', nome: 'Tela dividida 2', encaixa: 'encaixa',
    desc: 'Vídeo em duas metades com uma pincelada na cor da marca no meio.',
    campos: [{ k: 'headline', rotulo: 'Headline da pincelada', max: 50, ex: 'Ninguém te conta isso' }],
    base: (c, B) => fundo(c, escuro(B)),
    slots: () => [{ x: 0, y: 0, w: 1080, h: 960, r: 0 }, { x: 0, y: 960, w: 1080, h: 960, r: 0 }],
    topo: (c, B, T) => {
      c.save(); c.translate(540, 960); c.rotate(-0.025);
      R.brush(c, -480, -82, 960, 164, B.primaria);
      R.text(c, T.headline, { x: -420, y: -82, w: 840, h: 164, size: 56, min: 30, font: B.fX, weight: 800, color: R.on(B.primaria), align: 'center', valign: 'middle', upper: true, maxLines: 2 });
      c.restore();
    },
    prompt: P('TELA DIVIDIDA 2 (pincelada)',
      'o vídeo aparece em duas metades com uma pincelada colorida no meio, estilo story editado à mão.',
      '- "headline": frase curta e forte em caixa alta (máx. 7 palavras).')
  });

  /* 8 ------------------------------------------------------------------ */
  def({
    id: 'google-meet', nome: 'Google Meet', encaixa: 'adaptar',
    desc: 'Videochamada: tela principal com apresentação e o participante falando embaixo, com barra de controles.',
    campos: [
      { k: 'nome1', rotulo: 'Nome da tela principal', max: 30, ex: 'Apresentação' },
      { k: 'nome2', rotulo: 'Nome do participante', max: 30, ex: B => B.pessoa || 'Seu nome completo' }
    ],
    base: c => fundo(c, '#202124'),
    slots: () => [{ x: 30, y: 120, w: 1020, h: 900, r: 22 }, { x: 30, y: 1050, w: 1020, h: 600, r: 22 }],
    topo: (c, B, T) => {
      R.rotulo(c, T.nome1, 64, 955, B);
      R.box(c, 30, 1050, 1020, 600, 22, null, '#8ab4f8', 8);
      R.meetFala(c, 1000, 1100);
      R.rotulo(c, T.nome2, 64, 1585, B);
      R.meetBar(c, 1735);
    },
    prompt: P('GOOGLE MEET (videochamada)',
      'imita uma videochamada: a tela principal mostra o vídeo como se fosse uma apresentação e embaixo aparece o participante falando. Parece conteúdo vazado de uma reunião ou mentoria.',
      '- "nome1": nome da tela principal, como uma apresentação compartilhada (ex.: "Apresentação - Método X", "Reunião de resultados").\n- "nome2": nome da pessoa que fala. Use {{pessoa}} se fizer sentido.')
  });

  /* 9 ------------------------------------------------------------------ */
  def({
    id: 'meet-dialogo', nome: 'Meet diálogo', encaixa: 'adaptar',
    desc: 'Videochamada com duas pessoas em telas iguais, como uma conversa.',
    campos: [
      { k: 'nome1', rotulo: 'Nome de cima', max: 30, ex: B => B.pessoa || 'Seu nome' },
      { k: 'nome2', rotulo: 'Nome de baixo', max: 30, ex: 'Outro nome' }
    ],
    base: c => fundo(c, '#202124'),
    slots: () => [{ x: 30, y: 110, w: 1020, h: 770, r: 22 }, { x: 30, y: 900, w: 1020, h: 770, r: 22 }],
    topo: (c, B, T) => {
      R.box(c, 30, 110, 1020, 770, 22, null, '#8ab4f8', 8); R.meetFala(c, 1000, 160); R.rotulo(c, T.nome1, 64, 815, B);
      R.box(c, 30, 900, 1020, 770, 22, null, '#8ab4f8', 8); R.meetFala(c, 1000, 950); R.rotulo(c, T.nome2, 64, 1605, B);
      R.meetBar(c, 1760);
    },
    prompt: P('MEET DIÁLOGO (duas pessoas em videochamada)',
      'duas telas iguais de videochamada, como uma conversa entre especialista e cliente/aluno.',
      '- "nome1": nome de quem aparece em cima (use {{pessoa}} se for a pessoa da marca).\n- "nome2": nome de quem está do outro lado, plausível para o público (ex.: "Carla - cliente", "Dr. Paulo").')
  });

  /* 10 ----------------------------------------------------------------- */
  def({
    id: 'ranking', nome: 'Ranking', encaixa: 'adaptar',
    desc: 'Vídeo em tela cheia com título de ranking e lista top 5 com medalhas.',
    campos: [
      { k: 'rotulo', rotulo: 'Rótulo', max: 14, ex: 'Ranking' },
      { k: 'titulo', rotulo: 'Título', max: 30, dest: true, ex: 'Top 5 *erros*' },
      { k: 'item1', rotulo: 'Item 1', max: 28, ex: 'Começar sem plano' }, { k: 'item2', rotulo: 'Item 2', max: 28, ex: 'Copiar os outros' },
      { k: 'item3', rotulo: 'Item 3', max: 28, ex: 'Desistir cedo' }, { k: 'item4', rotulo: 'Item 4', max: 28, ex: 'Não medir nada' },
      { k: 'item5', rotulo: 'Item 5', max: 28, ex: 'Fazer tudo sozinho' }
    ],
    slots: FULL,
    topo: (c, B, T) => {
      const st = { font: B.fT, weight: 800, color: '#fff', stroke: '#000', align: 'center', valign: 'middle', upper: true };
      R.text(c, '🏆 ' + T.rotulo + ' 🏆', { ...st, x: 60, y: 400, w: 960, h: 100, size: 64, min: 40, strokeW: 12, maxLines: 1 });
      R.text(c, T.titulo, { ...st, x: 60, y: 500, w: 960, h: 170, size: 86, min: 48, strokeW: 14, hi: B.primaria, maxLines: 2 });
      const med = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      for (let i = 0; i < 5; i++) {
        const y = 960 + i * 112;
        c.save(); c.font = R.font(400, 56); c.textBaseline = 'middle'; c.fillText(med[i], 70, y + 52); c.restore();
        R.text(c, '- ' + T['item' + (i + 1)], { x: 150, y, w: 870, h: 104, size: 54, min: 30, font: B.fX, weight: 800, color: '#fff', stroke: '#000', strokeW: 12, valign: 'middle', maxLines: 1 });
      }
    },
    prompt: P('RANKING (top 5)',
      'o vídeo roda em tela cheia e por cima aparece um ranking top 5, como os vídeos de lista que viralizam.',
      '- "rotulo": palavra curta acima do título (normalmente "Ranking" ou "Top 5").\n- "titulo": tema do ranking ligado ao vídeo (ex.: "5 erros de quem compra imóvel").\n- "item1" a "item5": itens curtíssimos (2 a 4 palavras cada), do 1º ao 5º, tirados do que é falado no vídeo sempre que possível.')
  });

  /* 11 ----------------------------------------------------------------- */
  def({
    id: 'tweet', nome: 'Tweet', encaixa: 'adaptar',
    desc: 'Post de rede social escura: perfil, texto persuasivo e o vídeo anexado ao post.',
    campos: [{ k: 'tweet', rotulo: 'Texto do post', max: 220, dest: true, ex: 'Gravei esse vídeo para quem está começando e quer evitar *os erros mais caros*. Assiste até o fim.' }],
    base: (c, B, T) => {
      fundo(c, escuro(B)); const on = R.on(escuro(B));
      R.avatar(c, 118, 520, 50, B);
      const e = R.nome(c, B.pessoa || B.nome, 186, 520, 34, on, B.fX, B.verificado);
      if (B.mostrarArroba) R.text(c, `${B.arroba} · 1h`, { x: e + 12, y: 495, w: Math.max(40, 930 - e - 12), h: 50, size: 30, min: 20, font: B.fX, weight: 400, color: '#8b98a5', valign: 'middle', maxLines: 1 });
      c.save(); c.fillStyle = '#8b98a5'; [0, 1, 2].forEach(i => { c.beginPath(); c.arc(985 + i * 13, 520, 4, 0, 7); c.fill(); }); c.restore();
      R.text(c, T.tweet, { x: 70, y: 585, w: 940, h: 165, size: 40, min: 26, font: B.fX, weight: 400, color: on, hi: R.hiOn(escuro(B), B), hiWeight: 700, lh: 1.3 });
    },
    slots: () => [{ x: 70, y: 770, w: 940, h: 700, r: 28 }],
    prompt: P('TWEET (post de rede social)',
      'imita um post de texto (estilo X/Twitter) com o vídeo anexado. O texto do post é o que vende.',
      '- "tweet": copy curta e muito persuasiva em primeira pessoa, como um post real da pessoa/marca. Pode usar *destaque* em 1 a 3 palavras-chave. Sem hashtags.')
  });

  /* 12 ----------------------------------------------------------------- */
  def({
    id: 'oferta-direta', nome: 'Oferta direta', encaixa: 'adaptar',
    desc: 'Vídeo no topo esmaecendo no fundo, promessa gigante, preço de/por e chamada.',
    campos: [
      { k: 'promessa', rotulo: 'Promessa', max: 40, dest: true, ex: 'Comece *hoje*' },
      { k: 'precoDe', rotulo: 'Preço "de" (vazio = sem riscado)', max: 14, ex: '' },
      { k: 'rotuloPreco', rotulo: 'Rótulo do preço', max: 14, ex: 'Condição:' },
      { k: 'precoPor', rotulo: 'Preço "por" / condição', max: 12, ex: 'Especial' },
      { k: 'cta', rotulo: 'Chamada', max: 40, ex: 'Toque no botão e garanta ↓' }
    ],
    base: c => { c.fillStyle = '#000'; c.fillRect(0, 0, 1080, 1920); },
    slots: () => [{ x: 0, y: 140, w: 1080, h: 980, r: 0 }],
    topo: (c, B, T) => {
      const bg = escuro(B), on = R.on(bg);
      c.fillStyle = bg; c.fillRect(0, 0, 1080, 140); c.fillRect(0, 1120, 1080, 800);
      let g = c.createLinearGradient(0, 760, 0, 1121); g.addColorStop(0, R.alpha(bg, 0)); g.addColorStop(1, R.alpha(bg, 1));
      c.fillStyle = g; c.fillRect(0, 760, 1080, 361);
      g = c.createLinearGradient(0, 140, 0, 300); g.addColorStop(0, R.alpha(bg, 1)); g.addColorStop(1, R.alpha(bg, 0));
      c.fillStyle = g; c.fillRect(0, 139, 1080, 161);
      R.text(c, T.promessa, { x: 50, y: 1040, w: 980, h: 260, size: 120, min: 60, font: B.fT, weight: 800, color: on, hi: R.hiOn(bg, B), align: 'center', valign: 'middle', upper: true, lh: 0.98 });
      const x = 220, y = 1330, w = 640, hh = 150;
      R.box(c, x, y, w, hh, 20, 'rgba(255,255,255,0.05)', on, 3);
      const de = String(T.precoDe || '').trim();
      c.save(); c.textBaseline = 'middle';
      if (de) {
        c.font = R.font(700, 30, B.fX); c.fillStyle = '#ff4d4d'; c.fillText(de, x + 34, y + 48);
        const dw = c.measureText(de).width; c.fillRect(x + 30, y + 46, dw + 8, 4);
      }
      c.font = R.font(800, 30, B.fX); c.fillStyle = on; c.fillText(T.rotuloPreco || 'Por apenas:', x + 34, de ? y + 102 : y + hh / 2);
      c.restore();
      R.text(c, T.precoPor, { x: x + 250, y, w: w - 280, h: hh, size: 96, min: 40, font: B.fX, weight: 800, color: B.destaque, align: 'right', valign: 'middle', maxLines: 1 });
      R.text(c, T.cta, { x: 60, y: 1505, w: 960, h: 90, size: 40, min: 26, font: B.fX, weight: 700, color: on, align: 'center', valign: 'middle', maxLines: 1 });
    },
    prompt: P('OFERTA DIRETA',
      'o vídeo aparece no topo e se dissolve no fundo; embaixo vem a promessa gigante, o preço "de/por" e a chamada. É o formato mais direto de venda.',
      '- "promessa": a promessa mais forte da oferta em até 5 palavras, em caixa alta.\n- "precoDe": preço cheio que aparece riscado (ex.: "R$997"). Só use se a marca informou um preço "de" real; se não, deixe vazio ("").\n- "rotuloPreco": texto antes do preço, normalmente "Por apenas:". Sem preço, use algo como "Condição:" ou "Entrada:".\n- "precoPor": preço final com "R$" e sem espaço (ex.: "R$497" ou "R$1.497"), até 12 caracteres. Sem preço informado, use uma condição curtíssima e verdadeira da oferta (ex.: "Facilitada", "Grátis" só se for gratuito).\n- "cta": chamada curta com seta para o botão.',
      'Oferta da marca: {{oferta}}')
  });

  /* 13 ----------------------------------------------------------------- */
  def({
    id: 'story', nome: 'Story', encaixa: 'adaptar',
    desc: 'Story com o vídeo escurecido ao fundo, caixinha de pergunta, faixa de headline, texto complementar e bloco de copy.',
    campos: [
      { k: 'cabecalho', rotulo: 'Cabeçalho da caixinha', max: 30, ex: 'Faça uma pergunta' },
      { k: 'pergunta', rotulo: 'Pergunta', max: 90, ex: 'Vale mesmo a pena começar agora ou é melhor esperar?' },
      { k: 'headline', rotulo: 'Headline (faixa)', max: 40, ex: 'A resposta curta é: depende disso' },
      { k: 'complemento', rotulo: 'Texto complementar', max: 70, ex: 'Assista até o fim que eu explico o porquê' },
      { k: 'copy', rotulo: 'Copy longa', max: 220, ex: 'Muita gente trava nesse ponto e perde tempo. No vídeo eu mostro o caminho mais simples. Toque no botão para saber mais.' }
    ],
    slots: FULL,
    topo: (c, B, T) => {
      c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(0, 0, 1080, 1920);
      const yb = R.pergunta(c, B, 150, 270, 780, T.cabecalho, T.pergunta, { head: '#111111' });
      const m = R.text(c, T.headline, { x: 0, y: 0, w: 900, size: 48, min: 30, font: B.fX, weight: 800, dry: true, maxLines: 2 });
      const bw = Math.min(980, m.width + 64), bh = m.height + 30, by = Math.max(yb + 110, 700);
      R.box(c, 540 - bw / 2, by, bw, bh, 10, B.destaque);
      R.text(c, T.headline, { x: 540 - bw / 2 + 32, y: by, w: bw - 64, h: bh, size: 48, min: 30, font: B.fX, weight: 800, color: R.on(B.destaque), align: 'center', valign: 'middle', maxLines: 2 });
      const cm = R.text(c, T.complemento, { x: 90, y: by + bh + 24, w: 900, h: 110, size: 34, min: 24, font: B.fX, weight: 500, color: '#e8e8e8', align: 'center', valign: 'top' });
      const ty = Math.max(1150, cm.bottom + 60);
      const m2 = R.text(c, T.copy, { x: 0, y: 0, w: 780, size: 30, min: 22, font: B.fX, weight: 500, dry: true, lh: 1.35, maxLines: 8 });
      if (m2.height) {
        R.box(c, 130, ty, 820, m2.height + 56, 10, '#ffffff');
        R.text(c, T.copy, { x: 150, y: ty + 28, w: 780, size: 30, min: 22, font: B.fX, weight: 500, color: '#222', hi: R.hiOn('#ffffff', B), lh: 1.35, align: 'center', maxLines: 8 });
      }
    },
    prompt: P('STORY (montagem de stories)',
      'o vídeo fica escurecido ao fundo e por cima vêm várias camadas de texto, como um story bem editado: caixinha de pergunta, faixa colorida com headline, texto de apoio e um bloco branco com copy maior.',
      '- "cabecalho": topo da caixinha (normalmente "Faça uma pergunta").\n- "pergunta": dúvida real do público que o vídeo responde.\n- "headline": frase de impacto curta para a faixa colorida.\n- "complemento": uma linha que reforça a headline.\n- "copy": 2 a 3 frases que explicam a oferta e levam para a ação.')
  });

  /* 14 ----------------------------------------------------------------- */
  def({
    id: 'leia-legenda', nome: 'Leia a legenda', encaixa: 'adaptar',
    desc: 'Vídeo em tela cheia com headline de curiosidade no meio e "Leia a legenda 👇".',
    campos: [
      { k: 'headline', rotulo: 'Headline de curiosidade', max: 70, dest: true, ex: 'O detalhe que quase ninguém percebe *no começo*' },
      { k: 'cta', rotulo: 'Chamada', max: 30, ex: 'Leia a legenda 👇' }
    ],
    slots: FULL,
    topo: (c, B, T) => {
      R.text(c, T.headline, { x: 80, y: 470, w: 920, h: 440, size: 78, min: 42, font: B.fX, weight: 800, color: '#fff', hi: B.primaria, stroke: '#000', strokeW: 12, align: 'center', valign: 'middle', lh: 1.12 });
      R.text(c, T.cta, { x: 80, y: 1300, w: 920, h: 110, size: 52, min: 32, font: B.fX, weight: 800, color: '#fff', stroke: '#000', strokeW: 10, align: 'center', valign: 'middle', maxLines: 1 });
    },
    prompt: P('LEIA A LEGENDA',
      'o vídeo roda em tela cheia com uma headline de curiosidade no meio, mandando a pessoa ler a legenda do anúncio. A legenda é que fecha a venda.',
      '- "headline": frase que abre uma curiosidade forte sem responder (ex.: "O erro que faz você pagar aluguel por mais 10 anos").\n- "cta": chamada curta para a legenda com emoji apontando para baixo.')
  });

  /* 15 ----------------------------------------------------------------- */
  def({
    id: 'pov-depoimento', nome: 'POV + Depoimento', encaixa: 'encaixa',
    desc: 'Fundo claro, frase de POV em cima e o vídeo grande como depoimento.',
    campos: [
      { k: 'pov', rotulo: 'Frase de POV', max: 90, dest: true, ex: 'Pov: você parou de adiar e *começou do jeito certo*:' },
      { k: 'cta', rotulo: 'Chamada', max: 50, ex: 'Clique no botão para testar' }
    ],
    base: (c, B, T) => {
      fundo(c, claro(B)); const on = R.on(claro(B));
      R.text(c, T.pov, { x: 70, y: 220, w: 940, h: 210, size: 50, min: 30, font: B.fX, weight: 800, color: on, hi: R.hiOn(claro(B), B), align: 'center', valign: 'bottom', lh: 1.15 });
      R.text(c, T.cta, { x: 70, y: 1555, w: 940, h: 110, size: 34, min: 24, font: B.fX, weight: 800, color: on, align: 'center', valign: 'middle', upper: true });
    },
    slots: () => [{ x: 70, y: 450, w: 940, h: 1070, r: 12 }],
    prompt: P('POV + DEPOIMENTO',
      'fundo claro com uma frase de POV em cima e o vídeo grande embaixo, como se fosse o depoimento de quem viveu o resultado.',
      '- "pov": frase começando com "Pov:" descrevendo o resultado que o público quer, terminando com dois pontos.\n- "cta": chamada curta para o botão.')
  });

  /* 16 ----------------------------------------------------------------- */
  def({
    id: 'live', nome: 'Live', encaixa: 'encaixa',
    desc: 'Interface de live do Instagram por cima do vídeo: perfil, selo LIVE, espectadores e comentários.',
    campos: [
      { k: 'espectadores', rotulo: 'Espectadores', max: 8, ex: '892' },
      { k: 'comentario', rotulo: 'Texto do rodapé', max: 50, ex: 'Os comentários foram desativados' }
    ],
    slots: FULL,
    topo: (c, B, T) => {
      let g = c.createLinearGradient(0, 0, 0, 340); g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, 1080, 340);
      g = c.createLinearGradient(0, 1560, 0, 1920); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
      c.fillStyle = g; c.fillRect(0, 1560, 1080, 360);
      R.avatar(c, 92, 120, 42, B, { ring: 'grad', ringW: 6 });
      const handle = B.mostrarArroba && B.arroba ? B.arroba.replace(/^@/, '') : B.nome;
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 8;
      R.nome(c, handle, 156, 120, 32, '#fff', B.fX, B.verificado); c.restore();
      const lg = c.createLinearGradient(700, 0, 812, 0); lg.addColorStop(0, B.secundaria); lg.addColorStop(1, B.primaria);
      R.box(c, 700, 94, 112, 52, 10, lg);
      R.text(c, 'LIVE', { x: 700, y: 94, w: 112, h: 52, size: 28, font: B.fX, weight: 800, color: '#fff', align: 'center', valign: 'middle' });
      R.box(c, 822, 94, 150, 52, 10, 'rgba(0,0,0,0.4)');
      R.text(c, '👁 ' + T.espectadores, { x: 830, y: 94, w: 134, h: 52, size: 28, min: 18, font: B.fX, weight: 600, color: '#fff', align: 'center', valign: 'middle', maxLines: 1 });
      c.save(); c.strokeStyle = '#fff'; c.lineWidth = 6; c.lineCap = 'round';
      c.beginPath(); c.moveTo(1010, 102); c.lineTo(1046, 138); c.moveTo(1046, 102); c.lineTo(1010, 138); c.stroke(); c.restore();
      R.heart(c, 1000, 1700, 64, '#fff', 6);
      R.text(c, T.comentario, { x: 60, y: 1790, w: 960, h: 70, size: 30, min: 20, font: B.fX, weight: 400, color: 'rgba(255,255,255,0.8)', align: 'center', valign: 'middle', maxLines: 1 });
    },
    prompt: P('LIVE (transmissão ao vivo do Instagram)',
      'o vídeo vira uma live: perfil da marca no topo, selo LIVE e número de espectadores. Quase não tem texto; a força está em parecer ao vivo.',
      '- "espectadores": número de pessoas assistindo, realista para o tamanho da marca (ex.: "892", "1,2 mil").\n- "comentario": texto do rodapé da live (ex.: "Os comentários foram desativados" ou um comentário curto de um espectador).')
  });

  /* 17 ----------------------------------------------------------------- */
  def({
    id: 'fofoca-1', nome: 'Fofoca 1', encaixa: 'encaixa',
    desc: 'Fundo claro, manchete de fofoca em caixa alta e o vídeo ocupando o resto, com o selo da marca.',
    campos: [{ k: 'manchete', rotulo: 'Manchete', max: 120, dest: true, ex: 'Veja o que ele revelou sobre *o que ninguém conta* nesse mercado!' }],
    base: (c, B, T) => {
      fundo(c, claro(B));
      R.text(c, T.manchete, { x: 90, y: 290, w: 900, h: 235, size: 42, min: 26, font: B.fX, weight: 800, color: R.on(claro(B)), hi: R.hiOn(claro(B), B), align: 'center', valign: 'bottom', upper: true, lh: 1.2 });
    },
    slots: () => [{ x: 0, y: 545, w: 1080, h: 1375, r: 0 }],
    topo: (c, B) => { if (B.mostrarLogo) R.avatar(c, 540, 1350, 85, B, { ring: '#fff', ringW: 8 }); },
    prompt: P('FOFOCA 1',
      'manchete de fofoca em caixa alta sobre fundo claro, com o vídeo logo abaixo como a "prova". Tom de quem está contando um babado.',
      '- "manchete": manchete de fofoca em terceira pessoa ("VEJA O QUE ELE AVISOU...", "ELA REVELOU..."), com curiosidade alta e sem entregar o final.')
  });

  /* 18 ----------------------------------------------------------------- */
  def({
    id: 'fofoca-2', nome: 'Fofoca 2', encaixa: 'encaixa',
    desc: 'Bordas com retícula na cor secundária, faixa de manchete e selo estourado de FOFOCA!',
    campos: [
      { k: 'manchete', rotulo: 'Manchete', max: 110, ex: 'Ele contou tudo e a internet não para de comentar' },
      { k: 'selo', rotulo: 'Selo', max: 12, ex: 'Fofoca!' }
    ],
    base: (c, B, T) => {
      fundo(c, claro(B));
      R.halftone(c, 0, 0, 1080, 440, B.secundaria, 'down');
      R.halftone(c, 0, 1460, 1080, 460, B.secundaria, 'up');
      R.text(c, T.manchete, { x: 70, y: 440, w: 940, h: 120, size: 32, min: 20, font: B.fX, weight: 800, color: R.on(claro(B)), align: 'center', valign: 'middle', upper: true, maxLines: 3 });
    },
    slots: () => [{ x: 0, y: 560, w: 1080, h: 900, r: 0 }],
    topo: (c, B, T) => {
      R.star(c, 540, 1460, 120, 14, B.primaria, '#fff');
      c.save(); c.translate(540, 1460); c.rotate(-0.1);
      R.text(c, T.selo, { x: -95, y: -50, w: 190, h: 100, size: 44, min: 22, font: B.fT, weight: 900, color: R.on(B.primaria), align: 'center', valign: 'middle', upper: true, maxLines: 1 });
      c.restore();
    },
    prompt: P('FOFOCA 2 (revista de fofoca)',
      'visual de revista de fofoca: bordas com retícula colorida, faixa com a manchete e um selo estourado escrito FOFOCA!',
      '- "manchete": manchete de fofoca curta em caixa alta, chamativa, ligada ao vídeo.\n- "selo": palavra do selo estourado (ex.: "FOFOCA!", "BOMBA!", "EXCLUSIVO!").')
  });

  window.FORMATOS = F;
  window.FMT = Object.fromEntries(F.map(f => [f.id, f]));

  window.RAIOX_PADRAO = `Você é um estrategista de tráfego pago especialista em criativos de vídeo para Instagram, Facebook e TikTok.
Assista ao criativo com atenção e faça um RAIO-X dele para adaptá-lo a vários formatos de anúncio.

{{marca_bloco}}

Analise:
- tudo o que é falado (transcreva a fala inteira);
- o gancho dos primeiros segundos, a promessa, as dores tocadas e o público que o vídeo atinge;
- o tipo de vídeo (pessoa falando para a câmera, experimento social, tela gravada, b-roll, depoimento...) e o tom;
- onde está o rosto principal no quadro (para enquadrar o vídeo nos formatos).

FORMATOS DISPONÍVEIS:
{{formatos}}

Para cada formato diga se o vídeo "encaixa" (funciona do jeito que está, só com a moldura e textos) ou se precisa "adaptar" (o enquadramento fica estranho, o tom não combina ou o texto precisa carregar muito a mensagem). Explique o motivo em uma frase curta.`;
})();
