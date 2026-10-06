import { publication } from '../config.mjs';

function story(article, prefix = '###') {
  if (!article) return '';
  const title = article.headline || article.originalTitle || 'Untitled';
  const summary = article.summary || article.excerpt || '';
  return `${prefix} [${title}](${article.link})\n\n${summary}\n\n_${article.source}${article.category ? ` · ${article.category}` : ''}_\n`;
}

export function renderMarkdown(edition) {
  const lines = [
    `# ${edition.title}`,
    '',
    edition.intro || '',
    '',
    `> ${publication.name} · ${edition.editionDate}`,
    '',
    '## Lead',
    '',
    story(edition.lead, '###')
  ];

  for (const section of edition.sections || []) {
    if (!section.articles?.length) continue;
    lines.push(`## ${section.name}`, '');
    for (const article of section.articles) lines.push(story(article, '###'));
  }
  return `${lines.join('\n').trim()}\n`;
}
