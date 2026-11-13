// Small local models sometimes answer a whole batch with a 0-1 "confidence"
// instead of the requested 0-10 editorial score. On 2026-11-13, 84 of 150
// analysis scores were between 0 and 1 (none exactly 0) while the rest sat at
// 6-8, so "Senado aprova ajuste fiscal" (0.99) and the Microsoft outage
// (0.87) were rejected as below-score.
//
// A batch is rescaled only when EVERY positive score is <= 1 and at least two
// items have one: a lone low value is a legitimate weak score, but a whole
// batch of them is a scale mix-up. Mixed batches are left untouched.

const SCORE_FIELDS = ["score", "relevance", "relevancia", "rating", "nota"];

export function rawScore(row) {
  for (const field of SCORE_FIELDS) {
    const value = row?.[field];
    if (value == null) continue;
    const number =
      typeof value === "number"
        ? value
        : Number(
            String(value)
              .replace(",", ".")
              .match(/-?\d+(?:\.\d+)?/)?.[0],
          );
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function detectScoreScale(rows) {
  const positive = rows
    .map(rawScore)
    .filter((value) => value != null && value > 0);
  if (positive.length >= 2 && positive.every((value) => value <= 1)) return 10;
  return 1;
}
