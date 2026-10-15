// Serialized into the static archive. No fetch/server is required (file:// works).
export function initArchive() {
  const data = JSON.parse(document.querySelector("#archive-data").textContent);
  const query = document.querySelector("#search");
  const category = document.querySelector("#category");
  const source = document.querySelector("#source");
  const status = document.querySelector("#feedback-status");
  const key = `highlords:${data.publication}:feedback:v1`;
  let feedback = {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    if (saved && typeof saved === "object" && !Array.isArray(saved))
      feedback = saved;
  } catch {
    status.textContent = data.ui.storageUnavailable;
  }
  const normalize = (text) =>
    String(text).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase();
  const refresh = () => {
    const text = normalize(query.value.trim());
    const active = Boolean(text || category.value || source.value);
    document.querySelector("#editions").hidden = active;
    document.querySelector("#stories").hidden = !active;
    let visible = 0;
    document.querySelectorAll(".archive-story").forEach((card) => {
      const row = data.stories[Number(card.dataset.index)];
      const matches =
        (!category.value || row.category === category.value) &&
        (!source.value || row.source === source.value) &&
        (!text ||
          normalize(
            [
              row.headline,
              row.summary,
              row.source,
              row.categoryName,
              ...(row.tags || []),
            ].join(" "),
          ).includes(text));
      card.hidden = !matches;
      if (matches) visible++;
    });
    document.querySelector("#result-count").textContent = active
      ? `${visible} ${data.ui.searchResults}`
      : "";
  };
  for (const field of [query, category, source])
    field.addEventListener("input", refresh);
  document.querySelectorAll(".archive-story").forEach((card) => {
    const story = data.stories[Number(card.dataset.index)];
    const id = `${story.date}:${story.key}`;
    const choice = card.querySelector(".feedback-choice");
    const correction = card.querySelector(".feedback-category");
    const previous = feedback[id];
    if (previous) {
      choice.value = previous.verdict;
      correction.value = previous.expectedCategory || "";
    }
    const save = () => {
      correction.hidden = choice.value !== "wrong-category";
      if (!choice.value) delete feedback[id];
      else
        feedback[id] = {
          ...story,
          verdict: choice.value,
          expectedCategory: correction.value || null,
          updatedAt: new Date().toISOString(),
        };
      try {
        localStorage.setItem(key, JSON.stringify(feedback));
        status.textContent = data.ui.feedbackSaved;
      } catch {
        status.textContent = data.ui.storageUnavailable;
      }
    };
    correction.hidden = choice.value !== "wrong-category";
    choice.addEventListener("change", save);
    correction.addEventListener("change", save);
  });
  document.querySelector("#export-feedback").addEventListener("click", () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            version: 1,
            publication: data.publication,
            entries: Object.values(feedback),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "highlords-editorial-feedback.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  refresh();
}
