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

const directEsportsSignal = /\b(esports?|e sports|esporte eletronico|esportes eletronicos|cblol|vct|valorant champions|valorant masters|iem|blast premier|esl pro league|cs2 major|major de counter strike|worlds 20\d{2}|mid season invitational|msi|lck|lpl|lec|lcs|ffws|free fire world series|six invitational|esports world cup|evo championship|capcom cup)\b/;
const competitiveSignal = /\b(campeonato|torneio|mundial|major|final|semifinal|quartas de final|playoff|playoffs|classificatoria|classificatorias|qualifier|qualifiers|split|stage|liga|league|masters|champions|cup|copa|premiacao|premiacao total|vaga no mundial|ranking competitivo)\b/;
const esportGameSignal = /\b(league of legends|lol|valorant|counter strike|counter strike 2|cs2|dota 2|rainbow six|rainbow six siege|free fire|wild rift|overwatch|rocket league|ea sports fc|efootball|street fighter|tekken|call of duty|pubg|fortnite)\b/;
const proSceneSignal = /\b(lineup|roster|pro player|jogador profissional|jogadora profissional|coach|treinador|equipe|time|organizacao|organizacao de esports|furia|loud|mibr|red canids|vivo keyd|pain gaming|fluxo|faze|team liquid|t1|g2|navi|fnatic|paper rex|nrg)\b/;

function articleText(article) {
  return normalize(`${article?.originalTitle || ''} ${article?.headline || ''} ${article?.excerpt || ''} ${article?.summary || ''} ${(article?.tags || []).join(' ')}`);
}

function isEsports(article) {
  const text = articleText(article);
  return directEsportsSignal.test(text)
    || (esportGameSignal.test(text) && (competitiveSignal.test(text) || proSceneSignal.test(text)));
}

function route(article) {
  if (!slugs.has('esports') || !isEsports(article)) return article;
  return {
    ...article,
    focus: ['esports'],
    strictFocus: true,
    category: article.category ? 'esports' : article.category,
    editorialGuardrail: 'clear-esports-signal'
  };
}

function routeAll(payload) {
  const input = Array.isArray(payload?.articles) ? payload.articles : [];
  let routed = 0;
  const articles = input.map(article => {
    const next = route(article);
    if (next !== article) routed += 1;
    return next;
  });
  if (routed) console.log(`  eSports: ${routed} candidata(s) roteada(s) para a seção dedicada.`);
  return { ...payload, articles };
}

export default {
  name: 'eSports Routing',
  afterCollect: routeAll,
  afterAnalyze: routeAll
};
