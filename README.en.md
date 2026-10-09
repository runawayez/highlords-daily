<p align="center">
  <img src="public/assets/highlords-logo.svg" width="150" alt="Highlords Daily" />
</p>

<h1 align="center">Highlords Daily</h1>

<p align="center"><strong>Information without noise.</strong></p>

<p align="center">
  <a href="README.md">Português</a> · <strong>English</strong>
</p>

<p align="center">
A local-first daily newsletter engine powered by RSS/Atom and Ollama, with editorial memory, multi-stage curation and HTML, JSON, PDF, Markdown and distribution-ready exports.
</p>

**Highlords Daily** collects recent stories, applies deterministic editorial rules, removes repeated coverage, uses a local LLM to classify and summarize material, runs a semantic editorial review and human-oriented ranking pass, assembles the edition and only publishes when the editorial contract is satisfied.

AI runs locally through **Ollama**. No external AI API is required.

The default **Vanilla/BR** preset is ready to use in `pt-BR`, with Brazil as its editorial context, curated Brazilian and international sources, a compact daily taxonomy and BR-specific coverage rules. The engine remains universal: locale, region, timezone, categories, feeds, editorial profile, visual identity and exporters can be changed without editing the core JavaScript.

---

## Current editorial model

The BR preset no longer tries to fill a portal-sized list of sections every day. The daily edition uses **10 categories**, split between mandatory editorial cores and opportunistic sections.

### Editorial core

These sections are considered essential and must retain valid coverage:

- **Technology** (`tecnologia`)
- **AI & Development** (`ia-desenvolvimento`)
- **Games** (`games`)
- **Economy** (`economia`)
- **Politics & Society** (`politica-sociedade`)

### Opportunistic sections

These appear only when the day has strong enough material:

- **eSports** (`esports`)
- **Entertainment** (`entretenimento`)
- **Sports** (`esportes`)
- **Science & Health** (`ciencia-saude`)
- **Climate & Future** (`clima-futuro`)

An optional category can simply be absent from an edition. This avoids artificial filler and reduces bad classifications caused by trying to force every section to appear.

The current BR preset considers up to **160 candidates** per run and up to **20 items per feed** before analysis and curation.

---

## How an edition is built

The current pipeline combines deterministic rules with local AI evaluation:

```text
Preset / YAML / .env
        ↓
RSS / Atom
        ↓
source normalization + strict_focus + guardrails
        ↓
image validation + editorial history
        ↓
Ollama classification + score + headline + summary + topicKey
        ↓
per-category coverage recovery
        ↓
semantic editorial review
        ↓
semantic deduplication
        ↓
human-oriented multidimensional ranking
        ↓
global front-page calibration
        ↓
edition curation
        ↓
editorial quality gate
        ↓
local cache for selected images
        ↓
HTML + PDF + JSON + Markdown + email + social
        ↓
memory + browsable archive + plugins
```

### Classification and `strict_focus`

Each feed can declare the categories it is allowed to serve through `focus`.

```yaml
feeds:
  - name: Example News
    url: https://example.com/feed.xml
    focus: [ia-desenvolvimento]
    strict_focus: true
```

When a source uses `strict_focus`, classification cannot escape the declared categories. In the BR preset, dedicated sources with **one single focus** receive a canonical category lock, reducing unnecessary LLM ambiguity in obvious cases.

A real preset example is the **GitHub Blog**, which is a dedicated `ia-desenvolvimento` source used to reinforce the AI & Development core.

### Semantic editorial review

After initial classification, the BR preset runs a second editorial review. That pass can:

- keep the original category;
- reclassify a story when confidence is high;
- reject out-of-scope content;
- ignore destructive low-confidence changes;
- preserve `strict_focus` boundaries.

### Human-oriented editorial ranking

Approved stories are evaluated on separate editorial dimensions such as impact, significance, public interest, novelty, utility, editorial value and promotional level.

The ranking produces two main signals:

- **sectionScore** — how strong the story is inside its own section;
- **frontPageScore** — how strong the story is relative to the rest of the edition for the lead and front page.

A second pass attempts to calibrate the strongest candidates against one another. If that global calibration returns an invalid response, Highlords falls back to the previous multidimensional ranking instead of aborting the edition.

### Editorial quality gate

Before rendering, Highlords validates the edition contract.

Mandatory categories cannot disappear silently. If a core such as `AI & Development` ends up with no valid candidate, generation stops with an explicit error instead of publishing an incomplete edition. Opportunistic categories may be missing without blocking publication.

---

## Quick Start

### Windows — recommended path

Requirements:

- Git
- Node.js 22.12+
- Ollama
- Google Chrome or Microsoft Edge

```powershell
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
.\GERAR-DAILY.bat
```

You can also double-click `GERAR-DAILY.bat`.

The Windows launcher:

- checks Node.js, npm and the browser;
- ensures project dependencies are installed;
- starts Ollama when required;
- waits for the local API;
- downloads the configured model on first use when needed;
- generates the edition;
- shuts Ollama down afterwards only when Highlords started it.

This is the recommended day-to-day flow on Windows.

### macOS / Linux

Install Git, Node.js 22.12+, Ollama, `curl`, and Chrome/Chromium/Edge.

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
bash RUN-DAILY.sh
```

### Manual execution

If you prefer to control services yourself:

```bash
npm ci
npm run doctor
ollama serve
npm run daily
```

On PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`:

```powershell
npm.cmd run doctor
npm.cmd run daily
```

---

## Updating and cache maintenance

Update the project with:

```bash
git pull --ff-only
npm ci
```

For normal cache maintenance, use the built-in command:

```bash
npm run cache:prune
```

On PowerShell:

```powershell
npm.cmd run cache:prune
```

This is preferred over manually deleting cache folders.

Editorial history is stored separately under `data/`, including the configured memory database. Do not delete `data/highlords.sqlite` just to clear cache: that removes editorial history, not only temporary files.

---

## Installation and diagnostics

The BR preset works without a `.env` file. For a manual installation:

```bash
npm ci
npm run setup
npm run doctor
npm run daily
```

`npm run setup` is optional and helps configure the preset, locale, regional context, timezone, editorial profile, publication name, model and items per category.

`npm run doctor` validates Node.js, configuration, browser and the Ollama model without starting services or downloading files.

If Ollama is not running:

```bash
ollama serve
```

If the default model is missing:

```bash
ollama pull qwen3:4b
```

Chrome, Chromium or Edge is required for PDF output.

---

## Current BR preset

The `PRESET=br` daily taxonomy is:

```text
Technology
AI & Development
Games
eSports
Entertainment
Sports
Economy
Politics & Society
Science & Health
Climate & Future
```

The source-of-truth files are:

```text
presets/br/categories.yml
presets/br/feeds.yml
presets/br/preset.json
presets/br/routing.mjs
```

The BR preset also enables dedicated plugins for editorial contract handling, semantic review, presentation, human ranking and the publication quality gate.

The `global` preset remains independent and keeps its own taxonomy and source list.

---

## Universal by design

Core regional settings are independent:

```env
PRESET=br
LANGUAGE=pt-BR
EDITORIAL_CONTEXT=Brasil
TIME_ZONE=America/Sao_Paulo
```

An Australian reader could use:

```env
PRESET=custom
LANGUAGE=en-AU
EDITORIAL_CONTEXT=Australia
TIME_ZONE=Australia/Sydney
CATEGORIES_FILE=./my-config/categories.yml
FEEDS_FILE=./my-config/feeds.yml
```

Ollama localizes editorial text for the configured locale without inventing currency conversions. Foreign prices remain in their original currency and may receive market context when needed.

---

## Custom categories and sources

Category example:

```yaml
categories:
  - slug: science
    name: Science
    required: false
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

`required: false` allows a section to be absent without failing the edition.

`focus` guides classification. `strict_focus: true` prevents a vertical source from leaking into unauthorized categories. `images: page` forces `og:image` / `twitter:image` discovery from the article page.

`CATEGORIES_FILE` and `FEEDS_FILE` remain full overrides.

---

## Editorial profiles

Use:

```env
EDITORIAL_PROFILE=balanced
```

Included profiles:

- `balanced` — general balance;
- `tech-heavy` — stronger technology emphasis;
- `business` — economy and business;
- `gaming` — games and related technology;
- `minimal` — shorter editions.

Profiles live in `config/editorial-profiles.yml`.

---

## Memory and semantic deduplication

Highlords can keep local memory between editions:

```env
HISTORY_ENABLED=true
HISTORY_DAYS=90
DUPLICATE_DAYS=7
DUPLICATE_THRESHOLD=0.72
MEMORY_FILE=./data/highlords.sqlite
```

When `node:sqlite` is available, history uses SQLite. On runtimes without that module, the engine can fall back to a local JSON file.

Previously published links and recent repeated stories can be filtered before AI analysis. After classification, `topicKey` helps consolidate multiple publishers covering the same event.

`data/` is local and ignored by Git.

---

## Stable images

The engine can validate candidate images before analysis and cache only the images used by selected stories.

When image caching is enabled, files are stored under:

```text
output/YYYY-MM-DD/assets/
```

This keeps HTML/PDF editions from permanently depending on third-party hotlinks. If the final cache write fails, the remote URL can remain as a fallback.

---

## Source diversity

Available settings include:

```env
MAX_ITEMS_PER_SOURCE=3
MAX_ITEMS_PER_SOURCE_PER_SECTION=1
SOURCE_DIVERSITY_STRICT=false
```

The engine tries to prevent a single publisher from dominating the edition. In non-strict mode, limits may be relaxed when needed to preserve editorial coverage.

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

Publication name, logo, tagline and colors are applied to visual outputs and the archive.

---

## Feed diagnostics

Check configured feeds without calling Ollama:

```bash
npm run feeds:check
```

Structured output:

```bash
npm run feeds:check -- --json
```

The command reports feed health, latency and story eligibility.

### Automatic RSS/Atom discovery

```bash
npm run feeds:discover -- example.com another.example
```

The command looks for RSS/Atom declarations in HTML and probes common paths such as `/feed`, `/rss.xml`, `/feed.xml` and `/atom.xml`.

Append discovered feeds to another config file with:

```bash
npm run feeds:discover -- abc.net.au theguardian.com/au --append ./my-config/feeds.yml
```

Discovered feeds intentionally start with `focus: []`; review their editorial scope before production use.

---

## Local scheduling

Schedule a daily edition for 07:00:

```bash
npm run schedule -- --time 07:00
```

Highlords uses:

- Windows Task Scheduler on Windows;
- `launchd` on macOS;
- `cron` on Linux.

Remove the schedule with:

```bash
npm run schedule:remove
```

---

## Main commands

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

Use `node src/cli/run.mjs <command> --help` for additional options on commands routed through the main CLI.

---

## Output formats

A run can generate:

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

Markdown, email, social and archive exporters can be enabled or disabled through configuration.

---

## Plugins

Files matching `plugins/*.plugin.mjs` can participate in hooks such as:

- `afterCollect`
- `afterAnalyze`
- `beforeRender`
- `afterWrite`
- `exportEdition`

The BR preset uses dedicated editorial plugins. Some plugins are deliberately **fatal**, such as the editorial quality gate: when the publication contract is not satisfied, generation must stop instead of silently publishing incomplete content.

See `plugins/README.md` for the plugin contract.

---

## Experimental desktop app

An optional Electron layer lives in `desktop/`:

```bash
npm run desktop:install
npm run desktop
```

Build a native package for the current OS with:

```bash
npm run desktop:build
```

Configured targets include NSIS/Windows, DMG/macOS and AppImage/Linux. Ollama and Chrome/Chromium/Edge remain external prerequisites. The CLI and launchers remain the primary workflow.

---

## Development and CI

For contributions:

```bash
npm ci
npm run format:check
npm run check
npm test
```

CI validates Windows, macOS and Linux on Node.js 22 and 24, including desktop-core preparation. Tests do not depend on Ollama or live feeds.

The project requires **Node.js 22.12+** and uses `package-lock.json` for reproducible installs.

---

## Privacy

AI curation runs locally through Ollama. Article content does not need to be sent to an external AI API. Highlords only makes the network requests required to fetch configured RSS/Atom feeds, article pages, images and any delivery services explicitly configured by the user.
