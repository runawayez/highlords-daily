// Runs inside Chromium. Measures the actual fonts/content before creating A4
// pages; no model, headline rewriting or whole-document shrinking is involved.
export function paginateEditorialDocument() {
  const shell = document.querySelector('.shell[data-design="editorial-v2"]');
  if (!shell) throw new Error("Editorial document not found.");
  document.querySelector(".pdf-document")?.remove();
  document.documentElement.classList.add("pdf-mode");
  const documentRoot = document.createElement("div");
  documentRoot.className = "pdf-document";
  document.body.append(documentRoot);
  const brand =
    shell.querySelector(".brand-name")?.textContent || document.title;
  const tagline = shell.querySelector(".brand-tag")?.textContent || "";
  const editionDate = shell.dataset.editionDate || "";
  const notice = shell.dataset.previewNotice || "";
  const language = String(document.documentElement.lang || "en")
    .toLowerCase()
    .split("-")[0];
  const linkHints = {
    pt: "Ctrl/Cmd+clique: nova aba",
    en: "Ctrl/Cmd+click: new tab",
    es: "Ctrl/Cmd+clic: nueva pestaña",
    fr: "Ctrl/Cmd+clic : nouvel onglet",
    de: "Ctrl/Cmd+Klick: neuer Tab",
    ja: "Ctrl/Cmd+クリック: 新しいタブ",
    zh: "Ctrl/Cmd+点击：新标签页",
    ar: "Ctrl/Cmd+نقرة: علامة تبويب جديدة",
  };
  const pages = [];
  let current;
  const copy = (element) => element.cloneNode(true);
  const fits = (page) =>
    page.content.scrollHeight <= page.content.clientHeight + 1;
  const hasContent = (page) => page.content.children.length > 0;

  function newPage() {
    const element = document.createElement("section");
    element.className = "pdf-page";
    const header = document.createElement("header");
    header.className = "pdf-page-header";
    const names = [];
    if (!pages.length) {
      const masthead = shell.querySelector(".masthead");
      if (masthead) header.append(copy(masthead));
      const index = shell.querySelector(".index");
      if (index) {
        const nav = copy(index);
        for (const link of nav.querySelectorAll("a"))
          link.removeAttribute("href");
        header.append(nav);
      }
    } else {
      const running = document.createElement("div");
      running.className = "pdf-running-head";
      const title = document.createElement("span");
      title.className = "pdf-running-brand";
      title.textContent = brand;
      const section = document.createElement("span");
      section.className = "pdf-running-section";
      running.append(title, section);
      header.append(running);
    }
    const content = document.createElement("main");
    content.className = "pdf-page-content";
    const footer = document.createElement("footer");
    footer.className = "pdf-page-footer";
    const imprint = document.createElement("span");
    imprint.className = "pdf-footer-brand";
    const publicationLine = document.createElement("div");
    publicationLine.textContent = [brand, tagline].filter(Boolean).join(" / ");
    const dateLine = document.createElement("div");
    dateLine.textContent = [
      editionDate,
      notice,
      linkHints[language] || linkHints.en,
    ]
      .filter(Boolean)
      .join(" · ");
    imprint.append(publicationLine, dateLine);
    const number = document.createElement("span");
    number.className = "pdf-page-number";
    footer.append(imprint, number);
    element.append(header, content, footer);
    documentRoot.append(element);
    element.style.paddingBottom = `${Math.max(87, footer.getBoundingClientRect().height + 62)}px`;
    current = { element, header, content, footer, names };
    pages.push(current);
    return current;
  }

  function registerSection(page, name) {
    if (!page.names.includes(name)) page.names.push(name);
    const label = page.header.querySelector(".pdf-running-section");
    if (label) label.textContent = page.names.join(" / ");
  }

  function addRow(section, row, heading, name) {
    const attach = (candidate = row) => {
      let unit = current.content.lastElementChild;
      const fresh =
        !unit?.classList.contains("pdf-section-unit") ||
        unit.dataset.section !== section;
      if (fresh) {
        unit = document.createElement("section");
        unit.className = "pdf-section-unit";
        unit.dataset.section = section;
        unit.append(copy(heading));
        current.content.append(unit);
      }
      unit.append(candidate);
      window.highlordsFitRow?.(candidate);
      if (fits(current)) {
        registerSection(current, name);
        return true;
      }
      candidate.remove();
      if (fresh) unit.remove();
      return false;
    };
    if (attach()) return;
    const cards = [...row.querySelectorAll(":scope > .story-card")];
    // Before moving an entire pair, try spending the remaining space on one
    // complete story. The second story keeps the section heading on continuation.
    if (cards.length === 2 && hasContent(current)) {
      const singles = cards.map((card) => {
        const single = document.createElement("div");
        single.className = `section-grid single ${card.querySelector(".story-image") ? "solo-visual" : "solo-text"}`;
        single.dataset.flowSingle = "true";
        single.append(copy(card));
        return single;
      });
      if (attach(singles[0])) {
        addRow(section, singles[1], heading, name);
        return;
      }
    }
    if (hasContent(current)) {
      newPage();
      if (attach()) return;
    }
    // A pair too tall at column width gets full-width individual stories.
    // It is never clipped or reduced to unreadable global scale.
    if (cards.length > 1) {
      for (const card of cards) {
        const single = document.createElement("div");
        single.className = "section-grid single pdf-single";
        single.append(card);
        addRow(section, single, heading, name);
      }
      return;
    }
    row.classList.add("pdf-compact", "pdf-single", "single");
    if (attach()) return;
    throw new Error(
      `Article exceeds the A4 content area: ${cards[0]?.querySelector("h2,h3")?.textContent || section}`,
    );
  }

  function addTeaserPair(left, right) {
    const pair = document.createElement("section");
    pair.className = "pdf-cross-section-grid";
    for (const section of [left, right]) {
      const teaser = document.createElement("section");
      teaser.className = "pdf-teaser";
      teaser.dataset.section = section.id;
      teaser.append(
        copy(section.querySelector(".section-title")),
        copy(section.querySelector(".story-card")),
      );
      pair.append(teaser);
    }
    const attach = () => {
      current.content.append(pair);
      const heights = [...pair.children].map(
        (child) => child.getBoundingClientRect().height,
      );
      if (
        Math.max(...heights) - Math.min(...heights) > 100 &&
        Math.max(...heights) > Math.min(...heights) * 1.5
      ) {
        pair.remove();
        return false;
      }
      if (fits(current)) {
        for (const section of [left, right])
          registerSection(
            current,
            section.querySelector(".section-title h2")?.textContent || "",
          );
        return true;
      }
      pair.remove();
      return false;
    };
    if (attach()) return;
    // Independent units can use the existing page rather than moving both
    // editorias to the next one. Their headings travel with their own story.
    for (const section of [left, right]) {
      const heading = section.querySelector(".section-title");
      const row = copy(section.querySelector(".section-grid"));
      row.className = "section-grid single pdf-single";
      addRow(
        section.id,
        row,
        heading,
        heading.querySelector("h2")?.textContent || "",
      );
    }
  }

  newPage();
  const lead = shell.querySelector(".lead-wrap");
  if (lead?.querySelector(".story-card")) {
    const block = copy(lead);
    current.content.append(block);
    if (!fits(current)) block.classList.add("pdf-compact");
    if (!fits(current))
      throw new Error(
        "Lead exceeds the A4 content area; edition HTML is preserved.",
      );
  }
  const sections = [...shell.querySelectorAll(".newsletter-section")];
  const isTextSingle = (section) =>
    section &&
    section.querySelectorAll(".story-card").length === 1 &&
    !section.querySelector(".story-image");
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index];
    if (isTextSingle(section) && isTextSingle(sections[index + 1])) {
      addTeaserPair(section, sections[++index]);
      continue;
    }
    const heading = section.querySelector(".section-title");
    if (!heading) continue;
    const name = heading.querySelector("h2")?.textContent || "";
    for (const row of section.querySelectorAll(".section-grid"))
      addRow(section.id, copy(row), heading, name);
  }
  // A sparse final page can take an entire preceding section when both fit.
  if (pages.length > 1) {
    const last = pages.at(-1);
    const before = pages.at(-2);
    const unit = before.content.lastElementChild;
    const occupied = (page) =>
      (page.content.lastElementChild?.getBoundingClientRect().bottom ||
        page.content.getBoundingClientRect().top) -
      page.content.getBoundingClientRect().top;
    const imbalance = Math.abs(occupied(before) - occupied(last));
    if (
      occupied(last) < last.content.clientHeight * 0.42 &&
      before.content.children.length > 1 &&
      unit?.matches(".pdf-section-unit,.pdf-cross-section-grid")
    ) {
      last.content.prepend(unit);
      if (
        !fits(last) ||
        Math.abs(occupied(before) - occupied(last)) >= imbalance
      )
        before.content.append(unit);
      else {
        const name = unit.querySelector(".section-title h2")?.textContent || "";
        registerSection(last, name);
      }
    }
  }
  for (const page of pages) {
    page.names = [];
    for (const heading of page.content.querySelectorAll(".section-title h2"))
      registerSection(page, heading.textContent || "");
  }
  const issues = [];
  for (const [index, page] of pages.entries()) {
    page.footer.querySelector(".pdf-page-number").textContent =
      `${String(index + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`;
    if (!fits(page)) issues.push(`page-${index + 1}-overflow`);
    const footerTop = page.footer.getBoundingClientRect().top;
    for (const card of page.content.querySelectorAll(".story-card")) {
      if (card.getBoundingClientRect().bottom > footerTop - 12)
        issues.push(`page-${index + 1}-footer-collision`);
    }
    for (const element of page.element.querySelectorAll(
      "h2,h3,p,.brand-name,.pdf-running-brand,.pdf-footer-brand",
    )) {
      if (element.scrollWidth > element.clientWidth + 2)
        issues.push(`page-${index + 1}-horizontal-overflow`);
    }
  }
  if (issues.length)
    throw new Error(`Invalid editorial pagination: ${issues.join(", ")}`);
  const expectedCards = shell.querySelectorAll(
    ".lead-wrap .story-card,.newsletter-section .story-card",
  ).length;
  const actualCards = documentRoot.querySelectorAll(".story-card").length;
  if (expectedCards !== actualCards)
    throw new Error(
      `PDF story count mismatch: ${actualCards}/${expectedCards}`,
    );
  return {
    design: "editorial-v2",
    pages: pages.length,
    stories: actualCards,
    scale: 1,
    issues,
    highlights: "references-not-reprinted",
    compactBlocks: documentRoot.querySelectorAll(".pdf-compact").length,
    flowSplitStories:
      documentRoot.querySelectorAll("[data-flow-single]").length,
    fittedRows: [...documentRoot.querySelectorAll("[data-fit]")].map((row) => ({
      mode: row.dataset.fit,
      stories: [...row.querySelectorAll(":scope > .story-card")].map(
        (card) => card.dataset.storyId,
      ),
    })),
    minimumBodyFontPx: Math.min(
      ...[...documentRoot.querySelectorAll(".story-card p")].map((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      ),
    ),
    pageSummaries: pages.map((page) => ({
      sections: page.names,
      stories: page.content.querySelectorAll(".story-card").length,
    })),
  };
}
