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

**Futebol** significa futebol de associação/soccer. Futebol americano, NFL, NCAA, Super Bowl e outras modalidades ficam em **Esportes**, junto de basquete, Fórmula 1, tênis, vôlei, lutas, atletismo, rugby e esportes olímpicos.

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
extração + validação de imagens
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
validação editorial
   ├─ respeita fontes de foco estrito
   ├─ impede vazamento entre verticais
   └─ mantém candidatas de reserva por seção
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

O padrão Vanilla tenta manter **2 destaques por categoria**. Para isso, o analisador conserva candidatas de reserva da mesma categoria quando elas ficam até 1 ponto abaixo do corte principal, e o gerador completa vagas antes da montagem final. Também evita, quando possível, escolher como manchete uma matéria que faria sua própria seção perder um dos dois destaques.

Categorias sem matéria válida não são renderizadas.

## Política de imagens

No preset Vanilla, `REQUIRE_IMAGES=true` vem ativado por padrão. Isso significa que uma matéria só segue para o Ollama se o coletor encontrar e validar uma imagem real para ela.

O coletor tenta primeiro a imagem presente no RSS e, quando necessário, busca `og:image` ou `twitter:image` diretamente na página da matéria. A URL encontrada é testada antes de a notícia entrar no pool editorial. Matérias sem imagem válida são descartadas antes da análise por IA.

Isso mantém **imagem em 100% dos cards selecionáveis da newsletter** e também evita gastar processamento do Ollama com matérias que depois quebrariam o layout visual.

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
    strict_focus: true

  - name: BBC Sport
    url: https://feeds.bbci.co.uk/sport/rss.xml
    focus: [esportes]
    strict_focus: true
```

Por padrão, `focus` funciona como uma dica editorial. Quando `strict_focus: true`, a matéria só pode ser classificada em uma das categorias listadas em `focus`. Isso é útil para fontes verticais e impede, por exemplo, uma matéria esportiva de acabar em Desenvolvimento por causa de uma resposta inconsistente do modelo.

Se o RSS fornecer apenas logo ou arte genérica, use `images: page` para buscar a `og:image` diretamente na página da matéria. Para desativar imagens naquela fonte, use `images: false`. O coletor também elimina imagens idênticas repetidas pela mesma fonte.

Com `REQUIRE_IMAGES=true`, feeds configurados com `images: false` não terão matérias elegíveis para a edição.

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
REQUIRE_IMAGES=true
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
- `REQUIRE_IMAGES`: quando `true`, descarta antes da IA qualquer matéria sem imagem válida.
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
