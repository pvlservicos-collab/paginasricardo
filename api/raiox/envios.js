// Diagnósticos para o painel Raio-X. Admin recebe tudo; leitor recebe sem dados pessoais (cortados em lib/raiox.mjs).
import { protegidoRaiox, listarEnvios, json } from '../../lib/raiox.mjs';

export const GET = protegidoRaiox(async (request, url, u) => json({ papel: u.papel, envios: await listarEnvios(u.papel) }));
