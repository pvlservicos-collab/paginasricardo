// Backup do banco (páginas, configurações, e-mails, leads do Raio-X, usuários, registro de eventos).
//
// - Todo dia às 00:00 de Brasília (cron /api/backup) sai um backup diário. Ficam guardados só o de hoje e o
//   de ontem: o de segunda apaga o de sábado.
// - Uma vez por mês sai também o mensal (no primeiro backup do mês). Ficam os últimos 12.
// - O arquivo vai para o Vercel Blob em backups-db/, COMPRIMIDO e CRIPTOGRAFADO (AES-256-GCM) com a chave
//   BACKUP_KEY. O Blob deste projeto é público, então sem a chave o arquivo não serve para nada; sem
//   BACKUP_KEY o backup não roda (nunca grava dado aberto).
// - Fora do backup: sessões, tentativas de login e códigos/tokens do Claude (só valem por horas e são segredos).
// - As imagens não são copiadas (já moram no Blob); vai junto a lista delas (nome, tamanho, data).
// - O backup antigo só é apagado depois que o novo foi gravado e conferido.
// Ler/restaurar: node scripts/backup.mjs (listar | baixar | restaurar).
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { put, list, del } from '@vercel/blob';
import { sql, usandoBanco, TOKEN_BLOB } from './store.mjs';

export const PASTA = 'backups-db/';
const MAGICA = Buffer.from('R1BK1');
const FORA = new Set(['sessoes', 'tentativas', 'oauth_codigos', 'oauth_tokens', 'raiox_sessoes', 'raiox_tentativas']);
const LOTE = 3 * 1024 * 1024; // a resposta do banco por HTTP tem limite de 10 MB
const DIAS_GUARDADOS = 2; // hoje e ontem
const MESES_GUARDADOS = 12;
const falha = (msg, status = 500) => Object.assign(new Error(msg), { status });

export function chave() {
  const k = Buffer.from(String(process.env.BACKUP_KEY || '').trim(), 'base64');
  if (k.length !== 32) throw falha('BACKUP_KEY ausente ou inválida (precisa de 32 bytes em base64).', 503);
  return k;
}

// Data de Brasília (UTC-3, sem horário de verão): "2026-11-09".
export const diaBR = (ms = Date.now()) => new Date(ms - 3 * 3600e3).toISOString().slice(0, 10);
const nome = (t) => '"' + String(t).replace(/"/g, '""') + '"';

async function tabelas() {
  const r = await sql`select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' order by 1`;
  return r.map((x) => x.t).filter((t) => !FORA.has(t));
}

// Lê uma tabela em lotes pequenos e entrega cada linha. Devolve quantas linhas saíram.
async function lerTabela(t, cadaLinha) {
  const linhas = await sql.query(`select ctid::text as id, octet_length(to_jsonb(x)::text) as n from ${nome(t)} x`);
  let lote = [], peso = 0, total = 0;
  const descarregar = async () => {
    if (!lote.length) return;
    const r = await sql.query(`select to_jsonb(x) as r from ${nome(t)} x where ctid = any($1::tid[])`, [lote]);
    for (const l of r) { cadaLinha(typeof l.r === 'string' ? JSON.parse(l.r) : l.r); total++; }
    lote = []; peso = 0;
  };
  for (const l of linhas) {
    if (lote.length && (peso + Number(l.n) > LOTE || lote.length >= 2000)) await descarregar();
    lote.push(l.id); peso += Number(l.n);
  }
  await descarregar();
  // uma linha alterada no meio da leitura muda de lugar e pode ficar de fora: quem chama confere e repete
  return { lidas: total, esperadas: linhas.length };
}

async function listarBlobs(prefix) {
  const itens = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000, token: TOKEN_BLOB });
    itens.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return itens;
}

// Monta o arquivo: linhas JSON → gzip → AES-256-GCM. Formato: "R1BK1" + iv (12) + dados + etiqueta (16).
export async function montar() {
  const k = chave();
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', k, iv);
  const gz = zlib.createGzip({ level: 6 });
  const partes = [MAGICA, iv];
  cifra.on('data', (p) => partes.push(p));
  const fim = new Promise((ok, ruim) => { cifra.on('end', ok); cifra.on('error', ruim); gz.on('error', ruim); });
  gz.pipe(cifra);
  const escrever = (o) => new Promise((ok) => { if (gz.write(JSON.stringify(o) + '\n')) ok(); else gz.once('drain', ok); });

  const lista = await tabelas();
  const contagem = {};
  let bytes = 0;
  await escrever({ tipo: 'cabecalho', versao: 1, criado_em: new Date().toISOString(), tabelas: lista });
  for (const t of lista) {
    for (let tentativa = 1; ; tentativa++) {
      const fila = [];
      const r = await lerTabela(t, (linha) => fila.push(linha));
      if (r.lidas !== r.esperadas && tentativa < 3) continue; // a tabela mudou durante a leitura: lê de novo
      if (r.lidas !== r.esperadas) throw falha(`Tabela ${t}: li ${r.lidas} de ${r.esperadas} linhas.`);
      for (const linha of fila) { const o = { t, r: linha }; bytes += JSON.stringify(o).length; await escrever(o); }
      contagem[t] = r.lidas;
      break;
    }
  }
  // lista das imagens e vídeos (o conteúdo fica no Blob; aqui vai o inventário)
  let imagens = 0;
  if (TOKEN_BLOB) {
    for (const b of await listarBlobs('wp-content/')) { await escrever({ blob: { caminho: b.pathname, bytes: b.size, em: b.uploadedAt } }); imagens++; }
  }
  await escrever({ tipo: 'fim', contagem, imagens });
  gz.end();
  await fim;
  partes.push(cifra.getAuthTag());
  return { arquivo: Buffer.concat(partes), contagem, imagens, bytesAbertos: bytes };
}

// Abre um arquivo de backup: devolve o texto (uma linha JSON por registro). Erra se a chave não for a certa.
export function abrir(arquivo) {
  if (arquivo.length < 40 || !arquivo.subarray(0, 5).equals(MAGICA)) throw falha('Este arquivo não é um backup do painel.', 400);
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), arquivo.subarray(5, 17));
  d.setAuthTag(arquivo.subarray(arquivo.length - 16));
  const gz = Buffer.concat([d.update(arquivo.subarray(17, arquivo.length - 16)), d.final()]);
  return zlib.gunzipSync(gz).toString('utf8');
}

const RE_DIARIO = /^backups-db\/diario\/(\d{4}-\d{2}-\d{2})-[A-Za-z0-9]+\.r1bk$/;
const RE_MENSAL = /^backups-db\/mensal\/(\d{4}-\d{2})-[A-Za-z0-9]+\.r1bk$/;

export async function listarBackups() {
  if (!TOKEN_BLOB) return [];
  return (await listarBlobs(PASTA))
    .map((b) => {
      const d = RE_DIARIO.exec(b.pathname), m = RE_MENSAL.exec(b.pathname);
      return d || m ? { tipo: d ? 'diario' : 'mensal', data: (d || m)[1], caminho: b.pathname, bytes: b.size, em: b.uploadedAt, url: b.url } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.tipo + a.data < b.tipo + b.data ? 1 : -1));
}

const gravarBlob = (caminho, arquivo) => put(caminho, arquivo, {
  access: 'public', addRandomSuffix: true, contentType: 'application/octet-stream',
  cacheControlMaxAge: 60, multipart: arquivo.length > 4 * 1024 * 1024, token: TOKEN_BLOB,
});

// Faz o backup de hoje (e o do mês, se ainda não houver) e apaga os que passaram do prazo.
export async function fazerBackup() {
  if (!usandoBanco) throw falha('Banco de dados não conectado.', 503);
  if (!TOKEN_BLOB) throw falha('Conecte um Vercel Blob ao projeto.', 503);
  const inicio = Date.now();
  const hoje = diaBR(), mes = hoje.slice(0, 7);
  const { arquivo, contagem, imagens, bytesAbertos } = await montar();
  abrir(arquivo); // confere que o arquivo abre com a chave antes de mexer nos antigos

  const antes = await listarBackups();
  const novo = await gravarBlob(`${PASTA}diario/${hoje}.r1bk`, arquivo);
  let mensal = null;
  if (!antes.some((b) => b.tipo === 'mensal' && b.data === mes)) mensal = await gravarBlob(`${PASTA}mensal/${mes}.r1bk`, arquivo);

  // só agora, com o novo gravado, saem os antigos
  const limiteDia = diaBR(Date.now() - (DIAS_GUARDADOS - 1) * 864e5);
  const meses = [...new Set([...antes.filter((b) => b.tipo === 'mensal').map((b) => b.data), mes])].sort().slice(-MESES_GUARDADOS);
  const apagar = antes.filter((b) => (b.tipo === 'diario' ? b.data < limiteDia || b.data === hoje : !meses.includes(b.data)));
  if (apagar.length) await del(apagar.map((b) => b.url), { token: TOKEN_BLOB });

  return {
    ok: true, dia: hoje, bytes: arquivo.length, bytesAbertos, tabelas: contagem, imagens,
    diario: novo.pathname, mensal: mensal ? mensal.pathname : null,
    apagados: apagar.map((b) => b.caminho), segundos: Math.round((Date.now() - inicio) / 1000),
  };
}

// Faxina diária: tira do banco o que já venceu (menos segredo guardado) e os pedaços de vídeo esquecidos no Blob.
export async function faxina() {
  const feito = {};
  const tentar = async (rotulo, fn) => { try { feito[rotulo] = await fn(); } catch (e) { feito[rotulo] = 'erro: ' + e.message.slice(0, 80); } };
  await tentar('sessoes', async () => (await sql`delete from sessoes where usada_em < now() - interval '12 hours' or criada_em < now() - interval '7 days' returning 1`).length);
  await tentar('tentativas', async () => (await sql`delete from tentativas where em < now() - interval '1 day' returning 1`).length);
  await tentar('oauth_codigos', async () => (await sql`delete from oauth_codigos where expira_em < now() returning 1`).length);
  await tentar('oauth_tokens', async () => (await sql`delete from oauth_tokens where expira_em < now() returning 1`).length);
  // cadastro de conector sem nenhum token válido há mais de 60 dias (nunca entrou ou foi abandonado)
  await tentar('oauth_clientes', async () => (await sql`delete from oauth_clientes c where c.criado_em < now() - interval '60 days'
    and not exists (select 1 from oauth_tokens t where t.client_id = c.client_id) returning 1`).length);
  await tentar('raiox_sessoes', async () => (await sql`delete from raiox_sessoes where usada_em < now() - interval '12 hours' or criada_em < now() - interval '7 days' returning 1`).length);
  await tentar('raiox_tentativas', async () => (await sql`delete from raiox_tentativas where em < now() - interval '1 day' returning 1`).length);
  await tentar('fabrica_tmp', async () => {
    if (!TOKEN_BLOB) return 0;
    const velhos = (await listarBlobs('fabrica-tmp/')).filter((b) => Date.now() - new Date(b.uploadedAt) > 24 * 3600e3);
    if (velhos.length) await del(velhos.map((b) => b.url), { token: TOKEN_BLOB });
    return velhos.length;
  });
  return feito;
}
