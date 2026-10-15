// Imagens do site no Vercel Blob (wp-content/uploads/), usadas pelo painel e pelo conector do Claude:
// salvar, listar, descobrir as imagens de uma página (no app × domínio externo) e migrar as externas.
import dns from 'node:dns/promises';
import net from 'node:net';
import { put, list } from '@vercel/blob';
import { TOKEN_BLOB } from './store.mjs';

export const PASTA_IMAGENS = 'wp-content/uploads/';
export const HOST_BLOB = 'mgdpqhggmvokpsko.public.blob.vercel-storage.com';
export const TIPOS = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
const MAX_DOWNLOAD = 10 * 1024 * 1024;

// Tipo real pelo conteúdo (não confia no nome nem no cabeçalho). SVG não é aceito: pode conter script.
export function tipoReal(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(b.toString('ascii', 8, 12))) return 'avif';
  return null;
}

export const nomeLimpo = (n) => String(n || 'imagem').replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'imagem';

// Grava no Blob e devolve o caminho público no site (/wp-content/uploads/nome-xxxx.ext).
export async function salvarImagem(buf, nome) {
  if (!TOKEN_BLOB) throw Object.assign(new Error('Conecte um Vercel Blob ao projeto.'), { status: 503 });
  const ext = tipoReal(buf);
  if (!ext) throw Object.assign(new Error('Formato não aceito. Use JPG, PNG, WEBP, GIF ou AVIF.'), { status: 415 });
  const r = await put(`${PASTA_IMAGENS}${nomeLimpo(nome)}.${ext}`, buf, { access: 'public', addRandomSuffix: true, contentType: TIPOS[ext], cacheControlMaxAge: 31536000, token: TOKEN_BLOB });
  return { url: '/' + r.pathname, nome: r.pathname.slice(PASTA_IMAGENS.length), tamanho: buf.length };
}

export async function listarImagens() {
  const itens = [];
  let cursor;
  do {
    const r = await list({ prefix: PASTA_IMAGENS, cursor, limit: 1000, token: TOKEN_BLOB });
    itens.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return itens
    .map((b) => ({ nome: b.pathname.slice(PASTA_IMAGENS.length), url: '/' + b.pathname, tamanho: b.size, em: b.uploadedAt }))
    .filter((i) => i.nome && !i.nome.includes('/'))
    .sort((a, b) => new Date(b.em) - new Date(a.em));
}

/* ---------------- descobrir as imagens de uma página ---------------- */
const desfaz = (s) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const pareceImagem = (u) => /^data:image\//i.test(u) || /\.(png|jpe?g|webp|gif|avif|svg|ico)(\?|#|$)/i.test(u);
const attr = (tag, nome) => {
  const m = new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

// Devolve as referências de imagem do HTML: { bruto (como está no código), url (decodificada), onde }.
export function extrairImagens(html) {
  const h = String(html || '');
  const achadas = [];
  const add = (bruto, onde) => {
    if (!bruto) return;
    const b = bruto.trim();
    if (!b || /^(#|about:|javascript:)/i.test(b) || b.includes('${')) return;
    achadas.push({ bruto: b, url: desfaz(b), onde });
  };
  const srcset = (v, onde) => v && v.split(',').forEach((p) => add(p.trim().split(/\s+/)[0], onde));
  for (const m of h.matchAll(/<(img|source|video|input|image)\b[^>]*>/gi)) {
    const tag = m[0], nome = m[1].toLowerCase();
    if (nome === 'img' || (nome === 'input' && /type\s*=\s*["']?image/i.test(tag))) {
      add(attr(tag, 'src'), '<img>');
      for (const a of ['data-src', 'data-lazy-src', 'data-original']) add(attr(tag, a), '<img>');
      srcset(attr(tag, 'srcset'), '<img srcset>');
      srcset(attr(tag, 'data-srcset'), '<img srcset>');
    } else if (nome === 'source') {
      srcset(attr(tag, 'srcset'), '<picture>');
      const src = attr(tag, 'src');
      if (src && pareceImagem(src)) add(src, '<picture>');
    } else if (nome === 'video') {
      add(attr(tag, 'poster'), '<video poster>');
    } else if (nome === 'image') {
      add(attr(tag, 'href') || attr(tag, 'xlink:href'), '<svg image>');
    }
  }
  for (const m of h.matchAll(/<meta\b[^>]*>/gi)) {
    if (/(property|name)\s*=\s*["']?(og:image|twitter:image)/i.test(m[0])) add(attr(m[0], 'content'), 'og:image');
  }
  for (const m of h.matchAll(/<link\b[^>]*>/gi)) {
    if (/rel\s*=\s*["']?[^"'>]*icon/i.test(m[0])) add(attr(m[0], 'href'), 'ícone');
  }
  for (const m of h.matchAll(/url\(\s*(["']?)([^"')]+?)\1\s*\)/gi)) {
    if (pareceImagem(m[2])) add(m[2], 'CSS');
  }
  for (const m of h.matchAll(/\sdata-(?:bg|background|image)\s*=\s*["']([^"']+)["']/gi)) add(m[1], 'data-bg');
  return achadas;
}

// Classifica cada imagem: no app (Blob / este site), externa (com o domínio) ou embutida (data:).
export async function relatorioImagens(html, { hostsApp = [] } = {}) {
  const refs = extrairImagens(html);
  const app = new Set([HOST_BLOB, ...hostsApp.filter(Boolean).map((x) => x.toLowerCase())]);
  let noBlob = null;
  const unicas = new Map();
  for (const r of refs) if (!unicas.has(r.url)) unicas.set(r.url, { ...r, brutos: new Set([r.bruto]) }); else unicas.get(r.url).brutos.add(r.bruto);
  const itens = [];
  for (const r of unicas.values()) {
    const item = { url: r.url, onde: r.onde };
    if (/^data:/i.test(r.url)) { item.situacao = 'embutida'; item.url = r.url.slice(0, 40) + '…'; }
    else {
      let u = null;
      try { u = new URL(r.url, 'https://app.local'); } catch {}
      if (!u) { item.situacao = 'invalida'; }
      else if (u.hostname === 'app.local' || app.has(u.hostname.toLowerCase())) {
        const caminho = decodeURIComponent(u.pathname);
        item.url = caminho;
        if (caminho.startsWith('/' + PASTA_IMAGENS)) {
          if (!noBlob && TOKEN_BLOB) noBlob = new Set((await listarImagens()).map((i) => i.url));
          item.situacao = !noBlob || noBlob.has(caminho) ? 'no_app' : 'faltando_no_app';
        } else item.situacao = 'caminho_desconhecido';
      } else {
        item.situacao = /\.svg(\?|#|$)/i.test(u.pathname) ? 'externa_svg' : 'externa';
        item.dominio = u.hostname.toLowerCase();
      }
    }
    item.brutos = [...r.brutos];
    itens.push(item);
  }
  const externas = itens.filter((i) => i.situacao === 'externa' || i.situacao === 'externa_svg');
  const porDominio = {};
  externas.forEach((i) => { porDominio[i.dominio] = (porDominio[i.dominio] || 0) + 1; });
  return {
    total: itens.length,
    no_app: itens.filter((i) => i.situacao === 'no_app').length,
    externas: externas.length,
    dominios_externos: Object.entries(porDominio).map(([dominio, imagens]) => ({ dominio, imagens })),
    faltando_no_app: itens.filter((i) => i.situacao === 'faltando_no_app').map((i) => i.url),
    embutidas: itens.filter((i) => i.situacao === 'embutida').length,
    outras: itens.filter((i) => ['caminho_desconhecido', 'invalida'].includes(i.situacao)).map((i) => i.url),
    itens: itens.map(({ brutos, ...i }) => i),
    _itens: itens,
  };
}

/* ---------------- baixar com segurança (anti-SSRF) ---------------- */
function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:127.') || x.startsWith('::ffff:10.') || x.startsWith('::ffff:192.168.');
}

async function urlSegura(u) {
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  return ips.length > 0 && !ips.some(ipPrivado);
}

export async function baixarImagem(endereco) {
  let u;
  try { u = new URL(endereco); } catch { throw new Error('endereço inválido'); }
  for (let salto = 0; salto < 5; salto++) {
    if (!(await urlSegura(u))) throw new Error('endereço não permitido');
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (painel-r1 importador de imagens)', Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5' }, signal: AbortSignal.timeout(15000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u); continue; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (Number(r.headers.get('content-length') || 0) > MAX_DOWNLOAD) throw new Error('maior que 10 MB');
    const partes = []; let total = 0;
    for await (const parte of r.body) { total += parte.length; if (total > MAX_DOWNLOAD) throw new Error('maior que 10 MB'); partes.push(parte); }
    const buf = Buffer.concat(partes);
    if (!tipoReal(buf)) throw new Error('o arquivo não é JPG, PNG, WEBP, GIF ou AVIF');
    return buf;
  }
  throw new Error('redirecionamentos demais');
}

// Baixa as imagens externas (de todos os domínios ou só dos escolhidos), sobe no Blob e troca os links no HTML.
export async function migrarImagens(html, { hostsApp = [], dominios = null, limite = 40 } = {}) {
  const rel = await relatorioImagens(html, { hostsApp });
  const filtro = dominios && dominios.length ? new Set(dominios.map((d) => String(d).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))) : null;
  const alvos = rel._itens.filter((i) => i.situacao === 'externa' && (!filtro || filtro.has(i.dominio))).slice(0, limite);
  const puladas = rel._itens.filter((i) => i.situacao === 'externa_svg' && (!filtro || filtro.has(i.dominio))).map((i) => ({ url: i.url, motivo: 'SVG não é migrado (pode conter script)' }));
  const migradas = [], falhas = [];
  const fila = [...alvos];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (fila.length) {
      const it = fila.shift();
      try {
        const buf = await baixarImagem(it.url);
        const base = decodeURIComponent(new URL(it.url).pathname.split('/').pop() || 'imagem');
        const salvo = await salvarImagem(buf, `${it.dominio.split('.').slice(-2, -1)[0] || 'img'}-${base}`);
        migradas.push({ de: it.url, para: salvo.url, dominio: it.dominio, tamanho: salvo.tamanho, brutos: it.brutos });
      } catch (e) { falhas.push({ url: it.url, motivo: e.message }); }
    }
  }));
  // troca no HTML: primeiro os links mais longos (evita trocar parte de outro link)
  let novo = String(html);
  const trocas = migradas.flatMap((m) => [...new Set([...m.brutos, m.de, m.de.replace(/&/g, '&amp;')])].map((b) => [b, m.para])).sort((a, b) => b[0].length - a[0].length);
  for (const [de, para] of trocas) novo = novo.split(de).join(para);
  return { html: novo, migradas: migradas.map(({ brutos, ...m }) => m), falhas, puladas, restantes: rel.externas - migradas.length };
}
