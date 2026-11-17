// POST /api/rota/rica-voz { texto } → audio/mpeg na voz do Ricardo (ElevenLabs). Só logado; cache por texto; limite diário.
import { createHash } from 'node:crypto';
import { json, lerToken, usoSobe, vozCacheLer, vozCacheGravar } from '../../lib/rota/base.mjs';

const VOZ = process.env.ELEVENLABS_VOICE_ID || 'IcqPmVdLTRW5XvqGeAM7'; // clone "Ricardo Nunes"
const MODELO = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const LIMITE_DIA = 25;

const audio = (buf) => new Response(buf, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });

export const POST = async (request) => {
  const email = lerToken(request);
  if (!email) return json({ erro: 'Entre de novo para ouvir o RICA.' }, 401);
  const KEY = process.env.ELEVENLABS_API_KEY;
  if (!KEY) return json({ erro: 'A voz do RICA ainda não foi ligada.' }, 503);
  let c = {}; try { c = await request.json(); } catch {}
  const texto = String(c.texto || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!texto) return json({ erro: 'Nada para ler.' }, 400);

  const h = createHash('sha256').update(VOZ + '|' + MODELO + '|' + texto).digest('hex');
  const cache = await vozCacheLer(h);
  if (cache) return audio(cache); // já gerado antes: não conta no limite

  const dia = new Date().toISOString().slice(0, 10);
  const n = await usoSobe('voz:' + email + ':' + dia);
  if (n > LIMITE_DIA) return json({ erro: 'Você já ouviu bastante o RICA hoje. Amanhã tem mais.' }, 429);

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOZ}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': KEY, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: texto, model_id: MODELO, voice_settings: { stability: 0.5, similarity_boost: 0.95, style: 0.3, use_speaker_boost: true } }),
  });
  if (!r.ok) return json({ erro: 'A voz não saiu agora. Tente de novo.' }, 502);
  const buf = Buffer.from(await r.arrayBuffer());
  await vozCacheGravar(h, buf);
  return audio(buf);
};
