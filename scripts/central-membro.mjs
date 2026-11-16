// Cria um membro da Central R1 (ou gera senha nova, se já existir). A senha aparece uma única vez.
// Uso: node scripts/central-membro.mjs <e-mail ou usuário> <admin|membro> "<Nome>"
// Precisa do banco no .env.local. Depois do primeiro admin, o resto se faz na tela /gestao-membros.
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

const [login, papel, ...resto] = process.argv.slice(2);
const nome = resto.join(' ');
if (!login || !['admin', 'membro'].includes(papel) || !nome) {
  console.error('Uso: node scripts/central-membro.mjs <e-mail ou usuário> <admin|membro> "<Nome>"');
  process.exit(1);
}
const { criarMembro, novaSenha, alterarMembro, registrar, HOST_CENTRAL } = await import('../lib/central.mjs');
let r;
try {
  r = await criarMembro({ login, nome, papel }, 'script');
  await registrar('central_membro_criado', { usuario: 'script', ip: 'local', detalhe: { login: r.login, papel } });
} catch (e) {
  if (e.status !== 409) throw e;
  r = await novaSenha(login, 'script');
  await alterarMembro(login, { nome, papel, ativo: true });
  await registrar('central_senha_nova', { usuario: 'script', ip: 'local', detalhe: { login: r.login } });
  console.log('(já existia: senha nova gerada, sessões antigas encerradas)');
}
console.log(`\nCentral R1 — ${papel}\nEndereço: https://${HOST_CENTRAL}/gestao-membros\nE-mail:   ${r.login}\nSenha:    ${r.senha}\n\nGuarde agora: a senha não aparece de novo.`);
process.exit(0);
