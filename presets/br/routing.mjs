import { isEsports } from "../../src/editorial/esports.mjs";
import { categories } from "../../src/config.mjs";
import { normalizeText as searchText } from "../../src/utils/text.mjs";
const categorySlugs = new Set(categories.map((category) => category.slug));
const filmSeriesSignal =
  /\b(filme|filmes|cinema|ator|atriz|atores|atrizes|diretor|diretora|bilheteria|oscar|emmy|documentario|documentarios|k drama|k dramas|anime|animes|rotten tomatoes)\b/;
const seriesContextSignal = /\b(serie|series|temporada|episodio|episodios)\b/;
const streamingContextSignal =
  /\b(streaming|netflix|hbo|max|prime video|disney\+|paramount\+|globoplay|apple tv)\b/;
const gameSignal =
  /\b(game|games|gaming|videogame|videogames|video game|xbox|playstation|nintendo|steam|gameplay|console|consoles|dlc|rpg|fps|ea fc|fortnite|gta)\b/;
const soccerSignal =
  /\b(futebol|brasileirao|libertadores|copa do brasil|champions league|goleiro|goleira|zagueiro|zagueira|atacante|mercado da bola|selecao brasileira de futebol|serie a|serie b)\b/;
const otherSportsSignal =
  /\b(ufc|mma|octogono|octagon|lutador|lutadora|lutadores|lutadoras|nocaute|knockout|finalizacao|peso mosca|peso galo|peso pena|peso leve|peso meio medio|peso medio|peso meio pesado|peso pesado|boxe|boxing|muay thai|jiu jitsu|nba|wnba|basquete|basketball|nfl|super bowl|quarterback|futebol americano|formula 1|formula1|f1|motogp|indycar|tenis|tennis|atp|wta|volei|volleyball|vnl|atletismo|athletics|maratona|natacao|swimming|ciclismo|cycling|rugby|cricket|beisebol|baseball|mlb|nhl|hockey|ginastica|gymnastics|surf|surfe|skate|olimpiada|olimpiadas|paralimpico|paralimpica|paralimpicos|paralimpicas)\b/;
const politicsSignal =
  /\b(tse|stf|tribunal superior eleitoral|justica eleitoral|eleicao|eleicoes|eleitoral|urna|urnas|presidencial|congresso nacional|camara dos deputados|senado federal|partido politico|partidos politicos)\b/;
const economySignal =
  /\b(economia|economico|economica|mercado|mercados|bolsa|acoes|inflacao|juros|selic|pib|dolar|cambio|fiscal|imposto|impostos|tributacao|investimento|investimentos|lucro|receita|balanca comercial|superavit|deficit|emprego|desemprego|banco central)\b/;

function canForceCategory(article, slug) {
  if (!categorySlugs.has(slug)) return false;
  if (
    !article.strictFocus ||
    !Array.isArray(article.focus) ||
    article.focus.length === 0
  )
    return true;
  return article.focus.includes(slug);
}

function routeToCategory(article, slug, reason) {
  return {
    ...article,
    focus: [slug],
    strictFocus: true,
    editorialGuardrail: reason,
  };
}

function rejectArticle(article, reason) {
  return { ...article, editorialReject: true, editorialGuardrail: reason };
}

export function applyEditorialGuardrails(article) {
  if (
    article.language &&
    !["und", "pt", "en"].includes(article.language.split("-")[0])
  )
    return article;
  if (canForceCategory(article, "esports") && isEsports(article)) {
    return routeToCategory(article, "esports", "clear-esports-signal");
  }
  const text = searchText(`${article.originalTitle} ${article.excerpt}`);
  const isEconomy = economySignal.test(text);
  const isFilmSeries =
    filmSeriesSignal.test(text) ||
    (seriesContextSignal.test(text) && streamingContextSignal.test(text));
  const isGame = gameSignal.test(text);
  const isSoccer = soccerSignal.test(text);
  const isOtherSport = otherSportsSignal.test(text);
  const isPolitics = politicsSignal.test(text);

  const economyOnly =
    article.strictFocus &&
    Array.isArray(article.focus) &&
    article.focus.length === 1 &&
    article.focus[0] === "economia";

  if (economyOnly && isPolitics && !isEconomy) {
    return rejectArticle(article, "strict-economy-off-topic-politics");
  }

  if (economyOnly && isEconomy) return article;

  if (isFilmSeries && !isGame) {
    if (canForceCategory(article, "filmes-series")) {
      return routeToCategory(
        article,
        "filmes-series",
        "clear-film-series-signal",
      );
    }
    if (article.strictFocus)
      return rejectArticle(article, "film-series-outside-strict-focus");
  }

  // Modalidades inequivocamente não-soccer são resolvidas antes da LLM.
  // A exigência !isSoccer evita forçar matérias genuinamente híbridas, como
  // um jogador de futebol visitando um evento de UFC; nesses casos a LLM decide.
  if (isOtherSport && !isSoccer && !isGame) {
    if (canForceCategory(article, "esportes")) {
      return routeToCategory(
        article,
        "esportes",
        "clear-non-soccer-sport-signal",
      );
    }
    if (article.strictFocus)
      return rejectArticle(article, "non-soccer-sport-outside-strict-focus");
  }

  if (isSoccer && !isGame) {
    if (canForceCategory(article, "futebol")) {
      return routeToCategory(article, "futebol", "clear-soccer-signal");
    }
    if (article.strictFocus)
      return rejectArticle(article, "soccer-outside-strict-focus");
  }

  if (isGame) {
    if (canForceCategory(article, "games")) {
      return routeToCategory(article, "games", "clear-game-signal");
    }
    if (article.strictFocus)
      return rejectArticle(article, "game-outside-strict-focus");
  }

  return article;
}
