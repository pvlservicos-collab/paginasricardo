# Painel de Páginas · Grupo R1

Painel para gerenciar as páginas do Ricardo Nunes: ver todas em grade, lista ou funil (com o criativo ao lado para comparar a copy), conferir se estão no ar, ver métricas por página, ativar/desativar, trocar a URL e trocar o HTML colando direto no painel.

**Login:** usuário `ricardo` · senha `2026` (dá para trocar pelas variáveis `PAINEL_USUARIO` e `PAINEL_SENHA`).

## Por que as páginas continuam com nota 100

As páginas são publicadas como **HTML estático puro**. Nada do painel entra nelas:

- O painel mora só em `/painel` e conversa com a pasta `api/`, que roda no servidor.
- Quando você muda algo no painel, ele grava um commit no GitHub e a Vercel gera de novo os arquivos estáticos (≈30 s). O visitante sempre recebe um HTML pronto, sem banco de dados e sem script extra.
- As visitas são contadas **no servidor** (`middleware.js`), depois de a página já ter sido entregue. Nenhum script de métrica é colocado na página.
- O build só envolve o HTML colado num documento completo (`<!doctype>`, `<head>`), levando para o `<head>` as tags `<meta>`/`<link>` do topo. O conteúdo da página não é alterado.

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

As páginas usam imagens em `/wp-content/uploads/...`. Para guardar todas dentro do projeto, rode uma vez no seu computador:

```bash
npm install
npm run imagens
```

Isso baixa tudo de `lp.grupor1.com` para `public/wp-content/uploads/`. Depois faça o commit. Enquanto isso não for feito, o build na Vercel baixa sozinho o que estiver faltando, então o site nunca sai com imagem quebrada. Quando trocar o HTML e ele usar imagens novas do WordPress, o build também busca essas.

## Publicar (GitHub + Vercel)

1. Crie um repositório no GitHub e suba esta pasta:
   ```bash
   git remote add origin https://github.com/pvlservicos-collab/paginasricardo.git
   git push -u origin main
   ```
2. Na Vercel: **Add New → Project →** escolha o repositório. Não precisa mudar nada (o `vercel.json` já define o build). Deploy.
3. Crie um token do GitHub para o painel poder editar:
   GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate. Em *Repository access* escolha só este repositório; em *Permissions → Contents* marque **Read and write**.
4. Na Vercel, em **Settings → Environment Variables**, adicione:
   | Nome | Valor |
   |---|---|
   | `GITHUB_TOKEN` | o token do passo 3 |
   | `GITHUB_REPO` | `pvlservicos-collab/paginasricardo` |
   | `GITHUB_BRANCH` | `main` |
   | `SESSION_SECRET` | um texto longo qualquer |
5. Faça um **Redeploy**. Pronto: `https://seu-projeto.vercel.app/painel`.

### Métricas (opcional, recomendado)

- **Visitas por página:** Vercel → seu projeto → **Storage → Create → Upstash (Redis)** → ligue ao projeto e faça redeploy. As variáveis são criadas sozinhas. A contagem começa a partir daí. Não conta robôs, o teste do Google, as prévias do painel, nem você navegando logado no painel.
- **Leads por página:** HubSpot → Settings → Integrations → **Private Apps** → crie um app com o escopo `forms` e coloque o token em `HUBSPOT_TOKEN`. O painel lê os envios do formulário que está em cada página e separa pela URL onde a pessoa se inscreveu.
- **Nota do Google (PageSpeed):** o botão **Medir** funciona sem chave, mas o Google limita o uso. Para não ter limite, crie uma chave da *PageSpeed Insights API* no Google Cloud e coloque em `PAGESPEED_API_KEY`.

### Domínio

Para as páginas ficarem em `lp.grupor1.com`, adicione o domínio em Vercel → Settings → Domains e, no painel, clique em **Domínio** e informe `https://lp.grupor1.com` (é o endereço que o painel usa para conferir se as páginas estão no ar). Antes de apontar o domínio, rode `npm run imagens` e faça o commit, para as imagens já estarem dentro do projeto.

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
