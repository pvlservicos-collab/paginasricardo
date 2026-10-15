import { protegido, json, erro, carregarConfig, salvarConfig, lerJson, auditar } from '../lib/servidor.mjs';
import { lerArquivo } from '../lib/store.mjs';
import { PASTA_CRIATIVOS } from '../lib/core.mjs';

// Os criativos ficam no banco (fora do site público): só o painel mostra. Função do Funil (em construção: só admin).
const TIPOS = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };

export const GET = protegido(async (request, url) => {
  const nome = (url.searchParams.get('arquivo') || '').replace(/[^a-z0-9._-]/gi, '');
  if (!nome) return erro('Arquivo não informado.');
  const bytes = await lerArquivo(`${PASTA_CRIATIVOS}/${nome}`, { bytes: true });
  if (!bytes) return erro('Criativo não encontrado.', 404);
  const ext = nome.split('.').pop().toLowerCase();
  return new Response(bytes, {
    headers: { 'Content-Type': TIPOS[ext] || 'application/octet-stream', 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" },
  });
}, { admin: true });

// Recebe a imagem já reduzida pelo navegador (data URL) e grava no projeto.
export const POST = protegido(async (request, url, usuario) => {
  const d = await lerJson(request, 5 * 1024 * 1024);
  const m = typeof d.dataUrl === 'string' ? /^data:image\/(webp|jpeg|png|gif);base64,([A-Za-z0-9+/=]+)$/.exec(d.dataUrl) : null;
  if (!m) return erro('Envie uma imagem (JPG, PNG, WEBP ou GIF).');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 3.5 * 1024 * 1024) return erro('Imagem muito grande (máx. 3,5 MB).');
  const cfg = await carregarConfig();
  const p = cfg.paginas.find((x) => x.slug === d.slug);
  if (!p) return erro('Página não encontrada.', 404);
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const nome = `${p.slug}-${Date.now().toString(36)}.${ext}`;
  const extras = [{ caminho: `${PASTA_CRIATIVOS}/${nome}`, conteudo: bytes }];
  if (p.criativo?.imagem) extras.push({ caminho: `${PASTA_CRIATIVOS}/${p.criativo.imagem}`, apagar: true });
  p.criativo = { ...p.criativo, imagem: nome };
  const r = await salvarConfig(cfg, `Criativo de /${p.url}`, extras);
  await auditar(usuario, 'criativo_enviado', { url: p.url, bytes: bytes.length }, request);
  return json({ ok: true, sha: r.sha, imagem: nome });
}, { admin: true });

export const DELETE = protegido(async (request, url) => {
  const cfg = await carregarConfig();
  const p = cfg.paginas.find((x) => x.slug === url.searchParams.get('slug'));
  if (!p || !p.criativo?.imagem) return erro('Nada para remover.', 404);
  const antigo = p.criativo.imagem;
  p.criativo = { ...p.criativo, imagem: '' };
  const r = await salvarConfig(cfg, `Criativo removido de /${p.url}`, [{ caminho: `${PASTA_CRIATIVOS}/${antigo}`, apagar: true }]);
  return json({ ok: true, sha: r.sha });
}, { admin: true });
