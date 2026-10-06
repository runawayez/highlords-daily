<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Tecnologia sem ruído.**

Highlords Daily é uma newsletter diária de tecnologia gerada localmente com **RSS + Ollama**. O projeto coleta notícias recentes, usa uma LLM local para filtrar, classificar, traduzir, resumir e pontuar cada matéria, monta a edição com uma segunda etapa editorial e entrega tudo em **HTML, JSON e PDF**.

A proposta é simples: abrir o projeto, gerar a edição do dia e receber uma newsletter pronta para leitura, sem depender de API de IA externa.

## Como funciona

```text
RSS / Atom
   ↓
coleta das notícias recentes
   ↓
Ollama analisa em lotes
   ├─ remove conteúdo fora do escopo
   ├─ classifica nas 7 seções
   ├─ reescreve títulos em PT-BR
   ├─ cria resumos em PT-BR
   ├─ gera tags
   └─ atribui nota de relevância de 0 a 10
   ↓
Ollama editor-chefe
   ├─ escolhe a manchete
   ├─ seleciona os melhores destaques
   ├─ equilibra fontes e assuntos
   └─ escreve título e introdução da edição
   ↓
template HTML editorial
   ↓
Chromium
   ↓
PDF com o mesmo layout do HTML
```

## Seções

A newsletter trabalha com sete seções fixas:

- **IA**
- **Desenvolvimento**
- **Mobile & Gadgets**
- **Hardware**
- **Software & Internet**
- **Games**
- **Futuro**

Política partidária, geopolítica, crime, celebridades, esportes, fofoca e notícias gerais ficam fora da curadoria, exceto quando houver uma relação tecnológica clara e relevante.

## Curadoria por IA local

Cada notícia recebe do Ollama:

- categoria;
- nota de relevância de **0 a 10**;
- headline em português brasileiro;
- resumo curto em português brasileiro;
- tags.

A nota considera principalmente **novidade, impacto, utilidade, relevância técnica e interesse editorial**. Notícias tecnológicas comuns tendem a ficar na faixa intermediária; notas de 8 a 10 ficam reservadas para destaques realmente fortes.

Depois dessa triagem, uma segunda chamada ao Ollama atua como **editor-chefe** e monta a edição final. Caso o editor deixe alguma seção incompleta, o gerador pode completar as vagas com as melhores candidatas daquela categoria que já tenham sido aprovadas pela análise da LLM.

## Requisitos

- **Node.js 22.5+**
- **Ollama**
- **Chrome, Chromium ou Microsoft Edge** para gerar o PDF
- modelo local padrão: **qwen3:4b**

## Instalação

Clone o repositório e instale as dependências:

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
npm.cmd install
```

Instale o modelo padrão no Ollama:

```powershell
ollama pull qwen3:4b
```

## Gerar a newsletter

No Windows, a forma mais simples é dar dois cliques em:

```text
GERAR-DAILY.bat
```

O script verifica o Ollama, inicia o serviço quando necessário e executa o gerador.

Também é possível rodar pelo terminal:

```powershell
ollama serve
```

Em outro terminal:

```powershell
npm.cmd run daily
```

Ao terminar, o HTML da edição pode ser aberto automaticamente no navegador.

## Saída

Cada edição fica salva em uma pasta pela data:

```text
output/
├─ 2026-10-06/
│  ├─ index.html
│  ├─ edition.json
│  └─ highlords-daily-2026-10-06.pdf
├─ latest.html
├─ latest.json
└─ highlords-daily-latest.pdf
```

O PDF é gerado pelo Chromium a partir do **mesmo HTML da newsletter**, preservando layout, imagens, cores, tipografia e links clicáveis.

## Configuração

Os padrões podem ser alterados criando um arquivo `.env` baseado em `.env.example`:

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
LLM_MIN_SCORE=4.5
AUTO_OPEN=true
```

Principais opções:

- `LOOKBACK_HOURS`: janela de tempo das notícias coletadas.
- `MAX_ITEMS_PER_FEED`: limite de itens lidos de cada RSS.
- `MAX_CANDIDATES`: máximo de notícias enviadas para análise.
- `AI_BATCH_SIZE`: quantidade de matérias por lote do Ollama.
- `ITEMS_PER_CATEGORY`: número de destaques por seção, entre 1 e 3.
- `LLM_MIN_SCORE`: nota mínima para uma matéria seguir para a etapa editorial.
- `AUTO_OPEN`: abre o HTML automaticamente ao finalizar.

## Fontes

As fontes ficam definidas em `src/config.mjs` e atualmente incluem:

- Tecnoblog
- The Verge
- Ars Technica
- Hacker News
- TechCrunch
- GitHub Blog
- InfoQ
- Tom's Hardware
- Rock Paper Shotgun

Como a curadoria é feita por uma LLM local, feeds internacionais podem ser usados normalmente: títulos e resumos da edição são produzidos em português brasileiro.

## Stack

- Node.js
- `rss-parser`
- Ollama
- `qwen3:4b`
- HTML/CSS
- `puppeteer-core`
- Chrome / Chromium / Edge para impressão em PDF

## Privacidade

A análise editorial acontece localmente através do Ollama. Nenhuma API externa de IA é necessária para gerar a newsletter.
