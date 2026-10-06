import { categories, config } from '../config.mjs';

const SOURCE_TRUST = new Map([
  ['Ars Technica', 1.35],
  ['GitHub Blog', 1.30],
  ['InfoQ', 1.25],
  ["Tom's Hardware", 1.20],
  ['Tecnoblog', 1.05],
  ['The Verge', 1.00],
  ['Rock Paper Shotgun', 1.00],
  ['TechCrunch', 0.90],
  ['Hacker News', 0.70]
]);

const CATEGORY_RULES = {
  ia: [
    ['artificial intelligence', 3.6], ['generative ai', 3.6], ['machine learning', 3.1],
    ['large language model', 3.5], ['language model', 2.7], ['llm', 3.4], ['openai', 3.4],
    ['chatgpt', 3.4], ['anthropic', 3.4], ['claude', 3.0], ['gemini', 3.0],
    ['deepmind', 2.8], ['copilot', 2.3], ['ai agent', 3.3], ['agentic', 3.0],
    ['neural network', 2.8], ['diffusion model', 3.0], ['inference', 2.1],
    ['training model', 2.5], ['foundation model', 3.0], ['multimodal', 2.7], [' ai ', 2.0]
  ],
  desenvolvimento: [
    ['developer', 1.8], ['programming', 2.8], ['software development', 2.7], ['framework', 2.7],
    ['library', 2.0], [' sdk ', 2.8], [' api ', 2.3], ['github', 2.5], ['gitlab', 2.5],
    ['devops', 3.0], ['kubernetes', 3.0], ['docker', 2.7], ['container', 1.8], ['ci/cd', 3.0],
    ['database', 2.0], ['postgres', 2.8], ['mysql', 2.7], ['sqlite', 2.7], ['redis', 2.5],
    ['typescript', 3.0], ['javascript', 3.0], ['python', 2.6], ['rust', 2.8], ['golang', 2.8],
    ['java ', 2.4], ['kotlin', 2.5], ['swift ', 2.2], ['open source', 2.5], ['repository', 1.6],
    ['ide ', 2.4], ['visual studio code', 2.5], ['vscode', 2.5], ['testing', 2.3], ['playwright', 3.0],
    ['selenium', 3.0], ['quality assurance', 2.6], ['compiler', 2.7], ['runtime', 2.1]
  ],
  'mobile-gadgets': [
    ['smartphone', 3.4], [' iphone', 3.4], ['galaxy ', 3.0], ['pixel ', 2.9], ['phone ', 2.3],
    ['android phone', 3.1], ['tablet', 2.8], ['ipad', 3.0], ['smartwatch', 3.1], ['apple watch', 3.1],
    ['wearable', 2.7], ['earbuds', 2.8], ['airpods', 3.0], ['headphones', 2.4], ['smart home', 2.8],
    ['gadget', 2.4], ['foldable', 2.8], ['folding phone', 3.1], ['e-reader', 2.6], ['kindle', 2.7]
  ],
  hardware: [
    [' gpu ', 3.5], ['graphics card', 3.4], [' cpu ', 3.5], ['processor', 2.7], ['nvidia', 2.8],
    ['geforce', 3.1], ['radeon', 3.1], ['ryzen', 3.2], ['intel core', 3.0], ['semiconductor', 3.1],
    ['chipmaker', 2.7], ['chip ', 2.1], ['snapdragon', 2.8], ['motherboard', 3.2], ['memory', 1.8],
    [' ddr', 2.8], ['ram ', 2.6], [' ssd', 3.0], ['storage', 1.8], ['laptop', 2.7], ['notebook', 2.7],
    ['desktop pc', 2.9], ['monitor', 2.5], ['keyboard', 2.4], ['mouse ', 2.2], ['peripheral', 2.4],
    ['display', 1.6], ['oled', 2.1], ['arm chip', 2.8], ['silicon', 2.0]
  ],
  'software-internet': [
    ['windows ', 2.9], ['linux', 3.0], ['macos', 3.0], ['android ', 2.5], [' ios ', 2.5],
    ['browser', 2.7], ['chrome', 2.5], ['firefox', 2.7], ['safari', 2.3], ['operating system', 3.0],
    ['security', 2.4], ['cybersecurity', 3.0], ['vulnerability', 3.2], [' cve-', 3.5], ['malware', 3.1],
    ['ransomware', 3.1], ['privacy', 2.5], ['encryption', 2.7], ['vpn ', 2.5], ['internet', 1.8],
    ['web app', 2.3], ['app update', 2.4], ['software update', 2.7], ['cloud service', 2.3],
    ['platform', 1.4], ['messaging app', 2.4], ['whatsapp', 2.5], ['telegram', 2.4], ['signal app', 2.5]
  ],
  games: [
    ['video game', 3.4], [' gaming', 3.0], ['gameplay', 3.2], ['steam', 3.0], ['playstation', 3.1],
    [' ps5', 3.1], ['xbox', 3.1], ['nintendo', 3.1], ['switch ', 2.8], ['console', 2.7],
    ['game studio', 2.8], ['game developer', 2.5], ['game engine', 3.1], ['unreal engine', 3.0],
    ['unity ', 2.5], ['indie game', 2.7], [' rpg', 2.6], ['dlc ', 2.5], ['remaster', 2.6],
    ['release date', 1.7], ['game pass', 2.8], ['epic games', 2.6]
  ],
  futuro: [
    ['robotics', 3.3], ['robot ', 2.8], ['humanoid', 3.1], ['quantum computing', 3.7], ['quantum computer', 3.7],
    ['virtual reality', 3.1], ['augmented reality', 3.1], ['mixed reality', 3.0], ['spatial computing', 3.2],
    [' vr ', 2.6], [' ar ', 2.2], ['brain-computer', 3.5], ['neural interface', 3.3], ['prototype', 2.2],
    ['researchers', 1.4], ['breakthrough', 1.8], ['experimental', 2.2], ['autonomous robot', 3.0],
    ['humanoid robot', 3.5], ['future technology', 2.7], ['holographic', 2.4]
  ]
};

const IMPORTANCE_RULES = [
  ['launch', 0.9], ['launched', 0.9], ['release', 0.7], ['released', 0.8], ['announces', 0.7],
  ['announced', 0.7], ['unveils', 0.9], ['unveiled', 0.9], ['ships', 0.8], ['available now', 0.8],
  ['major update', 1.0], ['new version', 0.8], ['open source', 0.8], ['security update', 1.0],
  ['critical vulnerability', 1.1], ['zero-day', 1.1], ['breakthrough', 1.0], ['benchmark', 0.5],
  ['new model', 0.9], ['new chip', 0.9], ['new gpu', 1.0], ['new cpu', 1.0], ['stable release', 0.8]
];

const NOISE_RULES = [
  ['rumor', 1.2], ['rumour', 1.2], ['leak', 0.8], ['reportedly', 0.7], ['might ', 0.45], ['could ', 0.35],
  ['deal', 0.8], ['discount', 1.2], ['coupon', 1.4], ['sale ', 1.0], ['best price', 1.2], ['buy now', 1.3],
  ['opinion', 0.7], ['editorial', 0.7], ['review', 0.35], ['earnings', 0.9], ['stock ', 1.0],
  ['layoff', 1.2], ['job cuts', 1.2], ['lawsuit', 0.8], ['drama', 1.0]
];

const POLITICS_BLOCK = [
  'donald trump', 'joe biden', 'election', 'presidential campaign', 'congress ', 'senate ', 'white house',
  'prime minister', 'political party', 'geopolitic', 'war in ', 'gaza', 'ukraine war', 'israel-hamas',
  'military strike', 'missile strike', 'sanctions against', 'crime ', 'murder', 'celebrity', 'football', 'soccer'
];

const TAGS = [
  ['OpenAI', ['openai', 'chatgpt']], ['Anthropic', ['anthropic', 'claude']], ['Google', ['google', 'gemini']],
  ['Microsoft', ['microsoft', 'windows', 'copilot']], ['Apple', ['apple', 'iphone', 'ipad', 'macos']],
  ['Samsung', ['samsung', 'galaxy']], ['NVIDIA', ['nvidia', 'geforce']], ['AMD', ['amd', 'ryzen', 'radeon']],
  ['Intel', ['intel']], ['GitHub', ['github']], ['Linux', ['linux']], ['Android', ['android']], ['iOS', [' ios ', 'iphone']],
  ['Python', ['python']], ['JavaScript', ['javascript']], ['TypeScript', ['typescript']], ['Rust', ['rust']],
  ['Kubernetes', ['kubernetes']], ['Docker', ['docker']], ['Steam', ['steam']], ['PlayStation', ['playstation', 'ps5']],
  ['Xbox', ['xbox']], ['Nintendo', ['nintendo', 'switch']], ['Segurança', ['security', 'cybersecurity', 'vulnerability', 'cve-']],
  ['GPU', [' gpu ', 'graphics card', 'geforce', 'radeon']], ['CPU', [' cpu ', 'processor', 'ryzen']], ['Robótica', ['robotics', 'robot ', 'humanoid']],
  ['Computação quântica', ['quantum computing', 'quantum computer']]
];

const STOPWORDS = new Set([
  'the','and','for','with','from','that','this','are','was','were','will','into','about','after','before','over','under','your','you','its','new','now',
  'uma','para','com','que','por','das','dos','de','do','da','em','no','na','nos','nas','um','uma','como','mais','novo','nova','agora'
]);

function normalize(value = '') {
  return ` ${String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9+.#/-]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
}

function ruleScore(text, rules) {
  let total = 0;
  for (const [term, weight] of rules) if (text.includes(term)) total += weight;
  return total;
}

function categoryScores(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  const scores = {};
  for (const category of categories) {
    const rules = CATEGORY_RULES[category.slug] || [];
    scores[category.slug] = ruleScore(title, rules) * 2.15 + ruleScore(excerpt, rules) * 0.72;
  }

  const source = article.source || '';
  if (source === 'Rock Paper Shotgun') scores.games += 2.4;
  if (source === "Tom's Hardware") scores.hardware += 1.9;
  if (source === 'GitHub Blog' || source === 'InfoQ') scores.desenvolvimento += 1.5;

  return scores;
}

function pickCategory(article) {
  const scores = categoryScores(article);
  const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestSlug, bestScore] = ranking[0] || [];
  const secondScore = ranking[1]?.[1] || 0;
  if (!bestSlug || bestScore < 2.25) return null;
  return { slug: bestSlug, confidence: bestScore, margin: bestScore - secondScore, scores };
}

function isPoliticsOrGeneralNoise(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  const titleBlocked = POLITICS_BLOCK.some(term => title.includes(term));
  if (titleBlocked) return true;
  const hits = POLITICS_BLOCK.filter(term => excerpt.includes(term)).length;
  return hits >= 2;
}

function recencyPoints(publishedAt) {
  const ageHours = Math.max(0, (Date.now() - new Date(publishedAt || 0).getTime()) / 3_600_000);
  if (ageHours <= 4) return 1.8;
  if (ageHours <= 8) return 1.55;
  if (ageHours <= 16) return 1.25;
  if (ageHours <= 24) return 1.0;
  if (ageHours <= 36) return 0.65;
  if (ageHours <= 48) return 0.35;
  return 0.1;
}

function sourcePoints(source) {
  return SOURCE_TRUST.get(source) ?? 0.75;
}

function importancePoints(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  return Math.min(2.2, ruleScore(title, IMPORTANCE_RULES) * 1.35 + ruleScore(excerpt, IMPORTANCE_RULES) * 0.35);
}

function noisePenalty(article) {
  const title = normalize(article.originalTitle);
  const excerpt = normalize(article.excerpt);
  return Math.min(2.8, ruleScore(title, NOISE_RULES) * 1.25 + ruleScore(excerpt, NOISE_RULES) * 0.25);
}

function qualityScore(article, classification) {
  const confidence = Math.min(1.8, classification.confidence / 4.2);
  const marginBonus = Math.min(0.55, Math.max(0, classification.margin) / 5);
  const detailBonus = String(article.excerpt || '').length >= 180 ? 0.35 : 0;
  const imageBonus = article.imageUrl ? 0.15 : 0;
  const raw = 2.3
    + recencyPoints(article.publishedAt)
    + sourcePoints(article.source)
    + confidence
    + marginBonus
    + importancePoints(article)
    + detailBonus
    + imageBonus
    - noisePenalty(article);
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10));
}

function summaryFromExcerpt(value = '') {
  const clean = String(value).replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  let summary = sentences.slice(0, 2).join(' ').trim();
  if (summary.length > 360) {
    summary = summary.slice(0, 357).replace(/\s+\S*$/, '').trim() + '...';
  }
  return summary;
}

function extractTags(article) {
  const text = normalize(`${article.originalTitle} ${article.excerpt}`);
  return TAGS.filter(([, terms]) => terms.some(term => text.includes(term))).map(([name]) => name).slice(0, 6);
}

function titleTokens(value = '') {
  return normalize(value).trim().split(/\s+/)
    .filter(token => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
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
  return Math.max(jaccard, common >= 4 ? overlap * 0.82 : 0);
}

function dedupeTopics(articles) {
  const kept = [];
  for (const article of articles) {
    const duplicate = kept.some(existing => similarity(article.originalTitle, existing.originalTitle) >= 0.58);
    if (!duplicate) kept.push(article);
  }
  return kept;
}

export function analyzeWithRules(articles) {
  const approved = [];
  const rejected = [];

  for (const article of articles) {
    if (isPoliticsOrGeneralNoise(article)) {
      rejected.push({ article, reason: 'off-topic' });
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
      summary: summaryFromExcerpt(article.excerpt),
      category: classification.slug,
      score,
      tags: extractTags(article),
      ruleConfidence: Math.round(classification.confidence * 10) / 10
    });
  }

  approved.sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
  return { approved: dedupeTopics(approved), rejected };
}

function selectBalanced(candidates, limit, sourceUse, { distinctSources = true } = {}) {
  const selected = [];
  for (const article of candidates) {
    if (selected.length >= limit) break;
    if ((sourceUse.get(article.source) || 0) >= 3) continue;
    if (distinctSources && selected.some(item => item.source === article.source)) continue;
    selected.push(article);
    sourceUse.set(article.source, (sourceUse.get(article.source) || 0) + 1);
  }
  if (selected.length < limit && distinctSources) {
    for (const article of candidates) {
      if (selected.length >= limit) break;
      if (selected.some(item => item.id === article.id)) continue;
      if ((sourceUse.get(article.source) || 0) >= 3) continue;
      selected.push(article);
      sourceUse.set(article.source, (sourceUse.get(article.source) || 0) + 1);
    }
  }
  return selected;
}

function editorialCopy(sections, lead) {
  const active = sections
    .filter(section => section.articles.length)
    .sort((a, b) => b.articles.length - a.articles.length || (b.articles[0]?.score || 0) - (a.articles[0]?.score || 0));
  const names = active.slice(0, 3).map(section => section.name);
  const focus = names.length > 1
    ? `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`
    : names[0] || categories.find(item => item.slug === lead?.category)?.name || 'tecnologia';
  return {
    title: 'O que vale sua atenção em tecnologia hoje',
    intro: `A edição de hoje reúne os destaques mais fortes em ${focus}. A seleção considera recência, relevância técnica, confiança da fonte, diversidade e sinais de novidade — sem usar LLM.`
  };
}

export function buildRulesNewsletter(articles, editionDate) {
  if (!articles.length) throw new Error('Nenhuma matéria passou pela curadoria algorítmica.');

  const sourceUse = new Map();
  const leadPool = articles.filter(article => article.score >= Math.max(config.minScore, 6.7));
  const lead = leadPool[0] || articles[0];
  sourceUse.set(lead.source, 1);
  const used = new Set([lead.id]);

  const sections = categories.map(category => {
    const candidates = articles
      .filter(article => article.category === category.slug && !used.has(article.id))
      .sort((a, b) => b.score - a.score || new Date(b.publishedAt) - new Date(a.publishedAt));
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
