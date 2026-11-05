// Diagnósticos para o painel Raio-X. Admin recebe tudo; leitor recebe sem dados pessoais (cortados em lib/raiox.mjs).
// GET lista · PATCH { acao, ids|id, ... } gestão dos leads, só admin (etapa, teste, lixeira, anotações; ver gerirLeads).
import { lerJson } from '../../lib/servidor.mjs';
import { protegidoRaiox, listarEnvios, gerirLeads, json, registrar, ipDe } from '../../lib/raiox.mjs';

export const GET = protegidoRaiox(async (request, url, u) => json({ papel: u.papel, envios: await listarEnvios(u.papel) }));

export const PATCH = protegidoRaiox(async (request, url, u) => {
  const d = await lerJson(request, 64 * 1024);
  const n = await gerirLeads(d, u.login);
  // nota guarda só o tamanho no log; exclusões ficam registradas com os ids
  const ids = Array.isArray(d.ids) ? d.ids.slice(0, 50) : d.id ? [d.id] : [];
  await registrar('raiox_leads_' + String(d.acao).slice(0, 20), { usuario: u.login, ip: ipDe(request),
    detalhe: { n, ids, status: d.status, teste: d.teste } });
  return json({ ok: true, n });
}, { admin: true });
