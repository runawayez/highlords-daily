# Diversidade editorial — 5.6.0

A edição deve explicar acontecimentos, oferecer informação útil e abrir espaço para descobertas, preservando os interesses escolhidos pelo leitor.

## Seleção

- O agrupamento editorial acontece acima das categorias: IA, Desenvolvimento, Hardware, Mobile e Software compartilham a família Tecnologia. Futebol e demais esportes compartilham Esportes; Games e eSports compartilham sua família.
- Em jornais gerais, uma primeira rodada dá espaço a famílias com candidatas acima do piso de qualidade. Rodadas seguintes buscam metas proporcionais e completam com as melhores matérias restantes.
- Referência de 16 matérias: Sociedade 3, Mundo 2, Economia 2, Ciência/Saúde/Meio Ambiente 2, Tecnologia 3, Cultura 2, Esportes 1, Games/eSports 1. São objetivos, não vagas obrigatórias.
- Tecnologia fica em aproximadamente 25% da edição real; futebol tem no máximo duas matérias. Existem tetos por família, por categoria, por fonte e por entidade central. A manchete entra nas contagens.
- Candidatas recentes vêm antes do estoque de resgate. O piso de seleção é pelo menos 4. Projetos pessoais, rumores, prévias e reações recebem penalidades de importância.
- Fontes diversas não bastam quando repetem os mesmos acontecimentos. Topic keys e a deduplicação existente continuam em vigor; entidades da revisão semântica limitam repetição de marcas e clubes.
- A ausência de material forte reduz a edição e aparece no relatório. Não se fabrica cobertura de uma categoria para preencher espaço.
- O modo é automático quando existem pelo menos três famílias reconhecidas e elegíveis. Jornais especializados e taxonomias inteiramente próprias preservam o fluxo anterior; perfis podem desativar o balanceamento.

## Cópia e apresentação

A classificação utiliza o título e o conteúdo original. A revisão existente também identifica formato, esporte, escopo geográfico e entidades, sem adicionar uma chamada exclusiva ao modelo. Regras estreitas protegem os casos conhecidos de celulares, compiladores e futebol. Hipérboles identificáveis da fonte são limpas; a evidência original permanece guardada. Traduções claramente defeituosas passam pela recuperação individual existente.

A capa usa referências às matérias selecionadas: até três chamadas de famílias distintas e uma chamada de serviço quando disponível. A chamada de serviço reaproveita o título da fonte; não cria instruções legais, médicas ou financeiras. O corpo permanece único. A estimativa de leitura considera apenas título/resumo, sem contar os artigos externos.

A paginação mede o conteúdo no Chromium e tenta incorporar uma página final esparsa por meio de geometria compacta. Se não couber, restaura a composição anterior. Textos, links e tamanho mínimo de leitura são preservados.

## Fontes e compatibilidade

Mundo é uma categoria opcional nos presets BR e global. Política & Sociedade no assistente passa a incluir Mundo. Presets pessoais antigos com esse interesse recebem a expansão em memória, sem regravar os arquivos. A cobertura BR acrescenta os feeds geral e internacional da Agência Brasil, verificados como RSS com matérias em 03/11/2026. Disponibilidade futura é tratada pelo fluxo normal de feeds.

Não há cidade presumida. Notícias locais precisam de fontes e contexto disponíveis; o histórico mede o escopo identificado pelo modelo, sem afirmar que todo acontecimento local é da cidade do leitor. Interesses especializados permanecem respeitados.

## Acompanhamento

`editorial-report.html/json` registra a distribuição observada e decisões de seleção. `data/diversity-history.json` retém as últimas sete datas de edição, substituindo a entrada quando a mesma data é gerada novamente. Isso é uma métrica operacional; não substitui a revisão humana de relevância ou exatidão.

A validação combina testes de concentração, entidades, categorias, compatibilidade do setup, fontes, cópia, histórico e uma prévia visual fictícia de 16 matérias. Testes com respostas simuladas não medem a acurácia de um modelo Ollama real.
