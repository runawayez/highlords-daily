export function normalizeText(value = "") {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/https?:\/\/\S+/gu, " ")
    .replace(/[^\p{L}\p{N}%+]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
export function wordTokens(
  value = "",
  language = "und",
  stopwords = new Set(),
) {
  const text = normalizeText(value);
  const locale = language === "und" ? undefined : language;
  return [...new Intl.Segmenter(locale, { granularity: "word" }).segment(text)]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment)
    .filter((token) => !stopwords.has(token));
}
export function textDirection(locale) {
  return ["ar", "fa", "he", "ur", "ps", "dv"].includes(
    new Intl.Locale(locale).language,
  )
    ? "rtl"
    : "ltr";
}
