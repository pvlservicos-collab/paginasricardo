import { protegido, json, carregarConfig } from '../lib/servidor.mjs';
import { linkDaPagina } from '../lib/core.mjs';

// Confere se cada página está no ar (abre a URL publicada e mede o tempo).
export const GET = protegido(async (request) => {
  const cfg = await carregarConfig();
  const hostAtual = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, '');
  const resultados = await Promise.all(cfg.paginas.map(async (p) => {
    const alvo = /^(localhost|127[.])/.test(hostAtual) ? `http://${request.headers.get('host')}/${p.url}` : linkDaPagina(p, cfg, hostAtual);
    const inicio = Date.now();
    try {
      const r = await fetch(alvo, {
        redirect: 'manual',
        headers: { 'User-Agent': 'R1-Painel-Monitor (bot)', Accept: 'text/html' },
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      const ms = Date.now() - inicio;
      const html = r.status === 200 ? await r.text() : '';
      const inativa = html.includes('data-pagina-inativa');
      const redireciona = (r.status >= 300 && r.status < 400) || html.includes('data-redirecionamento');
      let estado;
      if (r.status !== 200 && !redireciona) estado = 'fora';
      else if (p.ativa) estado = inativa || redireciona ? 'pendente' : 'online';
      else if (p.redirecionarInativaPara) estado = redireciona ? 'redireciona' : 'pendente';
      else estado = inativa ? 'inativa' : 'pendente';
      return { slug: p.slug, url: alvo, http: r.status, ms, kb: Math.round(Buffer.byteLength(html) / 1024), estado };
    } catch (e) {
      return { slug: p.slug, url: alvo, http: 0, ms: Date.now() - inicio, estado: 'fora', erro: e.name === 'TimeoutError' ? 'sem resposta em 10s' : e.message };
    }
  }));
  return json({ verificadoEm: new Date().toISOString(), resultados });
});
