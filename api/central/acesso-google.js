// POST /api/central/acesso-google { credential } → { chave, exp, email } | 202/403 { pendente }
// "Entrar com Google" na tela "Acesso restrito" de interno.grupor1.com. A página da Central vem criptografada e só abre
// com a chave (CENTRAL_CONTEUDO_KEY, a mesma CONTEUDO_KEY do backend antigo centralr1-acesso no Netlify).
// - Conta Google @grupor1.com ou @ivoxmarketing.com: entra direto.
// - Outra conta Google: vira pedido de acesso; entra depois que o superadmin aprovar em /aprovacoes (lib/aprovacao.mjs).
import { verificarIdToken } from '../../lib/google-login.mjs';
import { sql } from '../../lib/store.mjs';
import { ipDe, json, erro, hostDe } from '../../lib/central.mjs';
import { mesmaOrigem } from '../../lib/servidor.mjs';
import { prepararAprovacao, limiteIp, contarFalha, DOMINIOS_CENTRAL } from '../../lib/aprovacao.mjs';

const DURACAO_MS = 7 * 24 * 3600e3; // quanto tempo a chave fica guardada no navegador
const log = (acao, d) => console.log(JSON.stringify({ tipo: 'evento', acao, ...d, em: new Date().toISOString() }));

export async function POST(request) {
  if (hostDe(request) !== 'interno.grupor1.com' && !/^(localhost|127\.)/.test(hostDe(request))) return erro('Endereço não permitido.', 403);
  if (!mesmaOrigem(request)) return erro('Origem não permitida.', 403);
  const chave = (process.env.CENTRAL_CONTEUDO_KEY || '').trim();
  if (!chave) return erro('Login com Google indisponível agora.', 503);
  const ip = ipDe(request);
  try {
    await prepararAprovacao();
    if (await limiteIp(ip)) return erro('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429);
    let d = {};
    try { d = await request.json(); } catch {}
    let g;
    try { g = await verificarIdToken(d.credential); }
    catch (e) { await contarFalha(ip); return erro(e.message, e.status || 401); }
    const entra = () => { log('central_acesso_google', { email: g.email, ip }); return json({ chave, exp: Date.now() + DURACAO_MS, email: g.email }); };

    if (DOMINIOS_CENTRAL.some((dom) => g.email.endsWith(dom))) return entra();

    // fora dos domínios: depende de aprovação do superadmin
    const [a] = await sql`select status, origem, google_sub from central_acessos where email = ${g.email}`;
    if (!a) {
      await contarFalha(ip); // pedido novo conta no limite por IP
      await sql`insert into central_acessos (email, nome, origem, google_sub) values (${g.email}, ${g.nome || null}, 'google', ${g.sub || null})`;
      log('central_acesso_pedido', { email: g.email, ip, origem: 'google' });
      return json({ pendente: true, mensagem: 'Pedido enviado! Assim que o administrador aprovar, entre de novo com o Google.' }, 202);
    }
    if (a.google_sub && g.sub && a.google_sub !== g.sub) return erro('Este e-mail está ligado a outra Conta Google. Fale com o administrador.', 403);
    if (a.status === 'pendente') return json({ erro: 'Seu pedido está aguardando aprovação do administrador.', pendente: true }, 403);
    if (a.status !== 'aprovado') return erro('O acesso deste e-mail não foi aprovado. Fale com o administrador.', 403);
    if (!a.google_sub && g.sub) await sql`update central_acessos set google_sub = ${g.sub} where email = ${g.email}`;
    return entra();
  } catch (e) {
    console.error(JSON.stringify({ tipo: 'erro', rota: '/api/central/acesso-google', msg: e.message }));
    return erro('Login com Google indisponível agora. Tente de novo.', 503);
  }
}
