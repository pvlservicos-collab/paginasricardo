// GET /api/rota/conexoes → diretório Conexão R1. Só logado.
//
// SEGURANÇA (correção do vazamento de 16/11/2026): os contatos (telefone/e-mail) só vão para quem é MEMBRO de
// verdade — e-mail na lista emails-membros.json, ou e-mail de equipe (ROTA_LIVRE_EMAILS). Qualquer outra conta
// logada recebe apenas o NOME da empresa e do contato, sem telefone e sem e-mail. Antes, o backend mandava
// `membro = true` para todo mundo, então qualquer cadastro grátis baixava os contatos de todos os membros.
//
// Os dados (membros, intenções, e-mails de membros) ficam no banco, tabela rota_dados — não no código, porque o
// repositório do painel é público.
import { json, erro, lerToken, normalizarEmail, dado } from '../../lib/rota/base.mjs';

const LIVRES = new Set(String(process.env.ROTA_LIVRE_EMAILS || process.env.LIVRE_EMAILS || 'acesso.livre@cluber1.com.br')
  .split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const ATUALIZADO = '16/11/2026';

export const GET = async (request) => {
  const email = lerToken(request);
  if (!email) return erro('Entre de novo para ver as conexões.', 401);
  const e = normalizarEmail(email);
  let MEMBROS, INTENCOES, EMAILS;
  try { [MEMBROS, INTENCOES, EMAILS] = await Promise.all([dado('membros'), dado('intencoes'), dado('emails-membros')]); }
  catch (x) { console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/conexoes', msg: x.message })); return erro('Conexões indisponíveis agora. Tente de novo.', 503); }
  const membro = EMAILS.some((x) => String(x).trim().toLowerCase() === e) || LIVRES.has(e);
  // não-membro: devolve só o nome de cada contato (sem telefone `t` e sem e-mail `e`)
  const lista = membro ? MEMBROS : MEMBROS.map((c) => ({ ...c, m: (c.m || []).map((x) => ({ c: x.c })) }));
  return json({ membro, atualizado: ATUALIZADO, intencoes: INTENCOES, membros: lista });
};
