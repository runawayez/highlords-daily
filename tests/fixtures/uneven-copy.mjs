import { designPreview } from "./design-preview.mjs";

export function unevenCopy() {
  const sample = designPreview();
  const image = sample.lead.imageUrl;
  const pair = sample.sections.find(
    (section) => section.articles.length === 2,
  ).articles;
  sample.sections = [false, true].map((reverse, index) => {
    const long = {
      ...pair[0],
      stableId: `long-${index}`,
      imageUrl: image,
      displayImage: true,
      displayRole: "standard",
      headline:
        "Uma matéria longa com contexto que precisa de espaço para ser lida",
      summary:
        "Este texto fictício verifica o encaixe de um resumo muito maior que a nota ao lado, preservando todos os detalhes durante a paginação. "
          .repeat(7)
          .slice(0, 900),
    };
    const short = {
      ...pair[1],
      stableId: `short-${index}`,
      imageUrl: null,
      displayImage: false,
      displayRole: "standard",
      headline: "Uma notícia curta também merece espaço",
      summary: "Uma nota breve com os fatos disponíveis.",
    };
    return {
      slug: `uneven-${index}`,
      name: `Encaixe ${index + 1}`,
      articles: reverse ? [short, long] : [long, short],
    };
  });
  return sample;
}
