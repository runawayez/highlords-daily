import { normalizeText } from "../utils/text.mjs";

// The local model uses "esportes" as a dumping ground: on 2026-11-13 an iPhone
// price story, a supermarket promotion and several economy items were labelled
// as sports. A sports category therefore needs sports vocabulary in the
// SOURCE title or text. This is a lexical guard, not understanding: it only
// blocks labels with no sports evidence at all.

export const SPORTS_CATEGORIES = new Set(["esportes", "futebol"]);

const SPORTS_SIGNAL = new RegExp(
  "\\b(" +
    [
      "futebol",
      "soccer",
      "football",
      "campeonato",
      "campeonatos",
      "brasileirao",
      "libertadores",
      "copa",
      "premier league",
      "champions",
      "uefa",
      "fifa",
      "selecao",
      "tecnico",
      "treinador",
      "tecnicos",
      "atleta",
      "atletas",
      "gols",
      "partida",
      "partidas",
      "rodada",
      "torneio",
      "torneios",
      "clube",
      "clubes",
      "jogador",
      "jogadores",
      "jogadora",
      "elenco",
      "escalacao",
      "vitoria",
      "derrota",
      "empate",
      "goleada",
      "medalha",
      "olimpiada",
      "olimpiadas",
      "olimpico",
      "paralimpiada",
      "formula 1",
      "f1",
      "grande premio",
      "piloto",
      "nba",
      "nfl",
      "nhl",
      "mlb",
      "basquete",
      "basketball",
      "volei",
      "voleibol",
      "tenis",
      "tennis",
      "atletismo",
      "natacao",
      "maratona",
      "ufc",
      "mma",
      "boxe",
      "rugby",
      "ciclismo",
      "judo",
      "handebol",
      "esporte",
      "esportes",
      "sports",
      "coach",
      "league",
      "tournament",
      "championship",
      "playoffs",
      "super bowl",
    ].join("|") +
    ")\\b",
);

function plain(value) {
  return normalizeText(value).normalize("NFD").replace(/\p{M}/gu, "");
}

export function hasSportsEvidence(article) {
  const text = plain(
    `${article?.originalTitle || ""} ${article?.excerpt || ""}`,
  );
  return SPORTS_SIGNAL.test(text);
}

export function isSportsCategory(slug) {
  return SPORTS_CATEGORIES.has(slug);
}
