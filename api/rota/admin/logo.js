// POST /api/rota/admin/logo — sobe o logo de uma empresa das Conexões (pedido do Lucas, 20/11/2026).
// Authorization: Bearer <ROTA_CONEXOES_CHAVE>   (sem chave ou chave errada → 401)
//
// Envio: multipart/form-data com o arquivo no campo "arquivo" (PNG, JPG ou WebP, até 2 MB) e o nome da empresa
// no campo "nome" (só para o nome do arquivo). Também aceita o corpo cru da imagem com ?nome=<empresa>.
// Resposta: { l, mo } — endereços públicos para os campos l e mo da lista:
//   l  = 140x140, fundo branco;   mo = monocromático cinza-claro em fundo transparente, 96 px de altura.
// Os arquivos ficam no Vercel Blob em wp-content/uploads/ (servidos pelo próprio site em /wp-content/uploads/...).
import { put } from '@vercel/blob';
import { json } from '../../../lib/rota/base.mjs';
import { TOKEN_BLOB } from '../../../lib/store.mjs';
import { tipoReal, nomeLimpo } from '../../../lib/imagens.mjs';
import { chaveConfere, gerarLogos } from '../../../lib/rota/admin-conexoes.mjs';

const MAX = 2 * 1024 * 1024;
const cab = { 'x-robots-tag': 'noindex, nofollow' };
const log = (acao, d) => console.log(JSON.stringify({ tipo: 'evento', rota: '/api/rota/admin/logo', acao, ...d }));

export const POST = async (request) => {
  if (!chaveConfere(request)) return json({ erro: 'Não autorizado.' }, 401, cab);
  try {
    if (!TOKEN_BLOB) return json({ erro: 'Armazenamento de imagens indisponível.' }, 503, cab);
    const url = new URL(request.url);
    if (Number(request.headers.get('content-length') || 0) > MAX + 64 * 1024) return json({ erro: 'Imagem grande demais (máximo 2 MB).' }, 413, cab);
    let buf, nome = url.searchParams.get('nome') || '';
    if (/multipart\/form-data/i.test(request.headers.get('content-type') || '')) {
      const f = await request.formData();
      const arq = f.get('arquivo') || f.get('logo') || f.get('file');
      if (!arq || typeof arq === 'string') return json({ erro: 'Mande a imagem no campo "arquivo".' }, 400, cab);
      buf = Buffer.from(await arq.arrayBuffer());
      nome = String(f.get('nome') || nome || arq.name || '');
    } else {
      buf = Buffer.from(await request.arrayBuffer());
    }
    if (!buf.length) return json({ erro: 'Nenhuma imagem recebida.' }, 400, cab);
    if (buf.length > MAX) return json({ erro: 'Imagem grande demais (máximo 2 MB).' }, 413, cab);
    const tipo = tipoReal(buf);
    if (!['png', 'jpg', 'webp'].includes(tipo)) return json({ erro: 'Formato não aceito. Use PNG, JPG ou WebP.' }, 415, cab);

    let logos;
    try { logos = await gerarLogos(buf); }
    catch (e) { return json({ erro: e.status === 422 ? e.message : 'Não consegui ler essa imagem. Confira o arquivo.' }, e.status === 422 ? 422 : 400, cab); }

    const slug = nomeLimpo(nome || 'empresa');
    const opc = { access: 'public', addRandomSuffix: true, contentType: 'image/webp', cacheControlMaxAge: 31536000, token: TOKEN_BLOB };
    const [rl, rm] = await Promise.all([
      put(`wp-content/uploads/cxr1-${slug}.webp`, logos.l, opc),
      put(`wp-content/uploads/cxr1-mono-${slug}.webp`, logos.mo, opc),
    ]);
    const site = url.origin;
    log('logo', { slug, bytes: buf.length });
    return json({ l: `${site}/${rl.pathname}`, mo: `${site}/${rm.pathname}` }, 201, cab);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/admin/logo', msg: e.message }));
    return json({ erro: 'Não consegui salvar o logo agora. Tente de novo.' }, 503, cab);
  }
};
