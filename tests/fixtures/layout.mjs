export function layoutFixture() {
  let id = 0;
  const image = (width, height) =>
    `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#394d54"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 3}" fill="#ba482e"/></svg>`).toString("base64")}`;
  const story = (category, visual, long = false) => {
    id++;
    const marker = `STORY${String(id).padStart(2, "0")}`;
    return {
      id,
      stableId: marker,
      category,
      source: `Fonte ${id}`,
      headline: `${marker}START ${long ? "Um título editorial longo sobre mudanças no cenário de tecnologia, pesquisa e serviços públicos que exigem atenção e acompanhamento dos leitores da edição diária" : "Uma notícia importante para acompanhar hoje"}`,
      summary: `${"O acontecimento apresenta informações relevantes para os leitores, com contexto e consequências descritos pela fonte. ".repeat(long ? 5 : 2)} ${marker}END`,
      link: `https://example.org/${id}`,
      tags: ["contexto", "pesquisa"],
      imageUrl: visual ? image(id % 2 ? 400 : 1600, id % 2 ? 900 : 450) : null,
      displayImage: visual,
      displayRole: "standard",
    };
  };
  const lead = story("tecnologia", true, true);
  const layouts = [
    "solo-text",
    "mixed-grid",
    "balanced-grid",
    "solo-visual",
    "text-grid",
    "briefs-grid",
  ];
  return {
    editionDate: "2026-10-15",
    title: "Teste de regressão visual",
    intro: "",
    language: "pt-BR",
    lead,
    topStories: [],
    stats: { stories: 11, sources: 11 },
    sections: layouts.map((layout, index) => {
      const slug = `layout-${index}`;
      return {
        slug,
        name: index === 1 ? "eSports" : `Editoria ${index + 1}`,
        presentation: { layout },
        articles: layout.startsWith("solo")
          ? [story(slug, layout === "solo-visual", true)]
          : [
              story(
                slug,
                layout === "mixed-grid" || layout === "balanced-grid",
                true,
              ),
              story(slug, layout === "balanced-grid", false),
            ],
      };
    }),
  };
}
