import { decodeHTML as decode } from "entities";

export function cleanSourceText(value = "") {
  return (
    decode(
      String(value)
        .replace(/<(script|style|nav|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, "\n")
        .replace(
          /<\/(?:p|div|section|li|ul|ol|blockquote)>|<br\s*\/?\s*>/gi,
          "\n",
        )
        .replace(/<[^>]+>/g, " "),
    )
      // RSS providers sometimes concatenate an inline CTA with the next paragraph.
      .replace(
        /(?:📱|🛍️?)?\s*(?:veja|confira)\s+(?:as?\s+|os?\s+)?(?:melhores\s+|principais\s+)?(?:ofertas|promoções)[^\n.!?]*?(?:CT Ofertas|nosso canal|canal de ofertas)[.!]?/giu,
        " ",
      )
      .replace(
        /(?:🗒️?)?\s*Tem alguma sugestão de reportagem\?\s*Mande para o g1/giu,
        " ",
      )
      .split(/\n+/)
      .filter(
        (line) =>
          !/^\s*(?:[\p{Extended_Pictographic}\uFE0F]\s*)?(?:(?:veja|confira)\s+(?:as?\s+|os?\s+)?(?:melhores\s+)?(?:ofertas|promoções)|(?:assine|subscribe|sign up)\b.*(?:newsletter|nosso canal|our newsletter))/iu.test(
            line,
          ),
      )
      // Related-link lists are not article prose. Preserve the preceding source copy.
      .map((line) =>
        line.replace(
          /(?:Notícias relacionadas|Leia também|Veja também|Related (?:articles|stories)|Read also)\s*:[\s\S]*$/iu,
          "",
        ),
      )
      .join(" ")
      .replace(/([.!?])(?=[\p{Lu}])/gu, "$1 ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

export function sentenceParts(value, language = "en") {
  let segmenter;
  try {
    segmenter = new Intl.Segmenter(language, { granularity: "sentence" });
  } catch {
    segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  }
  return [...segmenter.segment(value)]
    .map(({ segment }) => segment.trim())
    .filter(Boolean);
}

// Prefer a complete sentence. If the source is one unpunctuated fragment, use
// a word boundary and an explicit ellipsis rather than publishing half a word.
export function limitCopy(value, maximum, language = "en") {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maximum) return text;
  let complete = "";
  for (const sentence of sentenceParts(text, language)) {
    const next = `${complete ? `${complete} ` : ""}${sentence}`;
    if (next.length > maximum) break;
    complete = next;
  }
  if (complete) return complete;
  const prefix = text.slice(0, maximum - 1);
  const boundary = prefix.search(/\s+\S*$/u);
  // CJK text need not contain spaces; avoid cutting a UTF-16 surrogate pair.
  const words =
    boundary > maximum * 0.4
      ? prefix.slice(0, boundary)
      : [...prefix].filter((c) => !/^[\uD800-\uDFFF]$/u.test(c)).join("");
  return `${words.trimEnd()}…`;
}
