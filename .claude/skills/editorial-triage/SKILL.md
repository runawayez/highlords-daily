---
name: editorial-triage
description: Investiga por que uma notícia não saiu na edição do Highlords Daily, ou por que a edição do dia ficou fraca ou curta. Use quando o usuário disser "essa notícia não saiu", "a edição está fraca", "por que X ficou de fora" ou pedir para auditar a seleção ou a categorização.
---

# Triagem editorial

Responda com evidência do relatório da edição, nunca com palpite. Cada matéria tem a trilha completa em `output/AAAA-MM-DD/editorial-report.json`.

## 1. Funil da edição

```bash
npm run editorial:why -- --summary
```

Leia nesta ordem e anote os números:

| Motivo | O que significa |
|---|---|
| `collect · invalid-link-or-date-outside-window` | Fora da janela de 48 h ou sem link/data. Muitos de um feed só = feed parado ou com datas velhas. |
| `analysis · strict-focus-mismatch` | O modelo pôs categoria fora do `focus` de uma fonte estrita. Número alto sugere classificação ruim do modelo, não falta de notícia. |
| `analysis · below-score` | Nota do modelo menor que `llmMinScore`. |
| `semantic-review · reject/reclassify` | Revisão independente. |
| `balance · below-editorial-floor` | Candidata fraca demais para o piso. |
| `balance · theme-source-entity-or-edition-limit` | Cortada por teto de família, fonte ou entidade. |

## 2. Uma matéria específica

```bash
npm run editorial:why -- "outlook|microsoft"
npm run editorial:why -- "termo" --date 2026-11-13
```

Se não aparecer nada, a matéria nem chegou à coleta: confira se o feed está em `presets/br/feeds.yml` e se `output/status.json` ou o relatório citam erro desse feed. Não conclua "o feed não publicou" sem ver o item no RSS (`npm run feeds:check`).

## 3. Grande notícia

Um assunto coberto por 4+ veículos em 2+ editorias deve ter decisão `breaking-cluster`. Se o assunto era grande e não há `breaking-cluster`:

- os títulos usam palavras diferentes (a similaridade é lexical);
- só uma editoria cobriu, ou menos de 4 veículos estavam nos feeds;
- a janela de 36 h ou o limite de 4 grupos cortou o evento.

Os limiares vivem em `DEFAULTS` de `src/editorial/breaking.mjs`. Ajuste apenas com um teste novo usando os títulos reais.

## 4. Relatar

Separe sempre "o que os dados mostram" de "hipóteses não verificadas". Entregue: a etapa que descartou, o motivo registrado, a evidência (linha do relatório) e a correção proposta. Não altere código antes do OK do usuário.

Limite: o relatório descreve a etapa observada. Não infere intenção editorial nem verifica se o fato é verdadeiro.
