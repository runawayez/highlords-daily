// Reject schema examples and empty model output before they reach publication.
export function invalidCopyField(value) {
  const text = String(value ?? "").trim();
  return (
    !text ||
    /^(?:string|null|undefined|n\/?a|todo|tbd|placeholder|headline|summary|title|description|resumo|titulo|manchete|texto aqui|lorem ipsum(?:[\s\S]*))?[.!…]*$/iu.test(
      text,
    )
  );
}
export function hasInvalidCopy(article) {
  return (
    invalidCopyField(article?.headline) || invalidCopyField(article?.summary)
  );
}
