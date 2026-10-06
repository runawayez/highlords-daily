<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Tecnologia sem ruído. Uma newsletter diária gerada com RSS e curadoria local.**

O Highlords Daily não é mais um news reader nem um servidor web. Ele é um gerador de edição: coleta as fontes, filtra e seleciona o que realmente importa e grava uma newsletter pronta em **HTML, JSON e PDF**.

O projeto possui dois modos:

- **Ollama**: melhor qualidade editorial, compreensão de contexto, headlines e resumos em PT-BR.
- **Sem LLM**: curadoria determinística rápida para GitHub Actions, sem GPU, modelo ou API externa.

## As sete seções fixas

- IA
- Desenvolvimento
- Mobile & Gadgets
- Hardware
- Software & Internet
- Games
- Futuro

Política, geopolítica, crime, celebridades, esportes e notícias gerais ficam fora da curadoria.

## Fluxo com Ollama

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
HTML + JSON + PDF
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

Para gerar com Ollama:

```powershell
npm.cmd run daily
```

Para testar localmente a mesma versão **sem LLM** usada no GitHub Actions:

```powershell
npm.cmd run daily:no-llm
```

Não existe mais `localhost:8090`, Fastify ou SQLite. A edição é um arquivo HTML normal e abre diretamente no navegador no modo local com Ollama.

## GitHub Actions — versão sem LLM

O workflow `.github/workflows/daily-no-llm.yml` gera uma edição sem Ollama e publica o resultado como **Artifact**.

Ele roda automaticamente todos os dias às **08:00 no horário de São Paulo** e também pode ser iniciado manualmente em:

```text
GitHub → Actions → Highlords Daily — sem LLM → Run workflow
```

O artifact contém:

```text
highlords-daily-no-llm-latest.pdf
latest-no-llm.html
latest-no-llm.json
diagnostics.json
```

A curadoria sem LLM usa:

- classificação ponderada por palavras e expressões específicas das 7 categorias;
- peso maior para termos encontrados no título;
- score de confiança por fonte;
- recência da publicação;
- sinais de lançamento, atualização importante, vulnerabilidade e novidade técnica;
- penalização de rumores, ofertas, clickbait, earnings, layoffs e outros ruídos;
- bloqueio forte de política e notícias gerais;
- deduplicação por similaridade lexical de títulos;
- limite de repetição da mesma fonte;
- diversidade entre categorias e fontes;
- tags determinísticas de marcas e tecnologias.

Sem LLM, headlines permanecem próximas do título original e o resumo é extraído do próprio trecho RSS. Portanto, o modo Ollama continua sendo a opção de maior qualidade editorial; o modo Actions existe para gerar uma edição rápida, gratuita e independente de modelo.

## Saída

Modo Ollama:

```text
output/AAAA-MM-DD/
   ├─ index.html
   ├─ edition.json
   └─ highlords-daily-AAAA-MM-DD.pdf

output/latest.html
output/latest.json
output/highlords-daily-latest.pdf
```

Modo sem LLM:

```text
output/AAAA-MM-DD/no-llm/
   ├─ index.html
   ├─ edition.json
   ├─ diagnostics.json
   └─ highlords-daily-AAAA-MM-DD-no-llm.pdf
```

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
- Ollama opcional
- PDFKit
- HTML/CSS estático
- GitHub Actions para geração sem LLM

## Privacidade

No modo Ollama, a análise acontece localmente. No modo sem LLM, nenhuma API de IA é utilizada.
