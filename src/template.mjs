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
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  }).format(date);
}

function curatorLabel(edition) {
  return edition.curatedBy === 'ollama' ? 'Curadoria por IA local' : 'Curadoria algorítmica sem LLM';
}

function storyCard(article, { lead = false } = {}) {
  if (!article) return '';
  const image = article.imageUrl
    ? `<a class="story-image" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(safeUrl(article.imageUrl))}" alt="" loading="eager"></a>`
    : `<div class="story-image placeholder"><span>HIGH LORDS</span></div>`;
  const tags = Array.isArray(article.tags) && article.tags.length
    ? `<div class="tags">${article.tags.slice(0, 5).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
  const category = String(article.category || '').replace(/-/g, ' ');

  return `<article class="story-card ${lead ? 'lead-card' : ''}">
    ${image}
    <div class="story-body">
      <div class="story-meta"><span class="source">${escapeHtml(article.source)}</span><span>${escapeHtml(category)}</span><b>${Number(article.score || 0).toFixed(1)}</b></div>
      <h${lead ? '2' : '3'}><a href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.headline || article.originalTitle)}</a></h${lead ? '2' : '3'}>
      <p>${escapeHtml(article.summary || article.excerpt || '')}</p>
      ${tags}
      <a class="read-link" href="${escapeHtml(safeUrl(article.link))}" target="_blank" rel="noopener noreferrer">Abrir matéria ↗</a>
    </div>
  </article>`;
}

function sectionMarkup(section, index) {
  const stories = section.articles?.length
    ? section.articles.map(article => storyCard(article)).join('')
    : '<div class="empty-section">Sem destaque forte o bastante para entrar nesta edição.</div>';

  return `<section class="newsletter-section" id="${escapeHtml(section.slug)}">
    <div class="section-title"><span class="section-number">0${index + 1}</span><h2>${escapeHtml(section.name)}</h2><span class="section-count">${section.articles?.length || 0} destaque${section.articles?.length === 1 ? '' : 's'}</span></div>
    <div class="section-grid">${stories}</div>
  </section>`;
}

export function renderNewsletterHtml(edition, logoDataUri = '') {
  const nav = edition.sections.map(section => `<a href="#${escapeHtml(section.slug)}">${escapeHtml(section.name)}</a>`).join('');
  const logo = logoDataUri ? `<img class="logo" src="${logoDataUri}" alt="Highlords Daily">` : '<div class="logo-fallback">HL</div>';
  const sections = edition.sections.map(sectionMarkup).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Highlords Daily — ${escapeHtml(edition.editionDate)}</title>
<style>
:root{--bg:#0b0b0d;--paper:#f7f3e9;--ink:#171717;--muted:#69655d;--red:#c92f2b;--line:#d8d0c2;--soft:#ece5d8;--white:#fff;--max:1060px}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}.shell{width:min(calc(100% - 34px),var(--max));margin:34px auto 70px;background:var(--paper);box-shadow:0 28px 90px rgba(0,0,0,.45);overflow:hidden}.masthead{background:var(--ink);color:var(--white);padding:22px 38px 20px;border-top:8px solid var(--red)}.masthead-row{display:flex;align-items:center;justify-content:space-between;gap:24px}.brand{display:flex;align-items:center;gap:14px}.logo,.logo-fallback{width:48px;height:48px;display:block;object-fit:contain}.logo-fallback{display:grid;place-items:center;border:1px solid #555;font-weight:900}.brand-name{font-family:Georgia,'Times New Roman',serif;font-size:27px;font-weight:700;letter-spacing:-.02em}.brand-tag{margin-top:4px;color:#f0655d;font-size:10px;font-weight:800;letter-spacing:.19em}.edition-date{font-size:11px;line-height:1.4;text-align:right;color:#c9c6c0;text-transform:uppercase;letter-spacing:.1em}.hero{padding:38px 38px 26px}.eyebrow{display:flex;align-items:center;gap:10px;color:var(--red);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.eyebrow:before{content:'';width:30px;height:3px;background:var(--red)}.hero h1{margin:14px 0 0;max-width:870px;font-family:Georgia,'Times New Roman',serif;font-size:clamp(38px,5.4vw,62px);line-height:.98;letter-spacing:-.038em}.hero-intro{max-width:810px;margin:20px 0 0;color:var(--muted);font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.55}.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.stat{padding:7px 10px;border:1px solid var(--line);border-radius:999px;font-size:10px;font-weight:700;color:#5d5952;background:rgba(255,255,255,.25)}.index{display:flex;gap:7px;overflow:auto;padding:0 38px 26px}.index a{flex:0 0 auto;color:var(--ink);text-decoration:none;border-bottom:1px solid transparent;padding:5px 0;margin-right:12px;font-size:11px;font-weight:800}.index a:hover{color:var(--red);border-color:var(--red)}.lead-wrap{padding:0 38px 36px}.lead-label{margin-bottom:12px;font-size:10px;color:var(--red);font-weight:900;letter-spacing:.16em}.story-card{background:rgba(255,255,255,.42);border:1px solid var(--line);border-radius:3px;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.story-image{display:block;width:100%;aspect-ratio:16/9;background:#ded7ca;overflow:hidden}.story-image img{width:100%;height:100%;object-fit:cover;display:block}.story-image.placeholder{display:grid;place-items:center;background:linear-gradient(135deg,#1a1a1d,#343439);color:#d84a43;font-size:12px;font-weight:900;letter-spacing:.18em}.story-body{padding:17px 18px 18px}.story-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#7a756c;font-size:9px;text-transform:uppercase;letter-spacing:.07em;font-weight:700}.story-meta .source{color:var(--red)}.story-meta b{margin-left:auto;color:var(--ink);font-size:10px}.story-card h2,.story-card h3{font-family:Georgia,'Times New Roman',serif;margin:9px 0 10px;letter-spacing:-.02em}.story-card h2{font-size:31px;line-height:1.02}.story-card h3{font-size:21px;line-height:1.08}.story-card h2 a,.story-card h3 a{color:var(--ink);text-decoration:none}.story-card p{margin:0;color:var(--muted);font-size:12.5px;line-height:1.55}.tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.tags span{padding:4px 7px;background:var(--soft);font-size:9px;font-weight:800;color:#5e5951;border-radius:2px}.read-link{display:inline-block;margin-top:13px;color:var(--red);font-size:10px;font-weight:900;text-decoration:none}.lead-card{display:grid;grid-template-columns:minmax(0,1.17fr) minmax(300px,.83fr);background:var(--ink);border:0;color:white}.lead-card .story-image{height:100%;aspect-ratio:auto;min-height:330px}.lead-card .story-body{padding:28px 28px 26px}.lead-card .story-meta{color:#aaa}.lead-card .story-meta .source{color:#ff6a61}.lead-card .story-meta b{color:#fff}.lead-card h2 a{color:#fff}.lead-card p{color:#c8c5bf;font-size:13.5px}.lead-card .tags span{background:#2a2a2e;color:#d6d3cd}.lead-card .read-link{color:#ff6a61}.newsletter-section{padding:0 38px 38px;break-inside:auto}.section-title{display:grid;grid-template-columns:42px 1fr auto;align-items:end;gap:10px;border-top:4px solid var(--ink);padding:15px 0 13px}.section-title h2{margin:0;font-family:Georgia,'Times New Roman',serif;font-size:29px;line-height:1}.section-number{color:var(--red);font-size:10px;font-weight:900;letter-spacing:.12em}.section-count{font-size:9px;font-weight:800;color:#817b72;text-transform:uppercase;letter-spacing:.08em}.section-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.empty-section{grid-column:1/-1;padding:18px 0 26px;color:#777168;font-family:Georgia,'Times New Roman',serif;font-size:13px;font-style:italic}.footer{display:flex;justify-content:space-between;gap:20px;margin-top:8px;padding:24px 38px 28px;background:#e8e0d2;color:#6d675f;font-size:10px}.footer strong{color:var(--ink)}
@media(max-width:760px){.shell{width:100%;margin:0;box-shadow:none}.masthead,.hero,.lead-wrap,.newsletter-section,.footer{padding-left:20px;padding-right:20px}.index{padding-left:20px;padding-right:20px}.masthead-row{align-items:flex-start}.brand-name{font-size:23px}.edition-date{font-size:9px}.hero h1{font-size:42px}.hero-intro{font-size:17px}.lead-card{grid-template-columns:1fr}.lead-card .story-image{min-height:220px;aspect-ratio:16/9}.section-grid{grid-template-columns:1fr}}
@page{size:A4;margin:9mm}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html,body{background:#fff}.shell{width:100%;margin:0;box-shadow:none;overflow:visible}.masthead{padding:16px 22px 15px;border-top-width:5px}.logo,.logo-fallback{width:38px;height:38px}.brand-name{font-size:23px}.brand-tag{font-size:8px}.edition-date{font-size:8px}.hero{padding:22px 22px 16px}.hero h1{font-size:36px;max-width:680px}.hero-intro{font-size:13px;margin-top:12px;max-width:650px}.stats{margin-top:13px}.stat{font-size:8px;padding:5px 7px}.index{display:none}.lead-wrap{padding:0 22px 22px}.lead-label{font-size:8px;margin-bottom:8px}.lead-card{grid-template-columns:1.05fr .95fr}.lead-card .story-image{min-height:250px}.lead-card .story-body{padding:18px}.story-card h2{font-size:23px}.story-card h3{font-size:16px}.story-card p{font-size:9.5px;line-height:1.45}.story-body{padding:12px}.story-meta{font-size:7.5px}.story-meta b{font-size:8px}.tags{margin-top:8px}.tags span{font-size:7px;padding:3px 5px}.read-link{font-size:8px;margin-top:9px}.newsletter-section{padding:0 22px 22px}.section-title{padding:11px 0 9px;border-top-width:3px}.section-title h2{font-size:22px}.section-count,.section-number{font-size:7.5px}.section-grid{gap:9px}.footer{padding:16px 22px 18px;font-size:8px}.story-card{break-inside:avoid;page-break-inside:avoid}.section-title{break-after:avoid;page-break-after:avoid}}
</style>
</head>
<body>
<main class="shell">
  <header class="masthead"><div class="masthead-row"><div class="brand">${logo}<div><div class="brand-name">Highlords Daily</div><div class="brand-tag">TECNOLOGIA SEM RUÍDO</div></div></div><div class="edition-date">${escapeHtml(formatDate(edition.editionDate))}</div></div></header>
  <section class="hero"><div class="eyebrow">Edição diária</div><h1>${escapeHtml(edition.title)}</h1><p class="hero-intro">${escapeHtml(edition.intro)}</p><div class="stats"><span class="stat">${edition.stats.stories} matérias</span><span class="stat">${edition.stats.sources} fontes</span><span class="stat">${edition.stats.candidates} candidatas aprovadas</span><span class="stat">${escapeHtml(curatorLabel(edition))}</span></div></section>
  <nav class="index">${nav}</nav>
  <section class="lead-wrap"><div class="lead-label">MANCHETE DA EDIÇÃO</div>${storyCard(edition.lead,{lead:true})}</section>
  ${sections}
  <footer class="footer"><span><strong>Highlords Daily</strong> · ${escapeHtml(curatorLabel(edition))}</span><span>${escapeHtml(edition.editionDate)}</span></footer>
</main>
</body>
</html>`;
}
