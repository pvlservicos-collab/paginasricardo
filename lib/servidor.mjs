// Utilidades usadas só pela API do painel (nunca pelas páginas).
import crypto from 'node:crypto';
import { lerArquivo, listarPasta, gravar } from './store.mjs';
import { sessaoAtual, registrar, ipDe } from './auth.mjs';
import { ARQUIVO_CONFIG, PASTA_PAGINAS, mesclarConfig, configParaSalvar, validarUrls } from './core.mjs';

/* ---------------- respostas ---------------- */
export const json = (dados, status = 200, extra = {}) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

export const erro = (mensagem, status = 400) => json({ erro: mensagem }, status);
const falha = (mensagem, status) => Object.assign(new Error(mensagem), { status });

/* ---------------- proteção das rotas ---------------- */
// Pedidos que mudam algo precisam vir do próprio painel (mesma origem): bloqueia CSRF e chamadas de outros sites.
// Não há cabeçalhos CORS, então outros sites também não conseguem ler as respostas.
export function mesmaOrigem(request) {
  const origem = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site && !['same-origin', 'none'].includes(site)) return false;
  if (!origem) return Boolean(site); // navegadores atuais mandam um dos dois
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  try { return new URL(origem).host === host; } catch { return false; }
}

// Lê o corpo JSON com limite de tamanho (o HTML de uma página cabe folgado em 4 MB).
export async function lerJson(request, limite = 4 * 1024 * 1024) {
  if (!/^application\/json\b/i.test(request.headers.get('content-type') || '')) throw falha('Envie os dados em JSON.', 415);
  const texto = await request.text();
  if (texto.length > limite) throw falha('Conteúdo grande demais.', 413);
  try {
    const d = JSON.parse(texto);
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error();
    return d;
  } catch { throw falha('JSON inválido.', 400); }
}

// Envolve um handler exigindo login (e, se pedido, papel de admin), tratando erros com log estruturado.
// O handler recebe (request, url, usuario).
export function protegido(fn, { admin = false } = {}) {
  return async (request) => {
    const id = crypto.randomUUID().slice(0, 8);
    const url = new URL(request.url);
    if (!['GET', 'HEAD'].includes(request.method) && !mesmaOrigem(request)) {
      await registrar('origem_bloqueada', { ip: ipDe(request), detalhe: { rota: url.pathname, origem: request.headers.get('origin') } });
      return erro('Origem não permitida.', 403);
    }
    let sessao;
    try { sessao = await sessaoAtual(request); } catch (e) {
      console.error(JSON.stringify({ tipo: 'erro', id, rota: url.pathname, msg: e.message }));
      return erro(`Serviço indisponível (código ${id}).`, 503);
    }
    if (!sessao) return erro('Faça login para continuar.', 401);
    if (admin && sessao.usuario.papel !== 'admin') return erro('Esta função está em construção.', 403);
    let resposta;
    try {
      resposta = await fn(request, url, sessao.usuario);
    } catch (e) {
      const status = e.status || 500;
      console.error(JSON.stringify({ tipo: 'erro', id, rota: url.pathname, metodo: request.method, usuario: sessao.usuario.login, status, msg: e.message }));
      resposta = erro(status >= 500 ? `Erro inesperado (código ${id}). Tente de novo.` : e.message, status);
    }
    if (sessao.cookie) resposta.headers.append('Set-Cookie', sessao.cookie);
    return resposta;
  };
}

// Registra no log de eventos uma alteração feita pelo painel.
export const auditar = (usuario, acao, detalhe, request) => registrar(acao, { usuario: usuario.login, ip: ipDe(request), detalhe });

/* ---------------- validação de entrada ---------------- */
export const LIMITE_HTML = 3 * 1024 * 1024;
export function texto(v, max, nome) {
  if (v == null) return '';
  if (typeof v !== 'string') throw falha(`${nome} inválido.`, 400);
  if (v.length > max) throw falha(`${nome} muito longo (máx. ${max} caracteres).`, 400);
  return v;
}
export function htmlValido(v) {
  if (typeof v !== 'string' || v.trim().length < 20) throw falha('Cole o HTML da página.', 400);
  if (v.length > LIMITE_HTML) throw falha('HTML grande demais (máx. 3 MB).', 413);
  return v;
}
export function linkValido(v) {
  const t = texto(v, 500, 'Link').trim();
  if (!t) return '';
  try { const u = new URL(t); if (u.protocol === 'https:' || u.protocol === 'http:') return u.href; } catch {}
  throw falha('Link inválido: use um endereço começando com https://', 400);
}

/* ---------------- config das páginas ---------------- */
export async function carregarConfig() {
  const [bruta, arquivos] = await Promise.all([lerArquivo(ARQUIVO_CONFIG), listarPasta(PASTA_PAGINAS)]);
  const html = arquivos.filter((n) => /\.html?$/i.test(n)).sort();
  return mesclarConfig(bruta ? JSON.parse(bruta) : null, html);
}

export async function salvarConfig(cfg, mensagem, arquivosExtras = []) {
  const problema = validarUrls(cfg);
  if (problema) throw Object.assign(new Error(problema), { status: 409 });
  return gravar([{ caminho: ARQUIVO_CONFIG, conteudo: configParaSalvar(cfg) }, ...arquivosExtras], mensagem);
}

export function dominioBase(cfg, request) {
  const d = (cfg.dominio || '').trim().replace(/\/+$/, '');
  return d || new URL(request.url).origin;
}

/* ---------------- Redis (Upstash) para métricas ---------------- */
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const temRedis = Boolean(REDIS_URL && REDIS_TOKEN);

export async function redis(...comandos) {
  if (!temRedis) return comandos.map(() => null);
  const r = await fetch(`${REDIS_URL}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comandos),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}`);
  return (await r.json()).map((x) => x.result);
}

export const hashParaObjeto = (arr) => {
  const o = {};
  for (let i = 0; arr && i < arr.length; i += 2) o[arr[i]] = Number(arr[i + 1]) || arr[i + 1];
  return o;
};
