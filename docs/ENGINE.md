# Highlords Daily 5 — motor regional e operação diária

O preset BR continua funcionando sem configuração. Região editorial, idiomas das fontes, idioma da edição, categorias e fuso são escolhas independentes. O motor continua local, com RSS/Atom, Ollama e HTML determinístico.

## Instalação

Requisitos: Node.js 22.12 ou superior, Ollama e um modelo local. Chrome, Chromium ou Edge só são necessários para PDF. Para idiomas com outros alfabetos, instale fontes com os glifos correspondentes; Noto Sans e as famílias Noto CJK/Arabic são opções compatíveis.

```bash
git clone https://github.com/runawayez/highlords-daily.git
cd highlords-daily
npm ci
ollama pull qwen3:4b
```

Inicie o serviço Ollama (`ollama serve`, se não estiver ativo). Em outro terminal:

```bash
npm run doctor
npm run daily
```

`npm run setup` é opcional. Os launchers continuam disponíveis para o primeiro uso. No PowerShell com scripts bloqueados, use `npm.cmd`. Não é preciso trocar a política global de execução.

O envio SMTP usa Nodemailer como dependência opcional. `npm ci --omit=optional` instala o core sem SMTP; Telegram, Discord e gateway HTTP continuam disponíveis. Prettier é apenas dependência de desenvolvimento. `npm ci --omit=dev` instala para uso normal.

Desktop: `npm run desktop:install`, depois `npm run desktop`. As dependências desktop possuem lockfile próprio. A interface permanece experimental; o CLI é a referência operacional.

Atualização: `git pull --ff-only`, depois `npm ci`. Preserve `.env`, `data/` e `output/`. A versão 5 entende o histórico anterior; os novos checkpoints começam na primeira execução. Uma edição concluída na versão 5 não é regenerada automaticamente no mesmo dia.

## Configuração regional

A precedência é: defaults do preset → `.env`/ambiente. Com `--config`, o perfil YAML/JSON substitui as opções da publicação e não herda o `.env` do repositório. Caminhos no perfil são relativos ao arquivo. Segredos podem vir do ambiente ou de `secretsFile` explícito.

```yaml
preset: global
language: pt-BR
region: JP
coverage: [JP, GLOBAL]
sourceLanguages: [ja, en]
timeZone: Asia/Tokyo
editorialContext: Japan and its impact on residents
publicationName: Highlords Daily Japan
publicationSlug: highlords-japan
feedsFile: ../data/profiles/japan/feeds.yml
dataDir: ../data/profiles/japan
outputDir: ../output/japan
autoOpen: false
```

`examples/japan.yml` fornece esse exemplo. Cada perfil exige `dataDir` e `outputDir`; memória e cache são isolados automaticamente. Execute perfis diferentes em processos separados, incluindo via `runCommand` de `src/cli/run.mjs`; o pipeline aceita serviços injetados, mas os adaptadores legados ainda usam configuração por processo.

```bash
npm run config:show
npm run config:show -- --config examples/japan.yml
npm run daily -- --config examples/japan.yml --unattended
```

`language` é o idioma de saída. `sourceLanguages` filtra o idioma declarado do feed, independentemente do país. Idiomas desconhecidos permanecem elegíveis e aparecem como `und`; preencha `language` no cadastro para filtros estritos. A qualidade da localização depende do modelo: suporte de configuração a um locale não certifica a qualidade linguística da IA.

IDs/slugs das categorias permanecem estáveis. `labels` fornece os nomes de apresentação por locale ou idioma. `examples/custom-categories.yml` mostra categorias sem dependência da taxonomia Vanilla. Defina `categoriesFile` para utilizá-las. Regras regionais pertencem a `routingFile`/preset; plugins podem ser escolhidos com `enabledPlugins`.

## Encontrar fontes

```bash
npm run sources:discover -- --region JP --languages ja,en --research --query Japan --output data/profiles/japan/feeds.yml
```

Faça a descoberta antes de usar um perfil cujo `feedsFile` ainda não existe. Depois revise o YAML e execute o perfil. A descoberta não altera `.env` nem ativa silenciosamente fontes em uma publicação existente.

O catálogo inclui as fontes BR/Global existentes e sementes para GB, DE, JP, US, ES e FR. Sementes não são certificadas: a disponibilidade é verificada ao executar o descobridor. `--research` usa pesquisa opcional no diretório Wikipédia/MediaWiki para encontrar sites candidatos; esses candidatos também passam pela descoberta e validação de RSS. Isso não equivale a uma auditoria de qualidade editorial nem a uma busca exaustiva de veículos de uma região.

Opções adicionais:

```bash
npm run sources:discover -- --region DE --site https://example.org --output data/germany/feeds.yml
npm run sources:discover -- --catalog ./my-sources.yml --region DE --categories science,local --output data/germany/feeds.yml
npm run feeds:discover -- https://example.org
```

Os arquivos registram idioma, cobertura, grupo editorial, validação e disponibilidade. `*.research.json` registra a procedência da descoberta. A região de um site descoberto não é presumida: revise `country`, `coverage`, `publisher_group` e `focus`. Um endpoint válido não garante cobertura regional, independência editorial, atualização ou boas imagens.

A seleção diária usa o YAML aprovado. Descoberta e atualização de fontes são operações explícitas; não há pesquisa de veículos em toda geração. Revisite o catálogo periodicamente e consulte a saúde em `data/cache/source-health/`. Fontes falhas não são removidas automaticamente.

## Idiomas e interface

Catálogos estáticos completos: português, inglês, espanhol, francês, alemão, japonês, chinês e árabe. Idiomas adicionais usam o catálogo inglês como fallback até receberem um catálogo personalizado.

```bash
LANGUAGE=ko-KR npm run locale:generate -- --output data/locales/ko-KR.json
```

No Windows, defina `LANGUAGE` pelo `.env`/perfil ou ambiente PowerShell. Revise a tradução gerada uma única vez, depois defina `UI_LOCALE_FILE` ou `uiLocaleFile` no perfil. Os rótulos não são retraduzidos em cada edição. HTML, arquivo e e-mail respeitam direção RTL; o PDF deriva do mesmo HTML.

## Performance e medição

- Coleta concorrente com ordem de resultados estável; `FEED_CONCURRENCY=4`, `DOMAIN_CONCURRENCY=2`, `IMAGE_CONCURRENCY=4` por padrão.
- URLs/títulos duplicados e histórico filtrados antes da descoberta de imagens.
- Revalidação HTTP com ETag/Last-Modified. Uma resposta 304 reaproveita o XML, mas datas e filtros são reavaliados.
- Cache de páginas e probes; imagens finais reutilizam arquivos validados.
- Cache de classificação/localização por conteúdo, taxonomia, modelo, prompt, idioma e contexto.
- Cache de dimensões editoriais; recência e consenso são recalculados. Calibração global e fechamento da edição continuam atuais.
- Uma chamada de Ollama por vez. Schemas JSON e validação local em análise, ranking e curadoria.
- `OLLAMA_KEEP_ALIVE=10m`, `ANALYSIS_CACHE_DAYS=7`; use `0` para desativar o cache de IA.
- Manutenção automática antes da geração; `CACHE_MAX_MB=256`. Também existe `npm run cache:prune`.

`data/runs/YYYY-MM-DD/metrics.json` registra tempos por etapa, chamadas de rede, hits de cache, chamadas/tokens/tempos de Ollama e pico de memória. Checagens de uma edição já concluída gravam `last-check.json`, preservando as métricas da geração.

```bash
npm run benchmark
```

Esse benchmark compara coleta sequencial e concorrente de respostas de uma fixture HTTP local, verificando igualdade e ordem das saídas. Não mede a duração de uma edição com Ollama real. Compare execuções reais com as mesmas entradas/modelo e verifique qualidade editorial antes de alterar limites.

## Agendamento diário

Ollama deve estar ativo e o modelo/dependências já instalados. O agendador não baixa modelos, não instala pacotes, não aguarda teclado e não abre o navegador.

```bash
npm run schedule -- --time 07:00 --dry-run
npm run schedule -- --time 07:00
npm run schedule -- --config examples/japan.yml --time 07:00 --deliver
npm run schedule:remove
```

Windows usa Task Scheduler; macOS usa launchd; Linux prefere systemd de usuário quando disponível e aceita `--backend cron`. Cada publicação tem identificador próprio. O agendador verifica a cada cinco minutos; o gate usa o fuso editorial e gera a edição atual quando o horário foi alcançado. Uma execução concluída não é repetida. Quando a máquina volta após o horário, recupera a edição do dia, sem fabricar um backlog de dias passados.

No Linux, timers systemd usam `Persistent=true`. Serviços de usuário dependem de uma sessão de usuário disponível; operação permanente pode exigir habilitar linger ou usar uma conta de serviço configurada pelo administrador. Task Scheduler/launchd também dependem das condições da conta e da máquina. O motor não liga computadores desligados.

Cron escreve logs em `data/scheduler/scheduler.log`; o runner mantém rotação básica de 5 MB. systemd usa o journal. Caminhos absolutos para Node e scripts evitam depender do PATH interativo. Se mudar a instalação do Node ou mover o projeto, reinstale o agendamento. Remova o agendamento legado da versão 4 antes da primeira instalação do novo.

## Falhas e recuperação

Há um lock por publicação. Checkpoints com fingerprint da configuração e digest do conteúdo permitem repetir o comando após falhas sem refazer etapas concluídas. Configuração diferente invalida checkpoints. Não compartilhe o mesmo `dataDir` entre publicações.

A edição é montada em staging e depois publicada. HTML/JSON/exportações permanecem disponíveis se o PDF falhar. O erro fica no manifesto; `REQUIRE_PDF=true` torna essa situação um erro operacional depois de preservar a edição.

```bash
npm run daily -- --unattended
npm run pdf:rerender -- 2026-10-07
npm run pdf:rerender -- --config examples/japan.yml 2026-10-07
```

`--force` gera uma nova revisão da edição: o histórico continua ativo e pode remover matérias já publicadas. Para reproduzir a mesma seleção, use o HTML existente com `pdf:rerender`; não desative memória indiscriminadamente. `--date` escolhe uma data editorial, mas a coleta ainda usa a janela de notícias atual; não reconstrói automaticamente notícias históricas.

## Entrega

A geração exporta arquivos mesmo sem destinatários configurados. O envio só ocorre com `--deliver` ou pelo comando separado:

```bash
npm run daily -- --unattended --deliver
npm run deliver -- 2026-10-07
```

Configure apenas os destinos desejados no ambiente ou no `secretsFile` do perfil:

```env
# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
# Discord
DISCORD_WEBHOOK_URL=
# E-mail SMTP
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=
EMAIL_TO=
# Alternativa ao SMTP: gateway HTTP próprio
EMAIL_WEBHOOK_URL=
EMAIL_WEBHOOK_TOKEN=
```

Telegram e Discord dividem mensagens respeitando seus limites. SMTP usa TLS e Message-ID estável. O gateway HTTP recebe `{from,to,subject,html}` e o cabeçalho `Idempotency-Key`; configure um gateway que implemente esse contrato. SMTP e gateway são alternativas, não envios duplicados do mesmo e-mail.

A outbox guarda tentativas e confirmações por edição/destino/parte. Confirmações não são reenviadas. Respostas de rate limit definem janela para retry. Falhas de rede ou respostas ambíguas são marcadas como incertas: confira o provedor antes de usar `npm run deliver -- 2026-10-07 --retry-uncertain`. Não há promessa de entrega exatamente uma vez quando um provedor não oferece idempotência. Não são persistidos tokens, URLs secretas ou corpos das mensagens na outbox.

## Arquitetura e extensão

`src/engine/pipeline.mjs` recebe contexto e serviços explícitos. `src/editorial/edition.mjs` concentra seleção, backfill e diversidade. `src/services/` mantém ingestão, memória, IA, imagens e exportação. `src/sources/` cuida de catálogo/pesquisa. `src/locales/` contém UI determinística. `src/cli/run.mjs` isola configurações em workers. Regras BR estão em `presets/br/routing.mjs`, sem categorias brasileiras fixas no coletor.

O contexto fornece configuração resolvida, publicação, data, métricas e candidatas de reserva aos plugins. Hooks antigos com um único argumento continuam compatíveis. Plugins customizados podem manter seus próprios efeitos colaterais; não execute plugins não confiáveis.

A taxonomia legada mantém slugs para compatibilidade. O plugin editorial Vanilla ainda contém heurísticas específicas desse conjunto; categorias customizadas usam o ranking dimensional sem essas correções. Adapte regras específicas ao idioma das fontes em um preset/plugin.

## Validação desta versão

Os testes locais cobrem Unicode, concorrência, TTL/corrupção de cache, locks, retomada, falha de PDF, fuso, perfis, schemas, descoberta e entrega simulada. A integração completa usa RSS japonês e Ollama HTTP simulados para gerar edição árabe com imagens, histórico, caches e reexecução idempotente.

Não foram validados aqui um modelo Ollama real, renderização Chromium, entregas a provedores reais, instalação nativa de tarefas no Windows/macOS nem instaladores Electron. CI verifica Node 22/24 em Windows, Linux e macOS; isso não substitui a validação gráfica ou operacional nos sistemas de destino.
