---
name: onboarding
description: >
  Use esta skill no PRIMEIRO CONTATO de um dev com o kit — repo recém-clonado, chat vazio, ninguém
  sabe por onde começar. Ativa quando a mensagem for vaga ("oi", "e agora?", "baixei o kit", "vamos
  começar", "o que eu faço", "como inicio o projeto", "clonei o template", "primeiro projeto",
  "me guia") ou quando o diagnóstico do repo acusar estado zerado (skills não instaladas, sources/
  vazio, project.yaml sem identidade, 001-docs/ sem doc do pipeline). Conduz do clone ao primeiro
  documento: liga as skills, valida o ambiente, coleta o insumo, declara a sessão e abre o pipeline
  1–8 com as guardas do discovery — a etapa de PROBING, que produz a base de conhecimento que
  alimenta todo o resto do desenvolvimento do robô no Rocketbot Studio.
---

# Onboarding — do clone ao primeiro doc

## Por que esta skill existe

O kit tem README completo. **O dev não lê o README — ele abre o chat e espera um prompt.** Esse é
um comportamento observado, não uma hipótese. Um kit que só funciona para quem leu a documentação
inteira antes de começar é um kit que não funciona.

Sua função aqui é ser o prompt que ele esperava: **diagnosticar o estado do repo e devolver uma
única próxima ação**, repetidas vezes, até a base de conhecimento existir. Não é um tour do
produto. É um corrimão.

## Regra de ouro da condução

> **Uma ação por vez. Nunca despeje a lista inteira.**

O dev que trava diante de um chat vazio trava igual diante de um checklist de 12 itens. Diagnostique,
diga **o próximo comando**, espere ele voltar. A sensação de progresso é o que mantém o onboarding
vivo — e cada portão vencido reduz o espaço de erro do próximo.

## Diagnóstico → próxima ação

Rode o diagnóstico do `CLAUDE.md` (seção *Primeiro contato*) e leia a **primeira** linha vermelha
de cima para baixo. Essa é a ação. As de baixo não interessam ainda.

| Estado detectado | Próxima ação única | Por que nesta ordem |
|---|---|---|
| `.claude/skills/` ausente/vazia | `./install-skills.sh` **e reiniciar a sessão** | sem skill carregada você improvisa — e improviso aqui vira documentação bonita e inútil |
| `001-docs/node_modules` ausente | `cd 001-docs && npm install` | sem isso não há portal para ver o resultado; o dev perde o feedback visual |
| `DEEPGRAM_API_KEY` ausente **e** insumo com áudio/vídeo | `export DEEPGRAM_API_KEY="..."` | a transcrição é o passo 1; sem chave o pipeline para antes de começar |
| `sources/` sem `session-*/` | criar `sources/session-1/` e pôr o material dentro | **sem insumo não há sonda** — este é o portão que não tem contorno |
| `project.yaml` com `sessions: []` | declarar a `session-1` (há exemplo comentado no arquivo) | é o que resolve os caminhos para `transcribe.py` e para as skills |
| transcrição ausente (`001-docs/transcription/*.txt`) | `python3 001-docs/transcription/transcribe.py` | passo 1 do pipeline |
| nada em `001-docs/0[1-7]*.md` | abrir o pipeline pela skill `transcription-forensics` | daqui em diante é a sequência 1–8 |
| pipeline rodado, dev quer construir o robô | skill `read-docs`, depois fase 2 | ver *Onde o probing termina* |

**Identidade (`project.name`, `client`, `process_slug`, `systems[]`) não é portão de entrada.** As
skills preenchem a partir da call. Se o dev quiser adiantar, ótimo; se não souber, siga em frente —
travar o onboarding num campo que a máquina preenche sozinha é ruído.

## As guardas do probing

Probing é a etapa que produz a **base de conhecimento do processo** — o insumo de todas as
atividades seguintes (spec do robô, seletores, tratamento de exceção, construção no Rocketbot
Studio via MCP). O que se decide aqui é herdado por tudo que vem depois, então vale deixar as
escolhas explícitas em vez de implícitas.

Os pontos abaixo são os **defaults do kit** — o que fazer quando ninguém disse o contrário. **O dev
é o dono do processo:** se ele preferir outro caminho, diga o custo uma vez e siga a decisão dele.
Repetir o alerta a cada passo não protege ninguém, só cansa.

1. **Fato só existe se está no insumo.** Se a transcrição não disse, não vá para o doc — vá para a
   lista de perguntas da próxima sessão. Preencher lacuna com plausibilidade é o modo de falha mais
   caro do kit, porque o resultado *parece* certo. Marque a evidência (`EXPLÍCITA` / `INFERIDA` /
   `HIPOTÉTICA`) sempre que a skill do passo previr isso.
2. **A ordem 1–8 é dependência, não burocracia.** Estado sem evento é chute; falha sem estado é
   lista de medos; contrato sem falha não cobre a exceção real. Pular passo não acelera — só move o
   retrabalho para depois.
3. **`read-docs` antes de qualquer tarefa de análise ou geração.** Inclusive quando a pergunta
   parece simples. Ferramenta sem contexto clica no lugar errado.
4. **Sessão nova SOMA, nunca sobrescreve.** Da 2ª em diante, quem governa é `session-merge` — nos
   oito passos, não só na transcrição. Conflito real entre sessões fica **registrado**, não
   resolvido no chute.
5. **Contradição se aponta, não se escolhe em silêncio.** Se uma inferência em `discovery/` briga
   com um fato documentado, há erro em um dos dois — mostre os dois ao dev.
6. **A máquina é agnóstica.** Nome de cliente, portal ou seletor nunca entram em skill, `build.js`,
   `transcribe.py` ou script da fase 2. O dado vive no `project.yaml`.
7. **`discovery/` é livre-forma.** Leia tudo, recursivo. Não numere, não renomeie, não "padronize"
   — a convenção `NNN` é de `001-docs/`.

## Onde o probing termina e o robô começa

A fronteira que mais se atravessa cedo. **Não abra o Rocketbot Studio (nem o MCP dele) enquanto a
base não responder estas quatro perguntas:**

- **quais estados** o processo tem e quais transições são inválidas (`030-maquina-estados.md`)
- **o que pode falhar** e o que o robô faz em cada caso (`040-falhas.md`)
- **o que é dado válido** — tipo, formato, faixa, regra de negócio (`050-schema.md`)
- **quais sistemas** ele toca e qual é a fonte da verdade (`systems[]` no `project.yaml`)

Sem isso, construir no Studio é escrever o *happy path* de um processo que ninguém mapeou — e todo
o custo aparece na primeira exceção real, em produção, com dado de cliente. Quando as quatro
existirem, o caminho é: `read-docs` → registrar as decisões de implementação em `discovery/` →
fase 2 (`cdp-browser-control`, `rocketbot-git-transport`, `automation-test-loop`, `drift-guard`,
`secrets-hitl`, `remote-session-control`).

## Armadilhas deste momento específico

- **Rodar `install-skills.sh` e não reiniciar a sessão.** As skills só entram no próximo boot do
  Claude Code. O dev jura que instalou e nada funciona. Sempre diga as duas coisas juntas.
- **Responder com o resumo do README.** Ele já não leu uma vez; reescrevê-lo no chat não muda o
  resultado. Uma ação.
- **Começar a documentar com `sources/` vazio.** Sem insumo não há sonda. Se o dev não tem material
  ainda, o onboarding legítimo termina em "prepare a call" — não em documentação inventada.
- **Commitar vídeo/áudio.** `sources/*` é gitignored por desenho; confira antes de qualquer
  `git add`. Vale também para chave Deepgram e JSON bruto da transcrição.
- **Tratar sessão `type: document` como se precisasse de transcrição.** Sessão sem áudio é lida
  direto, sem `transcribe.py`.

## Checklist de saída

O onboarding cumpriu seu papel quando:

- [ ] `./install-skills.sh --list` mostra as skills e a sessão foi reiniciada
- [ ] `cd 001-docs && npm run build` compila sem erro
- [ ] `sources/session-1/` tem o material e a sessão está declarada em `project.yaml`
- [ ] existe pelo menos um doc do pipeline em `001-docs/`, gerado por skill (não à mão)
- [ ] o dev sabe **qual é o próximo passo** sem perguntar de novo
