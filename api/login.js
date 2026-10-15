import { conferirCredenciais, cookieDeSessao, cookieDeSaida, logado, json, erro } from '../lib/servidor.mjs';

export async function POST(request) {
  let dados = {};
  try { dados = await request.json(); } catch {}
  if (!conferirCredenciais(dados.usuario, dados.senha)) {
    await new Promise((r) => setTimeout(r, 600));
    return erro('Usuário ou senha incorretos.', 401);
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookieDeSessao() });
}

export function GET(request) {
  return json({ logado: logado(request) });
}

export function DELETE() {
  return json({ ok: true }, 200, { 'Set-Cookie': cookieDeSaida() });
}
