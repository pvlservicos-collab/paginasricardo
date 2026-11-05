# Editor de E-mails · RGV

> **Onde está no ar:** o editor roda como página do painel em **https://ricardonunes.grupor1.com/emails** (a URL antiga `/rgv-e-mails` leva para lá), com o login e o Blob do próprio painel, e tem atalho no menu lateral ("E-mails").
>
> **Onde ficam os e-mails:** no banco do painel (tabela `emails_dados`, rota `api/emails.js` do painel), com o mesmo login. Na 1ª abertura em cada navegador, o que estava no localStorage sobe sozinho para o banco (script `armazenamento-banco`, igual a `public/armazenamento-nuvem.js`, embutido no `index.html`). Excluir só marca `excluido_em`: dá para recuperar pelo banco.
>
> Esta pasta é a **cópia do código no Git**: o painel entrega o HTML guardado no banco, não este arquivo. Ao mudar o editor, atualize os dois. Ela não entra no deploy do painel (`.vercelignore`). O passo a passo abaixo só serve se um dia ele virar um app separado.

Editor visual de e-mails em HTML (modelos de e-mail marketing com botões para WhatsApp), extraído do Painel de Páginas (`/rgv-e-mails`) e preparado para rodar como app próprio na Vercel.

- **Front:** um único arquivo, `public/index.html` (HTML + CSS + JS puro, sem framework e sem build). É **idêntico** ao que está publicado no Painel, sem os pixels/GTM/Clarity que o Painel injeta.
- **Back:** 3 rotas serverless em `api/` (Vercel Functions, Node 20+), que substituem as rotas que o editor usava dentro do Painel.

---

## 1. Estrutura

```
rgv-emails/
├── public/
│   ├── index.html               ← o editor inteiro (front)
│   └── armazenamento-nuvem.js   ← OPCIONAL: salva os e-mails na nuvem
├── api/
│   ├── login.js                 ← GET/POST/DELETE /api/login (sessão)
│   ├── imagens.js               ← POST /api/imagens (upload para o Vercel Blob)
│   └── dados.js                 ← OPCIONAL: GET/PUT/DELETE /api/dados (Upstash Redis)
├── lib/
│   └── sessao.js                ← cookie assinado, conferência de senha, helpers
├── vercel.json                  ← pasta pública, noindex e cabeçalhos
├── package.json
├── .env.example                 ← variáveis de ambiente necessárias
└── .gitignore
```

---

## 2. Rodar no VS Code (local)

Pré-requisitos: **Node 20+**, **Git** e uma conta na **Vercel**.

```bash
# 1. abrir a pasta no VS Code
cd rgv-emails
code .

# 2. instalar dependências
npm install

# 3. ligar a pasta a um projeto da Vercel (cria o projeto na 1ª vez)
npx vercel login
npx vercel link

# 4. baixar as variáveis de ambiente cadastradas na Vercel (ver seção 4)
npm run env:pull          # gera .env.local

# 5. rodar com as rotas /api funcionando
npm run dev               # abre em http://localhost:3000
```

> **Atalho sem servidor:** abrir `public/index.html` direto no navegador (duplo clique ou extensão *Live Server*) liga o **modo local**: sem login, imagens guardadas só no navegador. Serve para mexer em layout/CSS rapidamente. Com Live Server (http) o editor tenta `/api/login`, recebe 404 e também cai no modo local.

---

## 3. Publicar na Vercel

**Opção A — pelo GitHub (recomendado):**
1. Crie um repositório e suba a pasta (`git init && git add . && git commit -m "Editor de E-mails" && git push`).
2. Na Vercel: **Add New → Project → Import** o repositório. *Framework Preset:* **Other**. Não precisa de Build Command.
3. Cadastre as variáveis (seção 4) e faça o deploy. Cada `git push` na `main` publica sozinho; outras branches geram *preview*.

**Opção B — pela linha de comando:**
```bash
npm run deploy            # = npx vercel --prod
```

**Domínio próprio:** Project → Settings → Domains (ex.: `emails.grupor1.com`) e crie o CNAME indicado no DNS.

---

## 4. Variáveis de ambiente e serviços

Cadastre em **Project → Settings → Environment Variables** (Production, Preview e Development).

| Variável | Obrigatória | Para quê |
|---|---|---|
| `SESSAO_SEGREDO` | Sim | Assina o cookie de login. Mínimo 32 caracteres. Gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PAINEL_USUARIO` + `PAINEL_SENHA` | Uma das duas formas | Um único usuário/senha |
| `USUARIOS` | Uma das duas formas | Vários usuários: `ana:senha1,joao:senha2` |
| `BLOB_READ_WRITE_TOKEN` | Sim | Upload de imagens. **Criada sozinha** ao ligar um Blob Store: Project → **Storage → Create → Blob** → Connect |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | Só se usar a nuvem | Project → **Storage → Upstash (Redis)** → Connect. Criadas sozinhas |

Depois de alterar variáveis, faça um novo deploy (e `npm run env:pull` para o ambiente local).

---

## 5. Contrato da API (o que o `index.html` espera)

O front chama sempre o mesmo domínio (`API_BASE = ''`, `credentials: 'same-origin'`).

### `/api/login`
| Método | Envio | Resposta |
|---|---|---|
| `GET` | cookie | `200 { logado: true, usuario }` ou `401 { logado: false }` |
| `POST` | `{ usuario, senha }` (JSON) | `200 { ok: true, usuario }` + `Set-Cookie` ou `401 { ok: false, erro }` |
| `DELETE` | — | `200 { ok: true }` e apaga o cookie |

Na abertura, o editor faz `GET /api/login`:
- `200` → entra direto;
- `401` → mostra a tela de login;
- `404` / outro erro / `file://` → **modo local** (sem login, imagens em data-URL).

### `/api/imagens`
- `POST` com o **arquivo cru** no corpo (não é multipart), headers `Content-Type: image/*` e `X-Nome: <nome codificado>`.
- Responde `200 { url }` com a URL pública e permanente no Vercel Blob (`.../emails/<nome>-<sufixo>.png`).
- Erros: `401` sem sessão, `413` acima de 4 MB, `415` tipo não aceito, `500` Blob não configurado. O editor mostra o campo `erro`.
- Limite de 4 MB por imagem (as Functions da Vercel aceitam até 4,5 MB de corpo). O próprio editor já bloqueia antes de enviar.

### `/api/dados` (opcional)
- `GET ?k=` → `{ valor }` · `PUT { k, v }` → `{ ok }` · `DELETE ?k=` → `{ ok }`.
- Só aceita chaves que começam com `editorEmails:`. Exige sessão.

---

## 6. Onde ficam os e-mails (armazenamento)

O editor grava tudo através do objeto `Armazenamento` (seção 2 do script). As chaves são:

| Chave | Conteúdo |
|---|---|
| `editorEmails:indice` | lista de e-mails (id, nome, grupo, datas) |
| `editorEmails:email:<id>` | o e-mail completo (`htmlAtual`, histórico etc.) |
| `editorEmails:grupos` | grupos/pastas |
| `editorEmails:biblioteca` | biblioteca de imagens já usadas |
| `editorEmails:ultimoWhats` | último número de WhatsApp digitado (sempre no navegador) |

**Padrão:** `localStorage` → cada navegador tem o seu acervo, e ele **não** passa de um domínio para outro.

**Para salvar na nuvem** (mesmo acervo em qualquer computador):
1. Ligue o Upstash Redis ao projeto (seção 4).
2. No `public/index.html`, logo antes do `<script>` principal (procure por `'use strict';`), inclua:
   ```html
   <script src="/armazenamento-nuvem.js"></script>
   ```
3. Deploy. O editor detecta `window.ArmazenamentoPlataforma` sozinho. Todos os usuários veem o mesmo acervo; para separar por usuário, troque a função `chave()` em `api/dados.js`.

### Migrar os e-mails que estão no Painel
Os e-mails feitos em `ricardonunes.grupor1.com/rgv-e-mails` estão no `localStorage` daquele domínio. Para trazer:
1. No editor antigo, na tela da lista: botão **⋯ → Baixar backup dos e-mails** (gera `backup-editor-emails-AAAA-MM-DD.json`).
2. No app novo: **⋯ → Restaurar backup…** e escolha o arquivo.

As imagens já hospedadas continuam no Blob do Painel (URLs públicas), então seguem funcionando nos e-mails.

---

## 7. Mapa do `index.html`

O script principal é dividido em seções numeradas (procure pelo título no VS Code com `Ctrl+F`):

| # | Seção | O que faz |
|---|---|---|
| 1 | Conexão com o Painel | `API_BASE`, `ENDPOINT_UPLOAD`, `chamarApi()`, `uploadImagem()` |
| 2 | Armazenamento | `Armazenamento.get/set/del` (plataforma ou `localStorage`) |
| 3 | Estado e utilitários | objeto `estado`, helpers `$`, `h()`, estilos inline, WhatsApp |
| 4 | Serialização | preserva DOCTYPE, `<head>`, metas e comentários do Outlook |
| 5 | Detecção das áreas editáveis | acha textos, imagens e botões (`data-edit`) |
| 6 | Grupos | criar, renomear, mover e-mails |
| 7 | Lista de e-mails | tela inicial, busca, duplicar, excluir, backup |
| 8 | Novo e-mail | upload do HTML do modelo |
| 9 | Editor | salvamento automático e desfazer |
| 10 | Prévia com edição direta | edição no iframe + barra de formatação |
| 11 | Campos de edição | painéis de imagem/banner e botão/link (WhatsApp ou URL) |
| 12 | Exportação e checagem | HTML final, avisos (imagens não hospedadas, links) |
| 13 | Modais genéricos | prompts e confirmações |
| 14 | Login | tela de login e “Sair” |
| 15 | Eventos | atalhos, menus, inicialização |

Outros pontos úteis:
- `<script type="text/plain" id="modelo-exemplo">` (perto da linha 396) é o **modelo de exemplo** que aparece ao criar um e-mail. Edite ali.
- As cores do editor ficam em `:root` no início do `<style>`.
- `ENDPOINT_UPLOAD` permite trocar o destino das imagens por outro serviço (POST multipart, campo `arquivo`, resposta `{ url }`).

---

## 8. Segurança

- Senhas ficam só nas variáveis de ambiente; nunca vão para o front nem para o Git (`.env*` está no `.gitignore`).
- Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`, assinado com HMAC-SHA256, validade de 30 dias. Trocar `SESSAO_SEGREDO` derruba todas as sessões.
- O site responde com `X-Robots-Tag: noindex` e a página tem `<meta name="robots" content="noindex, nofollow">`.
- As imagens no Blob são **públicas** (precisam ser, para aparecer no e-mail de quem recebe).

---

## 9. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Aparece “Modo local” no canto | `/api/login` não respondeu: abriu como arquivo, usou Live Server, ou a rota deu 404/500. Use `npm run dev`. |
| Erro 500 ao entrar | Falta `SESSAO_SEGREDO` (ou tem menos de 32 caracteres). |
| “Usuário ou senha incorretos” com a senha certa | Variáveis não cadastradas no ambiente certo (Production/Preview) ou deploy antigo. |
| “A hospedagem falhou” ao subir imagem | Blob Store não ligado ao projeto / falta `BLOB_READ_WRITE_TOKEN` no `.env.local`. |
| Os e-mails sumiram ao trocar de domínio | Estão no `localStorage` do domínio antigo. Use ⋯ → Restaurar backup…, ou ligue o armazenamento na nuvem. |
| Login não persiste no ambiente local | Acesse por `http://localhost:3000` (o cookie é `Secure`, e o navegador só o aceita em HTTPS ou `localhost`). |
