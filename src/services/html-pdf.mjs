import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const PDF_VIEWPORT_WIDTH = 1120;
const PDF_VIEWPORT_HEIGHT = 1600;
const PDF_SCALE = 0.64;

function browserCandidates() {
  const candidates = [
    process.env.BROWSER_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ];

  if (process.platform === 'win32') {
    const programFiles = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const root of programFiles) {
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
      );
    }
  }

  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      path.join(process.env.HOME || '', 'Applications', 'Microsoft Edge.app', 'Contents', 'MacOS', 'Microsoft Edge')
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

function findBrowser() {
  const found = browserCandidates().find(candidate => fs.existsSync(candidate));
  if (!found) throw new Error('Chrome/Chromium/Edge não encontrado. Instale um navegador compatível ou defina BROWSER_PATH no arquivo .env.');
  return found;
}

async function waitForImages(page, timeoutMs = 12000) {
  await Promise.race([
    page.evaluate(async () => {
      const images = [...document.images];
      await Promise.all(images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }));
    }),
    new Promise(resolve => setTimeout(resolve, timeoutMs))
  ]);
}

async function waitForFonts(page) {
  try {
    await page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    });
  } catch {}
}

function withBase(html, baseDir) {
  if (!baseDir) return html;
  const href = pathToFileURL(`${path.resolve(baseDir)}${path.sep}`).href;
  const base = `<base href="${href}">`;
  return String(html).includes('<head>') ? String(html).replace('<head>', `<head>\n${base}`) : `${base}${html}`;
}

export async function renderHtmlPdf(html, { baseDir } = {}) {
  const executablePath = findBrowser();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none', '--allow-file-access-from-files']
  });

  try {
    const page = await browser.newPage();

    // The newsletter is designed around a ~1060 px desktop canvas. Rendering
    // the PDF as print media made Chromium apply the narrow/mobile rules of the
    // template on an A4 page, collapsing grids and changing the composition.
    // Keep the screen layout, then scale that stable desktop canvas into A4.
    await page.setViewport({
      width: PDF_VIEWPORT_WIDTH,
      height: PDF_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1
    });
    await page.emulateMediaType('screen');
    await page.setContent(withBase(html, baseDir), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await Promise.all([waitForImages(page), waitForFonts(page)]);

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      scale: PDF_SCALE,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
  } finally {
    await browser.close();
  }
}
