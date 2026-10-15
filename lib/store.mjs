// Onde os arquivos do projeto são lidos e gravados.
// - Na Vercel com o banco Postgres (Neon) ligado ao projeto: tudo fica no banco (tabela "arquivos"),
//   e as imagens dos criativos no Vercel Blob. As páginas são servidas direto do banco, então cada
//   alteração entra no ar na hora, sem deploy. Na primeira vez, o banco é preenchido com o que
//   está no repositório (paginas/ e criativos/).
// - Na Vercel com GITHUB_TOKEN e GITHUB_REPO (sem banco): lê e grava direto no repositório do GitHub.
// - No computador (npm run dev), sem banco: lê e grava na pasta do projeto.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { neon } from '@neondatabase/serverless';
import { put, del, get } from '@vercel/blob';

const URL_BANCO = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING;
const TOKEN_BLOB = process.env.BLOB_READ_WRITE_TOKEN;
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO; // ex.: grupor1/paginas
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const RAIZ = process.env.PROJETO_RAIZ || process.cwd();

export const usandoBanco = Boolean(URL_BANCO);
export const usandoGitHub = !usandoBanco && Boolean(TOKEN && REPO);
export const podeGravar = usandoBanco || usandoGitHub || !process.env.VERCEL;

/* ---------------- banco (Neon / Postgres) ---------------- */
const sql = usandoBanco ? neon(URL_BANCO) : null;
const ehTexto = (caminho) => /\.(html?|json|txt|css|js|svg)$/i.test(caminho);

let pronto = null;
// Cria a tabela e, se estiver vazia, copia para ela o que está no repositório.
function preparar() {
  if (!pronto) {
    pronto = (async () => {
      await sql`create table if not exists arquivos (
        caminho text primary key,
        texto text,
        blob_url text,
        blob_acesso text,
        atualizado_em timestamptz not null default now()
      )`;
      const [{ n }] = await sql`select count(*)::int as n from arquivos`;
      if (n > 0) return;
      for (const pasta of ['paginas', 'criativos']) {
        let nomes = [];
        try { nomes = (await fs.readdir(path.join(RAIZ, pasta), { withFileTypes: true })).filter((i) => i.isFile() && i.name !== '.gitkeep').map((i) => i.name); } catch {}
        for (const nome of nomes) {
          const caminho = `${pasta}/${nome}`;
          const conteudo = await fs.readFile(path.join(RAIZ, caminho));
          await gravarNoBanco(caminho, ehTexto(caminho) ? conteudo.toString('utf8') : conteudo, { soSeNaoExistir: true });
        }
      }
    })().catch((e) => { pronto = null; throw e; });
  }
  return pronto;
}

async function subirBlob(caminho, bytes) {
  if (!TOKEN_BLOB) throw new Error('Conecte um Vercel Blob ao projeto para guardar imagens.');
  for (const acesso of ['private', 'public']) {
    try {
      const r = await put(caminho, bytes, { access: acesso, addRandomSuffix: true, token: TOKEN_BLOB });
      return { url: r.url, acesso };
    } catch (e) {
      if (acesso === 'public') throw e; // store pública não aceita "private": tenta "public"
    }
  }
}

async function gravarNoBanco(caminho, conteudo, { soSeNaoExistir = false } = {}) {
  if (typeof conteudo === 'string') {
    if (soSeNaoExistir) await sql`insert into arquivos (caminho, texto) values (${caminho}, ${conteudo}) on conflict (caminho) do nothing`;
    else await sql`insert into arquivos (caminho, texto, blob_url, blob_acesso, atualizado_em) values (${caminho}, ${conteudo}, null, null, now())
      on conflict (caminho) do update set texto = excluded.texto, blob_url = null, blob_acesso = null, atualizado_em = now()`;
    return;
  }
  const b = await subirBlob(caminho, conteudo);
  await sql`insert into arquivos (caminho, texto, blob_url, blob_acesso, atualizado_em) values (${caminho}, null, ${b.url}, ${b.acesso}, now())
    on conflict (caminho) do update set texto = null, blob_url = excluded.blob_url, blob_acesso = excluded.blob_acesso, atualizado_em = now()`;
}

async function lerDoBanco(rel, bytes) {
  await preparar();
  const [linha] = await sql`select texto, blob_url, blob_acesso from arquivos where caminho = ${rel}`;
  if (!linha) return null;
  if (linha.texto != null) return bytes ? Buffer.from(linha.texto) : linha.texto;
  if (!linha.blob_url) return null;
  const r = await get(linha.blob_url, { access: linha.blob_acesso || 'public', token: TOKEN_BLOB });
  if (!r?.stream) return null;
  const buf = Buffer.from(await new Response(r.stream).arrayBuffer());
  return bytes ? buf : buf.toString('utf8');
}

/* ---------------- GitHub ---------------- */
async function gh(caminho, opcoes = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: opcoes.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'painel-r1',
      ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  if (opcoes.raw) return opcoes.bytes ? Buffer.from(await r.arrayBuffer()) : r.text();
  return r.json();
}

const cod = (p) => p.split('/').map(encodeURIComponent).join('/');

/* ---------------- interface usada pelo resto do projeto ---------------- */
export async function lerArquivo(rel, { bytes = false } = {}) {
  if (usandoBanco) return lerDoBanco(rel, bytes);
  if (usandoGitHub) return gh(`/contents/${cod(rel)}?ref=${BRANCH}`, { raw: true, bytes });
  try {
    return await fs.readFile(path.join(RAIZ, rel), bytes ? undefined : 'utf8');
  } catch {
    return null;
  }
}

// Lê vários de uma vez (o servidor das páginas usa para buscar config + HTML numa ida só ao banco).
export async function lerArquivos(rels) {
  if (usandoBanco) {
    await preparar();
    const linhas = await sql`select caminho, texto from arquivos where caminho = any(${rels})`;
    const m = new Map(linhas.map((l) => [l.caminho, l.texto]));
    return rels.map((r) => m.get(r) ?? null);
  }
  return Promise.all(rels.map((r) => lerArquivo(r)));
}

export async function listarPasta(rel) {
  if (usandoBanco) {
    await preparar();
    const linhas = await sql`select caminho from arquivos where caminho like ${rel + '/%'}`;
    return linhas.map((l) => l.caminho.slice(rel.length + 1)).filter((n) => n && !n.includes('/'));
  }
  if (usandoGitHub) {
    const itens = await gh(`/contents/${cod(rel)}?ref=${BRANCH}`);
    return Array.isArray(itens) ? itens.filter((i) => i.type === 'file').map((i) => i.name) : [];
  }
  try {
    const itens = await fs.readdir(path.join(RAIZ, rel), { withFileTypes: true });
    return itens.filter((i) => i.isFile()).map((i) => i.name);
  } catch {
    return [];
  }
}

export async function shaAtual() {
  if (!usandoGitHub) return null;
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  return ref?.object?.sha || null;
}

// arquivos: [{ caminho, conteudo (string|Buffer) }] ou [{ caminho, apagar: true }]
export async function gravar(arquivos, mensagem) {
  if (!podeGravar) throw new Error('Edição desligada: conecte o banco Postgres ao projeto na Vercel.');
  if (usandoBanco) {
    await preparar();
    // imagens primeiro (se o upload falhar, nada muda no banco)
    for (const a of arquivos) if (!a.apagar && typeof a.conteudo !== 'string') await gravarNoBanco(a.caminho, a.conteudo);
    for (const a of arquivos) if (!a.apagar && typeof a.conteudo === 'string') await gravarNoBanco(a.caminho, a.conteudo);
    for (const a of arquivos.filter((x) => x.apagar)) {
      const [linha] = await sql`delete from arquivos where caminho = ${a.caminho} returning blob_url`;
      if (linha?.blob_url) await del(linha.blob_url, { token: TOKEN_BLOB }).catch(() => {});
    }
    return { sha: null };
  }
  if (!usandoGitHub) {
    for (const a of arquivos) {
      const destino = path.join(RAIZ, a.caminho);
      if (a.apagar) await fs.rm(destino, { force: true });
      else {
        await fs.mkdir(path.dirname(destino), { recursive: true });
        await fs.writeFile(destino, a.conteudo);
      }
    }
    return { sha: null };
  }
  const blobs = await Promise.all(
    arquivos.map(async (a) => {
      if (a.apagar) return { path: a.caminho, mode: '100644', type: 'blob', sha: null };
      const blob = await gh('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: Buffer.from(a.conteudo).toString('base64'), encoding: 'base64' }),
      });
      return { path: a.caminho, mode: '100644', type: 'blob', sha: blob.sha };
    }),
  );
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const ref = await gh(`/git/ref/heads/${BRANCH}`);
    const pai = ref.object.sha;
    const commitPai = await gh(`/git/commits/${pai}`);
    const arvore = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commitPai.tree.sha, tree: blobs }) });
    const commit = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: `${mensagem}\n\n[painel]`, tree: arvore.sha, parents: [pai] }),
    });
    try {
      await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
      return { sha: commit.sha };
    } catch (e) {
      if (tentativa === 2) throw e; // outra gravação entrou no meio: tenta de novo em cima dela
    }
  }
}
