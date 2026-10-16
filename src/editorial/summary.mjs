// Extract complete source sentences: no generated facts, padding or ellipses.
export function sourceSummary(value, language = "en", budget = 420) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  let segmenter;
  try {
    segmenter = new Intl.Segmenter(language, { granularity: "sentence" });
  } catch {
    segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  }
  const promotional =
    /^(?:(?:veja|confira)\s+(?:as?\s+|os?\s+)?(?:melhores\s+|principais\s+)?(?:ofertas|promoções)\b|(?:receba|acompanhe|assine|entre|siga)\b.*(?:noss[oa]|newsletter|canal de ofertas)|(?:join|subscribe|sign up|follow us)\b.*(?:our newsletter|our channel))/iu;
  const sentences = [...segmenter.segment(text)]
    .map(({ segment }) => segment.trim())
    .filter((sentence) => sentence && !promotional.test(sentence));
  let summary = "";
  for (const sentence of sentences) {
    if (summary && summary.length + sentence.length + 1 > budget) break;
    summary += `${summary ? " " : ""}${sentence}`;
  }
  return summary;
}
