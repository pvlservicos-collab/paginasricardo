// Pré-visualização do HTML antes de salvar. A página abre "isolada" (CSP sandbox): os scripts dela rodam,
// mas sem acesso ao painel, aos cookies nem à API. Pixel e Clarity não entram na prévia.
import { protegido, erro, LIMITE_HTML } from '../lib/servidor.mjs';
import { limparCodigo, montarDocumento } from '../lib/core.mjs';

export const POST = protegido(async (request) => {
  if (Number(request.headers.get('content-length') || 0) > LIMITE_HTML * 1.5) return erro('HTML grande demais.', 413);
  const form = await request.formData().catch(() => null);
  const html = form && typeof form.get('html') === 'string' ? limparCodigo(form.get('html')) : '';
  if (html.length < 20) return erro('Nada para pré-visualizar.');
  return new Response(montarDocumento(html, 'Pré-visualização'), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': 'sandbox allow-scripts allow-forms allow-popups allow-modals',
      'X-Robots-Tag': 'noindex, nofollow',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
});
