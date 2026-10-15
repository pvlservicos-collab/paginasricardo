// Cria um usuário do painel (ou troca a senha dele) com uma senha forte gerada na hora.
//   node scripts/usuarios.mjs <login> <admin|editor> [email] [nome]
// Usa o DATABASE_URL do arquivo .env.local (o mesmo banco da Vercel). A senha aparece só aqui, uma vez;
// no banco fica apenas o hash. Trocar a senha encerra as sessões abertas desse usuário.
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

const [login, papel, email = null, nome] = process.argv.slice(2);
if (!login || !['admin', 'editor'].includes(papel)) {
  console.log('Uso: node scripts/usuarios.mjs <login> <admin|editor> [email] [nome]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) { console.log('Falta DATABASE_URL (coloque no .env.local).'); process.exit(1); }
const { salvarUsuario, senhaForte } = await import('../lib/auth.mjs');
const senha = senhaForte();
await salvarUsuario({ login, email, nome: nome || login, papel, senha });
console.log(`Usuário: ${login.toLowerCase()}  ·  papel: ${papel}\nSenha:   ${senha}`);
