// Exporta as CONTAS e os ESTADOS do Netlify Blobs do app Rota do Bilhão para um arquivo rota-dump.json,
// que depois é importado no Postgres da VPS com scripts/rota-importar.mjs.
//
// Precisa de acesso ao Netlify (um token pessoal) e do @netlify/blobs instalado. O jeito mais fácil é rodar
// de dentro da pasta `api/` do projeto baixado (lá o @netlify/blobs já está nas dependências):
//
//   cd app-rota-do-bilhao/api
//   npm install
//   NETLIFY_AUTH_TOKEN=<seu-token> node <caminho>/scripts/rota-exportar.mjs
//
// Token pessoal do Netlify: https://app.netlify.com/user/applications#personal-access-tokens
// (O site id já vem certo; mude com ROTA_SITE_ID se precisar.)
import { promises as fs } from 'node:fs';

const SITE = process.env.ROTA_SITE_ID || 'e7ba9fe9-afcb-43e6-93f2-034bba1526d1';
const TOKEN = process.env.NETLIFY_AUTH_TOKEN;
if (!TOKEN) { console.error('Defina NETLIFY_AUTH_TOKEN (token pessoal do Netlify).'); process.exit(1); }

let getStore;
try { ({ getStore } = await import('@netlify/blobs')); }
catch { console.error('Rode este script de uma pasta onde o @netlify/blobs esteja instalado (ex.: a pasta api/ do projeto baixado).'); process.exit(1); }

const emailDe = (k) => Buffer.from(k, 'base64url').toString();

async function baixar(nome) {
  const store = getStore({ name: nome, siteID: SITE, token: TOKEN, consistency: 'strong' });
  const out = {};
  for await (const pagina of store.list({ paginate: true })) {
    for (const b of pagina.blobs) {
      try { out[emailDe(b.key)] = await store.get(b.key, { type: 'json' }); }
      catch (e) { console.warn('Falhou em', b.key, '-', e.message); }
    }
  }
  return out;
}

const contas = await baixar('contas');
const estados = await baixar('estados');
await fs.writeFile('rota-dump.json', JSON.stringify({ contas, estados, em: new Date().toISOString() }, null, 0));
console.log(`Exportado: ${Object.keys(contas).length} conta(s) e ${Object.keys(estados).length} estado(s) → rota-dump.json`);
console.log('Agora rode, dentro do painel:  node scripts/rota-importar.mjs <caminho>/rota-dump.json');
