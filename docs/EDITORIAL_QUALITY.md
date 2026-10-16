# Qualidade editorial — Highlords Daily 5.1

## Avaliação repetível

```bash
npm run editorial:evaluate
npm run editorial:evaluate -- --live
npm run editorial:evaluate -- --predictions predictions.json --output data/evaluation/comparison.json
```

Sem opções, a avaliação executa os casos de deduplicação/desdobramentos e consistência numérica sem rede ou Ollama. O relatório declara explicitamente que **o modelo não foi avaliado**. `--live` usa o Ollama e os plugins configurados para analisar uma lista fixa de candidatas e gerar uma edição isolada; mede categoria, consistência numérica dos textos finais, preferência de ranking e escolha da manchete. O modo `--predictions` aceita `{ "articles": [...], "leadId": "stableId" }`, usando os IDs estáveis da coleção. Falhas retornam código de saída 1.

A coleção inicial em `tests/fixtures/editorial.json` é sintética: 12 notícias, oito pares de acontecimentos e quatro casos de texto. Os rótulos são pontos de partida para revisão humana, não uma certificação de qualidade jornalística. Uma oferta pode ser rejeitada em vez de receber uma categoria; notícias obrigatórias ausentes nas previsões contam como falha. Os rótulos e scores de referência são removidos antes de enviar as candidatas ao modelo.

Use `--dataset arquivo.json` para outra coleção. Registre idioma, `originalTitle`, `excerpt`, `publishedAt`, `stableId`, categoria esperada e decisões de ranking. Inclua exemplos difíceis, negativos e idiomas realmente usados. Presets com outra taxonomia precisam de uma coleção compatível. Compare a mesma coleção/modelo/configuração; a recência ainda depende da data real de execução.

## Benchmark do pipeline

```bash
npm run benchmark
npm run benchmark -- --live
npm run benchmark -- --live --pdf --artifacts data/benchmark-preview
```

O modo padrão reproduz respostas de referência e mede orquestração, composição da edição, cache final, HTML, exportadores, publicação e relatórios, **sem medir a IA**. `--live` usa o modelo real, revisão, ranking e curadoria de produção. `--pdf` inclui Chromium/PDF; sem essa opção, o navegador não é necessário. A coleta usa candidatas fixas e fontes em modo texto: a latência de RSS, páginas e imagens externas fica fora da medição.

O JSON em `data/benchmarks/latest.json` contém identificação da coleção, modelo, tempos por etapa, duração total, pico de RSS do processo, chamadas, retries e caches da IA, além da avaliação editorial. O pico de memória é o máximo do processo, não uma medição de VRAM do Ollama. `--output` altera o destino. `--artifacts` preserva os arquivos em um diretório explicitamente dedicado; não use uma pasta de publicação existente. Não compare a reprodução sem modelo com `--live` como se fossem o mesmo trabalho.

A avaliação/benchmark live usam estado temporário próprio, histórico desativado e nenhum envio. Não alteram a edição diária nem seu banco de memória. Eles usam um processo dedicado, como os demais comandos com `--config`.

## Relatórios de decisões

Cada edição nova recebe `editorial-report.json` e `editorial-report.html`, ao lado de `edition.json`. Há um filtro de texto no relatório HTML. São registrados os descartes observados na coleta, imagem, histórico e análise; decisões e confiança declarada dos plugins; alterações de categoria; scores; seleção final; referências de cobertura e trechos de origem.

Motivos agregados como `not-selected-by-curator-or-edition-rules` identificam a etapa responsável, sem inventar uma justificativa individual que a IA não forneceu. A confiança declarada pelo modelo não é probabilidade calibrada nem comprovação factual. Checkpoints preservam e reapresentam as decisões das etapas retomadas.

Se a geração falhar, os relatórios ficam em `data/runs/AAAA-MM-DD/`. O arquivo `output/status.json`, o terminal e o aviso no arquivo de edições identificam a falha. A falha anterior à publicação não altera a última edição válida. PDF pendente e falha posterior à publicação/entrega são estados distintos. A distribuição continua dependendo das opções e serviços já configurados; nenhum novo canal de mensagem é ativado automaticamente.

## Desdobramentos e histórico

A deduplicação histórica continua usando link, topicKey e similaridade de palavras. A versão 5.1 pode aceitar uma atualização mais recente quando o título/trecho **da fonte** demonstra uma transição inequívoca entre anúncio, aprovação, bloqueio, cancelamento ou conclusão. Ela registra o link anterior, a edição, o estágio e o trecho de evidência. Notícias ambíguas mantêm a regra de duplicatas existente.

É uma proteção conservadora com sinais lexicais em português, inglês e parte do espanhol; não resolve todos os acontecimentos, negações, idiomas ou mudanças apenas numéricas. Não constitui compreensão universal de eventos. Para ampliar a cobertura, adicione casos revisados antes de mudar as regras.

O SQLite antigo recebe a coluna `excerpt` e passa de unicidade por link para unicidade por edição/link, preservando o histórico e permitindo desdobramentos na mesma URL em dias diferentes. O fallback JSON também mantém esses registros e usa escrita atômica. Cópias de segurança de `data/` continuam recomendadas antes de upgrades; voltar ao engine antigo após novas observações exige atenção à antiga restrição de unicidade por link.

## Fidelidade do texto

Os textos gerados mantêm procedência em `provenance`: link, título, trecho original e hash. Uma verificação determinística detecta números/datas numéricas, unidades percentuais e marcadores de moeda que não aparecem no material fornecido. Se houver conflito, usa o título e trecho da fonte em vez de publicar o número gerado. Quando isso exige voltar ao idioma da fonte, o card informa o idioma original.

Essa verificação **não verifica fatos**, nomes próprios, equivalência semântica ou causalidade. Pode sinalizar traduções legítimas de separadores/formatos numéricos; o fallback privilegia fidelidade. A preservação de texto no mesmo idioma pelo plugin Copy Integrity continua ativa. Não há promessa de checagem factual completa nem extração indiscriminada de páginas protegidas.

## Cobertura e independência

`coverageCount` descreve veículos/grupos editoriais. `independentCoverageCount` só recebe peso extra quando há origens declaradas distintas em `reporting_origin` no cadastro das fontes. Sem essa informação, o consenso usa o valor conservador 1. Trechos idênticos também impedem elevar o sinal de independência.

```yaml
feeds:
  - name: Example Agency
    url: https://example.org/rss
    publisher_group: Example Group
    reporting_origin: Example Agency Newsroom
```

Esse campo é uma declaração editorial manual e deve ser usado apenas quando a origem for conhecida. Não é possível provar apuração independente apenas contando domínios. Referências de matérias consolidadas são preservadas em `relatedCoverage`, inclusive na deduplicação inicial de títulos/links.

## Busca e feedback

`output/index.html` permite buscar título, resumo, tags, fonte e categoria; filtrar fonte/categoria; e avaliar uma notícia como relevante, repetida ou categoria errada. As avaliações ficam no navegador, sem servidor ou envio externo. Navegadores podem isolar o armazenamento entre caminhos `file://`: use o arquivo de edições como ponto de avaliação e exporte o JSON para preservar as escolhas. Quando o armazenamento está indisponível, a página avisa; exportação ainda funciona na sessão.

```bash
npm run feedback:import -- --file highlords-editorial-feedback.json
npm run editorial:evaluate -- --live --feedback data/editorial-feedback.json
```

A importação valida publicação, datas e categoria corrigida, e consolida entradas em `data/editorial-feedback.json`. Correções de categoria podem ampliar a coleção de avaliação com `--feedback`. Marcas de relevância/repetição ficam disponíveis para revisão humana: não mudam pesos nem treinam modelos automaticamente.

## Regressão visual

```bash
npm run test:visual
```

Requer Chrome/Chromium/Edge; use `BROWSER_PATH` quando necessário. A suíte gera screenshots, HTML, PDF e `checks.json` em `data/visual-regression/`. Testa títulos/resumos longos, imagens verticais/horizontais, diferentes composições, desktop e celular, busca com acentos, filtros e persistência do feedback.

Com Poppler (`pdftotext`), também verifica presença dos cards, que início/fim de cada card estejam na mesma página, título eSports acompanhado de conteúdo e ausência de páginas quase vazias. `REQUIRE_PDF_TEXT_CHECKS=true` exige essas verificações, como no job visual de CI. São testes de estrutura/paginação com artefatos para revisão visual; não são comparação pixel a pixel com uma imagem de referência. A suíte não roda Ollama nem depende de feeds externos.

## Atualização visual 5.2

O teste visual também cobre o [design editorial e a paginação A4](EDITORIAL_DESIGN.md), incluindo fonte mínima, contagem de matérias, textos no tamanho máximo, versão sem imagens, RTL e compatibilidade com HTML legado.
