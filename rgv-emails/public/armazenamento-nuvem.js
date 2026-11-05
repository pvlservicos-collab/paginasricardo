/* OPCIONAL — salva e-mails, grupos e biblioteca na nuvem (rota /api/dados) em vez do navegador.
   Para ligar, inclua no <head> do index.html, ANTES do script principal:
     <script src="/armazenamento-nuvem.js"></script>
   O editor detecta window.ArmazenamentoPlataforma sozinho (seção 2 do index.html).
   Aberto como arquivo local (file://), este script não faz nada e o editor volta ao localStorage. */
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  const api = (q, init) => fetch('/api/dados' + q, { credentials: 'same-origin', cache: 'no-store', ...init });
  const erro = async r => {
    let d = {};
    try { d = await r.json(); } catch (_) {}
    const e = new Error(d.erro || 'Falha ao acessar o armazenamento (' + r.status + ').');
    e.status = r.status;
    return e;
  };
  window.ArmazenamentoPlataforma = {
    async getItem(k) {
      const r = await api('?k=' + encodeURIComponent(k));
      if (r.status === 401) return null; // ainda sem login: a tela de login cuida disso
      if (!r.ok) throw await erro(r);
      return (await r.json()).valor;
    },
    async setItem(k, v) {
      const r = await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k, v: String(v) }) });
      if (!r.ok) throw await erro(r);
    },
    async removeItem(k) {
      const r = await api('?k=' + encodeURIComponent(k), { method: 'DELETE' });
      if (!r.ok) throw await erro(r);
    }
  };
})();
