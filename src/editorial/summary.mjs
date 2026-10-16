// Extract source sentences, without generated facts or padding. Only oversized,
// unpunctuated source fragments need the explicit word-boundary fallback.
import { cleanSourceText, sentenceParts, limitCopy } from "./source-text.mjs";
export function sourceSummary(value, language = "en", budget = 420) {
  const text = cleanSourceText(value);
  if (!text) return "";
  const promotional =
    /^(?:(?:veja|confira)\s+(?:as?\s+|os?\s+)?(?:melhores\s+|principais\s+)?(?:ofertas|promoções)\b|(?:receba|acompanhe|assine|entre|siga)\b.*(?:noss[oa]|newsletter|canal de ofertas)|(?:join|subscribe|sign up|follow us)\b.*(?:our newsletter|our channel))/iu;
  const sentences = sentenceParts(text, language).filter(
    (sentence) => sentence && !promotional.test(sentence),
  );
  let summary = "";
  for (const sentence of sentences) {
    if (summary && summary.length + sentence.length + 1 > budget) break;
    summary += `${summary ? " " : ""}${sentence}`;
  }
  return limitCopy(summary, 900, language);
}
