<p align="center">
  <img src="public/assets/highlords-logo.svg" width="160" alt="Highlords Post" />
</p>

# Highlords Post

**Seu jornal pessoal, local e inteligente.**

Highlords Post coleta feeds RSS/Atom, usa uma LLM local via **Ollama** para classificar, resumir e ranquear matérias e monta uma edição editorial rápida para você ler no navegador.

O projeto nasce com três princípios: **local-first**, **interface leve** e **controle do usuário sobre as categorias**.

## MVP 0.3

- RSS/Atom configurável pela interface.
- Feeds iniciais adicionados automaticamente na primeira execução.
- Categorias personalizadas, editáveis, pausáveis e removíveis.
- Filtro rápido por categoria e botão **Todos**.
- Ollama local para headline, resumo, categoria, score e tags.
- **Editor-chefe local** para escolher manchete, ordem das seções e seleção de matérias.
- Processamento paralelo configurável, com fila limitada por atualização para não travar a máquina.
- Progresso em tempo real: coleta, análise e montagem da edição.
- Thumbnails extraídas dos feeds quando disponíveis, com fallback visual da marca.
- Interface editorial responsiva inspirada em dashboards modernos de notícias, sem framework de frontend.
- Fallback automático para ranking se a etapa editorial falhar.
- Cache curto da edição para evitar chamadas repetidas ao modelo.
- Saída sempre em português brasileiro.
- SQLite local.
- Atualização manual e agendada.
- Docker opcional.

### Feeds iniciais

Na primeira execução o banco recebe um conjunto pequeno de fontes para você testar imediatamente: Agência Brasil, Tecnoblog, The Verge, Ars Technica, BBC World, The Guardian World e Hacker News. Elas podem ser removidas normalmente pela interface e não são recriadas depois.

## Stack

- Node.js 22+
- Fastify
- SQLite via `node:sqlite`
- `rss-parser`
- Ollama
- HTML/CSS/JavaScript sem build de frontend

## Rodando localmente

1. Instale o Ollama e baixe um modelo:

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

Na primeira execução, abra o site e clique em **Atualizar agora**. O topo da interface mostra o estágio atual e o número de matérias já analisadas.

### Ajustando velocidade

Os principais controles ficam no `.env`:

```env
MAX_ITEMS_PER_FEED=12
MAX_PROCESS_PER_RUN=36
ANALYSIS_CONCURRENCY=2
```

`MAX_PROCESS_PER_RUN` evita que uma primeira sincronização enorme tente analisar tudo de uma vez. Se restarem matérias, o botão passa a mostrar quantas continuam na fila. `ANALYSIS_CONCURRENCY=2` é um bom ponto de partida para GPUs de 8 GB com `qwen3:4b`.

## Docker

Se o Ollama estiver rodando nativamente no computador, ajuste no `.env`:

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
coleta + artwork
   ↓
fila limitada
   ↓
Ollama / editores de matéria em paralelo
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
- Busca semântica local.
- Extração opcional do texto integral das matérias.
- Importação/exportação de OPML.
- Fontes além de RSS: APIs, Reddit, GitHub Releases e YouTube.
- PWA / modo offline.

## Privacidade

A análise acontece no seu próprio Ollama. O Highlords Post não precisa enviar o conteúdo das notícias para uma API de LLM na nuvem.
