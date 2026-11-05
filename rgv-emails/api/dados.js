// OPCIONAL — armazenamento na nuvem dos e-mails, grupos e biblioteca (Upstash Redis).
// Só é usado se public/armazenamento-nuvem.js estiver incluído no index.html.
//
// GET    /api/dados?k=chave        → 200 { valor: string | null }
// PUT    /api/dados  body { k, v } → 200 { ok: true }
// DELETE /api/dados?k=chave        → 200 { ok: true }
import { Redis } from '@upstash/redis';
import { lerSessao, json, naoAutorizado } from '../lib/sessao.js';

const PREFIXO_PERMITIDO = 'editorEmails:';

function redis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Banco Redis não configurado (KV_REST_API_URL / KV_REST_API_TOKEN).');
  return new Redis({ url, token, automaticDeserialization: false });
}

// Todos os usuários compartilham o mesmo acervo (igual ao Painel).
// Para separar por usuário, troque por: `rgv:${usuario}:${k}`
const chave = (usuario, k) => 'rgv:' + k;

function validar(k) {
  return typeof k === 'string' && k.startsWith(PREFIXO_PERMITIDO) && k.length < 200;
}

export async function GET(request) {
  const usuario = lerSessao(request);
  if (!usuario) return naoAutorizado();
  const k = new URL(request.url).searchParams.get('k');
  if (!validar(k)) return json({ erro: 'Chave inválida.' }, 400);
  const valor = await redis().get(chave(usuario, k));
  return json({ valor: valor ?? null });
}

export async function PUT(request) {
  const usuario = lerSessao(request);
  if (!usuario) return naoAutorizado();
  let corpo = {};
  try { corpo = await request.json(); } catch {}
  if (!validar(corpo.k) || typeof corpo.v !== 'string') return json({ erro: 'Dados inválidos.' }, 400);
  await redis().set(chave(usuario, corpo.k), corpo.v);
  return json({ ok: true });
}

export async function DELETE(request) {
  const usuario = lerSessao(request);
  if (!usuario) return naoAutorizado();
  const k = new URL(request.url).searchParams.get('k');
  if (!validar(k)) return json({ erro: 'Chave inválida.' }, 400);
  await redis().del(chave(usuario, k));
  return json({ ok: true });
}
