// Explicitly fictional copy and vector illustrations for layout review only.
export function designPreview() {
  const svg = (body, width = 1200, height = 450) =>
    `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`).toString("base64")}`;
  const servers = svg(
    `<rect width="1200" height="450" fill="#1c272b"/>${Array.from({ length: 6 }, (_, i) => `<rect x="${70 + i * 178}" y="${70 - (i % 2) * 30}" width="122" height="280" fill="#111a1d"/>${Array.from({ length: 9 }, (_, j) => `<path d="M${86 + i * 178} ${100 + j * 26 - (i % 2) * 30}h82" stroke="#647778" stroke-width="2"/><circle cx="${180 + i * 178}" cy="${100 + j * 26 - (i % 2) * 30}" r="2" fill="${j % 3 ? "#b7c9bc" : "#b8332b"}"/>`).join("")}`).join("")}<path d="M0 414H445L760 35H1200" stroke="#b8332b" stroke-width="5" fill="none"/>`,
  );
  const city = svg(
    `<rect width="600" height="500" fill="#e5dfd1"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${i * 90 - 150} 500l300 -500M0 ${i * 80}l600 -220" stroke="#bcb4a6" stroke-width="2"/>`).join("")}<path d="M65 390V180h70v210zM165 330V80h55v250zM270 430V210h65v220zM385 290V100h75v190z" fill="#727d77"/><path d="M0 460L170 345L285 280L355 170L600 32" stroke="#b8332b" stroke-width="15" fill="none"/>`,
    600,
    500,
  );
  let id = 0;
  const story = (category, headline, summary, imageUrl = null) => ({
    id: ++id,
    stableId: `design-${id}`,
    category,
    source: "Texto ilustrativo",
    originalTitle: headline,
    headline,
    summary,
    excerpt: summary,
    link: "https://example.org/layout-preview",
    tags: [],
    imageUrl,
    displayImage: Boolean(imageUrl),
    displayRole: "standard",
    language: "pt-BR",
  });
  const lead = story(
    "tecnologia",
    "A próxima disputa da IA está na infraestrutura",
    "O avanço dos modelos coloca energia, capacidade de processamento e operação no centro da conversa. Uma mudança que alcança empresas, desenvolvedores e usuários.",
    servers,
  );
  return {
    editionDate: "2026-10-15",
    previewNotice: "Prévia de layout · Conteúdo ilustrativo",
    language: "pt-BR",
    lead,
    topStories: [],
    stats: { stories: 10, sources: 1 },
    sections: [
      {
        slug: "economia",
        name: "Economia",
        articles: [
          story(
            "economia",
            "O custo do crédito entra nas decisões do dia a dia",
            "Juros não ficam restritos ao mercado financeiro. Eles também aparecem no parcelamento, no investimento das empresas e no planejamento das famílias.",
          ),
        ],
      },
      {
        slug: "esports",
        name: "eSports",
        articles: [
          story(
            "esports",
            "Por trás da final, um ecossistema em transformação",
            "O competitivo envolve mais que resultados. Estrutura dos clubes, calendário e sustentabilidade das ligas também ajudam a explicar o cenário.",
          ),
        ],
      },
      {
        slug: "ia-desenvolvimento",
        name: "IA & Desenvolvimento",
        articles: [
          story(
            "ia-desenvolvimento",
            "Quando o software começa a trabalhar junto",
            "A automação se torna mais útil quando sai da demonstração e encontra uma tarefa concreta. É nesse ponto que integração, qualidade e contexto passam a pesar tanto quanto a capacidade do modelo. Para equipes de produto, também importa saber como revisar o resultado e acompanhar falhas.",
          ),
          story(
            "ia-desenvolvimento",
            "O valor de executar tudo na própria máquina",
            "Rodar ferramentas localmente muda a relação com custo, privacidade e dependência de serviços. Em contrapartida, coloca configuração, memória e manutenção na conta de quem opera. A escolha depende do uso e de uma rotina bem definida, com validação e limites claros.",
          ),
        ],
      },
      {
        slug: "tecnologia",
        name: "Tecnologia",
        articles: [
          story(
            "tecnologia",
            "Eficiência também é desempenho",
            "Consumo, temperatura e estabilidade fazem parte da experiência de uso.",
          ),
          story(
            "tecnologia",
            "Ferramentas menores, tarefas mais claras",
            "Produtos focados podem resolver uma rotina sem adicionar novas camadas de trabalho.",
          ),
        ],
      },
      {
        slug: "politica-sociedade",
        name: "Política & Sociedade",
        articles: [
          story(
            "politica-sociedade",
            "Uma cidade se lê pelos caminhos de quem vive nela",
            "Transporte, moradia e acesso a serviços dão forma à experiência urbana. Olhar para esses trajetos ajuda a entender como oportunidades e obstáculos se distribuem pelo território. Por trás de cada mapa há uma rotina: chegar ao trabalho, buscar atendimento e encontrar tempo para a vida.",
            city,
          ),
        ],
      },
      {
        slug: "entretenimento",
        name: "Entretenimento",
        articles: [
          story(
            "entretenimento",
            "O terror encontra novas formas de contar histórias",
            "Atmosfera, silêncio e espaço sugerido podem ser tão importantes quanto o susto. Cinema e séries exploram esses recursos para construir tensão e deixar perguntas depois do fim.",
          ),
        ],
      },
      {
        slug: "games",
        name: "Games",
        articles: [
          story(
            "games",
            "Jogar junto também é uma forma de encontro",
            "No cooperativo, a experiência nasce da divisão de papéis e das decisões em grupo. Às vezes, o que fica não é a vitória, mas a história que os amigos criaram durante a partida.",
          ),
        ],
      },
    ],
  };
}
