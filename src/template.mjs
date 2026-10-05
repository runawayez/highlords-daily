import { config } from './config.mjs';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function safeUrl(value = '') {
  try {
    const url = new URL(String(value));
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
}

function formatDate(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: config.timeZone,
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function story(article, { lead = false } = {}) {
  if (!article) return '';
  const image = article.imageUrl
    ? `<a class="story-image ${lead ? 'lead-image' : ''}" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(safeUrl(article.imageUrl))}" alt="" loading="lazy"></a>`
    : '';
  const tags = Array.isArray(article.tags) && article.tags.length
    ? `<div class="tags">${article.tags.slice(0, 6).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';

  return `<article class="story ${lead ? 'lead-story' : ''}">
    ${image}
    <div class="story-copy">
      <div class="story-meta"><strong>${escapeHtml(article.source)}</strong><span>${Number(article.score || 0).toFixed(1)}</span></div>
      <h${lead ? '2' : '3'}><a href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.headline || article.originalTitle)}</a></h${lead ? '2' : '3'}>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${tags}
      <a class="read-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">Ler matéria →</a>
    </div>
  </article>`;
}

function sectionMarkup(section) {
  const stories = section.articles?.length
    ? section.articles.map(article => story(article)).join('')
    : '<p class="empty-section">Sem destaque forte o bastante nesta edição.</p>';

  return `<section class="newsletter-section" id="${escapeHtml(section.slug)}">
    <div class="section-head"><span>${escapeHtml(section.name)}</span><b>${section.articles?.length || 0}</b></div>
    <div class="section-stories">${stories}</div>
  </section>`;
}

export function renderNewsletterHtml(edition, logoDataUri = '') {
  const nav = edition.sections.map(section => `<a href="#${escapeHtml(section.slug)}">${escapeHtml(section.name)}</a>`).join('');
  const logo = logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="">` : '';
  const sections = edition.sections.map(sectionMarkup).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>Highlords Daily — ${escapeHtml(edition.editionDate)}</title>
<style>
:root{--bg:#0a0a0c;--paper:#f3efe5;--ink:#191816;--muted:#68645c;--red:#c9342d;--line:#d8d1c2;--dark:#111114;--max:1080px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}.shell{width:min(calc(100% - 32px),var(--max));margin:34px auto 70px;background:var(--paper);box-shadow:0 28px 90px rgba(0,0,0,.38)}header{padding:38px 46px 28px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:18px}.logo{width:54px;height:54px}.brand-copy strong{display:block;font-family:Georgia,serif;font-size:32px;line-height:1}.brand-copy span{display:block;margin-top:7px;color:var(--red);font-size:11px;font-weight:800;letter-spacing:.16em}.edition-date{margin-top:30px;color:var(--muted);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.intro{padding:42px 46px 34px}.intro h1{margin:0;max-width:820px;font-family:Georgia,serif;font-size:clamp(38px,6vw,68px);line-height:.98;letter-spacing:-.035em}.intro>p{max-width:760px;margin:22px 0 0;color:var(--muted);font-family:Georgia,serif;font-size:20px;line-height:1.55}.stats{display:flex;gap:20px;flex-wrap:wrap;margin-top:24px;color:var(--muted);font-size:12px}.index{display:flex;gap:9px;overflow:auto;padding:0 46px 30px}.index a{flex:0 0 auto;border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:var(--ink);text-decoration:none;font-size:12px;font-weight:700}.index a:hover{border-color:var(--red);color:var(--red)}.lead-wrap{padding:0 46px 44px}.label{margin-bottom:12px;color:var(--red);font-size:11px;font-weight:900;letter-spacing:.16em}.story{display:grid;grid-template-columns:180px 1fr;gap:22px;padding:23px 0;border-top:1px solid var(--line)}.lead-story{grid-template-columns:minmax(300px,1.15fr) minmax(0,1fr);padding:0;border:0}.story-image{display:block;aspect-ratio:16/10;overflow:hidden;background:#ddd4c4}.story-image img{width:100%;height:100%;object-fit:cover;display:block}.lead-image{aspect-ratio:16/10}.story-meta{display:flex;gap:12px;align-items:center;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.story-meta strong{color:var(--red)}.story h2,.story h3{margin:8px 0 10px;font-family:Georgia,serif}.story h2{font-size:34px;line-height:1.05}.story h3{font-size:23px;line-height:1.12}.story h2 a,.story h3 a{color:var(--ink);text-decoration:none}.story p{margin:0;color:var(--muted);font-size:14px;line-height:1.62}.tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.tags span{padding:4px 7px;background:#e8e1d3;color:#5b574f;font-size:10px;font-weight:700}.read-link{display:inline-block;margin-top:14px;color:var(--red);font-size:12px;font-weight:800;text-decoration:none}.newsletter-section{padding:0 46px}.section-head{display:flex;align-items:baseline;justify-content:space-between;padding:30px 0 14px;border-top:3px solid var(--ink);font-family:Georgia,serif;font-size:30px;font-weight:700}.section-head b{color:var(--red);font-family:Inter,sans-serif;font-size:12px}.empty-section{margin:0;padding:5px 0 34px;color:var(--muted);font-style:italic}.footer{margin-top:34px;padding:30px 46px 40px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.footer strong{color:var(--ink)}@media(max-width:760px){.shell{width:100%;margin:0;box-shadow:none}header,.intro,.lead-wrap,.newsletter-section,.footer{padding-left:22px;padding-right:22px}.index{padding-left:22px;padding-right:22px}.brand-copy strong{font-size:26px}.intro h1{font-size:44px}.intro>p{font-size:18px}.story,.lead-story{grid-template-columns:1fr}.story h2{font-size:31px}.story h3{font-size:25px}.story-image{aspect-ratio:16/9}}@media print{body{background:white}.shell{width:100%;margin:0;box-shadow:none}.index{display:none}.story{break-inside:avoid}.newsletter-section{break-before:auto}}
</style>
</head>
<body>
<main class="shell">
  <header>
    <div class="brand">${logo}<div class="brand-copy"><strong>Highlords Daily</strong><span>TECNOLOGIA SEM RUÍDO</span></div></div>
    <div class="edition-date">${escapeHtml(formatDate(edition.editionDate))}</div>
  </header>
  <section class="intro">
    <h1>${escapeHtml(edition.title)}</h1>
    <p>${escapeHtml(edition.intro)}</p>
    <div class="stats"><span><strong>${edition.stats.stories}</strong> matérias</span><span><strong>${edition.stats.sources}</strong> fontes</span><span><strong>${edition.stats.candidates}</strong> candidatas analisadas</span><span>Curadoria: ${edition.curatedBy === 'ollama' ? 'Ollama' : 'ranking'}</span></div>
  </section>
  <nav class="index">${nav}</nav>
  <section class="lead-wrap"><div class="label">MANCHETE DA EDIÇÃO</div>${story(edition.lead, { lead: true })}</section>
  ${sections}
  <footer class="footer"><strong>Highlords Daily</strong> · gerado localmente com RSS + Ollama · ${escapeHtml(edition.editionDate)}</footer>
</main>
</body>
</html>`;
}
