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
