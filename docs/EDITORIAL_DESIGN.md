# Design editorial 5.3

O layout aplica a direção visual aprovada na prévia conceitual: fundo de papel, preto e vermelho da publicação, cabeçalho tipográfico, manchete em destaque, resumos leves, filetes discretos e duas colunas. Sai a apresentação com grandes blocos escuros, bordas de cards e badges. A identidade continua configurável pelas cores/nome/logo do perfil.

## HTML

`src/template.mjs` continua gerando HTML determinístico e autocontido. `src/presentation/editorial-styles.mjs` centraliza os estilos compartilhados. Georgia/DejaVu Serif/Times e Arial/DejaVu/Noto são famílias locais de fallback; não há download de fontes nem dependência de uma API de design. A aparência exata e o número de páginas podem variar com as fontes instaladas, que são medidas no navegador antes de imprimir.

A manchete é apresentada antes de uma imagem horizontal de destaque. Fontes, categorias e links permanecem visíveis. Matérias com imagem, notas tipográficas e editorias de uma ou várias matérias usam composições distintas. Em celular, as colunas empilham. Scores continuam disponíveis nos dados/relatórios, sem entrar na apresentação de leitura.

### Encaixe por conteúdo

`src/presentation/fit-row.mjs` mede cada par com as fontes e imagens carregadas. Quando há diferença relevante de altura, compara colunas iguais, colunas 59/41 em ambos os sentidos e blocos horizontais empilhados. O custo considera altura e espaço vazio; uma mudança precisa trazer ganho real sem aumentar significativamente a altura da linha. A composição horizontal coloca imagem e título no topo e libera a largura para o resumo, em vez de deixar uma nota curta ao lado de uma parede de texto. A ordem editorial, palavras e tamanhos de fonte são preservados. A medição é refeita ao redimensionar o HTML e ao inserir cada linha na página A4. No celular, permanece o fluxo simples de uma coluna.

Na geração de novas edições, `source-text.mjs` limpa o HTML antes de achatar os parágrafos: separa blocos, decodifica entidades, remove subtítulos, navegação, chamadas promocionais conhecidas e listas de notícias relacionadas. O RSS prioriza o conteúdo HTML para preservar essas fronteiras. Nos limites de 1400 caracteres da coleta e 900 do resumo, prefere frases completas; para fragmentos sem pontuação, usa fronteira de palavra e reticências explícitas. Manchetes também respeitam fronteiras de palavra.

A proteção de cópia no idioma da fonte seleciona frases do RSS, com referência de 420 caracteres. Uma primeira frase maior é preservada até o limite de segurança; fontes curtas não são preenchidas. O `excerpt` usado como evidência permanece nos dados, e os fallbacks de proveniência usam o mesmo tratamento. Não há chamada adicional ao Ollama. Resumos traduzidos continuam sob responsabilidade do modelo, que recebe a mesma orientação de extensão; o editor de arte recebe `summaryLength` completo mesmo quando o texto enviado está abreviado. `--refresh-template` altera somente a apresentação da cópia arquivada, mantendo o JSON e o texto existentes.

`event-match.mjs` acrescenta um sinal conservador à deduplicação global: mesma ação na fonte, expressão nominal compartilhada e compatibilidade de datas/modelos/nomes. Reconhece, por exemplo, o encerramento de League of Legends Classic/LoL Classic entre Games e eSports. Jogos diferentes da mesma empresa, versões divergentes e mudanças de estágio não devem ser fundidos. Casos sem evidência suficiente continuam com a política de similaridade existente; não é uma checagem factual nem uma garantia de deduplicação semântica universal.

## PDF

Novos HTMLs possuem `data-design="editorial-v2"`. Ao gerar PDF, `src/services/html-pdf.mjs` usa Chromium para compor páginas A4 com `src/presentation/paginate.mjs`. Os mesmos componentes/conteúdos do HTML são clonados e medidos; os títulos, resumos e fatos não são reescritos.

- Escala fixa 1, margens próprias para A4, cabeçalhos de continuação e numeração `01 / 03`.
- Matérias são mantidas inteiras; título de editoria acompanha a primeira linha de matérias.
- Se um par não couber no espaço restante, o compositor tenta inserir a primeira matéria como bloco horizontal completo antes de levar a segunda para a próxima página. A continuação repete o título da editoria. Notas de editorias diferentes que não combinam em altura passam a blocos independentes; uma editoria pode começar no espaço disponível de outra.
- Dois destaques curtos de editorias adjacentes podem aparecer lado a lado, cada um com sua categoria e fonte.
- Manchetes longas recebem tamanho tipográfico apropriado; pares muito altos podem virar matérias de largura inteira. Há uma composição compacta para blocos extremos, sem redução global do documento nem corte de texto.
- Resumos mantêm pelo menos 13,4 CSS px, aproximadamente 10 pt, nas composições atuais.
- A imagem da manchete ocupa uma faixa horizontal; imagens verticais não forçam a altura da página.
- Destaques de primeira página (`topStories`) continuam no HTML como referências e não são republicados no PDF, onde as matérias aparecem na manchete ou na editoria correspondente.
- O layout verifica contagem de matérias, overflow e colisão com o rodapé antes de exportar. Conteúdo excepcional que ainda não couber gera erro de PDF, preservando o HTML, em vez de ser recortado.

A quantidade de páginas depende da extensão dos títulos/resumos e das fontes. A amostra demonstrativa de dez matérias fica em três páginas no ambiente de referência; isso não é uma meta rígida para toda edição. Editoriais densos podem exigir mais páginas para manter a legibilidade.

### Peso das imagens

`pdf-images.mjs` usa o canvas do Chromium já aberto para otimizar apenas imagens raster locais ou embutidas na cópia de impressão. Limita a maior dimensão a 1400 px, usa JPEG a 82% em fotos opacas e mantém PNG quando há transparência. Só substitui quando economiza pelo menos 10% dos bytes; SVG, GIF, arquivos pequenos e imagens que não puderem ser processadas permanecem intactos. As imagens remotas não são baixadas de novo nesta etapa. Assets, HTML e JSON originais não são alterados. Os diagnósticos incluem quantidade de imagens otimizadas e bytes economizados, além de matérias encaixadas individualmente.

## Ver ou aplicar em uma edição existente

```bash
npm run layout:preview
npm run pdf:rerender -- --refresh-template
npm run pdf:rerender -- 2026-10-15 --refresh-template
```

`layout:preview` gera `output/layout-preview/index.html` e `highlords-layout-preview.pdf` com **conteúdo fictício identificado**, sem feeds, histórico ou Ollama. Usa o renderer real de produção. `--output diretório` altera o destino. O navegador é necessário para PDF; o HTML fica disponível mesmo se a exportação falhar.

`--refresh-template` reconstrói o HTML de uma edição a partir do `edition.json` existente e gera o PDF com o novo visual, sem reexecutar curadoria. As imagens locais e o logo embutido são preservados. Sem essa opção, HTMLs arquivados mantêm seu visual anterior e continuam renderizáveis pela rota de compatibilidade. Novas edições adotam o design automaticamente.

A limpeza de RSS e a deduplicação são aplicadas durante uma nova geração, não ao trocar o template de um JSON antigo. O renderer nunca inventa conteúdo nem altera a seleção arquivada para diminuir páginas.

## Verificação

`npm run test:visual` gera screenshots e PDFs para a amostra aprovada, títulos de 220 caracteres/resumos de 900, pares com matéria longa e nota curta nas duas ordens, edição sem imagens, texto RTL/árabe e HTML legado. Compara o custo antes/depois do encaixe em desktop e tablet, preservação de todo o texto e retorno ao fluxo simples no celular. Verifica escala, tamanho de fonte, preservação da quantidade de matérias, ausência de overflow e páginas vazias. Com Poppler, a fixture de estresse também exige que início/fim dos cards permaneçam na mesma página e que a numeração corresponda à paginação real.

Os arquivos de inspeção ficam em `data/visual-regression/`; o CI publica os artefatos do job visual. Os testes não precisam de Ollama ou fontes externas. Para outros alfabetos, as fontes com glifos adequados continuam sendo um requisito do ambiente, conforme `docs/ENGINE.md`.

A regressão visual também exercita fotos PNG locais com e sem transparência, exige redução relevante de bytes, verifica dimensões/canal alfa e preservação dos arquivos originais, e exporta a fixture otimizada pelo renderer de produção. A edição sem imagens precisa demonstrar uso do fluxo por matéria. Testes de cópia cobrem os anúncios e cortes observados na edição real, os dois caminhos de fallback e os casos positivo/negativo de LoL Classic.
