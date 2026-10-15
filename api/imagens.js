// Imagens do site, guardadas no Vercel Blob em wp-content/uploads/ e entregues em /wp-content/uploads/...
// GET lista · POST sobe uma imagem (corpo = o arquivo) · DELETE apaga (só admin e só se nenhuma página usa).
import { list, del } from '@vercel/blob';
import { protegido, json, erro, auditar, carregarConfig } from '../lib/servidor.mjs';
import { TOKEN_BLOB, lerArquivos, sql, usandoBanco } from '../lib/store.mjs';
import { PASTA_PAGINAS } from '../lib/core.mjs';
import { PASTA_IMAGENS, listarImagens, salvarImagem } from '../lib/imagens.mjs';

const LIMITE = 4 * 1024 * 1024; // limite do corpo das funções da Vercel (~4,5 MB)
const MAX_POR_HORA = 300;

export const GET = protegido(async () => {
  if (!TOKEN_BLOB) return erro('Conecte um Vercel Blob ao projeto.', 503);
  return json({ imagens: await listarImagens() });
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
  let nome = 'imagem';
  try { nome = decodeURIComponent(request.headers.get('x-nome') || '') || 'imagem'; } catch {}
  const s = await salvarImagem(buf, nome);
  await auditar(usuario, 'imagem_enviada', { caminho: s.url, bytes: s.tamanho, origem: 'painel' }, request);
  return json({ ok: true, ...s });
});

export const DELETE = protegido(async (request, url, usuario) => {
  const nome = url.searchParams.get('nome') || '';
  if (!/^[a-z0-9][a-z0-9._-]{0,200}$/i.test(nome)) return erro('Nome inválido.');
  const cfg = await carregarConfig();
  const htmls = await lerArquivos(cfg.paginas.map((p) => `${PASTA_PAGINAS}/${p.arquivo}`));
  const usa = cfg.paginas.filter((p, i) => (htmls[i] || '').includes(nome));
  if (usa.length) return erro(`Imagem em uso em ${usa.map((p) => '/' + p.url).join(', ')}. Tire da página antes de apagar.`, 409);
  const [b] = (await list({ prefix: PASTA_IMAGENS + nome, limit: 5, token: TOKEN_BLOB })).blobs.filter((x) => x.pathname === PASTA_IMAGENS + nome);
  if (!b) return erro('Imagem não encontrada.', 404);
  await del(b.url, { token: TOKEN_BLOB });
  await auditar(usuario, 'imagem_apagada', { caminho: b.pathname }, request);
  return json({ ok: true });
}, { admin: true });
