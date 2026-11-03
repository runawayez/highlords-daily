import { normalizeNewsletter } from "../../src/editorial/edition.mjs";

// Fictional, explicitly labelled copy exercises a general newspaper end-to-end.
export function balancedPreview() {
  const desks = [
    [
      "politica-sociedade",
      "Serviços públicos entram no centro do debate",
      "A edição de demonstração apresenta uma discussão sobre acesso aos serviços e organização do atendimento. Este texto é ilustrativo e não relata uma decisão real.",
    ],
    [
      "mundo",
      "Diplomacia e cooperação abrem a conversa internacional",
      "Nesta matéria fictícia, o foco está nas relações entre países e nas consequências para a população. A informação serve exclusivamente à revisão de layout.",
    ],
    [
      "economia",
      "Trabalho e renda aparecem nas escolhas das famílias",
      "O exemplo ilustra uma matéria de economia voltada ao cotidiano, com espaço para explicar contexto e efeitos práticos sem recomendar investimentos.",
    ],
    [
      "ciencia-saude",
      "Pesquisa e saúde ganham espaço na edição",
      "Esta nota ilustrativa mostra como um tema científico pode ser apresentado com clareza. Não contém resultados de pesquisa nem recomendações médicas reais.",
    ],
    [
      "tecnologia",
      "Ferramentas digitais e privacidade disputam atenção",
      "O espaço de tecnologia reúne novidades relevantes, com prioridade para utilidade e consequências para os usuários. O conteúdo desta prévia é fictício.",
    ],
    [
      "entretenimento",
      "Cinema e cultura ajudam a ampliar o olhar",
      "Uma chamada cultural pode trazer um assunto interessante sem reproduzir a linguagem promocional da divulgação. Este é um exemplo de composição editorial.",
    ],
    [
      "esportes",
      "O esporte vai além das declarações de rotina",
      "A matéria fictícia representa uma cobertura esportiva centrada em acontecimentos relevantes. Nenhum resultado ou competição real é descrito neste exemplo.",
    ],
    [
      "games",
      "Jogos recebem um espaço próprio e proporcional",
      "O exemplo apresenta uma notícia de jogos em linguagem direta, preservando o interesse do leitor e o equilíbrio com os demais assuntos do jornal.",
    ],
  ];
  let id = 0;
  const articles = desks.flatMap(([category, headline, summary]) =>
    Array.from({ length: 3 }, (_, index) => ({
      id: ++id,
      stableId: `balanced-preview-${id}`,
      category,
      headline: index ? `${headline}: contexto ${index}` : headline,
      originalTitle: index ? `${headline}: contexto ${index}` : headline,
      summary,
      excerpt: summary,
      language: "pt-BR",
      source: `Fonte ilustrativa ${id}`,
      publisherGroup: `Fonte ${id}`,
      score:
        category === "politica-sociedade" && !index ? 9 : 7.5 - index * 0.1,
      topicKey: `illustrative-${id}`,
      publishedAt: new Date().toISOString(),
      link: `https://example.org/preview/${id}`,
      imageMode: "off",
      imageUrl: null,
      tags: [],
      ...(category === "economia" && !index ? { storyType: "service" } : {}),
    })),
  );
  const edition = normalizeNewsletter(
    { leadId: articles[0].id, sections: {} },
    articles,
    "2026-11-03",
  );
  const art = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><rect width="1200" height="400" fill="#d4d2c2"/><path d="M0 350H1200M100 350V120H220V350M370 350V50H550V350M750 350V160H930V350" fill="#53615b" stroke="#53615b" stroke-width="25"/><path d="M0 390L1200 210" stroke="#bd392a" stroke-width="12"/></svg>').toString("base64")}`;
  edition.lead = { ...edition.lead, imageUrl: art, displayImage: true };
  edition.previewNotice =
    "Prévia de layout · Conteúdo fictício · Sem notícias reais";
  return edition;
}
