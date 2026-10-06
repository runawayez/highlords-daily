<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

# Highlords Daily

**Informação sem ruído.**

Highlords Daily é um gerador local de newsletter diária feito com **RSS + Ollama**. Ele coleta notícias recentes, usa uma LLM local para filtrar, classificar, traduzir, resumir e pontuar cada matéria, monta a edição com uma segunda etapa editorial e entrega tudo em **HTML, JSON e PDF**.

O projeto já vem com um preset editorial pronto chamado **Vanilla**. Basta clonar, instalar o modelo e gerar a edição. Quem quiser pode trocar categorias e fontes editando arquivos YAML, sem alterar o código da aplicação.

## Highlords Daily Vanilla

O preset padrão vem com nove categorias:

1. **IA**
2. **Desenvolvimento**
3. **Mobile & Gadgets**
4. **Hardware**
5. **Software & Internet**
6. **Games**
7. **Futebol**
8. **Economia**
9. **Futuro**

As categorias ficam em:

```text
config/categories.yml
```

As fontes RSS ficam em:

```text
config/feeds.yml
```

Assim, a estrutura editorial não fica hardcoded no JavaScript. O Ollama recebe as categorias configuradas no YAML e adapta automaticamente a classificação e a montagem da newsletter.

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
   └─ escreve título e introdução da edição
          ↓
template HTML editorial
          ↓
       Chromium
          ↓
PDF com o mesmo layout e links do HTML
```

## Curadoria por IA local

Cada notícia recebe do Ollama:

- categoria;
- nota de relevância de **0 a 10**;
- headline em português brasileiro;
- resumo curto em português brasileiro;
- tags.

A nota combina principalmente **novidade, impacto, utilidade, relevância para o leitor e interesse editorial**. Notícias comuns tendem a ficar na faixa intermediária; notas de 8 a 10 ficam reservadas para destaques realmente fortes.

Depois dessa triagem, uma segunda chamada ao Ollama atua como **editor-chefe** e monta a edição final. Caso uma seção fique incompleta, o gerador pode completar as vagas com as melhores candidatas daquela categoria que já tenham sido aprovadas pela LLM.

Categorias sem nenhuma matéria aprovada simplesmente não são renderizadas naquela edição.

## Categorias personalizáveis

O arquivo `config/categories.yml` é a fonte de verdade da taxonomia editorial.

Exemplo:

```yaml
categories:
  - slug: ciencia
    name: Ciência
    description: Pesquisa, espaço, astronomia, biologia e descobertas científicas.
    aliases:
      - science
      - astronomia

  - slug: cinema
    name: Cinema
    description: Filmes, festivais, lançamentos, bilheteria e indústria cinematográfica.
    aliases:
      - movies
      - filmes
```

Depois de salvar o arquivo, não é necessário alterar `ollama.mjs`, `daily.mjs` ou o template. Os slugs válidos e o formato esperado da resposta do modelo são gerados dinamicamente.

## Fontes personalizáveis

Cada feed pode indicar uma ou mais categorias em `focus`:

```yaml
feeds:
  - name: Trivela
    url: https://trivela.com.br/feed/
    focus: [futebol]

  - name: InfoMoney
    url: https://www.infomoney.com.br/feed/
    focus: [economia]
```

`focus` é apenas uma **dica** para o modelo. A classificação final continua sendo feita pelo Ollama com base no conteúdo da matéria.

O coletor também distribui as candidatas entre as fontes antes da análise, evitando que um feed muito movimentado ocupe sozinho todo o limite diário.

## Fontes Vanilla

O preset padrão inclui fontes de tecnologia, games, futebol e economia, entre elas:

- Tecnoblog
- The Verge
- Ars Technica
- Hacker News
- TechCrunch
- GitHub Blog
- InfoQ
- Tom's Hardware
- Rock Paper Shotgun
- ge
- Trivela
- InfoMoney
- MoneyTimes
- Agência Brasil Economia

Feeds internacionais podem ser usados normalmente: títulos e resumos da edição são produzidos em português brasileiro pela LLM local.

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

No Windows, a forma mais simples é dar dois cliques em:

```text
GERAR-DAILY.bat
```

O script verifica o Ollama, inicia o serviço quando necessário e executa o gerador.

Pelo terminal:

```powershell
ollama serve
```

Em outro terminal:

```powershell
npm.cmd run daily
```

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

CATEGORIES_FILE=./config/categories.yml
FEEDS_FILE=./config/feeds.yml

LOOKBACK_HOURS=48
MAX_ITEMS_PER_FEED=12
MAX_CANDIDATES=72
AI_BATCH_SIZE=10
ITEMS_PER_CATEGORY=2
LLM_MIN_SCORE=4.5
AUTO_OPEN=true
```

Principais opções:

- `CATEGORIES_FILE`: arquivo YAML que define a taxonomia da newsletter.
- `FEEDS_FILE`: arquivo YAML com as fontes RSS e seus focos sugeridos.
- `LOOKBACK_HOURS`: janela de tempo das notícias coletadas.
- `MAX_ITEMS_PER_FEED`: limite de itens lidos de cada RSS.
- `MAX_CANDIDATES`: máximo de notícias enviadas para análise.
- `AI_BATCH_SIZE`: quantidade de matérias por lote do Ollama.
- `ITEMS_PER_CATEGORY`: número de destaques por seção, entre 1 e 3.
- `LLM_MIN_SCORE`: nota mínima para uma matéria seguir para a etapa editorial.
- `AUTO_OPEN`: abre o HTML automaticamente ao finalizar.

## Stack

- Node.js
- `rss-parser`
- `yaml`
- Ollama
- `qwen3:4b`
- HTML/CSS
- `puppeteer-core`
- Chrome / Chromium / Edge para impressão em PDF

## Privacidade

A análise editorial acontece localmente através do Ollama. Nenhuma API externa de IA é necessária para gerar a newsletter.
