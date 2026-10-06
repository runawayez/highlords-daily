<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Informação sem ruído.</strong></p>

<p align="center">
  <strong>Português</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
Motor local-first de newsletter diária com RSS/Atom, Ollama, memória editorial, localização regional e geração em HTML, JSON, PDF, Markdown e formatos para distribuição.
</p>

O **Highlords Daily** coleta notícias recentes, valida e cacheia imagens, elimina histórias repetidas, usa uma LLM local para classificar, traduzir/localizar, resumir e pontuar as matérias e executa uma segunda etapa de curadoria para montar a edição.

A IA roda localmente pelo **Ollama**. Nenhuma API externa de IA é necessária.

O preset padrão **Vanilla/BR** continua pronto para uso: `pt-BR`, contexto Brasil e fontes brasileiras. O engine, porém, é universal: idioma, país/contexto, timezone, categorias, feeds, perfil editorial, identidade visual e exportadores são configuráveis sem alterar o JavaScript.

---

## Quick Start

### Windows

Pré-requisitos:

- Git
- Node.js 22.5+
- Ollama
- Google Chrome ou Microsoft Edge

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
```

Depois dê dois cliques em `GERAR-DAILY.bat` ou execute:

```powershell
.\GERAR-DAILY.bat
```

O launcher verifica o ambiente, instala dependências quando necessário, inicia o Ollama, baixa o modelo configurado na primeira execução e encerra o Ollama ao final quando foi ele quem iniciou o serviço.

### macOS / Linux

Instale Git, Node.js 22.5+, Ollama, `curl` e Chrome/Chromium/Edge.

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

### Setup guiado opcional

O Vanilla funciona sem `.env`. Para personalizar sem editar o arquivo na mão:

```bash
npm run setup
```

O assistente pergunta preset, idioma, contexto regional, timezone, perfil editorial, nome da publicação, modelo e quantidade por categoria.

---

## Universal por design

As três configurações que definem o contexto principal são:

```env
PRESET=br
LANGUAGE=pt-BR
EDITORIAL_CONTEXT=Brasil
TIME_ZONE=America/Sao_Paulo
```

Um leitor australiano pode usar, por exemplo:

```env
PRESET=custom
LANGUAGE=en-AU
EDITORIAL_CONTEXT=Australia
TIME_ZONE=Australia/Sydney
CATEGORIES_FILE=./my-config/categories.yml
FEEDS_FILE=./my-config/feeds.yml
```

O Ollama localiza títulos, resumos, tags, introdução, nomes de seções e rótulos da interface para o locale escolhido. Ele **não inventa conversão cambial**: preços estrangeiros continuam na moeda original e recebem contexto de mercado quando necessário.

---

## Presets

A estrutura é:

```text
presets/
├─ br/
│  ├─ categories.yml
│  └─ feeds.yml
└─ global/
   ├─ categories.yml
   └─ feeds.yml
```

`PRESET=br` é o Vanilla Brazil-first. `PRESET=global` mistura fontes brasileiras e internacionais.

Para criar um preset regional, copie uma pasta, troque os RSS/Atom e configure `LANGUAGE`, `EDITORIAL_CONTEXT` e `TIME_ZONE`. O engine resolve automaticamente `presets/<nome>/categories.yml` e `feeds.yml`.

`CATEGORIES_FILE` e `FEEDS_FILE` continuam disponíveis como overrides completos.

---

## Perfis editoriais

Use:

```env
EDITORIAL_PROFILE=balanced
```

Perfis incluídos:

- `balanced` — equilíbrio geral;
- `tech-heavy` — tecnologia em primeiro plano;
- `business` — economia e negócios;
- `gaming` — games e hardware;
- `minimal` — edição mais curta.

As definições ficam em `config/editorial-profiles.yml` e podem ser editadas ou ampliadas.

---

## Memória e deduplicação

O Highlords mantém memória local entre edições. Por padrão:

```env
HISTORY_ENABLED=true
HISTORY_DAYS=90
DUPLICATE_DAYS=7
DUPLICATE_THRESHOLD=0.72
MEMORY_FILE=./data/highlords.sqlite
```

Quando o `node:sqlite` está disponível, o histórico usa SQLite. Em runtimes onde o módulo não está disponível, o engine cai automaticamente para um arquivo JSON local.

Antes da IA, links e histórias já publicadas recentemente são removidos. Depois da análise, o Ollama gera um `topicKey` por matéria e o engine faz uma segunda deduplicação semântica para consolidar coberturas do mesmo acontecimento.

A pasta `data/` é local e ignorada pelo Git.

---

## Imagens estáveis

O Vanilla usa:

```env
REQUIRE_IMAGES=true
CACHE_IMAGES=true
```

O coletor valida imagens antes de gastar processamento com a matéria. Depois da curadoria, as imagens das histórias realmente selecionadas são baixadas para:

```text
output/AAAA-MM-DD/assets/
```

Assim a edição HTML/PDF não depende permanentemente de hotlinks externos. Se um download de cache falhar no último estágio, a matéria mantém a URL remota como fallback.

---

## Diversidade de fontes

```env
MAX_ITEMS_PER_SOURCE=3
MAX_ITEMS_PER_SOURCE_PER_SECTION=1
SOURCE_DIVERSITY_STRICT=false
```

O engine tenta evitar que uma única fonte domine a edição e cada seção. Com `SOURCE_DIVERSITY_STRICT=false`, o limite pode ser relaxado apenas quando necessário para não deixar vagas vazias. Use `true` para transformar a regra em limite rígido.

---

## Identidade visual

O Highlords pode continuar sendo Highlords ou virar outra publicação em cima do mesmo engine:

```env
PUBLICATION_NAME=Highlords Daily
PUBLICATION_TAGLINE=Informação sem ruído
PUBLICATION_LOGO=./public/assets/highlords-logo.svg
ACCENT_COLOR=#c92f2b
PAPER_COLOR=#f7f3e9
BACKGROUND_COLOR=#0b0b0d
```

Nome, logo, slogan e cores são usados no HTML/PDF e no arquivo histórico.

---

## Diagnóstico dos feeds

Antes de gerar uma edição você pode verificar as fontes sem chamar o Ollama:

```bash
npm run feeds:check
```

O comando testa cada feed, mede tempo, mostra quantas matérias recentes permaneceram elegíveis e quantas foram descartadas por falta de imagem.

Para saída estruturada:

```bash
npm run feeds:check -- --json
```

---

## Agendamento local

Agende uma edição diária às 07:00:

```bash
npm run schedule -- --time 07:00
```

O comando usa:

- Windows Task Scheduler no Windows;
- `launchd` no macOS;
- `cron` no Linux.

Remover:

```bash
npm run schedule:remove
```

Nada depende de servidor ou GitHub Actions.

---

## Saídas

Cada execução cria:

```text
output/
├─ index.html                         # arquivo navegável das edições
├─ latest.html                        # redireciona para a edição mais recente
├─ latest.json
├─ latest.md
├─ latest-email.html
├─ latest-telegram.txt
├─ latest-discord.md
├─ highlords-daily-latest.pdf
└─ AAAA-MM-DD/
   ├─ index.html
   ├─ edition.json
   ├─ edition.md
   ├─ email.html
   ├─ telegram.txt
   ├─ discord.md
   ├─ highlords-daily-AAAA-MM-DD.pdf
   └─ assets/
```

Você pode desligar exportadores individualmente:

```env
EXPORT_MARKDOWN=true
EXPORT_EMAIL=true
EXPORT_SOCIAL=true
ARCHIVE_ENABLED=true
```

---

## Categorias e fontes

Uma categoria:

```yaml
categories:
  - slug: ciencia
    name: Ciência
    description: Pesquisa, espaço, astronomia, biologia e descobertas científicas.
    aliases: [science, astronomia]
```

Uma fonte:

```yaml
feeds:
  - name: Example News
    url: https://example.com/feed.xml
    focus: [ciencia]
    strict_focus: true
    images: page
```

`focus` orienta a classificação. `strict_focus: true` impede uma fonte vertical de vazar para outras categorias. `images: page` força a busca de `og:image`/`twitter:image` na página da matéria.

---

## Plugins

Arquivos `plugins/*.plugin.mjs` são carregados automaticamente quando:

```env
PLUGINS_ENABLED=true
```

Hooks disponíveis:

- `afterCollect`
- `afterAnalyze`
- `beforeRender`
- `afterWrite`
- `exportEdition`

Erros de plugins são isolados e não derrubam a edição. Veja `plugins/README.md`.

Isso permite integrar novas fontes, filtros, exportadores ou automações sem alterar o core.

---

## Desktop experimental

Existe uma camada Electron opcional em `desktop/`:

```bash
npm run desktop:install
npm run desktop
```

Ela permite editar as principais configurações e gerar a edição por interface gráfica.

Para preparar um instalador no sistema operacional atual:

```bash
npm run desktop:build
```

Targets configurados: NSIS/Windows, DMG/macOS e AppImage/Linux. Ollama e Chrome/Chromium/Edge continuam sendo pré-requisitos externos. A interface desktop é opcional; o CLI continua sendo o caminho principal e mais leve.

---

## Como funciona

```text
Preset / YAML / .env
        ↓
RSS / Atom
        ↓
validação de imagens
        ↓
memória histórica
        ↓
Ollama: classificação + localização + topicKey
        ↓
deduplicação semântica
        ↓
perfil editorial + diversidade de fontes
        ↓
Ollama editor-chefe
        ↓
cache local das imagens selecionadas
        ↓
HTML + PDF + JSON + Markdown + email + social
        ↓
memória + arquivo navegável + plugins
```

---

## Configuração completa

Veja `.env.example`. Os valores Vanilla funcionam sem criar `.env`.

O projeto requer Node.js 22.5+ e utiliza `package-lock.json` para instalações reproduzíveis. Os launchers instalam dependências automaticamente quando necessário.

## Privacidade

A curadoria acontece localmente pelo Ollama. O conteúdo das matérias não precisa ser enviado a uma API externa de IA. As requisições externas do Highlords são apenas as necessárias para buscar RSS/Atom, páginas e imagens das fontes configuradas.
