> Correção 5.5.2: bloqueio de placeholders do modelo; revisão semântica independente sem ancoragem na categoria/fonte; metadados corretos de fontes internacionais; busca de imagens concentrada nas selecionadas; fotos compactas preservadas; layout determinístico sem chamada adicional ao Ollama. `GERAR-DAILY.bat` sempre refaz a edição atual; o histórico da mesma data é substituído e não bloqueia as matérias durante a regeneração.

> Primeiro uso 5.5: o launcher abre um assistente que cria a configuração e seleciona/verifica fontes automaticamente. O usuário não edita `.env`/YAML. Veja o [guia inicial](../README.md).

> Atualização 18/10/2026: o core e os manifests desktop estão em 5.5.2. Consulte [Confiabilidade 5.4](RELIABILITY_5_4.md) para políticas de perfil, datas, cópia, coleta progressiva, cache e recuperação do PDF; os snapshots abaixo registram a evolução anterior.

# Highlords Daily — contexto atual

Snapshot: 18/10/2026. Versão do core: 5.5.2.
Repositório: https://github.com/runawayez/highlords-daily, branch `main`.
O código e os presets da main são a fonte de verdade. Este arquivo substitui conceitualmente o contexto 4.0.0 de 07/10/2026; não é uma cópia daquele snapshot.

## Produto e limites

Motor universal de newsletter diária local-first em Node.js ESM. RSS/Atom, Ollama local (`qwen3:4b` por padrão), curadoria em várias etapas, memória SQLite com fallback JSON, templates HTML determinísticos e PDF via Chromium. Tagline: Informação sem ruído. Nenhuma API paga de IA é obrigatória. Categorias, região, timezone, fontes, idioma, perfis e branding são configuráveis. HTML é a apresentação principal, PDF deriva dele. A interface Electron continua experimental.

Novidades 5.3: limpeza de RSS antes do resumo, limites por frase/palavra, deduplicação de eventos entre categorias, fluxo por matéria na paginação e otimização das imagens na cópia do PDF. Os ajustes de layout não adicionam chamadas de IA ou dependências nativas. Veja `docs/EDITORIAL_DESIGN.md`.

Correção 5.3.1: a checagem numérica distingue `R$` de letras em palavras como `September`. Fallbacks estrangeiros passam por recuperação individual de tradução com cache e validação; falhas são retiradas das candidatas, e o contrato bloqueia fallback original ainda não localizado.

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

## Design 5.3

Layout editorial aprovado aplicado ao HTML e PDF: fundo de papel, wordmark tipográfico, duas colunas, imagem horizontal da manchete e menos caixas. O PDF usa páginas A4 medidas em Chromium, cabeçalhos e numeração com escala fixa 1. HTMLs antigos continuam re-renderizáveis; `pdf:rerender -- --refresh-template` aplica o novo visual a uma edição salva. `layout:preview` gera uma amostra identificada como fictícia sem Ollama. Estilos e paginação ficam em `src/presentation/`. Ver `docs/EDITORIAL_DESIGN.md`.

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
