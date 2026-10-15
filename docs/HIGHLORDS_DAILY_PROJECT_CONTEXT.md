# Highlords Daily — contexto atual

Snapshot: 15/10/2026. Versão do core: 5.1.0.
Repositório: https://github.com/runawayez/highlords-daily, branch `main`.
O código e os presets da main são a fonte de verdade. Este arquivo substitui conceitualmente o contexto 4.0.0 de 07/10/2026; não é uma cópia daquele snapshot.

## Produto e limites

Motor universal de newsletter diária local-first em Node.js ESM. RSS/Atom, Ollama local (`qwen3:4b` por padrão), curadoria em várias etapas, memória SQLite com fallback JSON, templates HTML determinísticos e PDF via Chromium. Tagline: Informação sem ruído. Nenhuma API paga de IA é obrigatória. Categorias, região, timezone, fontes, idioma, perfis e branding são configuráveis. HTML é a apresentação principal, PDF deriva dele. A interface Electron continua experimental.

## Preset BR atual

Dez categorias. Núcleos obrigatórios: Tecnologia, IA & Desenvolvimento, Games, Economia e Política & Sociedade. Oportunísticas: eSports, Entretenimento, Esportes, Ciência & Saúde e Clima & Futuro. O quality gate impede publicar sem a cobertura obrigatória; opcionais podem faltar. O preset global tem sua própria taxonomia. A antiga lista de 12 categorias e a exclusão geral de política do snapshot 4.0 não descrevem o BR atual.

## Arquitetura

- `src/config.mjs`: configuração e validação; `src/engine/profile.mjs`: perfis isolados.
- `src/daily.mjs`: composição dos serviços (`createDailyServices`) e entrada principal.
- `src/engine/pipeline.mjs`: etapas, publicação, relatórios, métricas e estado operacional.
- `src/engine/run-state.mjs`: lock da publicação e checkpoints por data/fingerprint.
- `src/services/rss.mjs`: coleta concorrente, filtros, imagens, histórico e limite equilibrado.
- `src/services/ollama*.mjs`: análise, respostas estruturadas, retries, cache e métricas.
- `plugins/`: contrato, auditoria de strict_focus, preservação do texto, revisão semântica, ranking multidimensional, apresentação e quality gate.
- `src/services/memory.mjs`: histórico, similaridade e migração de registros.
- `src/editorial/`: normalização da edição, desdobramentos, evidência de cobertura, procedência, auditoria e avaliação.
- `src/services/image-*.mjs`: descoberta, validação, cache e substituição final.
- `src/template.mjs`, `src/services/html-pdf.mjs`, `src/exporters/`: apresentação e formatos.
- `src/services/archive.mjs`, `src/ui/archive-client.mjs`: arquivo estático, busca e feedback local.
- `src/services/delivery.mjs`: entregas explícitas e controle de repetição/estado incerto.

O pipeline faz coleta → classificação → revisão/deduplicação/ranking → curadoria → cache/apresentação/quality gate → HTML/PDF/exportadores → publicação → memória/arquivo. O estado permite retomar etapas já concluídas. Falhas de plugins opcionais são isoladas; `fatal: true` no plugin ou erro interrompe a execução. Não remova a validação fatal por conveniência de preenchimento.

## Novidades 5.1

Coleção editorial sintética e avaliação offline/live; benchmark com candidatas fixas e modo de IA real; relatórios de decisões por matéria; evidência de texto e proteção numérica; desdobramentos conservadores no histórico; cobertura por veículos separada de origens declaradas; busca/filtros e feedback exportável/importável; status de geração e testes visuais de HTML/PDF. Os limites estão detalhados em `docs/EDITORIAL_QUALITY.md`.

Não confundir: teste offline com avaliação do modelo; número coincidente com checagem factual; veículos distintos com apuração independente; sinais lexicais de mudança com compreensão universal de acontecimentos; feedback salvo com treinamento automático.

## Uso e validação

Windows: `GERAR-DAILY.bat`. Linux/macOS: `bash RUN-DAILY.sh`.
Requisitos: Node 22.12+, Ollama e modelo; navegador para PDF.

```bash
npm ci
npm run doctor
npm run daily
npm run editorial:evaluate
npm run editorial:evaluate -- --live
npm run benchmark -- --live --pdf
npm run feedback:import -- --file highlords-editorial-feedback.json
npm run format:check
npm run check
npm test
npm run test:visual
```

Perfis usam `--config arquivo.yml`. Preservar compatibilidade Windows/macOS/Linux, CLI, presets e saídas existentes. Configuração editorial especializada pertence ao preset/plugin. Não introduzir cloud ou framework pesado obrigatório. Histórico/cache/outputs locais ficam fora do Git. CI inclui seis combinações de sistema/Node e um job visual Linux; teste com IA real continua sendo opt-in e exige Ollama disponível.

## Referências

- README.md / README.en.md: operação atual.
- docs/ENGINE.md: configuração, perfis, recuperação e distribuição.
- docs/EDITORIAL_QUALITY.md: avaliação, evidência, feedback e limitações.
- tests/fixtures/editorial.json: casos iniciais que devem ser ampliados com edições revisadas.
