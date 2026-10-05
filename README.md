<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Tecnologia sem ruído. Uma newsletter diária gerada localmente com RSS + Ollama.**

O Highlords Daily não é mais um news reader nem um servidor web. Ele é um gerador de edição: coleta as fontes, pede ao Ollama para filtrar e selecionar o que realmente importa e grava uma newsletter pronta em **HTML, JSON e PDF**.

## As sete seções fixas

- IA
- Desenvolvimento
- Mobile & Gadgets
- Hardware
- Software & Internet
- Games
- Futuro

Política, geopolítica, crime, celebridades, esportes e notícias gerais ficam fora da curadoria.

## Fluxo

```text
RSS / Atom
   ↓
coleta das notícias recentes
   ↓
Ollama analisa em lotes
   ├─ descarta ruído
   ├─ classifica nas 7 seções
   ├─ cria headline/resumo
   └─ pontua relevância
   ↓
Ollama editor-chefe
   ├─ escolhe a manchete
   ├─ escolhe as melhores por seção
   ├─ escreve título e introdução
   └─ pode deixar uma seção vazia
   ↓
output/AAAA-MM-DD/
   ├─ index.html
   ├─ edition.json
   └─ highlords-daily-AAAA-MM-DD.pdf
```

Também são atualizados automaticamente:

```text
output/latest.html
output/latest.json
output/highlords-daily-latest.pdf
```

## Uso mais simples no Windows

Depois do primeiro `git pull`, dê dois cliques em:

```text
GERAR-DAILY.bat
```

Ele verifica se o Ollama está rodando, inicia o serviço quando necessário, instala as dependências na primeira execução e roda a geração. Ao terminar, o HTML abre no navegador automaticamente.

## Pelo terminal

Primeira vez:

```powershell
ollama pull qwen3:4b
npm.cmd install
```

Para gerar uma edição:

```powershell
ollama serve
```

Em outro terminal:

```powershell
npm.cmd run daily
```

Não existe mais `localhost:8090`, Fastify ou SQLite. A edição é um arquivo HTML normal e abre diretamente no navegador.

## Configuração

Copie `.env.example` para `.env` se quiser alterar os padrões:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen3:4b
TIME_ZONE=America/Sao_Paulo
OUTPUT_DIR=./output

LOOKBACK_HOURS=48
MAX_ITEMS_PER_FEED=12
MAX_CANDIDATES=72
AI_BATCH_SIZE=10
ITEMS_PER_CATEGORY=2
MIN_SCORE=6
AUTO_OPEN=true
```

`LOOKBACK_HOURS` controla a janela das notícias. `ITEMS_PER_CATEGORY` aceita de 1 a 3 destaques por seção. `MIN_SCORE` controla o quanto a curadoria deve ser seletiva.

## Fontes

A lista fica em `src/config.mjs` e atualmente inclui Tecnoblog, The Verge, Ars Technica, Hacker News, TechCrunch, GitHub Blog, InfoQ, Tom's Hardware e Rock Paper Shotgun.

## Stack

- Node.js 22+
- `rss-parser`
- Ollama
- PDFKit
- HTML/CSS estático

## Privacidade

A análise e a curadoria acontecem no seu próprio Ollama. Nenhuma API de LLM em nuvem é necessária.
