// Contas do painel Raio-X (só admin).
// GET lista · POST { login, nome, papel, novaSenha? } cria/atualiza (senha gerada e mostrada uma vez) · PATCH { login, ativo }
import { lerJson } from '../../lib/servidor.mjs';
import { protegidoRaiox, listarUsuarios, salvarUsuario, ativarUsuario, senhaForte, json, erro, registrar, ipDe } from '../../lib/raiox.mjs';

export const GET = protegidoRaiox(async () => json({ usuarios: await listarUsuarios() }), { admin: true });

export const POST = protegidoRaiox(async (request, url, u) => {
  const d = await lerJson(request, 4096);
  const existe = (await listarUsuarios()).some((x) => x.login === String(d.login || '').trim().toLowerCase());
  if (existe && String(d.login).toLowerCase() === u.login && d.papel !== 'admin') return erro('Você não pode tirar o seu próprio acesso de admin.', 400);
  const senha = !existe || d.novaSenha ? senhaForte() : null;
  await salvarUsuario({ login: d.login, nome: d.nome, papel: d.papel, senha });
  await registrar(existe ? 'raiox_usuario_alterado' : 'raiox_usuario_criado', { usuario: u.login, ip: ipDe(request), detalhe: { login: d.login, papel: d.papel, novaSenha: Boolean(senha) } });
  return json({ ok: true, senha });
}, { admin: true });

export const PATCH = protegidoRaiox(async (request, url, u) => {
  const d = await lerJson(request, 4096);
  if (String(d.login || '').toLowerCase() === u.login && !d.ativo) return erro('Você não pode desativar a sua própria conta.', 400);
  await ativarUsuario(d.login, d.ativo);
  await registrar('raiox_usuario_ativo', { usuario: u.login, ip: ipDe(request), detalhe: { login: d.login, ativo: Boolean(d.ativo) } });
  return json({ ok: true });
}, { admin: true });
