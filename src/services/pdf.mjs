import PDFDocument from 'pdfkit';
import { config } from '../config.mjs';

const COLORS = {
  ink: '#171717',
  muted: '#666666',
  light: '#ededed',
  red: '#c9332c',
  paper: '#ffffff'
};

function clean(value = '') {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/•/g, '-')
    .trim();
}

function formatEditionDate(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!year || !month || !day) return clean(value);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function ensureSpace(doc, height = 100) {
  if (doc.y + height <= doc.page.height - 54) return;
  doc.addPage();
}

function drawRule(doc, y = doc.y) {
  doc.save()
    .strokeColor(COLORS.light)
    .lineWidth(1)
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .stroke()
    .restore();
}

function writeStory(doc, article, { lead = false } = {}) {
  if (!article) return;
  ensureSpace(doc, lead ? 190 : 135);

  if (lead) {
    doc.save()
      .rect(doc.page.margins.left, doc.y, 4, 132)
      .fill(COLORS.red)
      .restore();
    doc.x = doc.page.margins.left + 16;
  }

  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right - (lead ? 16 : 0);
  const category = clean(article.category || 'destaque').replace(/-/g, ' ').toUpperCase();
  const meta = [clean(article.source), category, Number(article.score || 0).toFixed(1)].filter(Boolean).join('  |  ');

  doc.font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(COLORS.red)
    .text(meta, { width, characterSpacing: 0.5 });

  doc.moveDown(0.45)
    .font('Helvetica-Bold')
    .fontSize(lead ? 21 : 13.5)
    .fillColor(COLORS.ink)
    .text(clean(article.headline || article.originalTitle || 'Sem título'), {
      width,
      lineGap: lead ? 2 : 1
    });

  const summary = clean(article.summary || article.excerpt || '');
  if (summary) {
    doc.moveDown(0.45)
      .font('Helvetica')
      .fontSize(lead ? 10.5 : 9.5)
      .fillColor(COLORS.muted)
      .text(summary, { width, lineGap: 2 });
  }

  const tags = Array.isArray(article.tags) ? article.tags.map(clean).filter(Boolean).slice(0, 6) : [];
  if (tags.length) {
    doc.moveDown(0.45)
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(tags.map(tag => `#${tag.replace(/\s+/g, '-')}`).join('   '), { width });
  }

  if (article.link) {
    doc.moveDown(0.55)
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor(COLORS.red)
      .text('Abrir matéria', { link: article.link, underline: true });
  }

  if (lead) doc.x = doc.page.margins.left;
  doc.moveDown(0.9);
}

function writeSection(doc, section) {
  ensureSpace(doc, 90);
  doc.moveDown(0.4)
    .font('Helvetica-Bold')
    .fontSize(16)
    .fillColor(COLORS.ink)
    .text(clean(section.name || section.slug));

  doc.moveDown(0.25);
  drawRule(doc);
  doc.moveDown(0.65);

  if (!section.articles?.length) {
    doc.font('Helvetica-Oblique')
      .fontSize(9.5)
      .fillColor(COLORS.muted)
      .text('Sem destaque relevante nesta edição.');
    doc.moveDown(1.1);
    return;
  }

  for (const article of section.articles) writeStory(doc, article);
}

function addPageNumber(doc, pageIndex, pageCount) {
  const oldX = doc.x;
  const oldY = doc.y;
  doc.font('Helvetica')
    .fontSize(7.5)
    .fillColor('#8a8a8a')
    .text(
      `Highlords Daily  |  ${pageIndex}/${pageCount}`,
      doc.page.margins.left,
      doc.page.height - 35,
      { width: doc.page.width - doc.page.margins.left - doc.page.margins.right, align: 'center' }
    );
  doc.x = oldX;
  doc.y = oldY;
}

export async function renderDailyPdf(edition) {
  if (!edition) throw new Error('Edição inexistente.');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: { top: 48, right: 48, bottom: 58, left: 48 },
      info: {
        Title: `Highlords Daily - ${edition.editionDate}`,
        Author: 'Highlords Daily',
        Subject: clean(edition.title || 'Newsletter diária de tecnologia')
      }
    });

    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.paper);
    doc.font('Helvetica-Bold')
      .fontSize(26)
      .fillColor(COLORS.ink)
      .text('HIGH LORDS', { characterSpacing: 1.5 });
    doc.font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLORS.red)
      .text('DAILY  /  TECNOLOGIA SEM RUÍDO', { characterSpacing: 1.2 });

    doc.moveDown(1.4)
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLORS.muted)
      .text(formatEditionDate(edition.editionDate).toUpperCase());

    doc.moveDown(0.45)
      .font('Helvetica-Bold')
      .fontSize(24)
      .fillColor(COLORS.ink)
      .text(clean(edition.title || 'O que vale sua atenção hoje'), { lineGap: 2 });

    if (edition.intro) {
      doc.moveDown(0.55)
        .font('Helvetica')
        .fontSize(11)
        .fillColor(COLORS.muted)
        .text(clean(edition.intro), { lineGap: 3 });
    }

    doc.moveDown(0.8)
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLORS.muted)
      .text(`${edition.stats?.stories || 0} matérias  |  ${edition.stats?.sources || 0} fontes  |  curadoria ${edition.curatedBy === 'ollama' ? 'IA local' : 'ranking'}`);

    doc.moveDown(1.2);
    drawRule(doc);
    doc.moveDown(1.0);

    if (edition.lead) {
      doc.font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(COLORS.red)
        .text('MANCHETE DA EDIÇÃO', { characterSpacing: 0.8 });
      doc.moveDown(0.45);
      writeStory(doc, edition.lead, { lead: true });
      drawRule(doc);
      doc.moveDown(0.8);
    }

    for (const section of edition.sections || []) writeSection(doc, section);

    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      addPageNumber(doc, index - range.start + 1, range.count);
    }

    doc.end();
  });
}
