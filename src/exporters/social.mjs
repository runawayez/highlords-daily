import { publication } from "../config.mjs";
import { uiCatalog } from "../services/i18n.mjs";

function compact(article) {
  if (!article) return "";
  return `• ${article.headline || article.originalTitle}\n${article.link}`;
}

export function renderSocialText(edition) {
  const blocks = [
    `${publication.name} — ${edition.title}`,
    edition.intro || "",
  ];
  if (edition.lead) blocks.push(`🔥 ${compact(edition.lead)}`);
  if (edition.topStories?.length)
    blocks.push(
      `${edition.frontPageTitle || uiCatalog().fallbackTitle}\n${edition.topStories.map(compact).join("\n")}`,
    );
  for (const section of edition.sections || []) {
    if (!section.articles?.length) continue;
    blocks.push(`${section.name}\n${section.articles.map(compact).join("\n")}`);
  }
  return `${blocks.filter(Boolean).join("\n\n").trim()}\n`;
}

export function renderDiscordMarkdown(edition) {
  const blocks = [`# ${edition.title}`, edition.intro || ""];
  if (edition.lead)
    blocks.push(
      `## 🔥 ${edition.lead.headline || edition.lead.originalTitle}\n${edition.lead.link}`,
    );
  if (edition.topStories?.length)
    blocks.push(
      `## ${edition.frontPageTitle || uiCatalog().fallbackTitle}\n${edition.topStories.map((article) => `- [${article.headline || article.originalTitle}](${article.link})`).join("\n")}`,
    );
  for (const section of edition.sections || []) {
    if (!section.articles?.length) continue;
    blocks.push(
      `## ${section.name}\n${section.articles.map((article) => `- [${article.headline || article.originalTitle}](${article.link})`).join("\n")}`,
    );
  }
  return `${blocks.filter(Boolean).join("\n\n").trim()}\n`;
}
