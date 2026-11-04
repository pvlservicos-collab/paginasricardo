// Login do painel Raio-X (/raioxtributariodash). Contas próprias, separadas do painel de páginas.
import { lerJson } from '../../lib/servidor.mjs';
import { entrar, sair, sessao, cookieDeSaida, json, erro, mesmaOrigem, registrar, ipDe } from '../../lib/raiox.mjs';

// Entrar: { usuario, senha }
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
    return json({ ok: true, usuario: r.usuario }, 200, { 'Set-Cookie': r.cookie });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/raiox/login', msg: e.message }));
    return erro('Login indisponível no momento. Tente de novo.', 503);
  }
}

// Está logado? Devolve nome e papel (o painel mostra as abas de admin só para admin; a API confere de novo).
export async function GET(request) {
  try {
    const u = await sessao(request);
    return json({ logado: Boolean(u), usuario: u ? { login: u.login, nome: u.nome, papel: u.papel } : null });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/raiox/login', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

export async function DELETE(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const u = await sessao(request).catch(() => null);
  await sair(request).catch(() => {});
  if (u) await registrar('raiox_logout', { usuario: u.login, ip: ipDe(request) });
  return json({ ok: true }, 200, { 'Set-Cookie': cookieDeSaida() });
}
