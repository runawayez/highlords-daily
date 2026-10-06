<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Informação sem ruído.</strong></p>

<p align="center">
Newsletter diária local e personalizável com curadoria por IA via Ollama, agregação RSS/Atom e geração editorial em HTML, JSON e PDF.
</p>

O **Highlords Daily** coleta notícias recentes, valida imagens, usa uma LLM local para classificar, resumir e pontuar as matérias e depois executa uma segunda etapa de curadoria para montar uma edição pronta para leitura.

Tudo acontece localmente. **Nenhuma API externa de IA é necessária.**

O preset padrão **Vanilla é Brazil-first**: usa somente fontes brasileiras para reduzir manchetes com preços, disponibilidade e contexto pensados para outros mercados.

---

## Quick Start

### Windows

Você precisa ter instalado:

- **Git**
- **Node.js 22.5 ou superior**
- **Ollama**
- **Google Chrome ou Microsoft Edge**

Clone o projeto:

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
```

Depois, dê dois cliques em:

```text
GERAR-DAILY.bat
```

Ou execute pelo terminal:

```powershell
.\GERAR-DAILY.bat
```

O launcher verifica automaticamente Node.js, npm, Ollama e o navegador. Se as dependências ainda não estiverem instaladas, ele executa `npm install`. Se o modelo `qwen3:4b` ainda não existir, ele também faz o download automaticamente.

> Na primeira execução o download do modelo pode levar alguns minutos. Nas próximas execuções ele não será baixado novamente.

Você **não precisa** iniciar `ollama serve` manualmente. O launcher inicia o Ollama quando necessário e, se ele próprio tiver iniciado o serviço, encerra-o ao final da geração.

### macOS / Linux

Instale **Git**, **Node.js 22.5+**, **Ollama**, `curl` e um navegador compatível (**Chrome, Chromium ou Edge**).

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

O script faz as mesmas verificações do launcher do Windows, instala dependências quando necessário, inicia o Ollama, baixa o modelo na primeira execução e encerra o serviço ao final quando foi ele quem o iniciou.

### Pronto

Ao finalizar, o Highlords abre a edição HTML automaticamente e grava os arquivos em:

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

O PDF usa o mesmo layout do HTML e preserva imagens, cores e links clicáveis.

---

## Nenhuma configuração é obrigatória

O preset **Vanilla** já vem pronto para uso. Você pode clonar o projeto e gerar a newsletter sem criar `.env` e sem editar YAML.

Crie um `.env` somente se quiser alterar os padrões:

**Windows:**

```powershell
copy .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Configuração padrão:

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

Principais opções:

- `OLLAMA_MODEL`: modelo local usado para análise e curadoria.
- `LOOKBACK_HOURS`: janela de tempo das notícias coletadas.
- `MAX_CANDIDATES`: máximo de matérias enviadas para análise.
- `ITEMS_PER_CATEGORY`: quantidade alvo de destaques por seção.
- `LLM_MIN_SCORE`: nota mínima principal para uma matéria seguir à etapa editorial.
- `REQUIRE_IMAGES=true`: elimina matérias sem imagem válida antes da IA.
- `AUTO_OPEN=true`: abre o HTML automaticamente ao terminar.
- `BROWSER_PATH`: opcional; use somente se Chrome/Chromium/Edge não for detectado automaticamente.

---

## Highlords Daily Vanilla

O preset padrão vem com dez categorias editoriais:

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

O Vanilla usa **somente fontes brasileiras**. Isso não significa que as notícias precisam acontecer no Brasil; significa que a seleção e o contexto editorial partem de veículos voltados ao público brasileiro.

**Futebol** significa futebol de associação/soccer. Futebol americano, NFL, NCAA, Super Bowl e outras modalidades ficam em **Esportes**, junto de basquete, Fórmula 1, tênis, vôlei, lutas, atletismo, rugby e esportes olímpicos.

O Vanilla tenta manter **2 destaques por categoria**, sem forçar conteúdo irrelevante apenas para preencher espaço.

---

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

Cada notícia recebe categoria, **nota de relevância de 0 a 10**, headline em PT-BR, resumo e tags. A nota considera novidade, impacto, utilidade e interesse editorial.

---

## Política de imagens

No Vanilla, `REQUIRE_IMAGES=true` vem ativado por padrão.

O coletor tenta obter a imagem pelo RSS e, quando necessário, busca `og:image` ou `twitter:image` diretamente na página da matéria. A URL é validada antes de a notícia entrar no pool editorial.

Matérias sem imagem válida são descartadas **antes** de serem enviadas ao Ollama. Isso mantém imagem em 100% dos cards elegíveis e evita gastar processamento com conteúdo que quebraria o layout da edição.

---

## Personalizar categorias

A taxonomia fica em:

```text
config/categories.yml
```

Exemplo:

```yaml
categories:
  - slug: ciencia
    name: Ciência
    description: Pesquisa, espaço, astronomia, biologia e descobertas científicas.
    aliases: [science, astronomia]
```

O prompt do Ollama e o formato esperado do editor-chefe são construídos dinamicamente a partir desse arquivo. Você pode trocar completamente as categorias sem alterar o JavaScript.

---

## Personalizar fontes

As fontes do Vanilla ficam em:

```text
config/feeds.yml
```

Exemplo:

```yaml
feeds:
  - name: Trivela
    url: https://trivela.com.br/feed/
    focus: [futebol]
    strict_focus: true
    images: page
```

`focus` funciona como orientação editorial. Com `strict_focus: true`, uma fonte vertical só pode gerar matérias para as categorias declaradas em `focus`.

Para fontes cujo RSS fornece logos ou imagens genéricas, use:

```yaml
images: page
```

Assim o Highlords busca a imagem diretamente na página da matéria.

### Fontes incluídas no Vanilla

**Tecnologia, desenvolvimento e games:** Tecnoblog, Canaltech, TecMundo, Olhar Digital, iMasters, Diolinux, Adrenaline e GameVicio.

**Futebol:** ge, Trivela, Placar e UOL Esporte.

**Esportes:** ge, UOL Esporte, Grande Prêmio, Olimpíada Todo Dia e Agência Brasil Esportes.

**Economia:** InfoMoney, MoneyTimes, Exame, Seu Dinheiro, Brazil Journal, UOL Economia e Agência Brasil Economia.

### Preset global opcional

Quem preferir uma seleção misturando fontes brasileiras e internacionais pode usar:

```text
config/feeds-global.yml
```

No `.env`:

```env
FEEDS_FILE=./config/feeds-global.yml
```

Esse preset mantém fontes como The Verge, Ars Technica, Hacker News, TechCrunch, GitHub Blog, InfoQ, Tom's Hardware, BBC Sport e outras.

---

## Uso manual

Se preferir não usar os launchers:

```powershell
ollama serve
```

Em outro terminal:

```powershell
npm.cmd install
ollama pull qwen3:4b
npm.cmd run daily
```

No macOS/Linux, use `npm` no lugar de `npm.cmd`.

---

## Solução de problemas

### `Ollama não está respondendo`

Os launchers tentam iniciar o serviço automaticamente. Se quiser testar manualmente:

```bash
ollama serve
```

### `Modelo qwen3:4b não encontrado`

```bash
ollama pull qwen3:4b
```

### `Chrome/Chromium/Edge não encontrado`

Instale um navegador compatível ou configure no `.env`:

```env
BROWSER_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Em Linux/macOS, informe o caminho absoluto do executável correspondente.

### A primeira execução está demorando

É normal quando o modelo ainda precisa ser baixado. Depois disso, o tempo passa a depender principalmente da quantidade de notícias e da velocidade da sua máquina ao executar a LLM local.

---

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

A curadoria acontece localmente através do Ollama. O Highlords Daily não precisa enviar o conteúdo das matérias para uma API externa de IA.
