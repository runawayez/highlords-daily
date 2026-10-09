<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Informação sem ruído.</strong></p>

<p align="center">
  <strong>Português</strong> · <a href="README.en.md">English</a>
</p>

<p align="center">
Motor local-first de newsletter diária com RSS/Atom, Ollama, memória editorial, curadoria em múltiplas etapas e geração em HTML, JSON, PDF, Markdown e formatos para distribuição.
</p>

O **Highlords Daily** coleta notícias recentes, aplica regras editoriais determinísticas, elimina histórias repetidas, usa uma LLM local para classificar e resumir as matérias, executa revisão semântica e ranking editorial humano, monta a edição e só publica quando o contrato editorial é atendido.

A IA roda localmente pelo **Ollama**. Nenhuma API externa de IA é necessária.

O preset padrão **Vanilla/BR** vem pronto para uso em `pt-BR`, com contexto Brasil, fontes brasileiras e internacionais selecionadas, taxonomia diária compacta e regras próprias de cobertura. O engine continua universal: idioma, região, timezone, categorias, feeds, perfil editorial, identidade visual e exportadores podem ser configurados sem alterar o JavaScript.

---

## O que mudou no fluxo editorial atual

O preset BR não tenta mais preencher um portal com dezenas de editorias. A edição diária trabalha com **10 categorias**, divididas entre núcleos obrigatórios e editorias oportunísticas.

### Núcleo editorial

Estas categorias são consideradas centrais para a edição e devem ter cobertura válida:

- **Tecnologia**
- **IA & Desenvolvimento**
- **Games**
- **Economia**
- **Política & Sociedade**

### Editorias oportunísticas

Estas entram somente quando houver matéria boa o suficiente no dia:

- **eSports**
- **Entretenimento**
- **Esportes**
- **Ciência & Saúde**
- **Clima & Futuro**

Uma categoria opcional sem notícia forte pode simplesmente não aparecer. Isso evita preenchimento artificial e reduz classificações forçadas só para completar uma grade.

O preset BR atual usa até **160 candidatas** por execução e até **20 itens por feed** antes das etapas de análise e curadoria.

---

## Como a edição é construída

O pipeline atual combina regras determinísticas e avaliação local por IA:

```text
Preset / YAML / .env
        ↓
RSS / Atom
        ↓
normalização de fonte + strict_focus + guardrails
        ↓
validação de imagens + memória histórica
        ↓
Ollama: classificação + score + headline + resumo + topicKey
        ↓
recuperação de cobertura por categoria
        ↓
revisão semântica editorial
        ↓
deduplicação semântica
        ↓
ranking editorial humano multidimensional
        ↓
calibração global da primeira página
        ↓
curadoria da edição
        ↓
quality gate editorial
        ↓
cache local das imagens selecionadas
        ↓
HTML + PDF + JSON + Markdown + email + social
        ↓
memória + arquivo navegável + plugins
```

### Classificação e `strict_focus`

Cada feed pode declarar categorias permitidas com `focus`.

```yaml
feeds:
  - name: Example News
    url: https://example.com/feed.xml
    focus: [ia-desenvolvimento]
    strict_focus: true
```

Quando uma fonte é `strict_focus`, a classificação não pode escapar das categorias declaradas. Fontes dedicadas com **um único focus** recebem um lock canônico de categoria no preset BR, reduzindo a dependência da LLM em casos óbvios.

Exemplo real do preset: o **GitHub Blog** é uma fonte dedicada de `ia-desenvolvimento`, usada para fortalecer a cobertura do núcleo de IA e desenvolvimento.

### Revisão semântica

Depois da classificação inicial, o preset BR executa uma segunda revisão editorial. Essa etapa pode:

- manter a categoria;
- reclassificar uma matéria quando houver alta confiança;
- rejeitar conteúdo fora do escopo;
- ignorar mudanças destrutivas quando a confiança for baixa;
- respeitar os limites de `strict_focus`.

### Ranking editorial humano

As matérias aprovadas são avaliadas por dimensões editoriais separadas, como impacto, significância, interesse público, novidade, utilidade, valor editorial e nível promocional.

O ranking gera dois sinais principais:

- **sectionScore** — força da matéria dentro da própria editoria;
- **frontPageScore** — força relativa para disputar a manchete e a primeira página.

Uma etapa adicional tenta calibrar as melhores candidatas entre si. Se a calibração global retornar uma resposta inválida, o sistema mantém o ranking dimensional anterior em vez de abortar a edição.

### Quality gate

Antes da renderização, o Highlords valida o contrato editorial da edição.

Categorias obrigatórias não podem desaparecer silenciosamente. Se um núcleo como `IA & Desenvolvimento` ficar sem candidata válida, a geração é interrompida com um erro explícito em vez de publicar uma edição incompleta. Categorias oportunísticas podem faltar sem derrubar a publicação.

---

## Quick Start

### Windows — caminho recomendado

Pré-requisitos:

- Git
- Node.js 22.12+
- Ollama
- Google Chrome ou Microsoft Edge

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
.\GERAR-DAILY.bat
```

Também é possível dar dois cliques em `GERAR-DAILY.bat`.

O launcher do Windows:

- verifica Node.js, npm e navegador;
- garante as dependências do projeto;
- inicia Ollama quando necessário;
- aguarda a API local;
- baixa o modelo configurado na primeira execução quando necessário;
- gera a edição;
- encerra o Ollama ao final somente se foi o próprio Highlords que iniciou o serviço.

Esse é o fluxo recomendado para uso diário no Windows.

### macOS / Linux

Instale Git, Node.js 22.12+, Ollama, `curl` e Chrome/Chromium/Edge.

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

### Execução manual

Se preferir controlar os serviços manualmente:

```bash
npm ci
npm run doctor
ollama serve
npm run daily
```

No PowerShell, use `npm.cmd` no lugar de `npm` se a política de execução bloquear `npm.ps1`:

```powershell
npm.cmd run doctor
npm.cmd run daily
```

---

## Atualização e cache

Para atualizar o projeto:

```bash
git pull --ff-only
npm ci
```

No uso normal, faça a manutenção do cache pelo comando próprio:

```bash
npm run cache:prune
```

No PowerShell:

```powershell
npm.cmd run cache:prune
```

Esse comando é preferível a apagar diretórios manualmente.

O histórico editorial fica separado em `data/`, incluindo o banco configurado para memória. Não apague `data/highlords.sqlite` apenas para limpar cache: isso remove histórico editorial, não só arquivos temporários.

---

## Instalação e diagnóstico

O preset BR funciona sem `.env`. Para instalação manual:

```bash
npm ci
npm run setup
npm run doctor
npm run daily
```

`npm run setup` é opcional e ajuda a configurar preset, idioma, contexto regional, timezone, perfil editorial, nome da publicação, modelo e quantidade por categoria.

`npm run doctor` valida Node.js, configuração, navegador e modelo Ollama sem iniciar serviços nem baixar arquivos.

Se Ollama estiver parado:

```bash
ollama serve
```

Se faltar o modelo padrão:

```bash
ollama pull qwen3:4b
```

Chrome, Chromium ou Edge são necessários para gerar PDF.

---

## Preset BR atual

A taxonomia diária do `PRESET=br` é:

```text
Tecnologia
IA & Desenvolvimento
Games
eSports
Entretenimento
Esportes
Economia
Política & Sociedade
Ciência & Saúde
Clima & Futuro
```

As definições ficam em:

```text
presets/br/categories.yml
presets/br/feeds.yml
presets/br/preset.json
presets/br/routing.mjs
```

O preset BR também habilita plugins editoriais específicos para contrato, revisão semântica, apresentação, ranking humano e quality gate.

O preset `global` continua separado e mantém sua própria taxonomia e fontes.

---

## Universal por design

As configurações principais são independentes:

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

Ollama localiza o conteúdo editorial para o locale configurado sem inventar conversão cambial. Preços estrangeiros permanecem na moeda original e podem receber contexto de mercado quando necessário.

---

## Categorias e fontes customizadas

Exemplo de categoria:

```yaml
categories:
  - slug: ciencia
    name: Ciência
    required: false
    description: Pesquisa, espaço, astronomia, biologia e descobertas científicas.
    aliases: [science, astronomia]
```

Exemplo de fonte:

```yaml
feeds:
  - name: Example News
    url: https://example.com/feed.xml
    focus: [ciencia]
    strict_focus: true
    images: page
```

`required: false` permite que a editoria falte sem derrubar a edição.

`focus` orienta a classificação. `strict_focus: true` impede uma fonte vertical de vazar para editorias não autorizadas. `images: page` força a busca de `og:image`/`twitter:image` na página da matéria.

`CATEGORIES_FILE` e `FEEDS_FILE` podem substituir completamente os arquivos do preset.

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
- `gaming` — games e tecnologia relacionada;
- `minimal` — edição mais curta.

As definições ficam em `config/editorial-profiles.yml`.

---

## Memória e deduplicação

Por padrão, o projeto pode manter memória local entre edições:

```env
HISTORY_ENABLED=true
HISTORY_DAYS=90
DUPLICATE_DAYS=7
DUPLICATE_THRESHOLD=0.72
MEMORY_FILE=./data/highlords.sqlite
```

Quando `node:sqlite` está disponível, o histórico usa SQLite. Em runtimes sem o módulo, o engine pode usar fallback local em JSON.

Antes da IA, links e histórias já publicadas recentemente podem ser removidos. Depois da classificação, `topicKey` ajuda a consolidar coberturas diferentes do mesmo acontecimento.

A pasta `data/` é local e ignorada pelo Git.

---

## Imagens estáveis

O engine pode validar imagens antes da análise e armazenar localmente apenas as imagens das histórias escolhidas.

Quando o cache de imagens está habilitado, os arquivos selecionados são salvos em:

```text
output/AAAA-MM-DD/assets/
```

Assim HTML e PDF não dependem permanentemente de hotlinks externos. Se o cache final falhar, a URL remota pode ser mantida como fallback.

---

## Diversidade de fontes

Configurações disponíveis incluem:

```env
MAX_ITEMS_PER_SOURCE=3
MAX_ITEMS_PER_SOURCE_PER_SECTION=1
SOURCE_DIVERSITY_STRICT=false
```

O engine tenta evitar que uma única publicação domine a edição. Em modo não estrito, os limites podem ser relaxados quando necessário para preservar cobertura editorial.

---

## Identidade visual

```env
PUBLICATION_NAME=Highlords Daily
PUBLICATION_TAGLINE=Informação sem ruído
PUBLICATION_LOGO=./public/assets/highlords-logo.svg
ACCENT_COLOR=#c92f2b
PAPER_COLOR=#f7f3e9
BACKGROUND_COLOR=#0b0b0d
```

Nome, logo, slogan e cores são aplicados às saídas visuais e ao arquivo histórico.

---

## Diagnóstico de feeds

Verifique as fontes sem chamar o Ollama:

```bash
npm run feeds:check
```

Saída estruturada:

```bash
npm run feeds:check -- --json
```

O comando testa feeds e mostra saúde, latência e elegibilidade das matérias.

### Descoberta automática de RSS/Atom

```bash
npm run feeds:discover -- omelete.com.br canaltech.com.br
```

O comando procura declarações RSS/Atom no HTML e testa caminhos comuns como `/feed`, `/rss.xml`, `/feed.xml` e `/atom.xml`.

Para anexar os feeds encontrados a outro arquivo:

```bash
npm run feeds:discover -- abc.net.au theguardian.com/au --append ./my-config/feeds.yml
```

Os feeds descobertos entram com `focus: []`; revise manualmente a cobertura editorial antes de usá-los em produção.

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

Para remover:

```bash
npm run schedule:remove
```

---

## Principais comandos

```bash
npm run daily
npm run doctor
npm run setup
npm run feeds:check
npm run feeds:discover -- example.com
npm run sources:discover
npm run config:show
npm run cache:prune
npm run benchmark
npm run pdf:rerender
npm run deliver
npm run schedule -- --time 07:00
npm run schedule:remove
npm run check
npm test
```

Use `node src/cli/run.mjs <comando> --help` quando quiser ver opções adicionais dos comandos roteados pelo CLI principal.

---

## Saídas

Cada execução pode gerar:

```text
output/
├─ index.html
├─ latest.html
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

Exportadores podem ser ativados ou desativados pela configuração, incluindo Markdown, email, social e arquivo navegável.

---

## Plugins

Arquivos `plugins/*.plugin.mjs` podem participar de hooks como:

- `afterCollect`
- `afterAnalyze`
- `beforeRender`
- `afterWrite`
- `exportEdition`

O preset BR usa plugins editoriais próprios. Alguns plugins são deliberadamente **fatais**, como o quality gate: quando o contrato editorial não é atendido, a geração deve parar em vez de publicar conteúdo incompleto.

Veja `plugins/README.md` para o contrato dos plugins.

---

## Desktop experimental

Existe uma camada Electron opcional em `desktop/`:

```bash
npm run desktop:install
npm run desktop
```

Para preparar um instalador no sistema operacional atual:

```bash
npm run desktop:build
```

Targets configurados incluem NSIS/Windows, DMG/macOS e AppImage/Linux. Ollama e Chrome/Chromium/Edge continuam sendo pré-requisitos externos. O CLI e os launchers continuam sendo o caminho principal.

---

## Desenvolvimento e CI

Para contribuir:

```bash
npm ci
npm run format:check
npm run check
npm test
```

O CI valida Windows, macOS e Linux em Node.js 22 e 24, incluindo preparação do core desktop. Os testes não dependem de Ollama ou feeds ativos.

O projeto requer Node.js **22.12+** e usa `package-lock.json` para instalações reproduzíveis.

---

## Privacidade

A curadoria por IA acontece localmente pelo Ollama. O conteúdo das matérias não precisa ser enviado a uma API externa de IA. As requisições externas do Highlords são as necessárias para buscar RSS/Atom, páginas, imagens e serviços de entrega que o usuário tenha configurado.
