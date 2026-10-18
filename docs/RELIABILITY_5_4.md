# Highlords Daily 5.4 — confiabilidade e desempenho

Esta revisão aplica os problemas reproduzidos na auditoria de 18/10/2026. Mantém Node/ESM, Ollama local como padrão, HTML determinístico e a identidade visual existente.

## Correções entregues

| Área | Comportamento novo |
| --- | --- |
| Idioma | Título e resumo são examinados separadamente, mesmo com metadados ausentes/incorretos. O contrato final verifica novamente a cópia. A recuperação de tradução tem no máximo duas tentativas. |
| Perfis | Um catálogo compartilhado cobre as opções de publicação. Políticas, identidade e destinos/credenciais de entrega não são herdados do ambiente. `secretsFile` define os canais do perfil. Caminhos de navegador da máquina podem ser compartilhados. |
| Memória | `MEMORY_FILE` padrão deriva de `DATA_DIR`, inclusive fora do caminho `--config`. |
| Configuração | Presets/perfis inexistentes, focos inválidos, números não finitos e modos de imagem inválidos deixam de cair silenciosamente em outro comportamento. `images: off` e `images: false` são aceitos. |
| Plugins | Os presets declaram proteções necessárias. Ausência, desabilitação ou erro de importação de um requisito interrompe o preflight. Listas explícitas de plugins também verificam nomes ausentes. |
| Diversidade | Editorias dos veículos cadastrados usam grupos compartilhados. O orçamento de candidatas é distribuído por grupo, com primeiras oportunidades para focos disponíveis. `weight` desempata a prioridade de fontes com a mesma data; não substitui o ranking jornalístico. |
| RSS | Ordenação acontece antes do limite; datas inválidas/ausentes não viram atuais silenciosamente. Há tolerância de 15 minutos para relógios adiantados, além da janela de recência. |
| Rede de feeds | Respostas vazias/HTML são identificadas; charsets declarados e RSS legado sem atributo de versão são tratados. O namespace do cache de feeds foi atualizado para não reaproveitar respostas antigas mal decodificadas. |
| Imagens | Resolução progressiva até o limite; reservas são consultadas para repor falhas. Cache e validação final continuam ativos. |
| Ollama | Revisões de foco/semântica ganham cache independente dos IDs de lote. Chaves consideram conteúdo, prompt, schema, modelo e digest disponível. Contagem, tempo e tokens são discriminados por finalidade. |
| Cópia | O modo extrativo evita pedir headline/summary ao modelo quando todo o lote já está no idioma da edição. O modo gerado é opcional. Tradução continua obrigatória para texto estrangeiro. |
| PDF | Rerender atualiza PDF, estado, status, relatório e metadados do JSON, preservando os textos. Métricas de ocupação, páginas, fonte mínima e compressão ficam no JSON. |
| Publicação | Staging e backup ficam no volume de output, evitando rename entre discos. Checkpoints incompletos incorporam hash do código/preset/plugin; edições concluídas só são refeitas com `--force`. |
| Instalação | Shell e PowerShell usam o mesmo bootstrap Node. O hash do lockfile/versão major do Node detecta dependências desatualizadas. Navegador só é exigido para PDF; Ollama remoto acessível não exige o executável local. |

## Migração

1. Atualize com `git pull --ff-only` e execute o launcher ou `npm ci`.
2. Se usa perfis com entrega, inclua `secretsFile: ./arquivo.env` em cada perfil. O arquivo deve conter somente os canais/destinos daquele jornal. Execução sem `--config` continua usando `.env`/ambiente normalmente.
3. Revise erros novos de `focus`, preset e perfil: corrigir a configuração substitui o antigo fallback silencioso. O preset `custom` continua aceito com `CATEGORIES_FILE` e `FEEDS_FILE` explícitos.
4. Para fontes sem data confiável, escolha conscientemente `FEED_UNKNOWN_DATE=allow`; os itens ficam identificados como data ausente/inválida. O padrão é `reject`.
5. Se preferir manter os textos gerados pela IA para matérias no mesmo idioma, configure `COPY_MODE=generated`. O padrão `extractive` preserva o comportamento de fonte do preset BR, agora sem solicitar cópia descartável em lotes homogêneos.
6. Uma edição concluída permanece intacta após o upgrade. Para recuperar somente o PDF, use `npm run pdf:rerender`; isso não repete a análise. O JSON ganha metadados de recuperação/layout, sem reescrever as matérias.

Exemplo de perfil:

```yaml
preset: br
dataDir: ./state
outputDir: ./editions
copyMode: extractive
feedUnknownDate: reject
maxItemsPerSource: 3
sourceDiversityStrict: true
secretsFile: ./delivery.env
```

## Verificação

As regressões cobrem idioma, isolamento de perfil, grupos de veículos, schema, plugins exigidos, ordenação/datas RSS, validação progressiva de imagens, cache de revisão, recuperação do PDF, fingerprints e sincronização do lockfile. A integração CLI usa RSS e Ollama simulados; não certifica qualidade de um modelo real.

```bash
npm run check
npm run format:check
npm test
npm run editorial:evaluate
npm run benchmark
npm run test:visual
```

O teste visual usa Chromium e, com `REQUIRE_PDF_TEXT_CHECKS=true`, exige Poppler. Verifica HTML desktop/mobile, paginação, conservação de matérias, cópia extrema/desigual, RTL, compressão e rerender pelo CLI. Screenshots e PDFs de teste ficam em `data/visual-regression/`.

## Limites mantidos explícitos

- A detecção linguística usa sinais conservadores, não cobre todos os idiomas e não substitui avaliação editorial humana. Nomes próprios isolados não devem ser traduzidos artificialmente.
- Fidelidade numérica não comprova entidades, causalidade ou significado. Nenhum mecanismo desta revisão é vendido como checagem factual.
- As camadas de revisão de IA continuam ativas; ainda é necessário um conjunto de notícias reais rotulado por humanos para decidir quais consolidar. Cache e métricas melhoram a medição sem remover proteções por suposição.
- A rede pode continuar retornando bloqueios, HTML ou feeds vazios. A revisão melhora diagnóstico e compatibilidade, mas não inventa URLs alternativas nem remove fontes sem evidência.
- O modo extrativo não aumenta fontes curtas com texto artificial. A composição deve acomodar o material disponível.
- Core e manifests desktop usam 5.4.0. Instaladores Electron e PowerShell precisam da execução nos sistemas de destino; o desktop continua experimental.
- `CACHE_MAX_MB` limita cache, não modelos Ollama nem todas as edições. Não foi adicionada exclusão automática de histórico/edições do usuário.
- Não foi adotado Page Object no motor RSS/IA. Esse padrão continua apropriado apenas para testes de interface que venham a precisar dele.
