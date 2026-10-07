import { categories } from '../src/config.mjs';

const slugs = new Set(categories.map(category => category.slug));

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const directEsportsSignal = /\b(esports?|e sports|esporte eletronico|esportes eletronicos|cblol|vct|valorant champions|valorant masters|iem|blast premier|esl pro league|cs2 major|major de counter strike|mid season invitational|msi|lck|lpl|lec|lcs|ffws|free fire world series|six invitational|esports world cup|evo championship|capcom cup)\b/;
const competitiveSignal = /\b(campeonato|torneio|mundial|major|grand final|semifinal|quartas de final|playoff|playoffs|classificatoria|classificatorias|qualifier|qualifiers|split|stage|liga|league|masters|champions|cup|copa|premiacao|vaga no mundial|ranking competitivo)\b/;
const esportGameSignal = /\b(league of legends|lol|valorant|counter strike|counter strike 2|cs2|dota 2|rainbow six|rainbow six siege|free fire|wild rift|overwatch|rocket league|ea sports fc|efootball|street fighter|tekken|call of duty|pubg|fortnite)\b/;
const proSceneSignal = /\b(lineup|roster|pro player|jogador profissional|jogadora profissional|coach|organizacao de esports|furia|loud|mibr|red canids|vivo keyd|pain gaming|fluxo|faze|team liquid|t1|g2|navi|fnatic|paper rex|nrg)\b/;
const generalGameSignal = /\b(jogo|jogos|game|games|videogame|videogames|gameplay|dlc|patch|update|atualizacao|mapa|mapas|modo|modos|temporada|arc raiders|xbox|playstation|nintendo|steam)\b/;

function sourceText(article) {
  return normalize(`${article?.originalTitle || ''} ${article?.excerpt || ''}`);
}

function isEsports(article) {
  const text = sourceText(article);
  return directEsportsSignal.test(text)
    || (esportGameSignal.test(text) && (competitiveSignal.test(text) || proSceneSignal.test(text)));
}

function routeCollected(article) {
  if (!slugs.has('esports') || !isEsports(article)) return article;
  return {
    ...article,
    focus: ['esports'],
    strictFocus: true,
    editorialGuardrail: 'clear-esports-signal'
  };
}

function validateAnalyzed(article) {
  if (!slugs.has('esports')) return article;

  if (isEsports(article)) {
    return {
      ...article,
      focus: ['esports'],
      strictFocus: true,
      category: 'esports',
      editorialGuardrail: 'clear-esports-signal'
    };
  }

  if (article?.category !== 'esports') return article;

  const originalFocus = Array.isArray(article.focus) ? article.focus : [];
  const text = sourceText(article);
  if (slugs.has('games') && originalFocus.includes('games') && generalGameSignal.test(text)) {
    return {
      ...article,
      category: 'games',
      editorialGuardrail: 'false-esports-rerouted-to-games'
    };
  }

  return null;
}

function afterCollect(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  let routed = 0;
  const articles = input.map(article => {
    const next = routeCollected(article);
    if (next !== article) routed += 1;
    return next;
  });
  if (routed) console.log(`  eSports: ${routed} candidata(s) com evidência competitiva roteada(s).`);
  return { ...payload, articles };
}

function afterAnalyze(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  let confirmed = 0;
  let corrected = 0;
  let dropped = 0;
  const articles = [];

  for (const article of input) {
    const wasEsports = article?.category === 'esports';
    const next = validateAnalyzed(article);
    if (!next) {
      if (wasEsports) dropped += 1;
      continue;
    }
    if (next.category === 'esports' && isEsports(next)) confirmed += 1;
    if (wasEsports && next.category !== 'esports') corrected += 1;
    articles.push(next);
  }

  if (confirmed || corrected || dropped) {
    console.log(`  eSports: ${confirmed} confirmada(s) · ${corrected} corrigida(s) para Games · ${dropped} descartada(s) sem evidência competitiva.`);
  }
  return { ...payload, articles };
}

export default {
  name: 'eSports Routing',
  afterCollect,
  afterAnalyze
};
