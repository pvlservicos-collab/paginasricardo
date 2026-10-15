// Conector do Claude (servidor MCP, transporte "Streamable HTTP" sem estado).
// Endereço para colar no Claude: https://<este-site>/api/mcp
// Login: OAuth (o Claude abre a tela /api/oauth/autorizar). Cada ferramenta age como o usuário que conectou,
// com as mesmas permissões e regras do painel, e tudo vai para o registro de eventos.
import { usuarioDoToken, origemDe } from '../lib/oauth.mjs';
import { registrar, ipDe } from '../lib/auth.mjs';
import { carregarConfig } from '../lib/servidor.mjs';
import { sql, usandoBanco } from '../lib/store.mjs';
import { linkDaPagina, hostDaPagina, hostPadrao, rastreioDaPagina, detectarRastreio, limparHost } from '../lib/core.mjs';
import { criarPagina, atualizarPagina, excluirPagina, acharPagina, htmlDaPagina } from '../lib/operacoes.mjs';
import { relatorioImagens, migrarImagens, salvarImagem, listarImagens, baixarImagem } from '../lib/imagens.mjs';

const VERSOES = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_ALTERACOES_HORA = 300;
const aviso = (msg) => Object.assign(new Error(msg), { status: 400 }); // erro que o Claude deve repassar ao usuário

const INSTRUCOES = `Este conector publica e edita landing pages no Painel de Páginas (Grupo R1).
Regras de uso:
1. Antes de CRIAR uma página, chame listar_opcoes e PERGUNTE ao usuário em qual domínio publicar, mostrando a lista de domínios como opções numeradas (e o padrão). Se houver mais de um pixel ou Clarity, pergunte também qual usar. Nunca escolha o domínio sozinho.
2. Mande o HTML completo e responsivo (pode ser um documento <!DOCTYPE html> inteiro). Não coloque o código do Pixel da Meta, do Clarity nem do Google Tag Manager no HTML: o sistema adiciona sozinho o que foi escolhido (sem deixar a página lenta) e envia o PageView também pela API de Conversões.
3. Depois de criar ou atualizar, mostre o relatório de imagens ao usuário: quantas já estão no nosso app e quantas vêm de domínios externos (diga quais domínios). Se houver externas, ofereça migrá-las com migrar_imagens para que tudo fique hospedado no nosso app.
4. Para usar uma imagem nova, envie-a com importar_imagem e use o link /wp-content/uploads/... que ela devolver.
5. Para trocar o domínio de uma página, use atualizar_pagina com o campo dominio (pergunte ao usuário antes).
6. Excluir é definitivo: confirme com o usuário e só então chame excluir_pagina com confirmar=true.
Sempre informe o link final da página ao usuário.`;

/* ---------------- ferramentas ---------------- */
function ferramentas(cfg, hostAtual) {
  const doms = cfg.dominios.length ? cfg.dominios : [hostPadrao(cfg, hostAtual)].filter(Boolean);
  const pix = ['nenhum', 'padrao', ...cfg.pixels.map((x) => x.id)];
  const cla = ['nenhum', 'padrao', ...cfg.clarities.map((x) => x.id)];
  const gtm = ['nenhum', 'padrao', ...cfg.gtms.map((x) => x.id)];
  const pagina = { type: 'string', description: 'URL da página (ex.: "black10x-v6" ou o link completo).' };
  return [
    { name: 'listar_opcoes', title: 'Domínios, pixels e Clarity disponíveis',
      description: 'Lista os domínios onde dá para publicar (e o padrão), os pixels da Meta e os Clarity cadastrados. Use antes de criar uma página para perguntar ao usuário em qual domínio publicar.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } },
    { name: 'listar_paginas', title: 'Listar páginas',
      description: 'Lista as páginas publicadas: URL, título, domínio, link, se está ativa, pixel e Clarity.',
      inputSchema: { type: 'object', properties: { busca: { type: 'string', description: 'Filtra por parte do título ou da URL (opcional).' } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } },
    { name: 'ver_pagina', title: 'Ver página',
      description: 'Mostra os dados de uma página, o relatório de imagens e (opcional) o HTML atual, para editar.',
      inputSchema: { type: 'object', properties: { pagina, incluir_html: { type: 'boolean', default: true } }, required: ['pagina'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } },
    { name: 'criar_pagina', title: 'Publicar página nova',
      description: 'Publica uma página nova com o HTML enviado. ANTES, pergunte ao usuário o domínio (lista de listar_opcoes). Devolve o link e o relatório de imagens (no app × externas).',
      inputSchema: { type: 'object', properties: {
        url: { type: 'string', description: 'Slug da página (ex.: "black10x-v6"). Vira https://dominio/slug.' },
        dominio: { type: 'string', enum: doms, description: 'Domínio escolhido pelo usuário.' },
        html: { type: 'string', description: 'HTML completo da página.' },
        titulo: { type: 'string', description: 'Nome da página no painel (opcional).' },
        ativa: { type: 'boolean', default: true, description: 'false = cria desativada.' },
        pixel: { type: 'string', enum: pix, description: 'Pixel da Meta (padrão = o do painel; nenhum = sem pixel).' },
        clarity: { type: 'string', enum: cla, description: 'Clarity (padrão = o do painel; nenhum = sem Clarity).' },
        gtm: { type: 'string', enum: gtm, description: 'Google Tag Manager (padrão = o do painel; nenhum = sem GTM).' },
        grupo: { type: 'string', description: 'Título do grupo onde a página entra no painel (opcional; cria se não existir).' },
      }, required: ['url', 'dominio', 'html'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false } },
    { name: 'atualizar_pagina', title: 'Editar página',
      description: 'Altera uma página existente: HTML, título, URL (a antiga continua redirecionando), domínio, ativa/desativada, pixel, Clarity ou GTM. Só os campos enviados mudam.',
      inputSchema: { type: 'object', properties: {
        pagina,
        html: { type: 'string', description: 'HTML novo completo (opcional).' },
        titulo: { type: 'string' },
        nova_url: { type: 'string', description: 'Novo slug (opcional).' },
        dominio: { type: 'string', enum: doms, description: 'Novo domínio (pergunte ao usuário).' },
        ativa: { type: 'boolean' },
        pixel: { type: 'string', enum: pix },
        clarity: { type: 'string', enum: cla },
        gtm: { type: 'string', enum: gtm },
        grupo: { type: 'string', description: 'Título do grupo ("nenhum" tira do grupo).' },
      }, required: ['pagina'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } },
    { name: 'excluir_pagina', title: 'Excluir página',
      description: 'Exclui a página de vez (sai do ar). Confirme com o usuário antes e envie confirmar=true.',
      inputSchema: { type: 'object', properties: { pagina, confirmar: { type: 'boolean', description: 'Precisa ser true.' } }, required: ['pagina', 'confirmar'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false } },
    { name: 'analisar_imagens', title: 'Onde estão as imagens',
      description: 'Diz quais imagens de uma página já estão no nosso app e quais vêm de domínios externos (e de quais domínios).',
      inputSchema: { type: 'object', properties: { pagina }, required: ['pagina'], additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } },
    { name: 'migrar_imagens', title: 'Trazer imagens para o app',
      description: 'Baixa as imagens externas da página, guarda no nosso app (Vercel Blob) e troca os links no HTML. Pode limitar a alguns domínios.',
      inputSchema: { type: 'object', properties: { pagina, dominios: { type: 'array', items: { type: 'string' }, description: 'Só estes domínios (opcional; vazio = todos).' } }, required: ['pagina'], additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } },
    { name: 'importar_imagem', title: 'Subir imagem',
      description: 'Guarda uma imagem no nosso app e devolve o link para usar no HTML. Envie o endereço da imagem (url) ou o conteúdo em base64.',
      inputSchema: { type: 'object', properties: {
        url: { type: 'string', description: 'Endereço https da imagem.' },
        base64: { type: 'string', description: 'Imagem em base64 (até ~3 MB).' },
        nome: { type: 'string', description: 'Nome do arquivo (opcional).' },
      }, additionalProperties: false },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true } },
    { name: 'listar_imagens', title: 'Imagens do app',
      description: 'Lista as imagens já guardadas no nosso app (links /wp-content/uploads/...).',
      inputSchema: { type: 'object', properties: { busca: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true, openWorldHint: false } },
  ];
}

const resumoPagina = (p, cfg, hostAtual, rastreio) => ({
  url: p.url, titulo: p.titulo, grupo: cfg.grupos.find((g) => g.id === p.grupo)?.titulo || null, dominio: hostDaPagina(p, cfg, hostAtual), link: linkDaPagina(p, cfg, hostAtual), ativa: p.ativa,
  pixel: rastreio?.pixel?.map((x) => x.id).join(', ') || rastreioDaPagina(p, cfg).pixelMeta || 'nenhum',
  clarity: rastreio?.clarity?.map((x) => x.id).join(', ') || rastreioDaPagina(p, cfg).clarity || 'nenhum',
  gtm: rastreio?.gtm?.map((x) => x.id).join(', ') || rastreioDaPagina(p, cfg).gtm || 'nenhum',
});

const resumoImagens = (r) => {
  const { itens, _itens, ...resto } = r;
  return { ...resto, externas_lista: itens.filter((i) => i.situacao.startsWith('externa')).map((i) => ({ url: i.url, dominio: i.dominio })).slice(0, 60) };
};

async function limiteAlteracoes(usuario) {
  if (!usandoBanco) return;
  const [{ n }] = await sql`select count(*)::int as n from eventos where usuario = ${usuario.login} and em > now() - interval '1 hour' and detalhe->>'origem' = 'claude'`;
  if (n >= MAX_ALTERACOES_HORA) throw aviso('Limite de alterações por hora atingido. Tente mais tarde.');
}

async function executar(nome, a, ctx) {
  const { usuario, hostAtual } = ctx;
  const quem = { login: usuario.login, papel: usuario.papel, ip: ctx.ip, origem: 'claude', hostAtual };
  const hostsApp = () => [hostAtual, ...ctx.cfg.dominios];
  switch (nome) {
    case 'listar_opcoes': {
      const cfg = ctx.cfg;
      const doms = cfg.dominios.length ? cfg.dominios : [hostPadrao(cfg, hostAtual)];
      return {
        dominios: doms.map((d) => ({ dominio: d, padrao: d === hostPadrao(cfg, hostAtual) })),
        pixels: cfg.pixels.map((x) => ({ ...x, padrao: x.id === cfg.pixelMeta })),
        clarities: cfg.clarities.map((x) => ({ ...x, padrao: x.id === cfg.clarity })),
        gtms: cfg.gtms.map((x) => ({ ...x, padrao: x.id === cfg.gtm })),
        grupos: cfg.grupos.map((g) => g.titulo),
        api_de_conversoes: cfg.pixels.filter((x) => process.env[`META_CAPI_TOKEN_${x.id}`]).map((x) => x.id),
        lembrete: 'Pergunte ao usuário em qual domínio publicar antes de criar a página.',
      };
    }
    case 'listar_paginas': {
      const b = String(a.busca || '').toLowerCase();
      return { paginas: ctx.cfg.paginas.filter((p) => !b || p.url.includes(b) || String(p.titulo).toLowerCase().includes(b)).map((p) => resumoPagina(p, ctx.cfg, hostAtual)) };
    }
    case 'ver_pagina': {
      const p = acharPagina(ctx.cfg, a.pagina);
      const html = await htmlDaPagina(p);
      return {
        pagina: resumoPagina(p, ctx.cfg, hostAtual, detectarRastreio(html, rastreioDaPagina(p, ctx.cfg))),
        imagens: resumoImagens(await relatorioImagens(html, { hostsApp: hostsApp() })),
        tamanho_html: html.length,
        ...(a.incluir_html === false ? {} : { html }),
      };
    }
    case 'criar_pagina': {
      await limiteAlteracoes(usuario);
      if (!a.dominio) throw aviso(`Pergunte ao usuário em qual domínio publicar. Opções: ${(ctx.cfg.dominios.length ? ctx.cfg.dominios : [hostPadrao(ctx.cfg, hostAtual)]).join(', ')}.`);
      const dominio = limparHost(a.dominio) === hostPadrao(ctx.cfg, hostAtual) && !ctx.cfg.dominios.length ? undefined : a.dominio;
      const { cfg, pagina, html } = await criarPagina({ url: a.url, titulo: a.titulo, html: a.html, ativa: a.ativa, dominio, pixel: a.pixel, clarity: a.clarity, gtm: a.gtm, grupo: a.grupo }, quem);
      return {
        ok: true, mensagem: 'Página publicada.', pagina: resumoPagina(pagina, cfg, hostAtual),
        imagens: resumoImagens(await relatorioImagens(html, { hostsApp: [hostAtual, ...cfg.dominios] })),
      };
    }
    case 'atualizar_pagina': {
      await limiteAlteracoes(usuario);
      acharPagina(ctx.cfg, a.pagina); // só páginas reais (nunca o laboratório)
      const { cfg, pagina, html, mudancas } = await atualizarPagina(a.pagina, {
        html: a.html, titulo: a.titulo, url: a.nova_url, dominio: a.dominio, ativa: a.ativa, pixel: a.pixel, clarity: a.clarity, gtm: a.gtm, grupo: a.grupo,
      }, quem);
      return {
        ok: true, mudancas, pagina: resumoPagina(pagina, cfg, hostAtual),
        ...(html ? { imagens: resumoImagens(await relatorioImagens(html, { hostsApp: [hostAtual, ...cfg.dominios] })) } : {}),
      };
    }
    case 'excluir_pagina': {
      acharPagina(ctx.cfg, a.pagina); // só páginas reais (nunca o laboratório)
      if (a.confirmar !== true) throw aviso('Confirme com o usuário e envie confirmar=true para excluir.');
      await limiteAlteracoes(usuario);
      const { pagina } = await excluirPagina(a.pagina, quem);
      return { ok: true, mensagem: `Página /${pagina.url} excluída.` };
    }
    case 'analisar_imagens': {
      const p = acharPagina(ctx.cfg, a.pagina);
      return { pagina: p.url, imagens: resumoImagens(await relatorioImagens(await htmlDaPagina(p), { hostsApp: hostsApp() })) };
    }
    case 'migrar_imagens': {
      await limiteAlteracoes(usuario);
      const p = acharPagina(ctx.cfg, a.pagina);
      const dominios = Array.isArray(a.dominios) ? a.dominios.filter((x) => typeof x === 'string').slice(0, 20) : null;
      const m = await migrarImagens(await htmlDaPagina(p), { hostsApp: hostsApp(), dominios });
      if (m.migradas.length) await atualizarPagina(p.slug, { html: m.html }, quem);
      await registrar('imagens_migradas', { usuario: usuario.login, ip: ctx.ip, detalhe: { url: p.url, migradas: m.migradas.length, falhas: m.falhas.length, origem: 'claude' } });
      return {
        ok: true, pagina: p.url, migradas: m.migradas, falhas: m.falhas, puladas: m.puladas,
        mensagem: m.migradas.length ? `${m.migradas.length} imagem(ns) agora estão no nosso app e a página já foi atualizada.` : 'Nenhuma imagem externa para migrar.',
        imagens_agora: resumoImagens(await relatorioImagens(m.migradas.length ? m.html : await htmlDaPagina(p), { hostsApp: hostsApp() })),
      };
    }
    case 'importar_imagem': {
      await limiteAlteracoes(usuario);
      let buf;
      if (a.url) buf = await baixarImagem(String(a.url)).catch((e) => { throw aviso(`Não consegui baixar a imagem: ${e.message}.`); });
      else if (a.base64) {
        const b = String(a.base64).replace(/^data:[^,]+,/, '');
        if (b.length > 4.5 * 1024 * 1024) throw aviso('Imagem grande demais (máx. ~3 MB em base64).');
        buf = Buffer.from(b, 'base64');
      } else throw aviso('Envie url ou base64.');
      const nome = a.nome || (a.url ? decodeURIComponent(new URL(a.url).pathname.split('/').pop() || '') : '') || 'imagem';
      const s = await salvarImagem(buf, nome);
      await registrar('imagem_enviada', { usuario: usuario.login, ip: ctx.ip, detalhe: { caminho: s.url, bytes: s.tamanho, origem: 'claude' } });
      return { ok: true, link: s.url, link_completo: `https://${hostPadrao(ctx.cfg, hostAtual)}${s.url}`, tamanho: s.tamanho, como_usar: `<img src="${s.url}" alt="...">` };
    }
    case 'listar_imagens': {
      const b = String(a.busca || '').toLowerCase();
      return { imagens: (await listarImagens()).filter((i) => !b || i.nome.includes(b)).slice(0, 200).map((i) => ({ link: i.url, tamanho: i.tamanho, em: i.em })) };
    }
    default:
      throw Object.assign(new Error(`Ferramenta desconhecida: ${nome}`), { rpc: -32602 });
  }
}

/* ---------------- JSON-RPC ---------------- */
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcErro = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

async function tratar(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return msg && 'id' in msg ? rpcErro(msg.id, -32600, 'Pedido inválido.') : null;
  const temId = 'id' in msg && msg.id !== null;
  if (!temId) return null; // notificações (ex.: notifications/initialized) não têm resposta
  const { id, method, params = {} } = msg;
  try {
    if (method === 'initialize') {
      const pedida = params.protocolVersion;
      return rpcOk(id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'painel-paginas-r1', title: 'Páginas R1', version: '1.0.0' },
        instructions: INSTRUCOES,
      });
    }
    if (method === 'ping') return rpcOk(id, {});
    if (method === 'tools/list') return rpcOk(id, { tools: ferramentas(await ctx.config(), ctx.hostAtual) });
    if (method === 'tools/call') {
      const nome = String(params.name || '');
      const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
      ctx.cfg = await ctx.config();
      try {
        const r = await executar(nome, args, ctx);
        return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(r, null, 2) }], structuredContent: r, isError: false });
      } catch (e) {
        if (e.rpc) return rpcErro(id, e.rpc, e.message);
        if (!e.status || e.status >= 500) console.error(JSON.stringify({ tipo: 'erro', rota: '/api/mcp', ferramenta: nome, usuario: ctx.usuario.login, msg: e.message }));
        return rpcOk(id, { content: [{ type: 'text', text: `Erro: ${e.status >= 500 || !e.status ? 'falha inesperada, tente de novo.' : e.message}` }], isError: true });
      }
    }
    if (method === 'resources/list') return rpcOk(id, { resources: [] });
    if (method === 'prompts/list') return rpcOk(id, { prompts: [] });
    return rpcErro(id, -32601, `Método não suportado: ${method}`);
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/mcp', metodo: method, msg: e.message }));
    return rpcErro(id, -32603, 'Erro interno.');
  }
}

function naoAutorizado(request, msg = 'Conecte-se pelo Claude para usar.') {
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: msg }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'WWW-Authenticate': `Bearer realm="paginas", resource_metadata="${origemDe(request)}/.well-known/oauth-protected-resource", error="invalid_token"`,
    },
  });
}

export async function POST(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  const usuario = m ? await usuarioDoToken(m[1]).catch(() => null) : null;
  if (!usuario) return naoAutorizado(request);
  const texto = await request.text();
  if (texto.length > 4.4 * 1024 * 1024) return new Response(JSON.stringify(rpcErro(null, -32600, 'Pedido grande demais (máx. ~4 MB).')), { status: 413, headers: { 'Content-Type': 'application/json' } });
  let corpo;
  try { corpo = JSON.parse(texto); } catch { return new Response(JSON.stringify(rpcErro(null, -32700, 'JSON inválido.')), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
  let cfgPromessa = null;
  const ctx = {
    usuario,
    ip: ipDe(request),
    hostAtual: (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').replace(/:[0-9]+$/, ''),
    // o Claude do usuário só enxerga as páginas reais (o laboratório oculto fica de fora)
    config: () => (cfgPromessa ||= carregarConfig().then((c) => { c.paginas = c.paginas.filter((p) => !p.lab); return c; })),
  };
  const lote = Array.isArray(corpo);
  const msgs = (lote ? corpo : [corpo]).slice(0, 20);
  const respostas = (await Promise.all(msgs.map((x) => tratar(x, ctx)))).filter(Boolean);
  if (!respostas.length) return new Response(null, { status: 202 });
  return new Response(JSON.stringify(lote ? respostas : respostas[0]), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// Sem fluxo SSE: este servidor responde tudo direto no POST.
export function GET(request) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '');
  if (!m) return naoAutorizado(request);
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export const DELETE = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
