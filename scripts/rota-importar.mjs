// Importa para o Postgres da VPS:
//  1) o rota-dump.json (contas e estados vindos do Netlify, gerado por scripts/rota-exportar.mjs);
//  2) o conteúdo do app (lib/rota/dados/: membros, e-mails de membros, intenções, livro, minutagem) para a tabela
//     rota_dados. Esse conteúdo NÃO vai para o git (repositório público); só existe no banco e nas cópias locais.
//
// Uso:  node scripts/rota-importar.mjs <caminho>/rota-dump.json [--so-novos]
//       node scripts/rota-importar.mjs --so-dados            (só atualiza o conteúdo, ex.: lista de membros nova)
//
// --so-novos: segunda passada depois da troca. Conta só entra se ainda não existir; estado só é atualizado se o
//             do Netlify for mais novo (campo atualizado). Assim nada que já foi gravado no backend novo é sobrescrito.
// Sem flag: atualiza todos os e-mails do arquivo (idempotente). Não apaga nada.
// Lê o banco do .env.local (BANCO_URL).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const linha of (await fs.readFile(path.join(RAIZ, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const args = process.argv.slice(2);
const soNovos = args.includes('--so-novos'), soDados = args.includes('--so-dados');
const arq = args.find((a) => !a.startsWith('--'));
if (!arq && !soDados) { console.error('Uso: node scripts/rota-importar.mjs <caminho>/rota-dump.json [--so-novos] | --so-dados'); process.exit(1); }

const { prepararRota, normalizarEmail } = await import('../lib/rota/base.mjs');
const { sql, usandoBanco, bancoAtual } = await import('../lib/store.mjs');
if (!usandoBanco) { console.error('Banco não conectado. Confira BANCO_URL no .env.local.'); process.exit(1); }
console.log('Banco:', bancoAtual);
await prepararRota();

/* ---------- conteúdo do app ---------- */
const PASTA = path.join(RAIZ, 'lib/rota/dados');
const conteudo = {
  membros: async () => JSON.stringify(JSON.parse(await fs.readFile(path.join(PASTA, 'membros.json'), 'utf8'))),
  'emails-membros': async () => JSON.stringify(JSON.parse(await fs.readFile(path.join(PASTA, 'emails-membros.json'), 'utf8'))),
  intencoes: async () => JSON.stringify(JSON.parse(await fs.readFile(path.join(PASTA, 'intencoes.json'), 'utf8'))),
  minutagem: async () => JSON.stringify(JSON.parse(await fs.readFile(path.join(PASTA, 'minutagem.json'), 'utf8'))),
  livro: async () => String((await import(pathToFileURL(path.join(PASTA, 'livro.js')).href)).default),
};
for (const [nome, ler] of Object.entries(conteudo)) {
  const valor = await ler();
  if (!valor || valor.length < 2) throw new Error(`Conteúdo vazio: ${nome}`);
  await sql`insert into rota_dados (nome, valor, atualizado) values (${nome}, ${valor}, now())
    on conflict (nome) do update set valor = excluded.valor, atualizado = now()`;
  console.log(`  conteúdo ${nome}: ${(valor.length / 1024).toFixed(0)} KB`);
}
if (soDados) process.exit(0);

/* ---------- contas e estados ---------- */
const dump = JSON.parse(await fs.readFile(arq, 'utf8'));
let nc = 0, ne = 0, pc = 0, pe = 0;
for (const [email, conta] of Object.entries(dump.contas || {})) {
  if (!conta || typeof conta !== 'object') continue;
  const e = normalizarEmail(conta.email || email);
  if (!e) continue;
  const r = soNovos
    ? await sql`insert into rota_contas (email, conta) values (${e}, ${JSON.stringify(conta)}::jsonb) on conflict (email) do nothing returning 1`
    : await sql`insert into rota_contas (email, conta) values (${e}, ${JSON.stringify(conta)}::jsonb)
        on conflict (email) do update set conta = excluded.conta, atualizado = now() returning 1`;
  r.length ? nc++ : pc++;
}
for (const [email, estado] of Object.entries(dump.estados || {})) {
  if (!estado || typeof estado !== 'object') continue;
  const e = normalizarEmail(email);
  if (!e) continue;
  const r = soNovos
    ? await sql`insert into rota_estados (email, estado) values (${e}, ${JSON.stringify(estado)}::jsonb)
        on conflict (email) do update set estado = excluded.estado, atualizado = now()
        where coalesce(rota_estados.estado->>'atualizado', '') < coalesce(excluded.estado->>'atualizado', '') returning 1`
    : await sql`insert into rota_estados (email, estado) values (${e}, ${JSON.stringify(estado)}::jsonb)
        on conflict (email) do update set estado = excluded.estado, atualizado = now() returning 1`;
  r.length ? ne++ : pe++;
}
const [{ c }] = await sql`select count(*)::int as c from rota_contas`;
const [{ s }] = await sql`select count(*)::int as s from rota_estados`;
console.log(`Gravado: ${nc} conta(s) e ${ne} estado(s)${soNovos ? ` (mantidos sem mudar: ${pc} conta(s), ${pe} estado(s))` : ''}.`);
console.log(`No banco agora: ${c} conta(s), ${s} estado(s).`);
process.exit(0);
