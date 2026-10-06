import { categories, config } from '../config.mjs';

const SOURCE_TRUST = new Map([
  ['Canaltech', 1.35],
  ['Tecnoblog', 1.30],
  ['Adrenaline', 1.25],
  ['TecMundo', 1.20],
  ['Olhar Digital', 1.15],
  ['MacMagazine', 1.10],
  ['Oficina da Net', 1.00],
  ['TudoCelular', 0.95],
  ['TabNews', 0.70]
]);

const CATEGORY_RULES = {
  ia: [
    ['inteligencia artificial', 3.8], ['ia generativa', 3.8], ['machine learning', 3.2], ['aprendizado de maquina', 3.2],
    ['modelo de linguagem', 3.5], ['modelo generativo', 3.2], ['llm', 3.5], ['openai', 3.2], ['chatgpt', 3.3],
    ['anthropic', 3.2], ['claude', 2.8], ['gemini', 2.9], ['deepmind', 2.8], ['copilot', 2.2], ['agente de ia', 3.3],
    ['agentes de ia', 3.3], ['rede neural', 2.8], ['inferencia', 2.3], ['treinamento de modelo', 2.7], ['multimodal', 2.8],
    ['artificial intelligence', 3.5], ['generative ai', 3.5], ['language model', 2.8], ['ai agent', 3.0]
  ],
  desenvolvimento: [
    ['desenvolvedor', 2.2], ['desenvolvedores', 2.2], ['programacao', 3.0], ['linguagem de programacao', 3.3], ['framework', 2.8],
    ['biblioteca', 2.1], [' sdk ', 2.9], [' api ', 2.5], ['github', 2.7], ['gitlab', 2.7], ['devops', 3.2], ['kubernetes', 3.1],
    ['docker', 2.9], ['container', 1.9], ['ci/cd', 3.1], ['banco de dados', 2.5], ['postgres', 2.9], ['mysql', 2.8],
    ['sqlite', 2.8], ['redis', 2.6], ['typescript', 3.1], ['javascript', 3.1], ['python', 2.8], ['rust', 2.9], ['golang', 2.8],
    ['codigo aberto', 2.5], ['open source', 2.5], ['repositorio', 1.8], ['ide ', 2.5], ['vscode', 2.6], ['testes', 2.4],
    ['playwright', 3.1], ['selenium', 3.1], ['qualidade de software', 2.7], ['compilador', 2.8], ['runtime', 2.1],
    ['developer', 1.7], ['programming', 2.7], ['software development', 2.6]
  ],
  'mobile-gadgets': [
    ['smartphone', 3.5], ['celular', 3.3], [' iphone', 3.4], ['galaxy ', 3.1], ['pixel ', 2.9], ['android', 1.8],
    ['tablet', 2.9], ['ipad', 3.0], ['smartwatch', 3.1], ['apple watch', 3.1], ['relogio inteligente', 3.0], ['wearable', 2.7],
    ['fones', 2.4], ['fone de ouvido', 2.8], ['earbuds', 2.8], ['airpods', 3.0], ['casa inteligente', 2.9], ['smart home', 2.8],
    ['gadget', 2.5], ['dobravel', 2.8], ['kindle', 2.7], ['e-reader', 2.6]
  ],
  hardware: [
    [' gpu ', 3.5], ['placa de video', 3.6], [' cpu ', 3.5], ['processador', 3.1], ['nvidia', 2.9], ['geforce', 3.2],
    ['radeon', 3.2], ['ryzen', 3.2], ['intel core', 3.1], ['semicondutor', 3.1], ['chip', 2.1], ['snapdragon', 2.8],
    ['placa-mae', 3.1], ['placa mae', 3.1], ['memoria ram', 2.8], [' ddr', 2.8], [' ssd', 3.0], ['armazenamento', 1.9],
    ['notebook', 2.8], ['laptop', 2.7], ['desktop', 2.5], ['pc gamer', 2.8], ['monitor', 2.6], ['teclado', 2.4], ['mouse ', 2.2],
    ['periferico', 2.5], ['oled', 2.2], ['silicio', 2.0], ['hardware', 1.8], ['graphics card', 3.2], ['processor', 2.6]
  ],
  'software-internet': [
    ['windows ', 2.9], ['linux', 3.0], ['macos', 3.0], ['android ', 2.4], [' ios ', 2.4], ['navegador', 2.8],
    ['chrome', 2.5], ['firefox', 2.7], ['safari', 2.3], ['sistema operacional', 3.1], ['seguranca', 2.6], ['ciberseguranca', 3.1],
    ['vulnerabilidade', 3.3], [' cve-', 3.5], ['malware', 3.1], ['ransomware', 3.1], ['privacidade', 2.6], ['criptografia', 2.8],
    ['internet', 1.9], ['aplicativo', 2.0], ['app ', 1.8], ['atualizacao', 2.2], ['software', 1.8], ['servico digital', 2.4],
    ['rede ', 1.8], ['whatsapp', 2.6], ['telegram', 2.4], ['signal', 2.3], ['browser', 2.6], ['security', 2.3], ['privacy', 2.3]
  ],
  games: [
    ['jogo ', 2.5], ['jogos ', 3.0], ['videogame', 3.2], ['gameplay', 3.2], ['steam', 3.1], ['playstation', 3.2], [' ps5', 3.2],
    ['xbox', 3.2], ['nintendo', 3.2], ['switch ', 2.9], ['console', 2.8], ['estudio', 1.8], ['engine', 2.3], ['unreal engine', 3.1],
    ['unity ', 2.6], ['jogo indie', 2.8], [' rpg', 2.6], ['dlc ', 2.5], ['remaster', 2.7], ['game pass', 2.9], ['epic games', 2.6],
    ['video game', 3.2], ['gaming', 2.8]
  ],
  futuro: [
    ['robotica', 3.4], ['robo ', 2.8], ['robos ', 2.8], ['humanoide', 3.2], ['computacao quantica', 3.8], ['computador quantico', 3.8],
    ['realidade virtual', 3.2], ['realidade aumentada', 3.2], ['realidade mista', 3.1], ['computacao espacial', 3.3], ['interface cerebral', 3.4],
    ['interface neural', 3.4], ['prototipo', 2.2], ['experimental', 2.2], ['pesquisadores', 1.3], ['avanco', 1.7], ['tecnologia emergente', 2.7],
    ['robotics', 3.2], ['quantum computing', 3.7], ['virtual reality', 3.0], ['augmented reality', 3.0], ['spatial computing', 3.1]
  ]
};

const IMPORTANCE_RULES = [
  ['lanca', 0.9], ['lancou', 0.9], ['lancamento', 0.9], ['anuncia', 0.8], ['anunciou', 0.8], ['apresenta', 0.7], ['revela', 0.8],
  ['chega', 0.6], ['disponivel', 0.6], ['nova versao', 0.9], ['grande atualizacao', 1.0], ['atualizacao critica', 1.1],
  ['codigo aberto', 0.8], ['open source', 0.8], ['vulnerabilidade critica', 1.1], ['zero-day', 1.2], ['falha critica', 1.1],
  ['novo modelo', 0.9], ['novo chip', 1.0], ['nova gpu', 1.0], ['nova cpu', 1.0], ['benchmark', 0.45], ['recorde', 0.45],
  ['launch', 0.8], ['release', 0.6], ['major update', 0.9], ['critical vulnerability', 1.0]
];

const REJECT_TITLE = [
  'oferta', 'ofertas', 'desconto', 'cupom', 'promocao', 'promoção', 'barato', 'menor preco', 'menor preço', 'por apenas',
  'sem juros', '% off', 'prime day', 'amazon prime', 'liquidacao', 'liquidação', 'sale ', 'discount', 'coupon', 'save $',
  'melhores ofertas', 'achados', 'compre agora', 'guia de compras', 'vale a pena comprar'
];

const NOISE_RULES = [
  ['rumor', 1.0], ['rumores', 1.0], ['vazamento', 0.8], ['vazou', 0.8], ['pode ', 0.25], ['deve ', 0.2], ['supostamente', 0.7],
  ['review', 0.5], ['analise', 0.35], ['opiniao', 0.7], ['editorial', 0.7], ['acoes', 0.8], ['bolsa', 0.8], ['demissao', 1.0],
  ['demissoes', 1.0], ['processo judicial', 0.7], ['drama', 0.8], ['rumour', 1.0], ['leak', 0.8], ['reportedly', 0.6]
];

const OFF_TOPIC = [
  'eleicao', 'eleições', 'eleicao presidencial', 'presidente da republica', 'congresso nacional', 'senado federal', 'partido politico',
  'geopolitica', 'guerra em', 'faixa de gaza', 'israel', 'hamas', 'ucrania', 'ataque militar', 'crime', 'assassinato', 'celebridade',
  'futebol', 'campeonato', 'loteria', 'mega-sena', 'quina', 'horoscopo', 'reality show', 'novela'
];

const TAGS = [
  ['OpenAI', ['openai', 'chatgpt']], ['Anthropic', ['anthropic', 'claude']], ['Google', ['google', 'gemini']],
  ['Microsoft', ['microsoft', 'windows', 'copilot']], ['Apple', ['apple', 'iphone', 'ipad', 'macos']], ['Samsung', ['samsung', 'galaxy']],
  ['NVIDIA', ['nvidia', 'geforce']], ['AMD', ['amd', 'ryzen', 'radeon']], ['Intel', ['intel']], ['GitHub', ['github']], ['Linux', ['linux']],
  ['Android', ['android']], ['iOS', [' ios ', 'iphone']], ['Python', ['python']], ['JavaScript', ['javascript']], ['TypeScript', ['typescript']],
  ['Rust', ['rust']], ['Kubernetes', ['kubernetes']], ['Docker', ['docker']], ['Steam', ['steam']], ['PlayStation', ['playstation', 'ps5']],
  ['Xbox', ['xbox']], ['Nintendo', ['nintendo', 'switch']], ['Segurança', ['seguranca', 'ciberseguranca', 'vulnerabilidade', 'cve-']],
  ['GPU', [' gpu ', 'placa de video', 'geforce', 'radeon']], ['CPU', [' cpu ', 'processador', 'ryzen']],
  ['Robótica', ['robotica', 'robo ', 'humanoide']], ['Computação quântica', ['computacao quantica', 'computador quantico']]
];

const STOPWORDS = new Set([
  'uma','para','com','que','por','das','dos','de','do','da','em','no','na','nos','nas','um','como','mais','novo','nova','agora','seu','sua','aos','as','os','e','ou','vai','tem','ter','sobre','apos','após','contra',
  'the','and','for','with','from','that','this','are','was','were','will','into','about','after','before','over','under','your','you','its','new','now'
]);

const PT_MARKERS = [' de ', ' da ', ' do ', ' para ', ' com ', ' que ', ' uma ', ' um ', ' em ', ' no ', ' na ', ' novo ', ' nova ', ' ganha ', ' lanca ', ' chega ', ' recebe ', ' atualizacao ', ' tecnologia '];
const EN_MARKERS = [' the ', ' and ', ' with ', ' from ', ' that ', ' this ', ' launches ', ' launch ', ' new ', ' gets ', ' says ', ' will ', ' for '];

function normalize(value = '') {
  return ` ${String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+.#/%$-]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function ruleScore(text, rules) {
  let total = 0;
  for (const [term, weight] of rules) if (text.includes(normalize(term).trim())) total += weight;
  return total;
}

function likelyPortuguese(article) {
  const text = normalize(`${article.originalTitle} ${article.excerpt}`);
  const pt = PT_MARKERS.reduce((sum, marker) => sum + (text.includes(marker) ? 1 : 0), 0);
  const en = EN_MARKERS.reduce((sum, marker) => sum + (text.includes(marker) ? 1 : 0), 0);
  const accents = /[áàâãéêíóôõúç]/i.test(`${article.originalTitle} ${article.excerpt}`) ? 1 : 0;
  return pt + accents >= 2 && pt + accents >= en;
}

function categoryScores(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  const scores = {};
  for (const category of categories) {
    const rules = CATEGORY_RULES[category.slug] || [];
    scores[category.slug] = ruleScore(title, rules) * 2.2 + ruleScore(excerpt, rules) * 0.65;
  }
  if (article.source === 'Adrenaline') {
    scores.hardware += 0.8;
    scores.games += 0.8;
  }
  if (article.source === 'MacMagazine') scores['mobile-gadgets'] += 0.7;
  if (article.source === 'TabNews') scores.desenvolvimento += 0.8;
  return scores;
}

function pickCategory(article) {
  const ranking = Object.entries(categoryScores(article)).sort((a, b) => b[1] - a[1]);
  const [bestSlug, bestScore] = ranking[0] || [];
  const secondScore = ranking[1]?.[1] || 0;
  if (!bestSlug || bestScore < 2.4) return null;
  return { slug: bestSlug, confidence: bestScore, margin: bestScore - secondScore };
}

function rejectReason(article) {
  const title = normalize(article.originalTitle);
  const text = normalize(`${article.originalTitle} ${article.excerpt}`);
  if (!likelyPortuguese(article)) return 'non-portuguese';
  if (REJECT_TITLE.some(term => title.includes(normalize(term).trim()))) return 'commercial-noise';
  if (OFF_TOPIC.some(term => text.includes(normalize(term).trim()))) return 'off-topic';
  if (String(article.excerpt || '').trim().length < 45) return 'thin-content';
  return null;
}

function recencyPoints(publishedAt) {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt || 0).getTime()) / 3_600_000);
  if (ageHours <= 4) return 1.9;
  if (ageHours <= 8) return 1.6;
  if (ageHours <= 16) return 1.3;
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 36) return 0.6;
  if (ageHours <= 48) return 0.3;
  return 0.05;
}

function importancePoints(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  return Math.min(2.2, ruleScore(title, IMPORTANCE_RULES) * 1.35 + ruleScore(excerpt, IMPORTANCE_RULES) * 0.28);
}

function noisePenalty(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  return Math.min(2.2, ruleScore(title, NOISE_RULES) * 1.1 + ruleScore(excerpt, NOISE_RULES) * 0.2);
}

function qualityScore(article, classification) {
  const confidence = Math.min(1.7, classification.confidence / 4.4);
  const marginBonus = Math.min(0.55, Math.max(0, classification.margin) / 5);
  const detailBonus = String(article.excerpt || '').length >= 180 ? 0.35 : 0.1;
  const imageBonus = article.imageUrl ? 0.15 : 0;
  const source = SOURCE_TRUST.get(article.source) ?? 0.65;
  const raw = 2.25 + recencyPoints(article.publishedAt) + source + confidence + marginBonus + importancePoints(article) + detailBonus + imageBonus - noisePenalty(article);
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
}

function summaryFromExcerpt(value = '', title = '') {
  let clean = String(value).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const cleanTitle = String(title).replace(/\s+/g, ' ').trim();
  if (cleanTitle && clean.toLocaleLowerCase('pt-BR').endsWith(cleanTitle.toLocaleLowerCase('pt-BR'))) {
    clean = clean.slice(0, -cleanTitle.length).trim().replace(/[|•·-]+$/, '').trim();
  }
  clean = clean.replace(/\b(?:leia mais|saiba mais|continue lendo)\b.*$/i, '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  let summary = sentences.slice(0, 2).join(' ').trim();
  if (summary.length > 330) summary = summary.slice(0, 327).replace(/\s+\S*$/, '').trim() + '...';
  return summary;
}

function extractTags(article) {
  const text = normalize(`${article.originalTitle} ${article.excerpt}`);
  return TAGS.filter(([, terms]) => terms.some(term => text.includes(normalize(term).trim()))).map(([name]) => name).slice(0, 5);
}

function titleTokens(value = '') {
  return normalize(value).trim().split(/\s+/).filter(token => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

function similarity(a, b) {
  const aa = new Set(titleTokens(a));
  const bb = new Set(titleTokens(b));
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  for (const token of aa) if (bb.has(token)) common += 1;
  const union = aa.size + bb.size - common;
  const jaccard = common / Math.max(1, union);
  const overlap = common / Math.max(1, Math.min(aa.size, bb.size));
  return Math.max(jaccard, common >= 4 ? overlap * 0.86 : 0);
}

function dedupeTopics(articles) {
  const kept = [];
  for (const article of articles) {
    const duplicate = kept.some(existing => similarity(article.originalTitle, existing.originalTitle) >= 0.54);
    if (!duplicate) kept.push(article);
  }
  return kept;
}

export function analyzeWithRules(articles) {
  const approved = [];
  const rejected = [];
  for (const article of articles) {
    const reason = rejectReason(article);
    if (reason) {
      rejected.push({ article, reason });
      continue;
    }
    const classification = pickCategory(article);
    if (!classification) {
      rejected.push({ article, reason: 'low-category-confidence' });
      continue;
    }
    const score = qualityScore(article, classification);
    if (score < config.minScore) {
      rejected.push({ article, reason: 'low-score' });
      continue;
    }
    approved.push({
      ...article,
      headline: article.originalTitle,
      summary: summaryFromExcerpt(article.excerpt, article.originalTitle),
      category: classification.slug,
      score,
      tags: extractTags(article),
      ruleConfidence: Math.round(classification.confidence * 10) / 10
    });
  }
  approved.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
  return { approved: dedupeTopics(approved), rejected };
}

function selectBalanced(candidates, limit, sourceUse) {
  const selected = [];
  const threshold = Math.max(config.minScore, 6.3);
  for (const article of candidates) {
    if (selected.length >= limit) break;
    if (article.score < threshold) continue;
    if ((sourceUse.get(article.source) || 0) >= 2) continue;
    if (selected.some(item => item.source === article.source)) continue;
    selected.push(article);
    sourceUse.set(article.source, (sourceUse.get(article.source) || 0) + 1);
  }
  if (selected.length < limit) {
    for (const article of candidates) {
      if (selected.length >= limit) break;
      if (article.score < threshold + 0.25) continue;
      if (selected.some(item => item.id === article.id)) continue;
      if ((sourceUse.get(article.source) || 0) >= 2) continue;
      selected.push(article);
      sourceUse.set(article.source, (sourceUse.get(article.source) || 0) + 1);
    }
  }
  return selected;
}

function editorialCopy(sections, lead) {
  const active = sections.filter(section => section.articles.length).sort((a, b) => (b.articles[0]?.score || 0) - (a.articles[0]?.score || 0));
  const names = active.slice(0, 3).map(section => section.name);
  const focus = names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}` : names[0] || categories.find(item => item.slug === lead?.category)?.name || 'tecnologia';
  return {
    title: names.length >= 2 ? `${names[0]} e ${names[1]} puxam a edição de hoje` : 'Tecnologia sem ruído: os destaques do dia',
    intro: `Uma seleção enxuta em português, com os assuntos mais fortes em ${focus}. Promoções, política, duplicatas e matérias fracas ficam de fora.`
  };
}

export function buildRulesNewsletter(articles, editionDate) {
  if (!articles.length) throw new Error('Nenhuma matéria passou pela curadoria algorítmica.');
  const lead = articles.find(article => article.score >= Math.max(config.minScore, 7.0)) || articles[0];
  const sourceUse = new Map([[lead.source, 1]]);
  const used = new Set([lead.id]);
  const sections = categories.map(category => {
    const candidates = articles.filter(article => article.category === category.slug && !used.has(article.id));
    const selected = selectBalanced(candidates, config.itemsPerCategory, sourceUse);
    selected.forEach(article => used.add(article.id));
    return { slug: category.slug, name: category.name, articles: selected };
  });
  const chosen = [lead, ...sections.flatMap(section => section.articles)].filter(Boolean);
  const copy = editorialCopy(sections, lead);
  return {
    editionDate,
    generatedAt: new Date().toISOString(),
    curatedBy: 'rules',
    title: copy.title,
    intro: copy.intro,
    lead,
    sections,
    stats: {
      stories: chosen.length,
      sources: new Set(chosen.map(article => article.source)).size,
      candidates: articles.length
    }
  };
}
