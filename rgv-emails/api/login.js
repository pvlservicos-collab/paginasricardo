// GET    /api/login  → 200 { logado: true, usuario }  |  401 { logado: false }
// POST   /api/login  → body { usuario, senha } → 200 { ok: true, usuario } + cookie  |  401 { ok: false, erro }
// DELETE /api/login  → apaga o cookie
import { conferirSenha, criarCookie, cookieSair, lerSessao, json, naoAutorizado } from '../lib/sessao.js';

export function GET(request) {
  const usuario = lerSessao(request);
  return usuario ? json({ logado: true, usuario }) : naoAutorizado();
}

export async function POST(request) {
  let corpo = {};
  try { corpo = await request.json(); } catch {}
  const usuario = conferirSenha(corpo.usuario, corpo.senha);
  if (!usuario) {
    await new Promise(r => setTimeout(r, 600)); // freia tentativa e erro
    return json({ ok: false, erro: 'Usuário ou senha incorretos.' }, 401);
  }
  return json({ ok: true, usuario }, 200, { 'Set-Cookie': criarCookie(usuario) });
}

export function DELETE() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookieSair });
}
