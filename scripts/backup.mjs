// Backups do banco (ver lib/backup.mjs). Usa DATABASE_URL, BLOB_READ_WRITE_TOKEN e BACKUP_KEY do .env.local.
//   node scripts/backup.mjs listar                        → backups guardados no Vercel Blob
//   node scripts/backup.mjs agora                         → faz o backup de hoje agora (mesma regra do cron)
//   node scripts/backup.mjs baixar [data|ultimo] [pasta]  → baixa, abre e salva em <pasta>/backup-<data>.ndjson
//                                                           e as páginas em <pasta>/paginas-<data>/
//   node scripts/backup.mjs restaurar <arquivo.ndjson> <tabela> --confirmar
//        → devolve ao banco as linhas dessa tabela que NÃO existem mais (não sobrescreve o que está lá)
// Sem a BACKUP_KEY o arquivo não abre: guarde uma cópia dela fora da Vercel (gerenciador de senhas).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const linha of (await fs.readFile(path.join(RAIZ, '.env.local'), 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/.exec(linha);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const { fazerBackup, faxina, listarBackups, abrir } = await import('../lib/backup.mjs');
const { sql } = await import('../lib/store.mjs');
const [cmd, a1, a2] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

if (cmd === 'listar') {
  const l = await listarBackups();
  if (!l.length) console.log('Nenhum backup guardado.');
  for (const b of l) console.log(`${b.tipo.padEnd(7)} ${b.data.padEnd(10)} ${mb(b.bytes).padStart(10)}  gravado em ${new Date(b.em).toISOString()}`);
} else if (cmd === 'agora') {
  const r = await fazerBackup();
  console.log(`Backup de ${r.dia}: ${mb(r.bytes)} (aberto: ${mb(r.bytesAbertos)}) em ${r.segundos}s`);
  console.log('Tabelas:', r.tabelas, '· imagens listadas:', r.imagens);
  console.log('Mensal:', r.mensal ? 'criado' : 'já existia o deste mês', '· apagados:', r.apagados.length ? r.apagados : 'nenhum');
  if (process.argv.includes('--faxina')) console.log('Faxina:', await faxina());
} else if (cmd === 'baixar') {
  const l = await listarBackups();
  const b = !a1 || a1 === 'ultimo' ? l.filter((x) => x.tipo === 'diario')[0] || l[0] : l.find((x) => x.data === a1);
  if (!b) { console.error('Backup não encontrado. Veja: node scripts/backup.mjs listar'); process.exit(1); }
  const texto = abrir(Buffer.from(await (await fetch(b.url)).arrayBuffer()));
  const pasta = path.resolve(a2 || '.');
  await fs.mkdir(pasta, { recursive: true });
  const destino = path.join(pasta, `backup-${b.data}.ndjson`);
  await fs.writeFile(destino, texto);
  const pastaPaginas = path.join(pasta, `paginas-${b.data}`);
  let n = 0;
  for (const linha of texto.split('\n')) {
    if (!linha.startsWith('{"t":"arquivos"')) continue;
    const { r } = JSON.parse(linha);
    if (r.texto == null || !/^[A-Za-z0-9._/-]+$/.test(r.caminho) || r.caminho.includes('..')) continue;
    const alvo = path.join(pastaPaginas, r.caminho);
    await fs.mkdir(path.dirname(alvo), { recursive: true });
    await fs.writeFile(alvo, r.texto); n++;
  }
  console.log(`Aberto: ${destino} (${mb(texto.length)})\nPáginas e configurações: ${n} arquivo(s) em ${pastaPaginas}`);
  console.log('ATENÇÃO: este arquivo tem dados de leads e hashes de senha. Apague depois de usar.');
} else if (cmd === 'restaurar') {
  if (!a1 || !a2 || !process.argv.includes('--confirmar')) { console.error('Uso: node scripts/backup.mjs restaurar <arquivo.ndjson> <tabela> --confirmar'); process.exit(1); }
  if (!/^[a-z_][a-z0-9_]{0,60}$/.test(a2)) { console.error('Tabela inválida.'); process.exit(1); }
  const prefixo = `{"t":"${a2}"`;
  let lidas = 0, voltaram = 0;
  for (const linha of (await fs.readFile(a1, 'utf8')).split('\n')) {
    if (!linha.startsWith(prefixo)) continue;
    lidas++;
    const r = await sql.query(`insert into "${a2}" select * from jsonb_populate_record(null::"${a2}", $1::jsonb) on conflict do nothing returning 1`, [JSON.stringify(JSON.parse(linha).r)]);
    voltaram += r.length;
  }
  console.log(`${a2}: ${lidas} linha(s) no backup, ${voltaram} devolvida(s) ao banco (as outras já existiam).`);
} else {
  console.log('Uso: node scripts/backup.mjs listar | agora | baixar [data|ultimo] [pasta] | restaurar <arquivo> <tabela> --confirmar');
}
