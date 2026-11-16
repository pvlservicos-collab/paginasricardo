// Gestão de membros da Central R1 (só admin). Não existe cadastro pelo próprio usuário.
// GET                                  lista os membros e o estado da proteção
// POST  { login, nome, papel }         cria o membro com senha aleatória (devolvida uma única vez)
// POST  { acao:'senha', login }        gera senha nova (aleatória) e derruba as sessões dele
// POST  { acao:'protecao', ligada }    liga/desliga a exigência de login nas páginas do interno.grupor1.com
// PATCH { login, nome?, papel?, ativo? }  altera; desativar derruba as sessões na hora
// DELETE ?login=                       exclui de vez
import { lerJson } from '../../lib/servidor.mjs';
import {
  protegidoCentral, listarMembros, criarMembro, novaSenha, alterarMembro, excluirMembro,
  protecaoLigada, definirProtecao, json, erro, registrar, ipDe, HOST_CENTRAL,
} from '../../lib/central.mjs';

export const GET = protegidoCentral(async () => json({
  membros: await listarMembros(),
  protecao: await protecaoLigada(),
  endereco: `https://${HOST_CENTRAL}/centralr1`,
}), { admin: true });

export const POST = protegidoCentral(async (request, url, u) => {
  const d = await lerJson(request, 4096);
  const ip = ipDe(request);
  if (d.acao === 'protecao') {
    if (d.ligada !== true && d.ligada !== false) return erro('Informe ligada: true ou false.');
    await definirProtecao(d.ligada, u.login);
    await registrar(d.ligada ? 'central_protecao_ligada' : 'central_protecao_desligada', { usuario: u.login, ip });
    return json({ ok: true, protecao: d.ligada });
  }
  if (d.acao === 'senha') {
    const r = await novaSenha(d.login, u.login);
    await registrar('central_senha_nova', { usuario: u.login, ip, detalhe: { login: r.login } });
    return json({ ok: true, ...r });
  }
  const r = await criarMembro({ login: d.login, nome: d.nome, papel: d.papel }, u.login);
  await registrar('central_membro_criado', { usuario: u.login, ip, detalhe: { login: r.login, papel: d.papel } });
  return json({ ok: true, ...r });
}, { admin: true });

export const PATCH = protegidoCentral(async (request, url, u) => {
  const d = await lerJson(request, 4096);
  const login = String(d.login || '').trim().toLowerCase();
  if (login === u.login && (d.ativo === false || (d.papel !== undefined && d.papel !== 'admin'))) {
    return erro('Você não pode tirar o seu próprio acesso de admin nem desativar a sua conta.', 400);
  }
  const r = await alterarMembro(login, { nome: d.nome, papel: d.papel, ativo: d.ativo });
  await registrar('central_membro_alterado', { usuario: u.login, ip: ipDe(request), detalhe: r });
  return json({ ok: true, membro: r });
}, { admin: true });

export const DELETE = protegidoCentral(async (request, url, u) => {
  const login = String(url.searchParams.get('login') || '').trim().toLowerCase();
  if (login === u.login) return erro('Você não pode excluir a sua própria conta.', 400);
  await excluirMembro(login);
  await registrar('central_membro_excluido', { usuario: u.login, ip: ipDe(request), detalhe: { login } });
  return json({ ok: true });
}, { admin: true });
