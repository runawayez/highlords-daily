<p align="center">
  <img src="public/assets/highlords-logo.svg" width="160" alt="Highlords Post" />
</p>

# Highlords Post

**Seu jornal pessoal, local e inteligente.**

Highlords Post coleta feeds RSS/Atom, usa uma LLM local via **Ollama** para classificar, resumir e ranquear matérias e monta uma edição editorial rápida para você ler no navegador.

O projeto nasce com três princípios: **local-first**, **interface leve** e **controle do usuário sobre as categorias**.

## MVP 0.1

- RSS/Atom configurável pela interface.
- Categorias personalizadas com descrição de interesse.
- Ollama local para headline, resumo, categoria, score e tags.
- Saída sempre em português brasileiro.
- Seleção de categorias diretamente no jornal.
- SQLite local.
- Interface sem framework de frontend: HTML + CSS + JS puro.
- Atualização manual e agendada.
- Docker opcional.

## Stack

- Node.js 22+
- Fastify
- SQLite via `node:sqlite`
- `rss-parser`
- Ollama
- HTML/CSS/JavaScript sem build de frontend

## Rodando localmente

1. Instale o [Ollama](https://ollama.com/) e baixe um modelo:

```bash
ollama pull qwen3:4b
```

2. Configure e instale:

```bash
cp .env.example .env
npm install
npm run dev
```

3. Abra:

```text
http://localhost:8090
```

O banco será criado automaticamente em `./data/highlords-post.db`.

## Docker

Se o Ollama estiver rodando nativamente no computador:

```bash
cp .env.example .env
```

No `.env`, ajuste:

```env
OLLAMA_HOST=http://host.docker.internal:11434
```

Depois:

```bash
docker compose up -d --build
```

Acesse `http://localhost:8090`.

## Como funciona

```text
RSS / Atom
   ↓
coletor
   ↓
normalização + deduplicação por URL
   ↓
Ollama
   ├─ headline em PT-BR
   ├─ resumo em PT-BR
   ├─ categoria
   ├─ score 0-10
   └─ tags
   ↓
SQLite
   ↓
edição Highlords Post
```

O Ollama nunca gera o HTML. Ele devolve dados estruturados; a interface é responsável pelo layout. Isso mantém o projeto previsível, rápido e fácil de evoluir.

## Próximos passos

- Deduplicação semântica entre fontes diferentes.
- Feedback `quero mais / quero menos`.
- Página de leitura posterior.
- Extração opcional do texto integral das matérias.
- Editor-chefe local para escolher manchete e destaques da edição.
- Importação/exportação de OPML.
- Fontes além de RSS: APIs, Reddit, GitHub Releases e YouTube.
- PWA / modo offline.

## Privacidade

A análise acontece no seu próprio Ollama. O Highlords Post não precisa enviar o conteúdo das notícias para uma API de LLM na nuvem.
