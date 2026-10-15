// Tela onde a pessoa entra com o usuário do painel para liberar o Claude (OAuth "authorize").
import { validarPedido, criarCodigo, origemDe } from '../../lib/oauth.mjs';
import { verificarCredenciais, registrar, ipDe } from '../../lib/auth.mjs';
import { mesmaOrigem } from '../../lib/servidor.mjs';

const CAMPOS = ['client_id', 'redirect_uri', 'response_type', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource'];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function pagina(corpo, status = 200) {
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Conectar o Claude · Painel de Páginas</title>
<style>
*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b0b0c;color:#f3f0ea;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:20px}
.caixa{width:100%;max-width:400px;background:#131315;border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:28px 24px}
.marca{display:flex;align-items:center;gap:10px;font-weight:800;font-size:17px}.marca i{display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:#e9b166;color:#1a1205;font-style:normal;font-size:12px}
h1{font-size:20px;margin:18px 0 6px}p{color:#9a958c;margin:0 0 16px}
label{display:block;font-size:13px;font-weight:600;margin:12px 0 6px}
input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:#1a1a1d;color:inherit;font:inherit}
input:focus{outline:2px solid #e9b166;border-color:transparent}
.bt{width:100%;margin-top:18px;padding:12px;border:0;border-radius:10px;background:#e9b166;color:#1a1205;font:700 15px system-ui;cursor:pointer}
.sec{background:none;border:1px solid rgba(255,255,255,.16);color:#f3f0ea;margin-top:8px;font-weight:600}
.erro{background:rgba(255,93,93,.12);color:#ff8a8a;padding:10px 12px;border-radius:10px;font-size:13.5px;margin-top:12px}
ul{color:#9a958c;font-size:13px;padding-left:18px;margin:12px 0 0}
</style></head><body><main><div class="caixa"><div class="marca"><i>R1</i>Painel de Páginas</div>${corpo}</div></main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai https://claude.com http://localhost:* http://127.0.0.1:*; frame-ancestors 'none'; base-uri 'none'",
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function formulario(p, cliente, erro = '') {
  const ocultos = CAMPOS.map((c) => (p[c] ? `<input type="hidden" name="${c}" value="${esc(p[c])}">` : '')).join('');
  return pagina(`<h1>Conectar o Claude</h1>
<p>O <b>${esc(cliente.nome || 'Claude')}</b> quer publicar e editar páginas em seu nome. Entre com o seu usuário do painel para liberar.</p>
<form method="post" autocomplete="on">${ocultos}
<label for="u">E-mail ou usuário</label><input id="u" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="160" required autofocus>
<label for="s">Senha</label><input id="s" name="senha" type="password" autocomplete="current-password" maxlength="200" required>
${erro ? `<div class="erro">${esc(erro)}</div>` : ''}
<button class="bt" type="submit" name="decisao" value="permitir">Entrar e permitir</button>
<button class="bt sec" type="submit" name="decisao" value="negar" formnovalidate>Cancelar</button>
</form>
<ul><li>O Claude não recebe a sua senha.</li><li>Ele terá as mesmas permissões do seu usuário no painel.</li><li>Para desligar: remova o conector no Claude ou troque a sua senha.</li></ul>`);
}

const erroPagina = (msg, status = 400) => pagina(`<h1>Não deu para conectar</h1><p>${esc(msg)}</p>`, status);

function voltar(p, extras, request) {
  const u = new URL(p.redirect_uri);
  Object.entries(extras).forEach(([k, v]) => u.searchParams.set(k, v));
  if (p.state) u.searchParams.set('state', p.state);
  u.searchParams.set('iss', origemDe(request));
  return new Response(null, { status: 302, headers: { Location: u.href, 'Cache-Control': 'no-store' } });
}

export async function GET(request) {
  const p = Object.fromEntries([...new URL(request.url).searchParams].filter(([k]) => CAMPOS.includes(k)).map(([k, v]) => [k, v.slice(0, 2000)]));
  try {
    const cliente = await validarPedido(p, request);
    return formulario(p, cliente);
  } catch (e) {
    return erroPagina(e.message || 'Pedido inválido.', e.status || 400);
  }
}

export async function POST(request) {
  if (!mesmaOrigem(request)) return erroPagina('Origem não permitida.', 403);
  const t = await request.text();
  if (t.length > 20000) return erroPagina('Pedido grande demais.', 413);
  const f = new URLSearchParams(t);
  const p = Object.fromEntries(CAMPOS.map((c) => [c, (f.get(c) || '').slice(0, 2000)]).filter(([, v]) => v));
  let cliente;
  try { cliente = await validarPedido(p, request); } catch (e) { return erroPagina(e.message || 'Pedido inválido.', e.status || 400); }
  if (f.get('decisao') === 'negar') return voltar(p, { error: 'access_denied', error_description: 'A pessoa cancelou.' }, request);
  const v = await verificarCredenciais(f.get('usuario'), f.get('senha'), request);
  if (v.erro) {
    await new Promise((ok) => setTimeout(ok, 400 + Math.random() * 400));
    return formulario(p, cliente, v.erro);
  }
  const codigo = await criarCodigo({ cliente, usuario: v.usuario, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, resource: p.resource });
  await registrar('claude_conectado', { usuario: v.usuario.login, ip: ipDe(request), detalhe: { client_id: cliente.client_id, nome: cliente.nome } });
  return voltar(p, { code: codigo }, request);
}
