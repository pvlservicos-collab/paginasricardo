// GET /api/rota/tripulacao  (Authorization: Bearer <TRIPULACAO_CHAVE>)
// Relatório de cada membro do app da Rota do Bilhão, para a página PRIVADA da equipe (/rotadobilhao/tripulacao).
// Pedido do Lucas (pasta pedido-pedro-tripulacao, 20/11/2026). Não é o telão: o /medias continua só com médias.
//  - sem chave ou chave errada → 401 sem dado; 10 erros do mesmo IP em 10 min → 429;
//  - nunca sai senha/hash/sal, token de sessão, id do Google ou outra credencial (a conta não é enviada; só nome/e-mail/datas);
//  - números da pessoa com as MESMAS regras do /medias (lib/rota/medias.mjs → numerosDaPessoa).
import { timingSafeEqual, createHash } from 'node:crypto';
import { json, ipDe, usoSobe, usoLer, prepararRota } from '../../lib/rota/base.mjs';
import { sql } from '../../lib/store.mjs';
import { numerosDaPessoa, contaDaEquipe } from '../../lib/rota/medias.mjs';

const MAX_ERROS = 10, JANELA_MS = 10 * 60e3;
const CREDENCIAIS = new Set(['token', 'senha', 'hash', 'sal', 'google', 'sub', 'access_token', 'credential', 'id_token', 'refresh_token']);
const semNoStore = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' };

function confere(veio) {
  const chave = process.env.TRIPULACAO_CHAVE || '';
  if (chave.length < 24 || !veio) return false; // sem chave configurada, ninguém entra
  const a = createHash('sha256').update(chave).digest(), b = createHash('sha256').update(veio).digest();
  return timingSafeEqual(a, b);
}
// tira qualquer campo de credencial, em qualquer nível do estado
function limpar(v) {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !CREDENCIAIS.has(k)).map(([k, x]) => [k, limpar(x)]));
  return v;
}
const quando = (...l) => l.map((x) => (x ? new Date(x) : null)).filter((d) => d && !isNaN(d)).sort((a, b) => b - a)[0]?.toISOString() ?? null;

export const GET = async (request) => {
  try {
    const ip = ipDe(request), janela = `trip:ip:${ip}:${Math.floor(Date.now() / JANELA_MS)}`;
    if (await usoLer(janela) >= MAX_ERROS) return json({ erro: 'Muitas tentativas. Tente de novo em alguns minutos.' }, 429, semNoStore);
    const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '');
    if (!confere(m?.[1]?.trim())) {
      await usoSobe(janela);
      console.log(JSON.stringify({ tipo: 'evento', rota: '/api/rota/tripulacao', acao: 'chave_errada', ip }));
      return json({ erro: 'Não autorizado.' }, 401, semNoStore);
    }
    await prepararRota();
    const contas = await sql`select c.email, c.conta, c.atualizado as conta_em, e.estado, e.atualizado as estado_em
      from rota_contas c left join rota_estados e on e.email = c.email`;
    const membros = contas.map((l) => {
      const S = l.estado && typeof l.estado === 'object' ? l.estado : null;
      const { etapas, numeros } = S ? numerosDaPessoa(S) : { etapas: [], numeros: { porto: null, maturidade: null, ilhas: null, dfe: null, pestel: null } };
      return {
        id: createHash('sha256').update(l.email).digest('hex').slice(0, 16),
        nome: S?.perfil?.nome || l.conta?.nome || '',
        empresa: S?.perfil?.empresa || l.conta?.empresa || '',
        email: l.email,
        equipe: contaDaEquipe(l.email), // conta da equipe/teste: fica fora do telão
        criadoEm: l.conta?.criado || null,
        atualizadoEm: quando(l.estado_em, S?.atualizado, l.conta_em),
        etapas, numeros,
        estado: S ? limpar(S) : null,
      };
    }).sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || '')));
    console.log(JSON.stringify({ tipo: 'evento', rota: '/api/rota/tripulacao', acao: 'lido', ip, total: membros.length }));
    return new Response(JSON.stringify({ geradoEm: new Date().toISOString(), total: membros.length, membros }), {
      headers: { 'content-type': 'application/json; charset=utf-8', ...semNoStore },
    });
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/rota/tripulacao', msg: e.message }));
    return json({ erro: 'Relatório indisponível agora.' }, 503, semNoStore);
  }
};
