# Grandes notícias — 5.7.0

## O problema

Em 13/11/2026 o maior assunto do dia foi o apagão global da Microsoft (Outlook, Teams e Copilot). Sete veículos de três editorias o cobriram e **nenhuma** das dez matérias entrou na edição:

- seis foram descartadas por `strict-focus-mismatch`: o modelo escolheu uma categoria fora do `focus` da fonte e a matéria saiu na hora;
- quatro receberam nota menor que o corte (`below-score`), porque o modelo local avalia cada matéria isoladamente e "falha em serviço" não grita no título.

Antes da 5.7 o sistema só usava "muitos veículos cobrem o mesmo fato" depois da análise, com peso de 4 a 6% no ranking. Um modelo pequeno nunca compensava isso.

## O que mudou

### Detecção de grande notícia (`src/editorial/breaking.mjs`)

Roda na coleta, antes do limite de candidatas e da análise, sem chamar o modelo.

1. Agrupa matérias das últimas 36 h que compartilham pelo menos 2 termos distintivos do título (termos muito comuns no lote são ignorados). Só liga matérias de veículos diferentes.
2. Poda o agrupamento aos termos centrais (presentes em ao menos 35% do grupo). Isso impede que palavras genéricas como "sexta-feira" ou "ataque hacker" juntem assuntos sem relação.
3. Classifica o grupo:
   - **major**: 6 ou mais veículos e 2 ou mais editorias (ou 9 veículos);
   - **notable**: 4 ou mais veículos e 2 ou mais editorias (ou 7 veículos numa só editoria).
   Uma partida de futebol coberta só por veículos esportivos não vira grande notícia.
4. Marca `article.breaking` e registra a decisão `breaking-cluster` no relatório. No máximo 4 grupos por edição, um representante por veículo.

Medido sobre as 183 matérias reais de 13/11: um único grupo (Microsoft/Outlook, 7 veículos, 15 matérias) e nenhum falso positivo.

### Efeitos no pipeline

| Etapa | Efeito |
|---|---|
| Coleta (`rss.mjs`) | Representantes entram primeiro no limite de candidatas. |
| Análise (`ollama.mjs`) | O modelo recebe `coveredByPublishers`. Categoria fora do `focus` é **remapeada** para a editoria da fonte, não descartada. Nota mínima 7,5 (major) ou 6 (notable); a nota original fica em `modelScoreBeforeBreaking`. |
| Revisão semântica | Pode reclassificar, mas não rejeitar uma grande notícia. |
| Ranking | Depois da calibração global: seção +1,5 / +0,8 e capa +2,5 / +1,2 (major / notable). |
| Balanço (`balance.mjs`) | Grandes notícias entram primeiro, ignoram tetos de família, categoria e fonte, e ocupam no máximo 1 vaga (2 se major). Não saem pelo teto de 25% de tecnologia. |

### Classificação em lotes por editoria

A análise agrupa os lotes pela editoria da fonte. Com lotes que misturavam esportes, tecnologia e economia, o qwen3:4b classificou, por exemplo, "Siri AI chegará a Apple TVs" como `esportes`, e 133 de 160 candidatas caíram em `strict-focus-mismatch` em 13/11. O agrupamento é uma mitigação; a eficácia no modelo real **não foi medida**: precisa de uma execução com Ollama.

### Fonte nova

`Canaltech Segurança` (RSS verificado em 13/11/2026, 50 itens), com `publisher_group: Canaltech` para não contar como segundo veículo.

## Diagnóstico

```bash
npm run editorial:why -- outlook          # o que aconteceu com cada matéria que cita "outlook"
npm run editorial:why -- --summary        # funil da edição: coleta, análise, ranking, seleção
```

O relatório HTML/JSON de cada edição ganha as decisões `breaking-cluster`, `breaking-focus-remapped` e `breaking-category-assigned`.

## Limites

- Cobertura de muitos veículos mede atenção da imprensa, não verdade nem importância jornalística. Um boato muito replicado vira grande notícia.
- A similaridade é lexical (português e inglês). Títulos que descrevem o mesmo fato com palavras diferentes podem não se agrupar.
- Cache de análise versionado (v7); histórico, feeds e imagens não são apagados.
- A qualidade do modelo local continua limitando a edição. Esta versão não troca o modelo.
- Nove testes antigos falham nesta máquina por usarem a taxonomia local em vez do preset BR (`unknown-section:ia-desenvolvimento`); falhavam antes da 5.7.
