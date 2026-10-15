// Onde os arquivos do projeto são lidos e gravados.
// - Na Vercel (com GITHUB_TOKEN e GITHUB_REPO): lê e grava direto no repositório do GitHub.
//   Cada gravação vira um commit, a Vercel refaz o deploy e as páginas continuam 100% estáticas.
// - No computador (npm run dev): lê e grava na pasta do projeto.
import { promises as fs } from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.GITHUB_TOKEN;
const REPO = process.env.GITHUB_REPO; // ex.: grupor1/paginas
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const RAIZ = process.env.PROJETO_RAIZ || process.cwd();

export const usandoGitHub = Boolean(TOKEN && REPO);
export const podeGravar = usandoGitHub || !process.env.VERCEL;

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

export async function lerArquivo(rel, { bytes = false } = {}) {
  if (usandoGitHub) return gh(`/contents/${cod(rel)}?ref=${BRANCH}`, { raw: true, bytes });
  try {
    return await fs.readFile(path.join(RAIZ, rel), bytes ? undefined : 'utf8');
  } catch {
    return null;
  }
}

export async function listarPasta(rel) {
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
  if (!podeGravar) throw new Error('Edição desligada: configure GITHUB_TOKEN e GITHUB_REPO na Vercel.');
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
