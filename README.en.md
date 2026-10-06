<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Information without noise.</strong></p>

<p align="center">
  <a href="README.md">Português</a> · <strong>English</strong>
</p>

<p align="center">
A local, customizable daily newsletter generator powered by RSS/Atom and Ollama, with polished HTML, JSON and PDF output.
</p>

**Highlords Daily** collects recent stories, validates images, uses a local LLM to classify, translate/localize, summarize and score them, then runs a second editorial pass to assemble a readable daily edition.

Everything runs locally. **No external AI API is required.**

The default **Vanilla** preset is Brazil-first: Brazilian sources, `pt-BR`, and a Brazilian editorial context. The engine itself is universal — you can change the language, regional context, categories and RSS sources without changing the JavaScript code.

---

## Quick Start

### Windows

Requirements:

- **Git**
- **Node.js 22.5+**
- **Ollama**
- **Google Chrome or Microsoft Edge**

Clone the repository:

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
```

Then double-click:

```text
GERAR-DAILY.bat
```

Or run it from a terminal:

```powershell
.\GERAR-DAILY.bat
```

The launcher checks Node.js, npm, Ollama and the browser automatically. It installs npm dependencies when needed and downloads the configured Ollama model on first use.

You do **not** need to start `ollama serve` manually. If the launcher starts Ollama, it also shuts that process down when generation finishes.

### macOS / Linux

Install **Git**, **Node.js 22.5+**, **Ollama**, `curl`, and a compatible browser (**Chrome, Chromium or Edge**).

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

The shell launcher performs the same environment checks, installs dependencies when needed, starts Ollama, downloads the model on first use, and stops the Ollama process afterwards if it started it.

### Output

When generation finishes, Highlords opens the HTML edition automatically and writes:

```text
output/
├─ YYYY-MM-DD/
│  ├─ index.html
│  ├─ edition.json
│  └─ highlords-daily-YYYY-MM-DD.pdf
├─ latest.html
├─ latest.json
└─ highlords-daily-latest.pdf
```

The PDF is rendered from the same HTML edition and preserves the visual layout and clickable links.

---

## No configuration is required

The Vanilla preset works out of the box. You only need a `.env` file if you want to customize the defaults.

**Windows:**

```powershell
copy .env.example .env
```

**macOS / Linux:**

```bash
cp .env.example .env
```

Default configuration:

```env
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3:4b

LANGUAGE=pt-BR
EDITORIAL_CONTEXT=Brasil
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

Key settings:

- `LANGUAGE`: output locale, such as `pt-BR`, `en-AU`, `en-US`, `es-ES` or `fr-FR`.
- `EDITORIAL_CONTEXT`: target country, region or audience for editorial framing.
- `TIME_ZONE`: timezone used to determine the edition date.
- `OLLAMA_MODEL`: local model used for analysis and curation.
- `LOOKBACK_HOURS`: news collection window.
- `MAX_CANDIDATES`: maximum number of stories sent to the analysis stage.
- `ITEMS_PER_CATEGORY`: target number of stories per section.
- `LLM_MIN_SCORE`: primary editorial relevance cutoff.
- `REQUIRE_IMAGES=true`: rejects stories without a valid image before they reach the LLM.
- `AUTO_OPEN=true`: opens the generated HTML automatically.
- `BROWSER_PATH`: optional browser executable override.

---

## Language and regional context

Highlords separates **language** from **editorial context**.

`LANGUAGE` controls the locale used for headlines, summaries, tags, section names, interface labels and dates. `EDITORIAL_CONTEXT` tells the local editor who it is writing for.

For example, an Australian edition could use:

```env
LANGUAGE=en-AU
EDITORIAL_CONTEXT=Australia
TIME_ZONE=Australia/Sydney
FEEDS_FILE=./config/feeds-australia.yml
```

You can then create `config/feeds-australia.yml` with Australian RSS feeds. Ollama will write in Australian English and frame the edition for an Australian reader.

Another example:

```env
LANGUAGE=es-MX
EDITORIAL_CONTEXT=México
TIME_ZONE=America/Mexico_City
```

Highlords is instructed **not to invent currency conversions**. If a source mentions a foreign price, the model should preserve the factual currency and clarify the relevant market/context instead of presenting it as a local price.

Section names and visible interface labels are also localized by the editor-in-chief pass. Portuguese and English have built-in fallback labels if that editorial pass fails.

---

## Vanilla preset

Vanilla ships with ten editorial categories:

1. **AI**
2. **Development**
3. **Mobile & Gadgets**
4. **Hardware**
5. **Software & Internet**
6. **Games**
7. **Football**
8. **Sports**
9. **Economy**
10. **Future**

The source configuration itself is Brazil-first. That does not mean every story must be about Brazil; it means the default sources are written for a Brazilian audience and are less likely to present foreign pricing or availability without local context.

Vanilla aims for **2 stories per category** when enough relevant candidates are available.

---

## How it works

```text
categories.yml + feeds.yml
          ↓
       RSS / Atom
          ↓
image extraction + validation
          ↓
balanced source collection
          ↓
Ollama analysis batches
   ├─ removes off-topic content
   ├─ classifies stories
   ├─ localizes to LANGUAGE
   ├─ adapts framing to EDITORIAL_CONTEXT
   ├─ creates summaries and tags
   └─ assigns a relevance score
          ↓
editorial validation
   ├─ enforces strict source focus
   ├─ keeps verticals separated
   └─ keeps reserve candidates per section
          ↓
Ollama editor-in-chief
   ├─ chooses the lead story
   ├─ selects section highlights
   ├─ localizes section names and UI labels
   ├─ balances sources and subjects
   └─ writes the edition title and intro
          ↓
editorial HTML template
          ↓
       Chromium
          ↓
PDF generated from the same layout
```

---

## Image policy

With `REQUIRE_IMAGES=true`, a story is only eligible if Highlords finds and validates an image.

The collector first checks the RSS item and can then inspect the article page for `og:image` or `twitter:image`. Stories without a usable image are discarded before LLM processing.

This keeps all eligible cards visual and avoids spending local inference time on stories that would break the design.

---

## Custom categories

Categories live in:

```text
config/categories.yml
```

Example:

```yaml
categories:
  - slug: science
    name: Science
    description: Research, space, astronomy, biology and scientific discoveries.
    aliases: [science, astronomy]
```

The Ollama prompts and editor schema are generated dynamically from this file.

---

## Custom RSS sources

Sources live in:

```text
config/feeds.yml
```

Example:

```yaml
feeds:
  - name: Example Tech
    url: https://example.com/feed.xml
    focus: [hardware, software-internet]
    strict_focus: true
    images: page
```

`focus` is an editorial hint. With `strict_focus: true`, a vertical source can only produce stories for the listed categories.

Use:

```yaml
images: page
```

when a feed provides logos or generic images and you want Highlords to fetch the article page image instead.

### Optional global preset

The repository also includes:

```text
config/feeds-global.yml
```

Enable it with:

```env
FEEDS_FILE=./config/feeds-global.yml
```

That preset mixes Brazilian and international sources such as The Verge, Ars Technica, Hacker News, TechCrunch, GitHub Blog, InfoQ, Tom's Hardware and BBC Sport.

For another country, the recommended workflow is simply to copy a feeds file, replace the RSS URLs, and set `LANGUAGE`, `EDITORIAL_CONTEXT` and `TIME_ZONE`.

---

## Manual usage

If you prefer not to use the launchers:

```bash
ollama serve
```

In another terminal:

```bash
npm install
ollama pull qwen3:4b
npm run daily
```

On Windows, `npm.cmd` can be used instead of `npm`.

---

## Troubleshooting

### Ollama is not responding

```bash
ollama serve
```

### Model not found

```bash
ollama pull qwen3:4b
```

### Chrome / Chromium / Edge not found

Install a supported browser or set an explicit path:

```env
BROWSER_PATH=/absolute/path/to/chrome
```

### First run is slow

That is expected if the Ollama model still needs to be downloaded. Later runs mainly depend on the number of stories and your local inference speed.

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

## Privacy

Editorial analysis runs locally through Ollama. Highlords Daily does not require sending article content to an external AI API.
