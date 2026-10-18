<p align="center"><img src="public/assets/highlords-logo.svg" width="120" alt="Highlords Daily"></p>
<h1 align="center">Highlords Daily</h1>
<p align="center"><strong>Informação sem ruído.</strong></p>
<p align="center"><strong>Português</strong> · <a href="README.en.md">English</a></p>

Seu jornal diário, preparado no seu computador. Você escolhe em qual idioma quer ler, quais países acompanhar e quais assuntos te interessam. O Highlords procura as notícias nas fontes configuradas, organiza os destaques e entrega uma edição para ler no navegador ou em PDF.

**Você não precisa saber programar, usar Git ou editar arquivos de configuração.** O assistente salva as suas escolhas automaticamente. A IA roda localmente pelo Ollama, sem exigir uma API paga.

## Instalar no Windows

### 1. Instale os programas necessários

- [Node.js](https://nodejs.org/en/download): escolha a versão **LTS**, abra o instalador e siga os passos sugeridos.
- [Ollama](https://ollama.com/download): instale e abra o aplicativo. Você não precisa escolher ou baixar um modelo por conta própria.
- Para PDF, tenha Google Chrome ou Microsoft Edge instalado. Se preferir, o jornal pode ser gerado apenas para leitura no navegador.

Feche e abra novamente as janelas do terminal depois de instalar. Se o computador já tem esses programas, siga para o próximo passo. O projeto exige Node.js 22.12 ou superior.

### 2. Baixe e extraia o Highlords Daily

[**Baixar o Highlords Daily em ZIP**](https://github.com/runawayez/highlords-daily/archive/refs/heads/main.zip)

Clique com o botão direito no ZIP e escolha **Extrair Tudo**. Abra a pasta extraída que contém `GERAR-DAILY.bat`. Não execute o programa de dentro do ZIP.

### 3. Dê dois cliques em `GERAR-DAILY.bat`

Na primeira vez, ele prepara os componentes e abre o assistente. Escolha os números e pressione Enter. O assistente pergunta:

1. Qual idioma você quer usar e em qual idioma quer ler.
2. Em qual país você mora.
3. Quais países quer acompanhar — pode escolher vários.
4. Quais assuntos te interessam.
5. Se prefere uma edição rápida, equilibrada ou mais completa.
6. Qual horário usar e se deseja PDF.

Depois de confirmar, ele verifica as fontes disponíveis e salva as preferências. O programa prepara a IA, baixa o modelo automaticamente quando necessário e gera o jornal.

**A primeira execução pode demorar**, pois baixa componentes e o modelo de IA. Mantenha a internet conectada e a janela aberta. O tempo das próximas edições depende do computador e da quantidade de notícias.

### 4. Leia seu jornal

A edição abre no navegador ao terminar. As edições anteriores ficam guardadas na pasta `output`. O arquivo `index.html` dessa pasta abre o histórico; cada edição também tem sua própria pasta e, quando solicitado, seu PDF.

Nos próximos dias, basta abrir **`GERAR-DAILY.bat`** novamente. Suas escolhas continuam salvas.

## Exemplo: sou brasileiro e moro nos Estados Unidos

No assistente, escolha:

| Pergunta | Resposta de exemplo |
| --- | --- |
| Idioma de leitura | Português brasileiro |
| Onde você mora | Estados Unidos |
| Lugares que quer acompanhar | Brasil e Estados Unidos |
| Assuntos | Os que você quiser |
| Horário | O horário do computador ou a cidade americana adequada |

Isso altera as fontes selecionadas, além do idioma e do contexto da edição. Fontes em outros idiomas podem ser traduzidas pela IA para o idioma de leitura escolhido. A tradução e a seleção podem conter erros; os links das matérias originais ficam disponíveis.

O catálogo de fontes não tem a mesma cobertura para todos os países e assuntos. Se não encontrar fontes locais disponíveis para um país escolhido, o assistente explica a limitação e pergunta se você quer continuar com as restantes. Ele não afirma ter cobertura local onde ela não existe.

## Mudar minhas preferências

No Windows, dê dois cliques em **`CONFIGURAR-DAILY.bat`**. Não é necessário abrir nenhum arquivo de configuração. O assistente guarda uma cópia das preferências anteriores antes de salvar as novas.

As mudanças são usadas na próxima geração. Sempre que você abre **`GERAR-DAILY.bat`**, ele gera novamente e substitui a edição de hoje. As edições dos outros dias continuam guardadas. Se a geração falhar antes da publicação, a edição anterior é mantida.

## macOS e Linux

Instale [Node.js LTS](https://nodejs.org/en/download) e [Ollama](https://ollama.com/download), baixe o ZIP e extraia-o. Para PDF, instale Chrome, Chromium ou Edge; a leitura sem PDF também está disponível.

Abra um terminal na pasta extraída e execute:

```bash
bash RUN-DAILY.sh
```

O mesmo assistente será aberto no primeiro uso. Para mudar as preferências depois:

```bash
bash RUN-DAILY.sh --setup-only
```

## Se algo não funcionar

| Situação | O que fazer |
| --- | --- |
| Mensagem pedindo Node.js | Instale a versão LTS, feche a janela e abra o programa novamente. |
| Mensagem pedindo Ollama | Instale e abra o Ollama; depois tente novamente. |
| Não encontrei navegador para PDF | Instale Chrome/Edge ou escolha leitura no navegador sem PDF no assistente. |
| Nenhuma fonte disponível | Verifique a conexão e tente configurar novamente. As preferências anteriores são preservadas se a verificação falhar. |
| A edição está demorando | A primeira vez inclui downloads. Edições completas e computadores menos potentes precisam de mais tempo. |
| Algumas categorias não apareceram | O jornal evita preencher seções sem notícias elegíveis. |
| Já gerei a edição de hoje | Abra `GERAR-DAILY.bat` normalmente: ele refaz e substitui a edição de hoje. |

Se precisar relatar um problema, copie a mensagem mostrada na janela. Você não precisa compartilhar arquivos que contenham senhas ou credenciais.

## Atualizar

Baixe o ZIP novo e extraia seu conteúdo sobre a pasta atual, substituindo os arquivos do programa. **Não apague a pasta antiga antes:** ela contém suas preferências e suas edições. Depois, abra o launcher habitual; ele sincroniza os componentes necessários.

Se você usa Git, pode atualizar com `git pull --ff-only`.

## Para quem quer personalizar ou desenvolver

O assistente é o caminho recomendado para uso normal. Configuração manual, perfis independentes, fontes próprias, agendamento, distribuição e desenvolvimento continuam disponíveis na [referência técnica](docs/TECHNICAL_REFERENCE.pt.md) e na [documentação do motor](docs/ENGINE.md).

A interface Electron continua experimental. O guia acima usa o launcher do projeto.
