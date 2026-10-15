// Imagens do site, guardadas no Vercel Blob em wp-content/uploads/ e entregues em /wp-content/uploads/...
// GET lista · POST sobe uma imagem (corpo = o arquivo) · DELETE apaga (só admin e só se nenhuma página usa).
import { list, put, del } from '@vercel/blob';
import { protegido, json, erro, auditar, carregarConfig } from '../lib/servidor.mjs';
import { TOKEN_BLOB, lerArquivos, sql, usandoBanco } from '../lib/store.mjs';
import { PASTA_PAGINAS } from '../lib/core.mjs';

const PASTA = 'wp-content/uploads/';
const LIMITE = 4 * 1024 * 1024; // limite do corpo das funções da Vercel (~4,5 MB)
const MAX_POR_HORA = 300;
const TIPOS = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

// Tipo real pelo conteúdo (não confia no nome nem no cabeçalho). SVG não é aceito: pode conter script.
function tipoReal(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (b.toString('ascii', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('ascii', 4, 8) === 'ftyp' && /avi[fs]/.test(b.toString('ascii', 8, 12))) return 'avif';
  return null;
}

const nomeLimpo = (n) => String(n || 'imagem').replace(/\.[a-z0-9]{2,5}$/i, '').toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'imagem';

async function todas() {
  const itens = [];
  let cursor;
  do {
    const r = await list({ prefix: PASTA, cursor, limit: 1000, token: TOKEN_BLOB });
    itens.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return itens;
}

export const GET = protegido(async () => {
  if (!TOKEN_BLOB) return erro('Conecte um Vercel Blob ao projeto.', 503);
  const itens = (await todas())
    .map((b) => ({ nome: b.pathname.slice(PASTA.length), url: '/' + b.pathname, tamanho: b.size, em: b.uploadedAt }))
    .filter((i) => i.nome && !i.nome.includes('/'))
    .sort((a, b) => new Date(b.em) - new Date(a.em));
  return json({ imagens: itens });
});

export const POST = protegido(async (request, url, usuario) => {
  if (!TOKEN_BLOB) return erro('Conecte um Vercel Blob ao projeto.', 503);
  if (!/^image\//i.test(request.headers.get('content-type') || '')) return erro('Envie uma imagem.', 415);
  if (Number(request.headers.get('content-length') || 0) > LIMITE) return erro('Imagem grande demais (máx. 4 MB).', 413);
  if (usandoBanco) {
    const [{ n }] = await sql`select count(*)::int as n from eventos where usuario = ${usuario.login} and acao = 'imagem_enviada' and em > now() - interval '1 hour'`;
    if (n >= MAX_POR_HORA) return erro('Limite de envios por hora atingido. Tente mais tarde.', 429);
  }
  const buf = Buffer.from(await request.arrayBuffer());
  if (!buf.length || buf.length > LIMITE) return erro('Imagem grande demais (máx. 4 MB).', 413);
  const ext = tipoReal(buf);
  if (!ext) return erro('Formato não aceito. Use JPG, PNG, WEBP, GIF ou AVIF.', 415);
  let nome = 'imagem';
  try { nome = nomeLimpo(decodeURIComponent(request.headers.get('x-nome') || '')); } catch {}
  const r = await put(`${PASTA}${nome}.${ext}`, buf, { access: 'public', addRandomSuffix: true, contentType: TIPOS[ext], cacheControlMaxAge: 31536000, token: TOKEN_BLOB });
  await auditar(usuario, 'imagem_enviada', { caminho: r.pathname, bytes: buf.length }, request);
  return json({ ok: true, nome: r.pathname.slice(PASTA.length), url: '/' + r.pathname, tamanho: buf.length });
});

export const DELETE = protegido(async (request, url, usuario) => {
  const nome = url.searchParams.get('nome') || '';
  if (!/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(nome)) return erro('Nome inválido.');
  const cfg = await carregarConfig();
  const htmls = await lerArquivos(cfg.paginas.map((p) => `${PASTA_PAGINAS}/${p.arquivo}`));
  const usa = cfg.paginas.filter((p, i) => (htmls[i] || '').includes(nome));
  if (usa.length) return erro(`Imagem em uso em ${usa.map((p) => '/' + p.url).join(', ')}. Tire da página antes de apagar.`, 409);
  const [b] = (await list({ prefix: PASTA + nome, limit: 5, token: TOKEN_BLOB })).blobs.filter((x) => x.pathname === PASTA + nome);
  if (!b) return erro('Imagem não encontrada.', 404);
  await del(b.url, { token: TOKEN_BLOB });
  await auditar(usuario, 'imagem_apagada', { caminho: b.pathname }, request);
  return json({ ok: true });
}, { admin: true });
