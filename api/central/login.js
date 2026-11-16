// Login da Central R1 (interno.grupor1.com). Contas próprias, criadas só pelo admin em /gestao-membros.
import { lerJson, mesmaOrigem } from '../../lib/servidor.mjs';
import { entrar, sair, sessao, cookieDeSaida, json, erro, registrar, ipDe, hostDe, hostPermitido } from '../../lib/central.mjs';

// Entrar: { usuario, senha }
export async function POST(request) {
  if (!hostPermitido(hostDe(request))) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  let d;
  try { d = await lerJson(request, 4096); } catch (e) { return erro(e.message, e.status || 400); }
  try {
    const r = await entrar(d.usuario, d.senha, request);
    if (r.erro) {
      await new Promise((ok) => setTimeout(ok, 400 + Math.random() * 400));
      return erro(r.erro, r.status);
    }
    return json({ ok: true, membro: r.membro }, 200, { 'Set-Cookie': r.cookie });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/central/login', msg: e.message }));
    return erro('Login indisponível no momento. Tente de novo.', 503);
  }
}

// Está logado? (a tela de gestão usa para saber se mostra o login)
export async function GET(request) {
  if (!hostPermitido(hostDe(request))) return erro('Endereço não permitido.', 403);
  try {
    const m = await sessao(request);
    return json({ logado: Boolean(m), membro: m ? { login: m.login, nome: m.nome, papel: m.papel } : null });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/central/login', msg: e.message }));
    return erro('Serviço indisponível.', 503);
  }
}

// Sair: apaga a sessão no servidor e o cookie no navegador.
export async function DELETE(request) {
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const m = await sessao(request).catch(() => null);
  await sair(request).catch(() => {});
  if (m) await registrar('central_logout', { usuario: m.login, ip: ipDe(request) });
  return json({ ok: true }, 200, { 'Set-Cookie': cookieDeSaida() });
}
