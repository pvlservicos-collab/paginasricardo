// Regras compartilhadas entre o build (gera as páginas estáticas) e a API do painel.
// Nada daqui vai para as páginas publicadas: elas saem como HTML puro.

export const PASTA_PAGINAS = 'paginas';
export const ARQUIVO_CONFIG = 'paginas/paginas.json';
export const PASTA_CRIATIVOS = 'criativos';

export function normalizarUrl(url) {
  return String(url || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/[?#].*$/, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/-{2,}/g, '-')
    .split('/').map((seg) => seg.replace(/^[-_]+|[-_]+$/g, '')).filter(Boolean).join('/');
}

export function slugDeArquivo(nome) {
  return nome.replace(/\.html?$/i, '');
}

export function configVazia() {
  return { dominio: '', paginas: [], redirecionamentos: [] };
}

// Junta o paginas.json com os .html que existem na pasta.
// Um .html que alguém subiu direto na pasta entra ativo, com a URL igual ao nome do arquivo.
export function mesclarConfig(cfgBruta, arquivosHtml) {
  const cfg = { ...configVazia(), ...(cfgBruta || {}) };
  const porArquivo = new Map((cfg.paginas || []).map((p) => [p.arquivo, p]));
  const paginas = [];
  let maiorOrdem = Math.max(0, ...(cfg.paginas || []).map((p) => p.ordem || 0));
  for (const arquivo of arquivosHtml) {
    const existente = porArquivo.get(arquivo);
    const slug = slugDeArquivo(arquivo);
    paginas.push({
      slug,
      arquivo,
      titulo: slug,
      url: slug,
      ativa: true,
      ordem: existente ? existente.ordem : ++maiorOrdem,
      redirecionarInativaPara: '',
      criativo: { imagem: '', texto: '', link: '' },
      notas: '',
      ...(existente || {}),
      slug,
      arquivo,
    });
  }
  paginas.sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  cfg.paginas = paginas;
  cfg.redirecionamentos = (cfg.redirecionamentos || []).filter((r) => r && r.de && r.para);
  return cfg;
}

// Remove os campos derivados antes de salvar o JSON.
export function configParaSalvar(cfg) {
  return JSON.stringify(
    {
      dominio: cfg.dominio || '',
      paginas: cfg.paginas.map(({ slug, ...p }) => p),
      redirecionamentos: cfg.redirecionamentos || [],
    },
    null,
    2,
  ) + '\n';
}

export function validarUrls(cfg) {
  const vistos = new Map();
  const reservadas = new Set(['api', 'painel', 'wp-content', 'criativos', '404']);
  for (const p of cfg.paginas) {
    const u = normalizarUrl(p.url);
    if (!u) return `A página "${p.titulo}" está sem URL.`;
    if (reservadas.has(u.split('/')[0])) return `A URL "/${u}" é reservada pelo sistema.`;
    if (vistos.has(u)) return `A URL "/${u}" está em duas páginas: "${vistos.get(u)}" e "${p.titulo}".`;
    vistos.set(u, p.titulo);
  }
  return null;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// O HTML que sai do WordPress é um fragmento (sem <html>/<head>).
// Aqui vira um documento completo, levando para o <head> as tags de meta/link
// que estavam antes do conteúdo. O conteúdo em si não é alterado.
export function montarDocumento(html, titulo) {
  let frag = String(html).replace(/<!--\s*\/?wp:[^>]*-->/g, '').trim();
  if (/<html[\s>]/i.test(frag)) return frag;
  const corte = frag.search(/<(div|section|main|header|body)[\s>]/i);
  let prefixo = corte > 0 ? frag.slice(0, corte) : '';
  let corpo = corte > 0 ? frag.slice(corte) : frag;
  const head = [];
  prefixo = prefixo.replace(/<noscript>[\s\S]*?<\/noscript>|<meta\b[^>]*>|<link\b[^>]*>/gi, (tag) => {
    head.push(tag);
    return '';
  });
  const temTitulo = /<title>/i.test(frag);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${temTitulo ? '' : `<title>${esc(titulo || 'Grupo R1')}</title>\n`}${head.join('\n')}
<style>html,body{margin:0;padding:0;background:#0b0b0c}</style>
</head>
<body>
${prefixo.trim()}
${corpo}
</body>
</html>
`;
}

export function documentoRedirecionamento(destino, titulo) {
  const alvo = '/' + normalizarUrl(destino);
  return `<!doctype html><html lang="pt-BR" data-redirecionamento><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo || 'Redirecionando')}</title><meta http-equiv="refresh" content="0;url=${esc(alvo)}"><script>location.replace(${JSON.stringify(alvo)}+location.search+location.hash)</script><style>body{margin:0;background:#0b0b0c}</style></head><body></body></html>\n`;
}

export function documentoInativo(titulo) {
  return `<!doctype html><html lang="pt-BR" data-pagina-inativa><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página indisponível</title><style>html,body{margin:0;height:100%;background:#0b0b0c;color:#f2f2f2;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}main{min-height:100%;display:grid;place-items:center;text-align:center;padding:24px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#9a9a9a}</style></head><body><main><div><h1>Esta página não está disponível no momento.</h1><p>Grupo R1</p></div></main></body></html>\n`;
}

// Extrai a copy principal para comparar com o criativo no funil.
export function extrairCopy(html) {
  const limpar = (s) => s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const um = (re) => { const m = re.exec(html); return m ? limpar(m[1]) : ''; };
  const h2 = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => limpar(m[1])).filter(Boolean);
  const ctas = [...new Set([...html.matchAll(/<a[^>]*class="[^"]*btn[^"]*"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => limpar(m[1])).filter(Boolean))];
  const formIds = [...new Set([...html.matchAll(/data-form-id="([0-9a-f-]{36})"/gi)].map((m) => m[1]))];
  return {
    topo: um(/<div class="topbar5"[^>]*>([\s\S]*?)<\/div>/i),
    h1: um(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
    sub: um(/<p class="sub"[^>]*>([\s\S]*?)<\/p>/i),
    h2,
    ctas,
    formIds,
  };
}
