// Aba Integrações do painel Raio-X (só admin). Hoje: RD Station Marketing (ver lib/rdstation.mjs).
//   GET                                    → situação (ligado, final da chave, campos, projetos, pendentes)
//   POST { acao: 'salvar', token?, ligado?, campos?, projetos? }
//   POST { acao: 'testar' }                → manda um lead de teste ao RD
//   POST { acao: 'pendentes', projeto? }   → manda ao RD os leads que ainda não foram
//   POST { acao: 'um', id }                → (re)envia um lead
import { lerJson } from '../../lib/servidor.mjs';
import { protegidoRaiox, json, erro, registrar, ipDe } from '../../lib/raiox.mjs';
import { situacaoRD, salvarRD, testeRD, enviarPendentes, enviarUm } from '../../lib/rdstation.mjs';

export const GET = protegidoRaiox(async () => json({ rd: await situacaoRD() }), { admin: true });

export const POST = protegidoRaiox(async (request, url, u) => {
  const d = await lerJson(request, 8192);
  const log = (acao, detalhe) => registrar('raiox_rd_' + acao, { usuario: u.login, ip: ipDe(request), detalhe });
  if (d.acao === 'salvar') {
    const rd = await salvarRD(d, u.login);
    await log('salvar', { ligado: rd.ligado, chaveNova: Boolean(d.token), campos: rd.campos, projetos: rd.projetos });
    return json({ ok: true, rd });
  }
  if (d.acao === 'testar') { const r = await testeRD(); await log('testar', { aviso: r.aviso }); return json(r); }
  if (d.acao === 'pendentes') {
    const r = await enviarPendentes(typeof d.projeto === 'string' ? d.projeto : null);
    await log('pendentes', { projeto: d.projeto || 'todos', enviados: r.enviados, erros: r.erros });
    return json({ ok: true, ...r, rd: r.situacao, situacao: undefined });
  }
  if (d.acao === 'um') { const r = await enviarUm(d.id); await log('um', { id: d.id, status: r.status }); return json({ ok: true, ...r }); }
  return erro('Ação desconhecida.');
}, { admin: true });
