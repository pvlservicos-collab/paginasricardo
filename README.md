# Painel de Páginas · Grupo R1

Painel para gerenciar as páginas do Ricardo Nunes: ver todas em grade, lista ou funil (com o criativo ao lado para comparar a copy), conferir se estão no ar, ver métricas por página, ativar/desativar, trocar a URL e trocar o HTML colando direto no painel.

**Endereço:** https://paginasricardo.vercel.app/painel · os usuários ficam no banco (veja *Usuários e segurança*).

## Como funciona

- **Banco de dados (Neon Postgres) + Vercel Blob**, conectados ao projeto em Vercel → Storage. A Vercel cria sozinha as variáveis (`DATABASE_URL` e `BLOB_READ_WRITE_TOKEN`); não precisa configurar nada à mão.
- Tudo o que o painel muda (HTML, URL, ativar/desativar, pixel, Clarity, criativo) é gravado no banco e **entra no ar em segundos, sem deploy**. As imagens dos criativos ficam no Blob.
- Na primeira vez que o site roda com o banco, ele copia para o banco o que está em `paginas/` e `criativos/`. Depois disso, **quem manda é o banco**: mudar arquivos em `paginas/` no GitHub não altera mais as páginas no ar (use o painel).
- As páginas são entregues pela função `api/servir.js` (região São Paulo, `gru1`), com cache de alguns segundos na CDN e na memória. O visitante recebe o HTML pronto, sem nenhum código do painel.
- O build só envolve o HTML colado num documento completo (`<!doctype>`, `<head>`), levando para o `<head>` as tags `<meta>`/`<link>` do topo, e acrescenta o Pixel da Meta (no `<head>`) e o Clarity (no fim do `<body>`), se configurados. O conteúdo da página não é alterado.
- O Clarity só baixa no primeiro toque, rolagem ou tecla do visitante, ou 3 segundos depois de a página terminar de abrir (o que vier primeiro).
- **Atenção:** o pixel tem *permissões de tráfego* na Meta (Gerenciador de Eventos → Configurações → Permissões de tráfego). Ele só dispara nos domínios liberados lá — hoje `lp.grupor1.com`. Em `*.vercel.app` ele é bloqueado pela própria Meta.
- As visitas são contadas **no servidor** (`middleware.js`). Nenhum script de métrica é colocado na página.
- Imagens novas em `/wp-content/...` que ainda não estejam no projeto são buscadas em `lp.grupor1.com` automaticamente.

## Estrutura

```
paginas/            ← suas páginas (.html) + paginas.json (título, URL, ativa, ordem, criativo)
public/wp-content/  ← imagens e vídeos das páginas (mesmos caminhos do WordPress)
criativos/          ← imagens dos anúncios (só o painel vê, não são publicadas)
painel/             ← o painel (HTML, CSS e JS)
api/                ← funções do painel na Vercel
lib/                ← regras compartilhadas
scripts/            ← build, servidor local e download de imagens
middleware.js       ← contador de visitas no servidor
vercel.json
```

**Subir página nova:** coloque o `.html` em `paginas/` e faça o push. Ela aparece no painel ativa, com a URL igual ao nome do arquivo (ex.: `black10x-v6.html` → `/black10x-v6`). Também dá para criar pelo botão **Nova página**.

## Imagens

As páginas usam imagens em `/wp-content/uploads/...`, que já estão dentro do projeto em `public/wp-content/uploads/` (com versões menores para celular: `-400`, `-600`, `-76`, `-320`). Se alguma página nova usar imagens do WordPress que ainda não estão aqui, rode no seu computador:

```bash
npm install
npm run imagens
```

Isso baixa tudo de `lp.grupor1.com` para `public/wp-content/uploads/`. Depois faça o commit. Enquanto isso não for feito, o build na Vercel baixa sozinho o que estiver faltando, então o site nunca sai com imagem quebrada. Quando trocar o HTML e ele usar imagens novas do WordPress, o build também busca essas.

## Publicar

O projeto na Vercel é o **paginasricardo**, ligado a este repositório e ao banco Neon (Vercel → Storage).
Cada `git push` na `main` publica o código do painel. As páginas em si **não** dependem de deploy: ficam no banco.

## Usuários e segurança

- Papéis: **admin** (tudo) e **editor** (sem as funções marcadas “em construção”: Funil e Métricas). A permissão é conferida no servidor em todas as rotas.
- Criar usuário ou trocar a senha (gera uma senha forte e mostra uma única vez; no banco fica só o hash):
  ```bash
  node scripts/usuarios.mjs <login> <admin|editor> [email] [nome]
  ```
  Precisa do `DATABASE_URL` no arquivo `.env.local` (nunca vai para o GitHub). Trocar a senha encerra as sessões abertas do usuário.
- Senhas com hash scrypt; mesma mensagem para usuário inexistente e senha errada.
- 5 erros por conta ou 20 por IP em 15 min bloqueiam novas tentativas.
- Sessão guardada no banco; cookie `__Host-r1s` HttpOnly + Secure + SameSite=Strict (nada em localStorage/sessionStorage). Expira após 12 h sem uso ou 7 dias; o código da sessão é trocado a cada 30 min; “Sair” apaga a sessão no servidor.
- Alterações só são aceitas vindas do próprio painel (checagem de origem contra CSRF); sem CORS.
- Entradas validadas (tamanho, formato, links só http/https, domínio sem endereços internos).
- Cabeçalhos: CSP rígida no painel, `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy.
- Prévias de páginas rodam isoladas (sandbox): o código colado não acessa o painel nem a sessão.
- Tudo que muda fica registrado na tabela `eventos` (quem, quando, IP) e no log da Vercel; erros têm um código para achar no log.
- Backup: o Neon guarda o histórico do banco e permite restaurar para um ponto anterior (console do Neon → Restore).

### Métricas (opcional, recomendado)

- **Visitas por página:** Vercel → seu projeto → **Storage → Create → Upstash (Redis)** → ligue ao projeto e faça redeploy. As variáveis são criadas sozinhas. A contagem começa a partir daí. Não conta robôs, o teste do Google, as prévias do painel, nem você navegando logado no painel.
- **Leads por página:** HubSpot → Settings → Integrations → **Private Apps** → crie um app com o escopo `forms` e coloque o token em `HUBSPOT_TOKEN`. O painel lê os envios do formulário que está em cada página e separa pela URL onde a pessoa se inscreveu.
- **Nota do Google (PageSpeed):** o botão **Medir** funciona sem chave, mas o Google limita o uso. Para não ter limite, crie uma chave da *PageSpeed Insights API* no Google Cloud e coloque em `PAGESPEED_API_KEY`.

### Domínio, Pixel da Meta e Clarity

Para as páginas ficarem em `lp.grupor1.com`, adicione o domínio em Vercel → Settings → Domains e, no painel, clique em **Domínio** e informe `https://lp.grupor1.com` (é o endereço que o painel usa para conferir se as páginas estão no ar).

Na mesma janela ficam o **Pixel da Meta** (hoje `554651949023828`) e o **Microsoft Clarity** (hoje `yy6pgr4e6u`). Valem para todas as páginas, inclusive as novas. Deixe em branco para tirar. Ao salvar, as páginas são publicadas de novo (≈30 s).

## O que o painel faz

- **Páginas (grade):** prévia ao vivo de cada página (celular ou computador), status, visitas, leads e conversão.
- **Lista:** tudo numa tabela, com tempo de resposta e a nota do Google no celular e no PC.
- **Funil:** as páginas uma abaixo da outra, na ordem que você escolher (setas ↑ ↓). Para cada uma: prévia no celular, a copy da página (faixa do topo, título, subtítulo, botões e seções) e, à direita, o criativo do anúncio. Arraste a imagem, clique para escolher ou cole com Ctrl/Cmd+V com o mouse em cima. Ao lado vai a copy do anúncio e o link.
- **Métricas:** visitas por dia, leads, conversão, % no celular, origens (utm_source) e nota do Google.
- **Ativar/desativar:** a chave em cada página. Desativada, a URL mostra “página indisponível” ou leva para outra página que você escolher em **Ajustes**.
- **Trocar URL:** em **Ajustes**. A URL antiga continua levando para a nova (mantendo as UTMs), para não quebrar anúncios que já estão rodando.
- **Trocar o HTML:** botão **HTML** → apague, cole o novo, **Salvar e publicar**. Dá para pré-visualizar antes e carregar um arquivo `.html`.
- **Duplicar** (a cópia nasce desativada) e **Excluir** (o histórico fica no GitHub).

Todo o histórico de mudanças fica nos commits do GitHub. Para desfazer algo, basta reverter o commit.

## Rodar no computador

```bash
npm install
npm run dev
```

Abra `http://localhost:3000/painel`. No modo local, as alterações são gravadas direto na pasta do projeto.
