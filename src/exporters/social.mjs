import { publication } from '../config.mjs';

function compact(article) {
  if (!article) return '';
  return `• ${article.headline || article.originalTitle}\n${article.link}`;
}

export function renderSocialText(edition) {
  const blocks = [`${publication.name} — ${edition.title}`, edition.intro || ''];
  if (edition.lead) blocks.push(`🔥 ${compact(edition.lead)}`);
  for (const section of edition.sections || []) {
    if (!section.articles?.length) continue;
    blocks.push(`${section.name}\n${section.articles.map(compact).join('\n')}`);
  }
  return `${blocks.filter(Boolean).join('\n\n').trim()}\n`;
}

export function renderDiscordMarkdown(edition) {
  const blocks = [`# ${edition.title}`, edition.intro || ''];
  if (edition.lead) blocks.push(`## 🔥 ${edition.lead.headline || edition.lead.originalTitle}\n${edition.lead.link}`);
  for (const section of edition.sections || []) {
    if (!section.articles?.length) continue;
    blocks.push(`## ${section.name}\n${section.articles.map(article => `- [${article.headline || article.originalTitle}](${article.link})`).join('\n')}`);
  }
  return `${blocks.filter(Boolean).join('\n\n').trim()}\n`;
}
