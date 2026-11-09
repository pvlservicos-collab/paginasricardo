/* Motor de desenho dos formatos. Tudo é desenhado num espaço de 1080x1920. */
(function () {
  const R = { W: 1080, H: 1920 };
  const EMOJI = /\p{Extended_Pictographic}/u;

  R.stack = f => `"${f}", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif`;
  R.font = (w, s, f) => `${w} ${Math.round(s)}px ${R.stack(f || 'Inter')}`;

  R.rr = (c, x, y, w, h, r) => { c.beginPath(); if (!r) c.rect(x, y, w, h); else c.roundRect(x, y, w, h, r); };
  R.box = (c, x, y, w, h, r, fill, stroke, lw) => {
    R.rr(c, x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.lineWidth = lw || 2; c.strokeStyle = stroke; c.stroke(); }
  };

  /* ---------- cores ---------- */
  R.rgb = hex => {
    hex = String(hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const n = parseInt(hex.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  R.lum = hex => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const c = R.rgb(hex); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  R.ratio = (a, b) => { const x = R.lum(a), y = R.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  R.on = hex => (R.lum(hex) > 0.42 ? '#111111' : '#ffffff');
  R.alpha = (hex, a) => { const c = R.rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  R.mix = (a, b, t) => {
    const x = R.rgb(a), y = R.rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  };
  /* cor de destaque legível sobre um fundo */
  R.hiOn = (bg, B) => {
    for (const c of [B.primaria, B.destaque, B.secundaria]) if (c && R.ratio(c, bg) >= 3) return c;
    return R.on(bg);
  };

  /* ---------- texto ---------- */
  function tokens(str) {
    const out = [];
    String(str ?? '').split('\n').forEach((para, pi) => {
      if (pi > 0) out.push({ br: true });
      let hi = false;
      para.split('*').forEach((part, i) => {
        if (i > 0) hi = !hi;
        part.split(/(\s+)/).forEach(w => {
          if (!w) return;
          if (/^\s+$/.test(w)) out.push({ sp: true });
          else out.push({ t: w, hi });
        });
      });
    });
    return out;
  }

  function layout(c, toks, o, size) {
    const fnt = hi => R.font(hi && o.hiWeight ? o.hiWeight : (o.weight || 700), size, o.font);
    c.font = fnt(false);
    const spaceW = c.measureText(' ').width;
    const lines = []; let cur = { items: [], w: 0 }; let sp = false;
    for (const tk of toks) {
      if (tk.br) { lines.push(cur); cur = { items: [], w: 0 }; sp = false; continue; }
      if (tk.sp) { sp = cur.items.length > 0; continue; }
      const t = o.upper ? tk.t.toLocaleUpperCase('pt-BR') : tk.t;
      c.font = fnt(tk.hi);
      const ww = c.measureText(t).width;
      const gap = sp ? spaceW : 0;
      if (cur.items.length && cur.w + gap + ww > o.w) {
        lines.push(cur); cur = { items: [{ t, hi: tk.hi, x: 0, w: ww }], w: ww };
      } else {
        const x = cur.w + gap; cur.items.push({ t, hi: tk.hi, x, w: ww }); cur.w = x + ww;
      }
      sp = false;
    }
    lines.push(cur);
    return lines;
  }

  /* Desenha texto com quebra automática, encolhe até caber em w x h.
     *palavras* entre asteriscos ganham a cor o.hi (e o peso o.hiWeight). */
  /* ---------- textos arrastáveis ----------
     Enquanto um formato é desenhado dentro de R.comCampos, cada texto que é o valor de um campo pode ganhar um
     deslocamento (arrastado com o mouse no editor) e tem a sua área registrada para o clique. */
  R.ctx = null;
  R.comCampos = (mapa, desl, fn) => {
    const antes = R.ctx; R.ctx = { mapa, desl: desl || {}, caixas: [], dentro: null };
    try { fn(); return R.ctx.caixas; } finally { R.ctx = antes; }
  };
  const campoDe = str => (R.ctx && typeof str === 'string' && str.trim() ? R.ctx.mapa.get(str) : null);
  const registrar = (c, k, x, y, w, h) => {
    if (!R.ctx || !k) return;
    const m = c.getTransform(), p = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([a, b]) => [m.a * a + m.c * b + m.e, m.b * a + m.d * b + m.f]);
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]);
    R.ctx.caixas.push({ k, x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  };
  const textoBase = (c, str, o) => R._text(c, str, o);
  R.text = (c, str, o) => {
    const k = R.ctx && !R.ctx.dentro && !o.dry ? campoDe(str) : null;
    const d = k && R.ctx.desl[k];
    if (!k) return textoBase(c, str, o);
    c.save(); if (d) c.translate(d.dx || 0, d.dy || 0);
    const r = textoBase(c, str, o);
    if (r.lines) {
      const w = o.w, x = o.align === 'center' ? o.x + (o.w - r.width) / 2 : o.align === 'right' ? o.x + o.w - r.width : o.x;
      registrar(c, k, Math.min(x, o.x + w) - 6, r.y - 6, r.width + 12, r.height + 12);
    }
    c.restore();
    return d ? { ...r, y: r.y + (d.dy || 0), bottom: r.bottom + (d.dy || 0) } : r;
  };
  R._text = (c, str, o) => {
    if (!String(str ?? '').trim()) return { height: 0, size: o.size, y: o.y, bottom: o.y, lines: 0, width: 0 };
    const toks = tokens(str); const lh = o.lh || 1.18; const min = o.min || Math.round(o.size * 0.5);
    let size = o.size, lines;
    for (;;) {
      lines = layout(c, toks, o, size);
      const tall = o.h && lines.length * size * lh > o.h;
      const wide = lines.some(l => l.w > o.w + 1);
      const many = o.maxLines && lines.length > o.maxLines;
      if ((!tall && !wide && !many) || size <= min) break;
      size = Math.max(min, size - 2);
    }
    const lineH = size * lh, total = lines.length * lineH;
    let y0 = o.y;
    if (o.h && o.valign === 'middle') y0 = o.y + (o.h - total) / 2;
    else if (o.h && o.valign === 'bottom') y0 = o.y + o.h - total;
    if (!o.dry) {
      c.save(); c.textBaseline = 'middle'; c.textAlign = 'left';
      if (o.shadow) { c.shadowColor = o.shadow; c.shadowBlur = o.shadowBlur || 14; }
      lines.forEach((l, i) => {
        let x = o.x;
        if (o.align === 'center') x = o.x + (o.w - l.w) / 2;
        else if (o.align === 'right') x = o.x + o.w - l.w;
        const cy = y0 + i * lineH + lineH / 2 + size * 0.04;
        for (const it of l.items) {
          c.font = R.font(it.hi && o.hiWeight ? o.hiWeight : (o.weight || 700), size, o.font);
          if (o.stroke && !EMOJI.test(it.t)) {
            c.lineJoin = 'round'; c.lineWidth = o.strokeW || size * 0.16; c.strokeStyle = o.stroke;
            c.strokeText(it.t, x + it.x, cy);
          }
          c.fillStyle = it.hi && o.hi ? o.hi : (o.color || '#fff');
          c.fillText(it.t, x + it.x, cy);
        }
      });
      c.restore();
    }
    return { size, height: total, y: y0, bottom: y0 + total, lines: lines.length, width: Math.max(...lines.map(l => l.w)) };
  };

  /* ---------- peças de interface ---------- */
  R.verif = (c, x, cy, s, color) => {
    c.save(); c.fillStyle = color || '#1d9bf0'; c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 2 * i / 16, r = i % 2 ? s * 0.44 : s * 0.5;
      c.lineTo(x + s / 2 + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = s * 0.11; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x + s * 0.3, cy + s * 0.02); c.lineTo(x + s * 0.45, cy + s * 0.16); c.lineTo(x + s * 0.72, cy - s * 0.14); c.stroke();
    c.restore();
  };

  R.nome = (c, txt, x, cy, size, color, font, verif) => {
    c.save(); c.font = R.font(700, size, font); c.fillStyle = color; c.textBaseline = 'middle';
    c.fillText(txt, x, cy); let e = x + c.measureText(txt).width; c.restore();
    if (verif) { R.verif(c, e + 10, cy, size * 0.9); e += 10 + size * 0.9; }
    return e;
  };

  R.avatar = (c, cx, cy, r, B, o = {}) => {
    c.save();
    if (o.ring) {
      c.beginPath(); c.arc(cx, cy, r + (o.ringW || 6), 0, Math.PI * 2);
      if (o.ring === 'grad') {
        const g = c.createLinearGradient(cx - r, cy + r, cx + r, cy - r);
        g.addColorStop(0, B.secundaria); g.addColorStop(1, B.primaria); c.fillStyle = g;
      } else c.fillStyle = o.ring;
      c.fill();
      if (o.ring === 'grad') { c.beginPath(); c.arc(cx, cy, r + 2, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); }
    }
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
    const img = B.logo;
    if (img && B.mostrarLogo) {
      const iw = img.naturalWidth || img.width || 300, ih = img.naturalHeight || img.height || 300;
      // "caber": a logo inteira dentro do círculo (bom para logos largas); "cobrir": preenche o círculo (foto)
      const caber = B.logoModo === 'caber';
      const s = (caber ? Math.min(2 * r * 0.78 / iw, 2 * r * 0.78 / ih) : Math.max(2 * r / iw, 2 * r / ih)) * (B.logoZoom || 1);
      const w = iw * s, h = ih * s;
      c.fillStyle = B.logoFundo || '#fff'; c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      c.drawImage(img, cx - w / 2 + (B.logoX || 0) * r, cy - h / 2 + (B.logoY || 0) * r, w, h);
    } else {
      c.fillStyle = B.primaria; c.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      c.fillStyle = R.on(B.primaria); c.font = R.font(800, r * 0.95, B.fT);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText((B.nome || '?').trim().charAt(0).toUpperCase(), cx, cy + r * 0.06);
    }
    c.restore();
  };

  R.heart = (c, cx, cy, s, color, lw) => {
    c.save(); c.strokeStyle = color; c.lineWidth = lw || 5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(cx, cy + s * 0.35);
    c.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.35, cy - s * 0.75, cx, cy - s * 0.3);
    c.bezierCurveTo(cx + s * 0.35, cy - s * 0.75, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
    c.stroke(); c.restore();
  };

  R.star = (c, cx, cy, r, n, color, stroke) => {
    c.save(); c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = Math.PI * i / n - Math.PI / 2, rr = i % 2 ? r * 0.8 : r;
      c.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    c.closePath(); c.fillStyle = color; c.fill();
    if (stroke) { c.lineWidth = 8; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); }
    c.restore();
  };

  R.halftone = (c, x, y, w, h, color, dir) => {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, R.mix(color, '#000000', 0.08)); g.addColorStop(1, R.mix(color, '#ffffff', 0.18));
    c.fillStyle = g; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,0.30)';
    const st = 30; let row = 0;
    for (let yy = y; yy < y + h + st; yy += st, row++) {
      const t = dir === 'up' ? 1 - (yy - y) / h : (yy - y) / h;
      const rad = 2 + 10 * Math.max(0, Math.min(1, t));
      for (let xx = x + (row % 2 ? st / 2 : 0); xx < x + w + st; xx += st) {
        c.beginPath(); c.arc(xx, yy, rad, 0, Math.PI * 2); c.fill();
      }
    }
    c.restore();
  };

  R.brush = (c, x, y, w, h, color) => {
    let s = 7; const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    c.save(); c.fillStyle = color; c.beginPath();
    const n = 36;
    c.moveTo(x, y + rnd() * h * 0.12);
    for (let i = 1; i <= n; i++) c.lineTo(x + w * i / n, y + (rnd() - 0.4) * h * 0.16);
    for (let i = 1; i <= 7; i++) c.lineTo(x + w + (rnd() - 0.2) * 34, y + h * i / 7);
    for (let i = n; i >= 0; i--) c.lineTo(x + w * i / n, y + h + (rnd() - 0.6) * h * 0.16);
    for (let i = 7; i >= 1; i--) c.lineTo(x - (rnd() - 0.2) * 34, y + h * i / 7);
    c.closePath(); c.fill();
    c.fillStyle = R.mix(color, '#000000', 0.22); c.globalAlpha = 0.35;
    for (let i = 0; i < 7; i++) c.fillRect(x + rnd() * w * 0.3, y + 8 + rnd() * (h - 16), w * (0.25 + rnd() * 0.55), 3 + rnd() * 4);
    c.restore();
  };

  /* caixinha de perguntas do Instagram; devolve o y final */
  /* a caixinha inteira (cabeçalho + pergunta) se move junto quando um dos dois textos é arrastado */
  R.pergunta = (c, B, x, y, w, cab, perg, o = {}) => {
    const k = campoDe(perg) || campoDe(cab), d = k && R.ctx.desl[k];
    if (!k) return caixinha(c, B, x, y, w, cab, perg, o);
    c.save(); if (d) c.translate(d.dx || 0, d.dy || 0);
    const antes = R.ctx.dentro; R.ctx.dentro = k;
    let fim;
    try { fim = caixinha(c, B, x, y, w, cab, perg, o); } finally { R.ctx.dentro = antes; }
    registrar(c, k, x, y - (o.avatar ? 60 : 0), w, fim - y + (o.avatar ? 60 : 0));
    c.restore();
    return fim + (d ? d.dy || 0 : 0);
  };
  const caixinha = (c, B, x, y, w, cab, perg, o = {}) => {
    const pad = 44, head = o.head || B.primaria, hh = o.avatar ? 140 : 110;
    const m = R.text(c, perg, { x: x + pad, y: 0, w: w - 2 * pad, size: 46, min: 28, font: B.fX, weight: 600, align: 'center', dry: true, maxLines: 5 });
    const bh = Math.max(150, m.height + 70);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = 34; c.shadowOffsetY = 10;
    R.box(c, x, y, w, hh + bh, 38, '#fff'); c.restore();
    c.save(); R.rr(c, x, y, w, hh + bh, 38); c.clip(); c.fillStyle = head; c.fillRect(x, y, w, hh); c.restore();
    const ty = o.avatar ? y + 40 : y;
    R.text(c, cab, { x: x + pad, y: ty, w: w - 2 * pad, h: hh - (ty - y), size: 38, min: 24, font: B.fX, weight: 600, color: R.on(head), align: 'center', valign: 'middle', maxLines: 1 });
    R.text(c, perg, { x: x + pad, y: y + hh, w: w - 2 * pad, h: bh, size: 46, min: 28, font: B.fX, weight: 600, color: '#262626', hi: R.hiOn('#ffffff', B), align: 'center', valign: 'middle', maxLines: 5 });
    if (o.avatar) R.avatar(c, x + w / 2, y, 54, B, { ring: '#fff', ringW: 7 });
    return y + hh + bh;
  };

  /* barra inferior estilo videochamada */
  R.meetBar = (c, y) => {
    const em = ['💖', '👍', '🎉', '👏', '😂', '😮', '😢', '🤔', '👎'];
    c.save();
    R.box(c, 130, y - 38, 820, 76, 38, '#2d2e31');
    c.font = R.font(400, 34); c.textAlign = 'center'; c.textBaseline = 'middle';
    em.forEach((e, i) => c.fillText(e, 180 + i * 90, y + 2));
    const by = y + 115;
    const xs = [170, 290, 410, 530, 650, 770];
    xs.forEach((x, i) => {
      c.beginPath(); c.arc(x, by, 44, 0, Math.PI * 2); c.fillStyle = i === 3 ? '#8ab4f8' : '#3c4043'; c.fill();
      c.fillStyle = i === 3 ? '#202124' : '#fff'; c.strokeStyle = c.fillStyle; c.lineWidth = 5; c.lineCap = 'round';
      if (i === 0) { R.rr(c, x - 10, by - 22, 20, 30, 10); c.fill(); c.beginPath(); c.arc(x, by, 18, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); c.beginPath(); c.moveTo(x, by + 18); c.lineTo(x, by + 26); c.stroke(); }
      if (i === 1) { R.rr(c, x - 24, by - 15, 32, 30, 6); c.fill(); c.beginPath(); c.moveTo(x + 10, by); c.lineTo(x + 24, by - 12); c.lineTo(x + 24, by + 12); c.closePath(); c.fill(); }
      if (i === 2) { c.beginPath(); c.arc(x, by, 20, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.arc(x - 7, by - 5, 3, 0, 7); c.arc(x + 7, by - 5, 3, 0, 7); c.fill(); c.beginPath(); c.arc(x, by + 2, 10, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
      if (i === 3) { R.rr(c, x - 22, by - 16, 44, 32, 5); c.stroke(); c.font = R.font(800, 16); c.fillText('CC', x, by + 1); }
      if (i === 4) { c.font = R.font(400, 36); c.fillText('✋', x, by + 2); }
      if (i === 5) { [-14, 0, 14].forEach(d => { c.beginPath(); c.arc(x, by + d, 4, 0, 7); c.fill(); }); }
    });
    R.box(c, 860, by - 44, 150, 88, 44, '#ea4335');
    c.save(); c.translate(935, by); c.rotate(Math.PI * 0.75);
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, 20, -Math.PI * 0.85, -Math.PI * 0.15); c.stroke(); c.restore();
    c.restore();
  };

  R.meetFala = (c, cx, cy) => {
    c.save(); c.beginPath(); c.arc(cx, cy, 26, 0, Math.PI * 2); c.fillStyle = '#1a73e8'; c.fill();
    c.fillStyle = '#fff'; [-9, 0, 9].forEach((d, i) => { const hh = i === 1 ? 22 : 12; R.rr(c, cx + d - 3, cy - hh / 2, 6, hh, 3); c.fill(); });
    c.restore();
  };

  R.rotulo = (c, txt, x, y, B) => R.text(c, txt, { x, y, w: 700, h: 50, size: 30, min: 22, font: B.fX, weight: 500, color: '#fff', shadow: 'rgba(0,0,0,0.8)', valign: 'middle', maxLines: 1 });

  /* ---------- vídeo nos espaços ---------- */
  R.placeholder = (c, x, y, w, h) => {
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#a8d6f4'); g.addColorStop(1, '#e9f6fe');
    c.fillStyle = g; c.fillRect(x, y, w, h);
    const s = Math.min(w, h) * 0.08, cx = x + w * 0.5, cy = y + h * 0.3;
    c.fillStyle = '#fff';
    [[0, -0.3, 1], [-1, 0.2, 0.75], [1, 0.25, 0.7], [-0.4, 0.35, 0.8], [0.5, 0.35, 0.8]].forEach(([dx, dy, k]) => { c.beginPath(); c.arc(cx + dx * s, cy + dy * s, s * k, 0, Math.PI * 2); c.fill(); });
    c.fillStyle = '#a5c93c'; c.beginPath(); c.moveTo(x, y + h * 0.7);
    c.bezierCurveTo(x + w * 0.3, y + h * 0.6, x + w * 0.6, y + h * 0.64, x + w, y + h * 0.66); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.fill();
    c.fillStyle = '#86ac2c'; c.beginPath(); c.moveTo(x, y + h * 0.86);
    c.bezierCurveTo(x + w * 0.4, y + h * 0.76, x + w * 0.7, y + h * 0.8, x + w, y + h * 0.74); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.fill();
    c.restore();
  };

  const clamp = v => Math.max(0, Math.min(1, v));
  /* enquadramento: zoom >= 1 e posição px/py (0..1). px/py nulos = automático pelo rosto */
  R.resolve = (vw, vh, sl, fr, face) => {
    fr = fr || {};
    const zoom = Math.max(1, +fr.zoom || 1);
    const k = Math.max(sl.w / vw, sl.h / vh) * zoom;
    const sw = Math.max(sl.w, Math.ceil(vw * k)), sh = Math.max(sl.h, Math.ceil(vh * k));
    let px = fr.px, py = fr.py;
    if (px == null) px = face && sw > sl.w ? clamp((face.x * sw - sl.w / 2) / (sw - sl.w)) : 0.5;
    if (py == null) py = face && sh > sl.h ? clamp((face.y * sh - sl.h * 0.42) / (sh - sl.h)) : 0.5;
    return { zoom, px: +px, py: +py, sw, sh, cx: Math.round((sw - sl.w) * px), cy: Math.round((sh - sl.h) * py) };
  };

  /* video = <video> da prévia ou um quadro (VideoSample) do motor de exportação (fabrica/video.js) */
  R.slot = (c, video, sl, fr, face) => {
    c.save(); R.rr(c, sl.x, sl.y, sl.w, sl.h, sl.r || 0); c.clip();
    const amostra = video && typeof video.draw === 'function' && video.displayWidth;
    if (amostra) {
      const vw = video.displayWidth, vh = video.displayHeight;
      const r = R.resolve(vw, vh, sl, fr, face);
      const kx = r.sw / vw, ky = r.sh / vh;
      video.draw(c, r.cx / kx, r.cy / ky, sl.w / kx, sl.h / ky, sl.x, sl.y, sl.w, sl.h);
    } else if (video && video.readyState >= 2 && video.videoWidth) {
      const vw = video.videoWidth, vh = video.videoHeight;
      const r = R.resolve(vw, vh, sl, fr, face);
      const kx = r.sw / vw, ky = r.sh / vh;
      c.drawImage(video, r.cx / kx, r.cy / ky, sl.w / kx, sl.h / ky, sl.x, sl.y, sl.w, sl.h);
    } else R.placeholder(c, sl.x, sl.y, sl.w, sl.h);
    c.restore();
  };
  /* camadas fixas de um formato (fundo e topo) em 1080x1920, para a exportação */
  /* valor de cada campo -> nome do campo (para achar o texto que foi arrastado) */
  R.mapaCampos = (f, T) => { const m = new Map(); f.campos.forEach(c => { const v = T[c.k]; if (typeof v === 'string' && v.trim() && !m.has(v)) m.set(v, c.k); }); return m; };
  R.fixas = (f, B, T, desl) => {
    const mk = () => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; return c; };
    const b = mk(), t = mk(); const bx = b.getContext('2d');
    bx.fillStyle = '#000'; bx.fillRect(0, 0, 1080, 1920);
    R.comCampos(R.mapaCampos(f, T), desl, () => {
      if (f.base) f.base(bx, B, T);
      if (f.topo) f.topo(t.getContext('2d'), B, T);
    });
    return { base: b, topo: t, slots: f.slots(B, T) };
  };

  /* camadas em resolução final para o servidor montar com o ffmpeg */
  R.camadas = (f, B, T, frames, face, vw, vh) => {
    const mk = () => { const c = document.createElement('canvas'); c.width = 1080; c.height = 1920; return c; };
    const b = mk(), t = mk(); const bx = b.getContext('2d');
    bx.fillStyle = '#000'; bx.fillRect(0, 0, 1080, 1920);
    if (f.base) f.base(bx, B, T);
    if (f.topo) f.topo(t.getContext('2d'), B, T);
    const slots = f.slots(B, T).map((s0, i) => {
      const s = { x: Math.round(s0.x), y: Math.round(s0.y), w: Math.round(s0.w), h: Math.round(s0.h), r: s0.r || 0 };
      const r = R.resolve(vw, vh, s, frames[i], face);
      let mask = null;
      if (s.r) {
        const m = document.createElement('canvas'); m.width = s.w; m.height = s.h; const mx = m.getContext('2d');
        mx.fillStyle = '#000'; mx.fillRect(0, 0, s.w, s.h); mx.fillStyle = '#fff'; R.rr(mx, 0, 0, s.w, s.h, s.r); mx.fill();
        mask = m.toDataURL('image/png');
      }
      return { x: s.x, y: s.y, w: s.w, h: s.h, zoom: r.zoom, px: r.px, py: r.py, mask };
    });
    return { base: b.toDataURL('image/png'), topo: t.toDataURL('image/png'), slots };
  };

  R.fontes = B => Promise.all([
    `400 40px "${B.fT}"`, `800 40px "${B.fT}"`, `400 40px "${B.fX}"`, `500 40px "${B.fX}"`,
    `600 40px "${B.fX}"`, `700 40px "${B.fX}"`, `800 40px "${B.fX}"`
  ].map(f => document.fonts.load(f).catch(() => null)));

  window.R = R;
})();
