import { json, erro, lerJson, mesmaOrigem } from '../lib/servidor.mjs';
import { entrar, sair, sessaoAtual, cookieDeSaida, registrar, ipDe } from '../lib/auth.mjs';

// Entrar: { usuario (login ou e-mail), senha }
export async function POST(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  let d;
  try { d = await lerJson(request, 4096); } catch (e) { return erro(e.message, e.status || 400); }
  try {
    const r = await entrar(d.usuario, d.senha, request);
    if (r.erro) {
      await new Promise((ok) => setTimeout(ok, 400 + Math.random() * 400));
      return erro(r.erro, r.status);
    }
    return json({ ok: true, usuario: { nome: r.usuario.nome, papel: r.usuario.papel } }, 200, { 'Set-Cookie': r.cookie });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/login', msg: e.message }));
    return erro('Login indisponível no momento. Tente de novo.', 503);
  }
}

// Está logado? (também troca o código da sessão quando chega a hora)
export async function GET(request) {
  try {
    const s = await sessaoAtual(request);
    const corpo = { logado: Boolean(s), usuario: s ? { nome: s.usuario.nome, login: s.usuario.login, papel: s.usuario.papel } : null };
    return json(corpo, 200, s?.cookie ? { 'Set-Cookie': s.cookie } : {});
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/login', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

// Sair: apaga a sessão no servidor e o cookie no navegador.
export async function DELETE(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const s = await sessaoAtual(request).catch(() => null);
  await sair(request).catch(() => {});
  if (s) await registrar('logout', { usuario: s.usuario.login, ip: ipDe(request) });
  return json({ ok: true }, 200, { 'Set-Cookie': cookieDeSaida() });
}
