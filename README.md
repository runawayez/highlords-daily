<p align="center">
  <img src="public/assets/highlords-logo.svg" width="160" alt="Highlords Post" />
</p>

# Highlords Post

**Seu jornal pessoal, local e inteligente.**

Highlords Post coleta feeds RSS/Atom, usa uma LLM local via **Ollama** para classificar, resumir e ranquear matérias e monta uma edição editorial rápida para você ler no navegador.

O projeto nasce com três princípios: **local-first**, **interface leve** e **controle do usuário sobre as categorias**.

## MVP 0.2

- RSS/Atom configurável pela interface.
- Feeds iniciais adicionados automaticamente na primeira execução.
- Categorias personalizadas com descrição de interesse.
- Categorias editáveis, pausáveis e removíveis.
- Botão **Todos** e seleção livre das seções exibidas.
- Ollama local para headline, resumo, categoria, score e tags.
- **Editor-chefe local**: uma segunda etapa do Ollama escolhe a manchete, a ordem das seções e a seleção de matérias da edição.
- Fallback automático para ranking se a etapa editorial falhar.
- Cache curto da edição para evitar chamadas repetidas ao modelo.
- Saída sempre em português brasileiro.
- SQLite local.
- Interface sem framework de frontend: HTML + CSS + JS puro.
- Atualização manual e agendada.
- Docker opcional.

### Feeds iniciais

Na primeira execução o banco recebe um conjunto pequeno de fontes para você testar imediatamente: G1, Tecnoblog, The Verge, Ars Technica, BBC World, The Guardian World e Hacker News. Elas podem ser removidas normalmente pela interface e não são recriadas depois.

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
npm run check
npm run dev
```

3. Abra:

```text
http://localhost:8090
```

O banco será criado automaticamente em `./data/highlords-post.db`.

Na primeira execução, abra o site e clique em **Atualizar agora**. O primeiro processamento pode levar alguns minutos porque cada matéria nova passa pelo Ollama antes de entrar no jornal.

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
Ollama / editor de matéria
   ├─ headline em PT-BR
   ├─ resumo em PT-BR
   ├─ categoria
   ├─ score 0-10
   └─ tags
   ↓
SQLite
   ↓
Ollama / editor-chefe
   ├─ manchete principal
   ├─ ordem das seções
   └─ seleção das matérias
   ↓
edição Highlords Post
```

O Ollama nunca gera o HTML. Ele devolve dados estruturados; a interface é responsável pelo layout. Isso mantém o projeto previsível, rápido e fácil de evoluir.

## Próximos passos

- Deduplicação semântica entre fontes diferentes.
- Feedback `quero mais / quero menos`.
- Página de leitura posterior.
- Extração opcional do texto integral das matérias.
- Importação/exportação de OPML.
- Fontes além de RSS: APIs, Reddit, GitHub Releases e YouTube.
- PWA / modo offline.

## Privacidade

A análise acontece no seu próprio Ollama. O Highlords Post não precisa enviar o conteúdo das notícias para uma API de LLM na nuvem.
