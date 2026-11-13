# Highlords Daily

Motor de newsletter diária local-first em Node.js ESM (22.12+): RSS/Atom → Ollama local (`qwen3:4b` por padrão) → edição HTML/PDF. Sem API paga obrigatória. Leia `docs/HIGHLORDS_DAILY_PROJECT_CONTEXT.md` antes de mudanças grandes.

## Comandos

```bash
npm run check            # validação estática
npm test                 # node --test (rede e Ollama fora do caminho)
npm run format:check     # prettier; use `npm run format` para corrigir
npm run daily            # gera a edição (precisa de Ollama)
npm run editorial:why -- <termo>   # por que uma matéria não saiu
npm run editorial:why -- --summary # funil da edição mais recente
```

Windows: `GERAR-DAILY.bat` sempre refaz a edição do dia.

## Pipeline

`collect → analyze → rank → select → images → html/pdf → publish → history`, em `src/engine/pipeline.mjs`, com checkpoints por data e fingerprint.

- `src/services/rss.mjs`: coleta, janela de 48 h, dedupe, limite de candidatas; chama `detectBreaking`.
- `src/editorial/breaking.mjs`: detecta eventos cobertos por muitos veículos em várias editorias (sem modelo).
- `src/services/ollama.mjs`: análise em lotes (categoria, nota, resumo). `parseBatch` aplica foco estrito e piso de grande notícia.
- `plugins/`: ordem pelo prefixo numérico. `editorial-ranking` (notas por dimensão + calibração), `10-semantic-editorial-review`, `99-editorial-quality-gate`.
- `src/editorial/balance.mjs` + `edition.mjs`: seleção por famílias, tetos e escolha da manchete.
- `src/editorial/audit.mjs`: `decision(article, stage, reason, extra)` alimenta `editorial-report.json`.

## Regras que não podem quebrar

- Não remova a validação `fatal` dos plugins nem o quality gate para "preencher" a edição. Edição curta é aceitável; cobertura fabricada não.
- Mudou prompt ou lógica de análise? Versione a chave do cache (`version` em `analyzeArticles`) sem apagar histórico, feeds ou imagens.
- Nada de IA paga, cloud ou framework pesado obrigatório. Compatibilidade Windows/macOS/Linux.
- `data/`, `output/` e `.env` ficam fora do Git. Nunca leia nem mostre o `.env`.
- Toda decisão que descarta uma matéria precisa de `decision(...)` com motivo, para o relatório explicar.
- Sinal de cobertura mede atenção da imprensa, não fato verificado. Não o descreva como checagem.

## Testes

- Testes não chamam Ollama nem rede; respostas simuladas não medem a acurácia do modelo real. Diga isso ao reportar.
- Nesta máquina, 9 testes antigos falham porque carregam a taxonomia local (`config/categories.yml`/`.env`) em vez do preset BR. Compare com `git stash` antes de achar que a falha é sua.
- Regressão editorial nova: use títulos reais do relatório do dia (veja `tests/breaking-news.test.mjs`).

## Fluxo de trabalho

- Edição ruim ou matéria ausente: skill `editorial-triage` e agente `edition-auditor` (em `.claude/`).
- Documentação por versão em `docs/`; atualize o contexto do projeto ao subir a versão.
