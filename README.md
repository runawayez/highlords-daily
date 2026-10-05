<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Tecnologia sem ruído. Uma newsletter diária, local e gerada por IA.**

Highlords Daily coleta fontes RSS/Atom, usa uma LLM local via **Ollama** para filtrar, classificar, resumir e pontuar matérias e monta uma newsletter diária com as notícias mais importantes de tecnologia.

A edição pode ser lida em `localhost` e exportada para **PDF** sob demanda.

## As sete seções fixas

1. IA
2. Desenvolvimento
3. Mobile & Gadgets
4. Hardware
5. Software & Internet
6. Games
7. Futuro

Não existe uma categoria genérica "Tecnologia": o próprio Highlords Daily já é uma publicação de tecnologia. Política, geopolítica, crime, celebridades, esportes e notícias gerais ficam fora da seleção.

## Como funciona

```text
RSS / Atom
   ↓
coleta das fontes
   ↓
Ollama analisa cada matéria
   ├─ headline em PT-BR
   ├─ resumo curto
   ├─ 1 das 7 categorias
   ├─ score 0-10
   └─ tags
   ↓
SQLite
   ↓
Editor-chefe local (Ollama)
   ├─ escolhe a manchete
   ├─ escolhe até 2 matérias por seção
   ├─ prioriza importância, novidade e variedade
   ├─ escreve título da edição
   └─ escreve uma introdução curta
   ↓
Highlords Daily
   ├─ newsletter em localhost
   ├─ arquivo de edições
   └─ PDF sob demanda
```

As sete seções sempre aparecem. Quando não existe conteúdo bom o bastante para uma delas, a seção fica sem destaque em vez de ser preenchida com uma matéria fraca.

## Stack

- Node.js 22+
- Fastify
- SQLite via `node:sqlite`
- `rss-parser`
- Ollama
- PDFKit
- HTML/CSS/JavaScript sem framework de frontend

## Rodando localmente

1. Instale o Ollama e baixe o modelo:

```bash
ollama pull qwen3:4b
```

2. Configure o projeto:

```bash
cp .env.example .env
npm install
npm run check
npm run dev
```

No Windows, se o PowerShell bloquear `npm.ps1`, use:

```powershell
npm.cmd install
npm.cmd run check
npm.cmd run dev
```

3. Abra:

```text
http://localhost:8090
```

Na primeira execução, clique em **Gerar Daily**. O frontend coleta os feeds, processa toda a fila pendente e só depois pede ao editor-chefe local para montar a edição.

## PDF

Cada edição salva pode ser baixada em PDF pelo botão **Baixar PDF**.

A API também expõe:

```text
GET /api/daily/:data/pdf
```

Exemplo:

```text
/api/daily/2026-10-05/pdf
```

O PDF é gerado localmente pelo servidor com PDFKit e não depende de navegador externo nem de serviço em nuvem.

## Edições e arquivo

Cada data possui no máximo uma edição persistida em `daily_editions`. Regenerar a edição do mesmo dia substitui a versão anterior daquele dia.

Endpoints principais:

```text
GET  /api/daily/current
GET  /api/daily/latest
GET  /api/daily/archive
GET  /api/daily/:data
POST /api/daily/generate
GET  /api/daily/:data/pdf
```

## Banco de dados

O banco principal é:

```text
./data/highlords-daily.db
```

Se existir uma instalação antiga com `highlords-post.db`, o projeto migra o arquivo automaticamente na primeira inicialização.

## Configuração

Principais opções do `.env`:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
TIME_ZONE=America/Sao_Paulo

DAILY_LOOKBACK_HOURS=48
DAILY_ITEMS_PER_CATEGORY=2
MIN_SCORE=5

MAX_ITEMS_PER_FEED=12
MAX_PROCESS_PER_RUN=36
ANALYSIS_CONCURRENCY=2
```

`DAILY_LOOKBACK_HOURS` define a janela de notícias candidatas para uma edição. `DAILY_ITEMS_PER_CATEGORY` aceita de 1 a 3 matérias por seção; o padrão é 2.

### Geração automática opcional

Por padrão a edição é manual. Para gerar uma edição automaticamente quando o servidor estiver rodando:

```env
DAILY_AUTO_GENERATE=true
DAILY_GENERATE_HOUR=8
```

O horário segue `TIME_ZONE`.

## Fontes

As fontes iniciais incluem Tecnoblog, The Verge, Ars Technica, Hacker News, TechCrunch, GitHub Blog, InfoQ, Tom's Hardware e Rock Paper Shotgun. Elas podem ser removidas ou complementadas pela interface.

As categorias, por outro lado, são parte da identidade editorial e não são editáveis pela interface.

## Privacidade

A classificação, o resumo e a curadoria acontecem no Ollama local. O Highlords Daily não precisa enviar o conteúdo das notícias para uma API de LLM na nuvem.
