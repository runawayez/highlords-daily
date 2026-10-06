<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Informação sem ruído.**

Highlords Daily é um gerador local de newsletter diária feito com **RSS + Ollama**. Ele coleta notícias recentes, usa uma LLM local para filtrar, classificar, traduzir, resumir e pontuar cada matéria, monta a edição com uma segunda etapa editorial e entrega tudo em **HTML, JSON e PDF**.

O projeto já vem com o preset editorial **Vanilla**. Basta clonar, instalar o modelo e gerar. Categorias e fontes podem ser alteradas em YAML sem mexer no JavaScript.

## Highlords Daily Vanilla

O preset padrão vem com dez categorias:

1. **IA**
2. **Desenvolvimento**
3. **Mobile & Gadgets**
4. **Hardware**
5. **Software & Internet**
6. **Games**
7. **Futebol**
8. **Esportes**
9. **Economia**
10. **Futuro**

**Futebol** fica separado de **Esportes**. A seção Esportes é voltada a basquete, Fórmula 1, tênis, vôlei, lutas, atletismo e outras modalidades.

A configuração editorial fica em:

```text
config/
├─ categories.yml
└─ feeds.yml
```

## Como funciona

```text
categories.yml + feeds.yml
          ↓
       RSS / Atom
          ↓
coleta balanceada entre as fontes
          ↓
Ollama analisa em lotes
   ├─ remove conteúdo fora do escopo
   ├─ classifica nas categorias configuradas
   ├─ reescreve títulos em PT-BR
   ├─ cria resumos em PT-BR
   ├─ gera tags
   └─ atribui nota de relevância de 0 a 10
          ↓
Ollama editor-chefe
   ├─ escolhe a manchete
   ├─ seleciona os melhores destaques
   ├─ equilibra fontes e assuntos
   └─ escreve título e introdução
          ↓
template HTML editorial
          ↓
       Chromium
          ↓
PDF com o mesmo layout e links do HTML
```

## Curadoria por IA local

Cada notícia recebe do Ollama categoria, nota de relevância de **0 a 10**, headline em PT-BR, resumo curto e tags. A nota combina **novidade, impacto, utilidade, relevância para o leitor e interesse editorial**.

O padrão Vanilla tenta manter **2 destaques por categoria**. O gerador completa automaticamente vagas com candidatas da mesma categoria já aprovadas pela LLM e, quando possível, evita escolher como manchete uma matéria que faria sua própria seção perder um dos dois destaques. Se não existirem duas candidatas aprovadas para uma categoria, a edição continua normalmente e o layout se adapta a um único card.

Categorias sem matéria aprovada não são renderizadas.

## Categorias personalizáveis

`config/categories.yml` é a fonte de verdade da taxonomia editorial:

```yaml
categories:
  - slug: ciencia
    name: Ciência
    description: Pesquisa, espaço, astronomia, biologia e descobertas científicas.
    aliases: [science, astronomia]
```

O prompt do Ollama e o formato esperado do editor-chefe são montados dinamicamente a partir desse arquivo.

## Fontes personalizáveis

Cada feed em `config/feeds.yml` pode indicar categorias em `focus`:

```yaml
feeds:
  - name: Trivela
    url: https://trivela.com.br/feed/
    focus: [futebol]

  - name: BBC Sport
    url: https://feeds.bbci.co.uk/sport/rss.xml
    focus: [esportes]
```

`focus` é apenas uma **dica**. A classificação final continua sendo feita pelo Ollama.

Se o RSS fornecer apenas logo ou arte genérica, use `images: page` para buscar a `og:image` diretamente na página da matéria. Para desativar imagens naquela fonte, use `images: false`. O coletor também elimina imagens idênticas repetidas pela mesma fonte.

Quando uma matéria realmente não possui imagem válida, o card passa a usar um layout textual compacto em vez de exibir um grande bloco de placeholder.

## Fontes Vanilla

### Tecnologia e games

- Tecnoblog
- The Verge
- Ars Technica
- Hacker News
- TechCrunch
- GitHub Blog
- InfoQ
- Tom's Hardware
- Rock Paper Shotgun

### Futebol

- ge
- Trivela
- Placar
- UOL Esporte
- BBC Sport Football

### Esportes

- UOL Esporte
- ge
- BBC Sport
- ESPN Top Headlines

### Economia

- InfoMoney
- MoneyTimes
- Exame
- Seu Dinheiro
- Brazil Journal
- UOL Economia
- Agência Brasil Economia

A coleta é balanceada antes da análise para que uma única fonte muito movimentada não ocupe sozinha todas as candidatas. Feeds internacionais podem ser usados normalmente: títulos e resumos são produzidos em português brasileiro pela LLM local.

## Requisitos

- **Node.js 22.5+**
- **Ollama**
- **Chrome, Chromium ou Microsoft Edge** para gerar o PDF
- modelo local padrão: **qwen3:4b**

## Instalação

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
npm.cmd install
ollama pull qwen3:4b
```

## Gerar a newsletter

No Windows, dê dois cliques em:

```text
GERAR-DAILY.bat
```

Ou use o terminal:

```powershell
ollama serve
```

Em outro terminal:

```powershell
npm.cmd run daily
```

## Saída

```text
output/
├─ AAAA-MM-DD/
│  ├─ index.html
│  ├─ edition.json
│  └─ highlords-daily-AAAA-MM-DD.pdf
├─ latest.html
├─ latest.json
└─ highlords-daily-latest.pdf
```

O PDF é impresso pelo Chromium a partir do **mesmo HTML da newsletter**, preservando layout, imagens, cores, tipografia e links clicáveis.

## Configuração

Crie um `.env` baseado em `.env.example` para alterar os padrões:

```env
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b
TIME_ZONE=America/Sao_Paulo
OUTPUT_DIR=./output

CATEGORIES_FILE=./config/categories.yml
FEEDS_FILE=./config/feeds.yml

LOOKBACK_HOURS=48
MAX_ITEMS_PER_FEED=12
MAX_CANDIDATES=96
AI_BATCH_SIZE=10
ITEMS_PER_CATEGORY=2
LLM_MIN_SCORE=4.5
AUTO_OPEN=true
```

- `CATEGORIES_FILE`: taxonomia editorial.
- `FEEDS_FILE`: fontes RSS e focos sugeridos.
- `LOOKBACK_HOURS`: janela das notícias.
- `MAX_ITEMS_PER_FEED`: itens lidos por feed.
- `MAX_CANDIDATES`: notícias enviadas para análise.
- `AI_BATCH_SIZE`: matérias por lote do Ollama.
- `ITEMS_PER_CATEGORY`: destaques por seção, de 1 a 3.
- `LLM_MIN_SCORE`: nota mínima para seguir à etapa editorial.
- `AUTO_OPEN`: abre o HTML ao finalizar.

## Stack

- Node.js
- `rss-parser`
- `yaml`
- Ollama
- `qwen3:4b`
- HTML/CSS
- `puppeteer-core`
- Chrome / Chromium / Edge

## Privacidade

A análise editorial acontece localmente através do Ollama. Nenhuma API externa de IA é necessária para gerar a newsletter.
