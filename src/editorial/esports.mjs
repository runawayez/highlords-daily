import { normalizeText as normalize } from "../utils/text.mjs";

const directEsportsSignal =
  /\b(esports?|e sports|esporte eletronico|esportes eletronicos|cblol|vct|valorant champions|valorant masters|iem|blast premier|esl pro league|cs2 major|major de counter strike|mid season invitational|demacia cup|lck|lpl|lec|lcs|ffws|free fire world series|six invitational|esports world cup|evo championship|capcom cup)\b/;
const competitiveSignal =
  /\b(campeonato|torneio|mundial|major|grand final|semifinal|quartas de final|playoff|playoffs|classificatoria|classificatorias|qualifier|qualifiers|split|stage|liga|league|masters|champions|cup|copa|premiacao|vaga no mundial|ranking competitivo)\b/;
const esportGameSignal =
  /\b(league of legends|lol|valorant|counter strike|counter strike 2|cs2|dota 2|rainbow six|rainbow six siege|free fire|wild rift|overwatch|rocket league|ea sports fc|efootball|street fighter|tekken|call of duty|pubg|fortnite)\b/;
const proSceneSignal =
  /\b(lineup|roster|pro player|jogador profissional|jogadora profissional|coach|organizacao de esports|furia|loud|mibr|red canids|vivo keyd|pain gaming|fluxo|faze|team liquid|t1|g2|navi|fnatic|paper rex|nrg)\b/;
export const generalGameSignal =
  /\b(jogo|jogos|game|games|videogame|videogames|gameplay|dlc|patch|update|atualizacao|mapa|mapas|modo|modos|temporada|arc raiders|xbox|playstation|nintendo|steam)\b/;

function sourceText(article) {
  return normalize(`${article?.originalTitle || ""} ${article?.excerpt || ""}`);
}

export function isEsports(article) {
  const text = sourceText(article);
  const dedicated =
    article.strictFocus &&
    article.focus?.length === 1 &&
    article.focus[0] === "esports";
  const marketSignal =
    /\b(patrocin\w*|sponsor\w*|parceria|partnership|investimento|investment|funding|receita|revenue|aquisicao|acquisition|contrata\w*|signing|substitutos|transfer\w*|dispensa\w*|demissao|layoff\w*|roster|lineup|jogadores|players|equipes|teams|organizacoes|organizations)\b/;
  return (
    ((dedicated || proSceneSignal.test(text)) && marketSignal.test(text)) ||
    (dedicated && competitiveSignal.test(text)) ||
    directEsportsSignal.test(text) ||
    (esportGameSignal.test(text) &&
      (competitiveSignal.test(text) || proSceneSignal.test(text)))
  );
}
