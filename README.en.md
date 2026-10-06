<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Information without noise.</strong></p>

<p align="center">
  <a href="README.md">Português</a> · <strong>English</strong>
</p>

<p align="center">
A local-first daily newsletter engine powered by RSS/Atom and Ollama, with editorial memory, regional localization and HTML, JSON, PDF, Markdown and distribution-ready exports.
</p>

**Highlords Daily** collects recent stories, validates and caches images, removes repeated coverage, uses a local LLM to classify, translate/localize, summarize and score the material, then runs a second editorial pass to assemble the edition.

AI runs locally through **Ollama**. No external AI API is required.

The default **Vanilla/BR** preset remains ready to use: `pt-BR`, Brazil context and Brazilian sources. The engine itself is universal: locale, region, timezone, categories, feeds, editorial profile, visual identity and exporters are configurable without changing JavaScript.

---

## Quick Start

### Windows

Requirements: Git, Node.js 22.5+, Ollama and Google Chrome or Microsoft Edge.

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
.\GERAR-DAILY.bat
```

The launcher checks the environment, installs dependencies when needed, starts Ollama, downloads the configured model on first use, and shuts Ollama down afterwards when it started the service itself.

### macOS / Linux

Install Git, Node.js 22.5+, Ollama, `curl`, and Chrome/Chromium/Edge.

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

### Optional guided setup

Vanilla works without `.env`. To configure the project interactively:

```bash
npm run setup
```

The wizard asks for preset, locale, regional context, timezone, editorial profile, publication name, Ollama model and items per category.

---

## Universal by design

Core regional settings:

```env
PRESET=br
LANGUAGE=pt-BR
EDITORIAL_CONTEXT=Brasil
TIME_ZONE=America/Sao_Paulo
```

An Australian reader can use:

```env
PRESET=custom
LANGUAGE=en-AU
EDITORIAL_CONTEXT=Australia
TIME_ZONE=Australia/Sydney
CATEGORIES_FILE=./my-config/categories.yml
FEEDS_FILE=./my-config/feeds.yml
```

Ollama localizes headlines, summaries, tags, the edition intro, section names and interface labels for the selected locale. It does **not** invent currency conversions: foreign prices remain in their original currency and receive market context when needed.

---

## Presets

```text
presets/
├─ br/
│  ├─ categories.yml
│  └─ feeds.yml
└─ global/
   ├─ categories.yml
   └─ feeds.yml
```

`PRESET=br` is the Brazil-first Vanilla preset. `PRESET=global` mixes Brazilian and international sources.

To build a regional preset, copy a preset directory, replace the RSS/Atom sources and configure `LANGUAGE`, `EDITORIAL_CONTEXT` and `TIME_ZONE`. `CATEGORIES_FILE` and `FEEDS_FILE` remain full overrides.

---

## Editorial profiles

```env
EDITORIAL_PROFILE=balanced
```

Included profiles:

- `balanced`
- `tech-heavy`
- `business`
- `gaming`
- `minimal`

Profiles live in `config/editorial-profiles.yml` and can define editorial goals, tone, priority categories and default source limits.

---

## Memory and semantic deduplication

```env
HISTORY_ENABLED=true
HISTORY_DAYS=90
DUPLICATE_DAYS=7
DUPLICATE_THRESHOLD=0.72
MEMORY_FILE=./data/highlords.sqlite
```

When `node:sqlite` is available, history is stored in SQLite. Otherwise the engine automatically falls back to a local JSON file.

Previously published links and highly similar stories are filtered before AI analysis. During analysis Ollama also creates a stable `topicKey`; after analysis, a second semantic deduplication pass consolidates different publishers covering the same event.

`data/` is local and ignored by Git.

---

## Stable image cache

```env
REQUIRE_IMAGES=true
CACHE_IMAGES=true
```

Candidate images are validated before AI processing. After curation, images for the stories that actually made the edition are downloaded into:

```text
output/YYYY-MM-DD/assets/
```

This keeps HTML/PDF editions stable instead of permanently depending on third-party hotlinks. A remote URL remains as a fallback if the final cache download fails.

---

## Source diversity

```env
MAX_ITEMS_PER_SOURCE=3
MAX_ITEMS_PER_SOURCE_PER_SECTION=1
SOURCE_DIVERSITY_STRICT=false
```

The engine prevents a single publisher from dominating the edition. With strict mode disabled, source limits can be relaxed only when required to avoid empty slots.

---

## Branding

```env
PUBLICATION_NAME=Highlords Daily
PUBLICATION_TAGLINE=Information without noise
PUBLICATION_LOGO=./public/assets/highlords-logo.svg
ACCENT_COLOR=#c92f2b
PAPER_COLOR=#f7f3e9
BACKGROUND_COLOR=#0b0b0d
```

The same engine can therefore power a completely different local publication.

---

## Feed diagnostics

Test all configured sources without calling Ollama:

```bash
npm run feeds:check
```

Structured output:

```bash
npm run feeds:check -- --json
```

The command reports feed health, latency, recent eligible stories and image rejections.

---

## Local scheduling

Schedule a daily run at 07:00:

```bash
npm run schedule -- --time 07:00
```

It uses Windows Task Scheduler, `launchd` on macOS and `cron` on Linux.

Remove the schedule:

```bash
npm run schedule:remove
```

No server or GitHub Actions are required.

---

## Output formats

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
└─ YYYY-MM-DD/
   ├─ index.html
   ├─ edition.json
   ├─ edition.md
   ├─ email.html
   ├─ telegram.txt
   ├─ discord.md
   ├─ highlords-daily-YYYY-MM-DD.pdf
   └─ assets/
```

Exporters can be toggled with `EXPORT_MARKDOWN`, `EXPORT_EMAIL`, `EXPORT_SOCIAL` and `ARCHIVE_ENABLED`.

---

## Categories and sources

Category example:

```yaml
categories:
  - slug: science
    name: Science
    description: Research, space, astronomy, biology and scientific discoveries.
    aliases: [ciencia, astronomy]
```

Feed example:

```yaml
feeds:
  - name: Example News
    url: https://example.com/feed.xml
    focus: [science]
    strict_focus: true
    images: page
```

`focus` is an editorial hint. `strict_focus: true` prevents a vertical source from leaking into unrelated sections. `images: page` forces Open Graph/Twitter image discovery on the article page.

---

## Plugins

Files matching `plugins/*.plugin.mjs` are loaded when `PLUGINS_ENABLED=true`.

Available hooks are `afterCollect`, `afterAnalyze`, `beforeRender`, `afterWrite` and `exportEdition`. Plugin failures are isolated and do not stop the edition. See `plugins/README.md`.

---

## Experimental desktop app

An optional Electron layer lives in `desktop/`:

```bash
npm run desktop:install
npm run desktop
```

Build a native package on the current OS:

```bash
npm run desktop:build
```

Configured targets are NSIS/Windows, DMG/macOS and AppImage/Linux. Ollama and Chrome/Chromium/Edge remain external prerequisites. The CLI remains the main lightweight path.

---

## Pipeline

```text
Preset / YAML / .env
        ↓
RSS / Atom
        ↓
image validation
        ↓
editorial history
        ↓
Ollama classification + localization + topicKey
        ↓
semantic deduplication
        ↓
editorial profile + source diversity
        ↓
Ollama editor-in-chief
        ↓
local image cache
        ↓
HTML + PDF + JSON + Markdown + email + social
        ↓
memory + browsable archive + plugins
```

## Privacy

Curation runs locally through Ollama. Article content does not need to be sent to an external AI API. Highlords only makes the network requests required to fetch the RSS/Atom feeds, article pages and images configured by the user.
