/* armazenamento-banco: e-mails, grupos e biblioteca no banco do painel (rota /api/emails) em vez do navegador.
   Fica embutido no <head> da página /emails (antes do script principal); o editor detecta
   window.ArmazenamentoPlataforma sozinho (seção 2). Aberto como arquivo local (file://), não faz nada.
   Migração: na 1ª leitura depois do login, os e-mails que estavam no localStorage deste navegador sobem
   para o banco, somando com o que já está lá (o mais recente vence). O localStorage fica intacto como cópia. */
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  var P = 'editorEmails:', MARCA = P + 'migradoBanco';
  var api = function (q, init) { return fetch('/api/emails' + q, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, init)); };
  var falha = async function (r) {
    var d = {}; try { d = await r.json(); } catch (_) {}
    var e = new Error(d.erro || 'Falha ao acessar o banco (' + r.status + ').'); e.status = r.status; return e;
  };
  async function ler(k) {
    var r = await api('?k=' + encodeURIComponent(k));
    if (r.status === 401) return null; // sem login: a tela de login cuida disso
    if (!r.ok) throw await falha(r);
    return (await r.json()).valor;
  }
  async function gravar(k, v) {
    var r = await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ k: k, v: String(v) }) });
    if (!r.ok) throw await falha(r);
  }
  var local = function (k) { try { return localStorage.getItem(k); } catch (_) { return null; } };
  var json = function (t, padrao) { try { return JSON.parse(t) || padrao; } catch (_) { return padrao; } };

  var migracao = null;
  function migrar() {
    if (!migracao) migracao = (async function () {
      if (local(MARCA)) return;
      var lista = json(local(P + 'indice'), []), grupos = json(local(P + 'grupos'), []), bib = json(local(P + 'biblioteca'), {});
      if (!lista.length && !grupos.length && !Object.keys(bib).length) { try { localStorage.setItem(MARCA, new Date().toISOString()); } catch (_) {} return; }
      var nuvemLista = json(await ler(P + 'indice'), []), nuvemGrupos = json(await ler(P + 'grupos'), []), nuvemBib = json(await ler(P + 'biblioteca'), {});
      var subiu = 0;
      for (var i = 0; i < lista.length; i++) {
        var r = lista[i], corpo = local(P + 'email:' + r.id);
        if (!r || !r.id || !corpo) continue;
        var j = nuvemLista.findIndex(function (x) { return x.id === r.id; });
        if (j >= 0 && String(nuvemLista[j].editadoEm || '') >= String(r.editadoEm || '')) continue; // banco já tem igual ou mais novo
        await gravar(P + 'email:' + r.id, corpo);
        if (j >= 0) nuvemLista[j] = r; else nuvemLista.push(r);
        subiu++;
      }
      grupos.forEach(function (g) { if (g && g.id && !nuvemGrupos.some(function (x) { return x.id === g.id; })) nuvemGrupos.push(g); });
      await gravar(P + 'grupos', JSON.stringify(nuvemGrupos));
      await gravar(P + 'biblioteca', JSON.stringify(Object.assign({}, bib, nuvemBib)));
      await gravar(P + 'indice', JSON.stringify(nuvemLista));
      try { localStorage.setItem(MARCA, new Date().toISOString() + ' · ' + subiu + ' e-mail(s)'); } catch (_) {}
    })().catch(function (e) { migracao = null; console.warn('Migração dos e-mails para o banco não terminou; tenta de novo na próxima abertura.', e); });
    return migracao;
  }

  window.ArmazenamentoPlataforma = {
    async getItem(k) {
      if (k === P + 'ultimoWhats') return local(k); // preferência do navegador
      if (!local(MARCA)) await migrar(); // 1ª abertura neste navegador: sobe o que estava nele
      return await ler(k);
    },
    async setItem(k, v) {
      if (k === P + 'ultimoWhats') { try { localStorage.setItem(k, v); } catch (_) {} return; }
      await gravar(k, v);
    },
    async removeItem(k) {
      var r = await api('?k=' + encodeURIComponent(k), { method: 'DELETE' });
      if (!r.ok) throw await falha(r);
    }
  };
})();
