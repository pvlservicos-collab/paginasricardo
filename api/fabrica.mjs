// Fábrica de Formatos (/fabrica). Exige login do painel. Ver lib/fabrica.mjs.
//   GET  ?acao=estado                   → IA (modelo e final da chave), organizações e prompts
//   GET  ?acao=arquivo&nome=files/x     → situação do vídeo no Gemini (PROCESSING / ACTIVE)
//   POST ?acao=marcas | prompts         { valor }
//   POST ?acao=testar                   → testa a chave
//   POST ?acao=parte&id=&n=             corpo = pedaço da cópia do vídeo (até 3 MB)
//   POST ?acao=enviar-video             { id, partes, mime }   → junta e manda para o Gemini
//   POST ?acao=raiox                    { uri, mime, prompt, ids }
//   POST ?acao=textos                   { prompt, campos }
import { protegido, json, erro, lerJson, auditar } from '../lib/servidor.mjs';
import { estado, salvar, testar, receberParte, enviarVideo, situacaoArquivo, raiox, textos, MAX_PARTE } from '../lib/fabrica.mjs';

export const GET = protegido(async (request, url) => {
  const a = url.searchParams.get('acao');
  if (a === 'estado') return json(await estado());
  if (a === 'arquivo') return json(await situacaoArquivo(url.searchParams.get('nome')));
  return erro('Ação desconhecida.', 404);
});

export const POST = protegido(async (request, url, usuario) => {
  const a = url.searchParams.get('acao');
  if (a === 'parte') {
    if (Number(request.headers.get('content-length') || 0) > MAX_PARTE) return erro('Parte grande demais.', 413);
    const buf = Buffer.from(await request.arrayBuffer());
    return json(await receberParte(url.searchParams.get('id'), Number(url.searchParams.get('n')), buf));
  }
  const d = await lerJson(request, 4 * 1024 * 1024);
  if (a === 'marcas' || a === 'prompts') { await salvar(a, d.valor, usuario.login); return json({ ok: true }); }
  if (a === 'testar') return json(await testar());
  if (a === 'enviar-video') {
    const r = await enviarVideo(d);
    await auditar(usuario, 'fabrica_raiox_video', { bytes: r.bytes }, request);
    return json(r);
  }
  if (a === 'raiox') return json(await raiox(d));
  if (a === 'textos') return json(await textos(d));
  return erro('Ação desconhecida.', 404);
});
