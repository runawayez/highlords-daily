import { normalizeText } from "../utils/text.mjs";

const actions = [
  /\b(?:encerr\w*|descontinu\w*|chegar ao fim|shut(?:s)? down|shutdown|discontinu\w*)\b/u,
  /\b(?:aprova\w*|autoriza\w*|approv\w*|aprob\w*)\b/u,
  /\b(?:bloque\w*|proib\w*|block(?:ed|s)?|banned)\b/u,
];
const titleOf = (article) =>
  String(
    article.originalTitle || article.headline || article.title || "",
  ).replace(/League of Legends/gi, "LoL");
const folded = (text) =>
  normalizeText(text.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
const entityPairs = (title) =>
  new Set(
    (
      title.match(
        /[\p{Lu}][\p{L}\p{N}-]+(?:\s+(?:(?:of|de|da|do|the)\s+)?(?:[\p{Lu}\p{N}][\p{L}\p{N}-]*|[\p{Ll}]+[\p{Lu}][\p{L}\p{N}-]*))+/gu,
      ) || []
    ).flatMap((phrase) => {
      const words = folded(phrase).split(" ");
      return words.slice(1).map((word, index) => `${words[index]} ${word}`);
    }),
  );
const disjoint = (a, b) =>
  a.size && b.size && ![...a].some((value) => b.has(value));

// A narrow additional signal, independent of category and model topicKey.
// Require the same action and a shared named phrase; publisher names alone or
// a shared game without the same event are insufficient. Unsupported cases
// retain the ordinary title/topic similarity policy.
export function sourceEventRelation(a, b) {
  const left = titleOf(a),
    right = titleOf(b);
  const x = folded(left),
    y = folded(right);
  const actionA = actions
    .map((pattern, index) => (pattern.test(x) ? index : -1))
    .filter((index) => index >= 0);
  const actionB = actions
    .map((pattern, index) => (pattern.test(y) ? index : -1))
    .filter((index) => index >= 0);
  if (actionA.length !== 1 || actionB.length !== 1 || actionA[0] !== actionB[0])
    return null;
  const entitiesA = entityPairs(left),
    entitiesB = entityPairs(right);
  if (
    ![...entitiesA].some(
      (entity) => entity.length >= 7 && entitiesB.has(entity),
    )
  )
    return null;
  const negative = (text) => /\b(?:nao|not|never|nega|denies)\b/u.test(text);
  if (negative(x) !== negative(y)) return "different";
  if (/\b(?:rumor|rumour)\b/u.test(`${x} ${y}`) || negative(x)) return null;
  const dates = [a, b].map((article) => Date.parse(article.publishedAt));
  if (
    dates.every(Number.isFinite) &&
    Math.abs(dates[0] - dates[1]) > 72 * 3600000
  )
    return null;
  if (
    disjoint(
      new Set(x.match(/\b\d+\b/g) || []),
      new Set(y.match(/\b\d+\b/g) || []),
    )
  )
    return "different";
  if (
    disjoint(
      new Set(left.match(/\b[A-Z][A-Z\d]{1,}\b/g) || []),
      new Set(right.match(/\b[A-Z][A-Z\d]{1,}\b/g) || []),
    )
  )
    return "different";
  const names = (title) =>
    new Set(
      (title.match(/[\p{L}\p{N}-]+/gu) || [])
        .filter((word) => /\p{Lu}/u.test(word))
        .map(folded),
    );
  const namesA = names(left),
    namesB = names(right);
  if (
    [...namesA].some((name) => !namesB.has(name)) &&
    [...namesB].some((name) => !namesA.has(name))
  )
    return "different";
  return "same";
}

export function matchingSourceEvent(a, b) {
  return sourceEventRelation(a, b) === "same";
}
