// Publicação em lote das páginas estáticas.
//
// As páginas saem como arquivos estáticos do deploy (scripts/estaticas.mjs). Assim, clique de anúncio
// (?fbclid=, ?utm_...) também sai do cache da CDN: arquivo estático ignora a query, e a função não roda.
// Em troca, uma alteração só entra no ar no próximo deploy. Para não pagar um build por salvamento:
//   1. salvarConfig() chama marcarMudanca();
//   2. o cron /api/publicar roda a cada minuto e, quando a última alteração tem 2 min sem nenhuma outra,
//      dispara um deploy (VERCEL_DEPLOY_HOOK, ou redeploy pela API com VERCEL_TOKEN). Edições seguidas viram um deploy só.
// IMPORTANTE: sem banco ou sem como disparar o deploy, o build NÃO gera as estáticas (scripts/estaticas.mjs),
// senão uma alteração ficaria presa na versão antiga. Aí tudo segue pela api/servir, como antes.
import { sql, usandoBanco } from './store.mjs';

export const QUIETO_MS = 2 * 60e3; // espera 2 min sem alteração antes de publicar
const ENTRE_DEPLOYS_MS = 3 * 60e3; // e não dispara de novo antes de 3 min (o build leva ~1 min)

let pronto = null;
function preparar() {
  if (!pronto) {
    pronto = sql`create table if not exists publicacao (
      id int primary key,
      mudou_em timestamptz,
      disparado_em timestamptz,
      gerado_em timestamptz,
      ultimo_erro text
    )`.catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

export async function marcarMudanca() {
  if (!usandoBanco) return;
  try {
    await preparar();
    await sql`insert into publicacao (id, mudou_em) values (1, now()) on conflict (id) do update set mudou_em = now()`;
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', onde: 'marcarMudanca', msg: e.message }));
  }
}

// Chamado pelo build (scripts/estaticas.mjs): o que foi alterado até aqui entra neste deploy.
export async function marcarGerado(quando) {
  if (!usandoBanco || process.env.VERCEL_ENV !== 'production') return; // build de prévia não publica nada
  await preparar();
  await sql`insert into publicacao (id, gerado_em) values (1, ${quando}) on conflict (id) do update set gerado_em = ${quando}`;
}

// Situação para o painel: 'no_ar' | 'aguardando' (ainda editando) | 'publicando'
export async function situacao() {
  if (!usandoBanco) return { estado: 'no_ar' };
  await preparar();
  const [r] = await sql`select mudou_em, disparado_em, gerado_em, ultimo_erro, now() as agora from publicacao where id = 1`;
  if (!r || !r.mudou_em) return { estado: 'no_ar' };
  const mudou = +new Date(r.mudou_em), gerado = r.gerado_em ? +new Date(r.gerado_em) : 0;
  const disparado = r.disparado_em ? +new Date(r.disparado_em) : 0, agora = +new Date(r.agora);
  if (gerado >= mudou) return { estado: 'no_ar', mudouEm: r.mudou_em };
  if (disparado >= mudou && agora - disparado < 15 * 60e3) return { estado: 'publicando', mudouEm: r.mudou_em, desde: r.disparado_em, erro: r.ultimo_erro };
  return { estado: 'aguardando', mudouEm: r.mudou_em, publicaEm: new Date(Math.max(mudou + QUIETO_MS, disparado + ENTRE_DEPLOYS_MS)).toISOString(), agora: r.agora };
}

// Cron: dispara o deploy quando há alteração parada há QUIETO_MS. Devolve o que fez.
// Dispara o build: Deploy Hook (se cadastrado) ou, com VERCEL_TOKEN, um redeploy da versão que está em
// produção agora (mesmo código; o build lê as páginas do banco de novo).
async function dispararDeploy() {
  if (process.env.VERCEL_DEPLOY_HOOK) {
    const r = await fetch(process.env.VERCEL_DEPLOY_HOOK, { method: 'POST', signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('deploy hook respondeu ' + r.status);
    return;
  }
  const time = process.env.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : '';
  const r = await fetch(`https://api.vercel.com/v13/deployments${time}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: process.env.VERCEL_PROJECT_NOME || 'paginasricardo', deploymentId: process.env.VERCEL_DEPLOYMENT_ID, target: 'production', meta: { origem: 'publicacao-em-lote' } }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error('redeploy respondeu ' + r.status + ' ' + (await r.text()).slice(0, 200));
}
export const podePublicar = () => Boolean(process.env.VERCEL_DEPLOY_HOOK || (process.env.VERCEL_TOKEN && process.env.VERCEL_DEPLOYMENT_ID));

export async function publicarSePreciso() {
  if (!usandoBanco || !podePublicar()) return { fez: 'nada', motivo: usandoBanco ? 'sem VERCEL_DEPLOY_HOOK nem VERCEL_TOKEN' : 'sem banco' };
  await preparar();
  // reserva o disparo numa única instrução (dois crons ao mesmo tempo não disparam dois deploys)
  const [r] = await sql`update publicacao set disparado_em = now(), ultimo_erro = null
    where id = 1 and mudou_em is not null
      and mudou_em < now() - make_interval(secs => ${QUIETO_MS / 1000})
      and (disparado_em is null or disparado_em < mudou_em or disparado_em < now() - interval '15 minutes') -- build que falhou: tenta de novo
      and (gerado_em is null or gerado_em < mudou_em)
      and (disparado_em is null or disparado_em < now() - make_interval(secs => ${ENTRE_DEPLOYS_MS / 1000}))
    returning mudou_em`;
  if (!r) return { fez: 'nada' };
  try {
    await dispararDeploy();
    return { fez: 'publicou', mudouEm: r.mudou_em };
  } catch (e) {
    // devolve a vez: o próximo cron tenta de novo
    await sql`update publicacao set disparado_em = null, ultimo_erro = ${e.message.slice(0, 300)} where id = 1`;
    throw e;
  }
}
