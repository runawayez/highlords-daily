import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const PDF_VIEWPORT_WIDTH = 1120;
const PDF_VIEWPORT_HEIGHT = Math.round(PDF_VIEWPORT_WIDTH * 297 / 210);
const A4_WIDTH_CSS_PX = (210 / 25.4) * 96;
const A4_HEIGHT_CSS_PX = (297 / 25.4) * 96;
const BASE_PDF_SCALE = A4_WIDTH_CSS_PX / PDF_VIEWPORT_WIDTH;
const MAX_AUTO_SHRINK = 0.06;
const TINY_LAST_PAGE_RATIO = 0.18;

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

async function waitForImages(page, timeoutMs = 15000) {
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

function expectedStoryImageCount(html) {
  return (String(html).match(/class=["']story-image["']/g) || []).length;
}

async function assertStoryImagesLoaded(page, expected) {
  const state = await page.evaluate(() => {
    const images = [...document.querySelectorAll('.story-image img')];
    return {
      total: images.length,
      failed: images
        .filter(image => !image.complete || image.naturalWidth < 1 || image.naturalHeight < 1)
        .map(image => image.currentSrc || image.src || '(sem src)')
    };
  });

  if (state.total !== expected || state.failed.length) {
    const detail = state.failed.slice(0, 3).join(', ');
    throw new Error(
      `Falha ao carregar imagens no PDF: ${state.total}/${expected} imagens editoriais presentes${detail ? `; falhas: ${detail}` : ''}.`
    );
  }
}

async function loadNewsletterPage(page, html, baseDir) {
  if (!baseDir) {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    return async () => {};
  }

  const absoluteDir = path.resolve(baseDir);
  await fsp.mkdir(absoluteDir, { recursive: true });
  const tempPath = path.join(absoluteDir, `.highlords-pdf-${process.pid}-${Date.now()}.html`);
  await fsp.writeFile(tempPath, html, 'utf8');

  try {
    await page.goto(pathToFileURL(tempPath).href, { waitUntil: 'networkidle0', timeout: 30000 });
  } catch (error) {
    await fsp.unlink(tempPath).catch(() => {});
    throw error;
  }

  return async () => {
    await fsp.unlink(tempPath).catch(() => {});
  };
}

async function applyPdfOverrides(page) {
  await page.addStyleTag({
    content: `
      @page { size: A4; margin: 0; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
      }
      .shell {
        margin: 0 auto !important;
        box-shadow: none !important;
      }
      .lead-wrap, .newsletter-section {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      .section-title {
        break-after: avoid-page !important;
        page-break-after: avoid !important;
      }
      .footer {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
        margin-top: 0 !important;
      }
    `
  });
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.shell');
    const footer = document.querySelector('.footer');
    const shellRect = shell?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      contentHeight: Math.ceil(Math.max(
        shellRect?.bottom || 0,
        document.body?.scrollHeight || 0,
        document.documentElement?.scrollHeight || 0
      )),
      footerHeight: Math.ceil(footerRect?.height || 0)
    };
  });
}

function adaptivePdfScale({ contentHeight }) {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return BASE_PDF_SCALE;

  const printedHeight = contentHeight * BASE_PDF_SCALE;
  const pages = Math.max(1, Math.ceil(printedHeight / A4_HEIGHT_CSS_PX));
  if (pages <= 1) return BASE_PDF_SCALE;

  const remainder = printedHeight - ((pages - 1) * A4_HEIGHT_CSS_PX);
  const remainderRatio = remainder / A4_HEIGHT_CSS_PX;
  if (remainderRatio > TINY_LAST_PAGE_RATIO) return BASE_PDF_SCALE;

  const targetScale = (((pages - 1) * A4_HEIGHT_CSS_PX) - 4) / contentHeight;
  const minimumScale = BASE_PDF_SCALE * (1 - MAX_AUTO_SHRINK);
  if (targetScale < minimumScale) return BASE_PDF_SCALE;

  return Math.min(BASE_PDF_SCALE, targetScale * 0.998);
}

export async function renderHtmlPdf(html, { baseDir } = {}) {
  const executablePath = findBrowser();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--font-render-hinting=none',
      '--allow-file-access-from-files'
    ]
  });

  let cleanup = async () => {};
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: PDF_VIEWPORT_WIDTH,
      height: PDF_VIEWPORT_HEIGHT,
      deviceScaleFactor: 1
    });

    // The HTML edition is the source of truth. Keep screen media and load a
    // real temporary file inside the edition directory so relative assets/
    // resolve exactly as they do when index.html is opened in the browser.
    await page.emulateMediaType('screen');
    cleanup = await loadNewsletterPage(page, html, baseDir);
    await Promise.all([waitForImages(page), waitForFonts(page)]);
    await assertStoryImagesLoaded(page, expectedStoryImageCount(html));
    await applyPdfOverrides(page);

    // Chromium can otherwise create a nearly empty trailing page when only the
    // footer spills a few pixels past the previous A4 page. Shrink by at most
    // 6% only when that last page is tiny; normal editions keep the base scale.
    const metrics = await layoutMetrics(page);
    const scale = adaptivePdfScale(metrics);

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: false,
      scale,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });
  } finally {
    await cleanup();
    await browser.close();
  }
}
