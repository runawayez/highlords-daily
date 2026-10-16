// Self-contained: shared by the offline HTML and the measured PDF compositor.
export function fitEditorialRow(row) {
  const cards = [...row.querySelectorAll(":scope > .story-card")];
  if (cards.length !== 2 || !row.getBoundingClientRect().width) return;
  const modes = ["fit-wide-first", "fit-wide-last", "fit-stack"];
  row.classList.remove(...modes);
  delete row.dataset.fit;
  if (!row.closest(".pdf-page") && innerWidth <= 760) return;
  const measure = () => {
    const rects = cards.map((card) => card.getBoundingClientRect());
    const height = row.getBoundingClientRect().height;
    const width = row.getBoundingClientRect().width;
    const empty = row.classList.contains("fit-stack")
      ? 0
      : rects.reduce(
          (sum, rect) => sum + (height - rect.height) * rect.width,
          0,
        ) / width;
    return { height, score: height + empty * 0.8, rects };
  };
  const baseline = measure();
  const heights = baseline.rects.map((rect) => rect.height);
  if (
    Math.max(...heights) - Math.min(...heights) < 100 ||
    Math.max(...heights) < Math.min(...heights) * 1.5
  )
    return;
  let best = { mode: "", ...baseline };
  for (const mode of modes) {
    row.classList.add(mode);
    const candidate = measure();
    // Stacking should earn its extra divider, rather than churn similar rows.
    const score = candidate.score + (mode === "fit-stack" ? 18 : 0);
    if (score < best.score - 16 && candidate.height <= baseline.height * 1.08)
      best = { mode, ...candidate, score };
    row.classList.remove(mode);
  }
  if (best.mode) {
    row.classList.add(best.mode);
    row.dataset.fit = best.mode;
  }
}
