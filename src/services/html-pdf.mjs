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
const MAX_AUTO_SHRINK = 0.08;
const TINY_LAST_PAGE_RATIO = 0.28;

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

async function preparePdfLayout(page) {
  // Keep the footer attached to the last editorial section. This prevents
  // Chromium from treating a tiny footer as meaningful content for a new page.
  await page.evaluate(() => {
    const footer = document.querySelector('.footer');
    const sections = [...document.querySelectorAll('.newsletter-section')];
    const lastSection = sections.at(-1);
    if (footer && lastSection && footer.parentElement !== lastSection) {
      lastSection.appendChild(footer);
      footer.classList.add('pdf-footer');
    }
  });

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
        overflow: visible !important;
      }
      .lead-wrap {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      .newsletter-section {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .section-grid {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .story-card {
        break-inside: avoid-page !important;
        page-break-inside: avoid !important;
      }
      .section-title {
        break-after: avoid-page !important;
        page-break-after: avoid !important;
      }
      .newsletter-section:last-of-type .section-grid {
        break-after: avoid-page !important;
        page-break-after: avoid !important;
      }
      .pdf-footer {
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
    const contentHeight = Math.ceil(Math.max(
      shellRect?.bottom || 0,
      footerRect?.bottom || 0,
      document.body?.scrollHeight || 0,
      document.documentElement?.scrollHeight || 0
    ));
    return {
      contentHeight,
      footerTop: Math.ceil(footerRect?.top || 0),
      footerBottom: Math.ceil(footerRect?.bottom || 0),
      footerHeight: Math.ceil(footerRect?.height || 0)
    };
  });
}

function adaptivePdfScale({ contentHeight, footerTop, footerBottom, footerHeight }) {
  if (!Number.isFinite(contentHeight) || contentHeight <= 0) return BASE_PDF_SCALE;

  const pageHeightAtBaseScale = A4_HEIGHT_CSS_PX / BASE_PDF_SCALE;
  const pages = Math.max(1, Math.ceil(contentHeight / pageHeightAtBaseScale));
  if (pages <= 1) return BASE_PDF_SCALE;

  // If the footer starts on what would be the final page and practically
  // nothing else shares that page, fit it into the previous page when that can
  // be achieved with a subtle shrink. This uses the footer geometry itself,
  // instead of relying only on total document height.
  const footerPage = footerTop > 0 ? Math.floor(footerTop / pageHeightAtBaseScale) + 1 : pages;
  const previousPageBottom = (footerPage - 1) * pageHeightAtBaseScale;
  const footerIsAlone = footerPage === pages
    && footerHeight > 0
    && footerTop >= previousPageBottom
    && (contentHeight - footerTop) <= Math.max(footerHeight * 1.35, pageHeightAtBaseScale * TINY_LAST_PAGE_RATIO);

  if (footerIsAlone && footerBottom > 0 && footerPage > 1) {
    const targetScale = (((footerPage - 1) * A4_HEIGHT_CSS_PX) - 6) / footerBottom;
    const minimumScale = BASE_PDF_SCALE * (1 - MAX_AUTO_SHRINK);
    if (targetScale >= minimumScale) return Math.min(BASE_PDF_SCALE, targetScale * 0.998);
  }

  const printedHeight = contentHeight * BASE_PDF_SCALE;
  const physicalPages = Math.max(1, Math.ceil(printedHeight / A4_HEIGHT_CSS_PX));
  if (physicalPages <= 1) return BASE_PDF_SCALE;
  const remainder = printedHeight - ((physicalPages - 1) * A4_HEIGHT_CSS_PX);
  const remainderRatio = remainder / A4_HEIGHT_CSS_PX;
  if (remainderRatio > TINY_LAST_PAGE_RATIO) return BASE_PDF_SCALE;

  const targetScale = (((physicalPages - 1) * A4_HEIGHT_CSS_PX) - 6) / contentHeight;
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

    await page.emulateMediaType('screen');
    cleanup = await loadNewsletterPage(page, html, baseDir);
    await Promise.all([waitForImages(page), waitForFonts(page)]);
    await assertStoryImagesLoaded(page, expectedStoryImageCount(html));
    await preparePdfLayout(page);

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
