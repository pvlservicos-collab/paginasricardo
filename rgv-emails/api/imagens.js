// POST /api/imagens
// Corpo: o arquivo cru (não é multipart). Headers: Content-Type (image/*) e X-Nome (nome codificado).
// Resposta: 200 { url } — URL pública e permanente no Vercel Blob.
import { put } from '@vercel/blob';
import { lerSessao, json, naoAutorizado } from '../lib/sessao.js';

const LIMITE = 4 * 1024 * 1024; // as Functions da Vercel aceitam até 4,5 MB de corpo
const TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function POST(request) {
  if (!lerSessao(request)) return naoAutorizado();

  const tipo = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TIPOS.includes(tipo)) return json({ erro: 'Envie uma imagem JPG, PNG, GIF ou WebP.' }, 415);

  const tamanho = Number(request.headers.get('content-length') || 0);
  if (tamanho > LIMITE) return json({ erro: 'A imagem passa de 4 MB. Reduza o tamanho e tente de novo.' }, 413);

  let nome = 'email-imagem';
  try { nome = decodeURIComponent(request.headers.get('x-nome') || nome); } catch {}
  nome = nome.toLowerCase().replace(/[^a-z0-9.\-]+/g, '-').slice(0, 80) || 'email-imagem';

  const arquivo = await request.arrayBuffer();
  if (arquivo.byteLength > LIMITE) return json({ erro: 'A imagem passa de 4 MB. Reduza o tamanho e tente de novo.' }, 413);

  try {
    const blob = await put('emails/' + nome, arquivo, {
      access: 'public',
      addRandomSuffix: true, // evita sobrescrever imagens com o mesmo nome
      contentType: tipo,
      cacheControlMaxAge: 60 * 60 * 24 * 365
    });
    return json({ url: blob.url });
  } catch (e) {
    console.error('Falha no upload para o Blob:', e);
    return json({ erro: 'A hospedagem falhou. Confira se o Blob Store está ligado ao projeto.' }, 500);
  }
}
