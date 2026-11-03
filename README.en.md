<p align="center"><img src="public/assets/highlords-logo.svg" width="120" alt="Highlords Daily"></p>
<h1 align="center">Highlords Daily</h1>
<p align="center"><strong>Information without noise.</strong></p>
<p align="center"><a href="README.md">Português</a> · <strong>English</strong></p>

Your daily newspaper, prepared on your computer. Choose your reading language, countries and subjects. Highlords selects stories from configured sources and produces an edition for browser reading or PDF.

**No programming, Git or configuration-file editing is required.** Setup saves your choices automatically. AI runs locally through Ollama without requiring a paid AI API.

## Install on Windows

### 1. Install the prerequisites

- [Node.js](https://nodejs.org/en/download): choose **LTS**, open the installer and follow the suggested steps. Node.js 22.12+ is required.
- [Ollama](https://ollama.com/download): install and open the app. You do not need to select or download a model manually.
- For PDF, install Chrome or Microsoft Edge. Browser reading without PDF is also supported.

Close and reopen terminal windows after installation. If these programs are already installed, continue below.

### 2. Download and extract Highlords Daily

[**Download Highlords Daily as a ZIP**](https://github.com/runawayez/highlords-daily/archive/refs/heads/main.zip)

Right-click the ZIP and choose **Extract All**. Open the extracted folder containing `GERAR-DAILY.bat`. Do not run the program from inside the ZIP.

### 3. Double-click `GERAR-DAILY.bat`

On first launch, it prepares the components and opens setup. Select **English** for the assistant, type option numbers and press Enter. Setup asks about:

1. Your reading language.
2. The country where you live.
3. Countries you want to follow — multiple choices are supported.
4. Subjects that interest you.
5. A quick, balanced or more complete edition.
6. The clock to use and whether you want PDF.

After confirmation it checks sources and saves preferences. The launcher prepares Ollama, downloads the AI model when needed and generates your newspaper.

**The first run can take a while**, because components and the model must be downloaded. Keep the internet connection and program window open. Later generation times depend on your computer and selected edition size.

### 4. Read your newspaper

The edition opens in your browser when ready. Previous editions stay in `output`; its `index.html` opens the archive. Each edition has its own folder and, when requested, a PDF.

On following days, just open **`GERAR-DAILY.bat`** again. Preferences remain saved.

## Example: a Brazilian reader living in the United States

Choose Portuguese for reading, the United States as your residence, Brazil and the United States as coverage, your preferred subjects and your local clock. These choices change actual source selection, as well as output language and editorial context. Foreign-language stories can be translated by the model. Translation and selection can contain errors; original story links remain available.

Source coverage differs by country and subject. If no available local sources are found for a requested country, setup explains the limitation and asks whether you want to continue with the remaining sources. It does not claim local coverage where none is available.

## Change preferences

Double-click **`CONFIGURAR-DAILY.bat`**. The assistant keeps a backup before saving new preferences; no configuration-file editing is required.

Changes apply to the next generation. Every launch of **`GERAR-DAILY.bat`** rebuilds and replaces today's edition. Other dates are preserved. If generation fails before publication, the previous edition is kept.

## macOS and Linux

Install [Node.js LTS](https://nodejs.org/en/download) and [Ollama](https://ollama.com/download), download the ZIP and extract it. Chrome, Chromium or Edge is needed only for PDF.

Open a terminal in the extracted folder and run:

```bash
bash RUN-DAILY.sh
```

The same setup opens on first use. To change preferences later:

```bash
bash RUN-DAILY.sh --setup-only
```

## Troubleshooting

| Situation | What to do |
| --- | --- |
| Node.js requested | Install LTS, close the window and open the program again. |
| Ollama requested | Install and open Ollama, then retry. |
| PDF browser not found | Install Chrome/Edge or select browser reading without PDF. |
| No sources available | Check your internet connection and retry setup. Failed verification preserves previous preferences. |
| Generation takes a while | The first run includes downloads. Complete editions and less powerful computers require more time. |
| Some sections are absent | The newspaper avoids filling sections without eligible stories. |
| Today's edition already exists | Open `GERAR-DAILY.bat` normally: it rebuilds and replaces today's edition. |

When reporting a problem, copy the message from the window. Do not share files containing passwords or credentials.

## Update

Download the new ZIP and extract its contents over the existing installation, replacing program files. **Do not delete the old folder first:** it contains your preferences and editions. Open the usual launcher afterward; dependencies synchronize automatically.

Git users can run `git pull --ff-only` instead.

## Advanced usage and development

The assistant is the recommended path for ordinary use. Manual configuration, independent profiles, custom sources, scheduling, delivery and development remain in the [technical reference](docs/TECHNICAL_REFERENCE.en.md) and [engine documentation](docs/ENGINE.md).

The Electron interface remains experimental; this guide uses the project launchers.

### Daily curation — 5.5.3 fix

Classification uses original story content. Source focus constrains allowed subjects without forcing a category or overriding a rejection. eSports validation also applies to wizard-created configurations; clear content/category contradictions are checked before and after plugins.

Independent review uses smaller batches, local IDs and one retry for omitted decisions. Selection favors reporting within the primary freshness window, counts the lead toward publisher limits, and compares curator choices with stronger alternatives. Sections may remain absent when candidates fall below the rescue floor (`LLM_MIN_SCORE - 1`).

Caching remains enabled. The update invalidates affected analysis and review decisions while preserving history, feed and image caches. Run `GERAR-DAILY.bat` after updating to regenerate today's edition. Corrections and exclusions are recorded in the edition's `editorial-report.html`.

### General newspaper and diversity — 5.6.0

Automatic balancing groups individual categories into editorial families: Technology (including AI and Development), Society, World, Economy, Science/Health/Environment, Culture, Sports and Games/eSports. Editions with at least three eligible families target up to 16 stories, with a quality floor, publisher/entity limits, at most two football stories, and technology at approximately 25% or less (minimum rounding of one story). Targets never require weak filler. Specialized publications and custom taxonomies retain category-based selection.

Guided setup configures short (up to 10), balanced (up to 16) and complete (up to 22) editions. Older personal presets already following Politics & Society gain World; BR coverage also gains Agência Brasil's general and international feeds. This is an in-memory compatibility upgrade; saved files and explicit category/feed overrides are preserved. Unselected interests remain disabled.

The cover presents up to three calls from different families, estimated reading time and, when available, a service-story link. Community projects, rumors, match previews and routine reactions receive lower priority and can become briefs. PDF composition attempts to reclaim tail-page space using complete cards, without cutting text.

The editorial report includes distribution and exclusion reasons. `data/diversity-history.json` tracks the last seven edition dates, replacing measurements when a date is regenerated. Local coverage depends on available sources and scope; the application does not infer a city from a time zone. Advanced profiles support `editionMaxStories` and `editorialBalance: off`; the new defaults require no manual environment editing.
