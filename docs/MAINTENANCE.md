# Revisão de manutenção — 2026-10-07

Base: `6c91cb5f43eb341bbadc140fa7de829b322291cd` (main).

## Entregue nesta revisão

- Verificação de sintaxe automática de todos os módulos, incluindo desktop, plugins e testes.
- Testes locais de exportação, arquivo, configuração, dotenv, ordem dos plugins e identificação de modelos.
- CI para Linux, Windows e macOS / Node.js 22 e 24.
- Instalação inicial pelo lockfile (`npm ci`) nos launchers.
- Diagnóstico sem efeitos colaterais (`npm run doctor`).
- Setup valida opções, locale, timezone e quantidade de matérias.
- Helpers comuns para HTML, URLs, dotenv, modelos e descoberta de navegador.
- Exportação de e-mail rejeita protocolos de links/imagens que não sejam HTTP(S).
- Correção de paths Windows com espaços ao gravar `.env`.
- Plugins editoriais incluídos no core desktop; erros de início de Ollama tratados.
- Diretórios gerados pelo desktop ignorados pelo Git.

## Branches temporárias revisadas

Nenhum PR aberto foi encontrado na consulta desta revisão. Antes de excluir uma branch,
confirme novamente seu SHA e ausência de novos PRs/commits.

| Branch | SHA revisado | Evidência | Decisão |
| --- | --- | --- | --- |
| `tmp-category-coverage` | `0930cd0bd8e6095c6065e0762675a2772acb3369` | Ancestral de main | Pode excluir |
| `tmp-fix-esports-images` | `94227be73c48631c28e4941339fddeea7530e920` | Ancestral de main | Pode excluir |
| `tmp-fix-esports-images-v2` | `94227be73c48631c28e4941339fddeea7530e920` | Duplicada e ancestral de main | Pode excluir |
| `tmp-feed-stability-v3` | `6b7377f31966cd633c7a0979d5f831c586705600` | Os únicos arquivos alterados (feeds-check e rss) são idênticos aos de main | Pode excluir |
| `tmp-batch-coverage-v2` | `002bbbf17dfc6415afd57d63a85a1f9d78ac8d33` | Commits exclusivos adicionam apenas `tmp-ignore` e `__probe_write.tmp`; correções posteriores estão em main | Pode excluir, descartando esses probes |

A exclusão remota não foi executada nesta revisão: o Git local não possui autenticação de escrita
e o conector não expõe exclusão de refs. A branch desta revisão deve ser mantida enquanto seu PR estiver aberto.

## Validação e limites

`npm ci`, `npm run check`, `npm test`, `bash -n RUN-DAILY.sh` e preparação do core desktop
foram executados localmente. O diagnóstico identificou corretamente configuração válida e ausência
de navegador/Ollama neste ambiente. Não foi executada uma geração real com IA/PDF nem um instalador Electron.
O CI adicionado deve confirmar as verificações em cada sistema operacional; não equivale a um teste gráfico do desktop.

## Próximas etapas sugeridas

- Testar os instaladores desktop nos sistemas de destino antes de promover a interface de experimental para estável.
- Adicionar fixtures de classificação/deduplicação e teste do pipeline com Ollama simulado.
- Separar as regras de normalização/backfill do orquestrador `daily.mjs` quando houver cobertura de regressão editorial.
- Consolidar YAMLs de compatibilidade em `config/` com os presets apenas após definir a migração de configurações customizadas.

As regras editoriais, ranking e layout permanecem preservados nesta revisão.
