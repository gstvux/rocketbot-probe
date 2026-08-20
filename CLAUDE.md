# Rocketbot Probe — regras para agentes

Kit de automação (RPA) em duas fases. **Fase 1 — descobrir e documentar:** transforma insumo bruto
de levantamento em base de conhecimento acionável sobre o processo. **Fase 2 — construir e operar:**
as ferramentas que fazem o robô rodar (navegador por CDP, sessão remota, transporte por git, gate
anti-drift, teste, segredos). A fase 1 diz **o que** construir; a fase 2 é **como** operar.

Todas as skills vivem em `skills/` — um lugar só. O Claude Code as carrega de `.claude/skills/`,
que é **gerado** pelo `./install-skills.sh` (símlink) e gitignored. Não versione nada em `.claude/`.

## Primeiro contato — o dev acabou de clonar

**O sintoma que esta seção existe para resolver:** o dev clona o kit, abre o chat e **espera um
prompt**. Ele não sabe o que pedir, e o repo não se apresenta sozinho. Não trate isso como falta
de iniciativa dele — trate como sua responsabilidade de abertura.

Se a primeira mensagem da sessão for vaga (`"oi"`, `"e agora?"`, `"vamos começar"`, `"o que eu
faço?"`, `"baixei o kit"`) — **ou** se for específica mas o repo estiver zerado — **diagnostique o
estado antes de responder qualquer coisa**:

```bash
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) && cd "$ROOT" || { echo "não é um repo git — pasta errada"; exit 1; }
[ -s project.yaml ] || { echo "project.yaml AUSENTE — isto não é a raiz do kit"; exit 1; }

[ -d .claude/skills ] && [ -n "$(ls -A .claude/skills 2>/dev/null)" ] \
  && echo "skills:     OK ($(ls -1 .claude/skills | wc -l) ativas)" \
  || echo "skills:     FALTA  → ./install-skills.sh  (e reiniciar a sessão)"
[ -d 001-docs/node_modules ] && echo "node:       OK" || echo "node:       FALTA  → cd 001-docs && npm install"
ls -d sources/session-* >/dev/null 2>&1 && echo "insumo:     OK ($(ls -d sources/session-* | wc -l) sessão/ões)" || echo "insumo:     VAZIO  → criar sources/session-1/"
grep -q 'name: ""' project.yaml && echo "identidade: VAZIA  (as skills preenchem — não trava o fluxo)" || echo "identidade: OK"
n_docs=$(ls 001-docs/*.md 2>/dev/null | grep -vcE '000-comece-aqui|075-cronograma')   # os 2 que já vêm no kit
[ "${n_docs:-0}" -gt 0 ] && echo "docs:       $n_docs do pipeline" || echo "docs:       NENHUM  → pipeline não rodou"
```

As duas primeiras linhas não são cerimônia: **o diagnóstico rodado da pasta errada mente**. De
dentro de `001-docs/` (onde o dev acabou de rodar `npm install`), o `grep` num `project.yaml`
inexistente falha e reporta `identidade: OK` — verde falso justamente onde ninguém confere.

Com o resultado em mãos, invoque a skill **`onboarding`** — ela conduz do clone ao primeiro doc,
com os portões do discovery na ordem.

**Exceção que importa:** se `.claude/skills/` não existir, **a skill `onboarding` também não
existe**. Nesse caso a única resposta correta é mandar rodar `./install-skills.sh` e reiniciar a
sessão do Claude Code. Sem isso não há uma skill sequer carregada, e você vai **improvisar
documentação** — que é exatamente o fracasso que este kit existe para evitar. Um agente sem as
skills escreve um resumo de reunião bonito; o kit existe para produzir base de conhecimento
rastreável. Não são a mesma coisa.

**Nunca** responda a um repo zerado com um resumo do README. Responda com **a próxima ação única**
— um comando, uma pasta a criar, um campo a preencher. O dev volta para pedir a seguinte.

## As três camadas

| Camada | Pasta | O que é | Quem escreve |
|---|---|---|---|
| 1 — Insumo | `sources/session-N/` | material bruto, particionado por ordem de chegada (vídeo, áudio, PDF, planilha, export do cliente) | o humano, soltando arquivos |
| 2 — Conhecimento | `001-docs/` | o que o processo **é** — saída do pipeline de skills (1–8), numerada NNN, publicável no portal | as skills |
| 3 — Inferência | `discovery/` | como **implementar** — pesquisa, decisões de arquitetura, seletores, specs, prompts estruturados | o dev, em `.md` de formato livre |

Caminhos reais sempre em `project.yaml` (`discovery.sources_dir`, `discovery.inferences_dir`,
`docs.root`, `docs.files.*`). Nunca hardcode caminho, nome de cliente, portal ou seletor em skill,
em `build.js`/`transcribe.py` ou nos scripts da fase 2 (`cdp.mjs`, `drift.sh`, `robotdb.py`,
`runlog.py`, `deploy.ps1`) — a máquina é agnóstica; o dado vive no `project.yaml` e nos arquivos
de configuração locais (`drift.json`, `dev.json`), que não são versionados com valor dentro.

## Regra operacional

> **Camada 2 + camada 3 são o contexto definitivo e acionável.** Antes de planejar ou gerar
> qualquer código de robô, carregue as duas (skill `read-docs`). Elas são instrução primária,
> não material de apoio.

Isso vale igualmente para a fase 2: as skills de construção são **agnósticas por construção** — o
driver CDP não conhece o portal, o gate de drift não conhece o projeto. Quem sabe qual seletor,
qual regra e qual exceção é a base de conhecimento. **Ferramenta sem contexto clica no lugar
errado**: carregue `read-docs` antes de operar, não depois.

### Precedência quando as fontes divergem

| Pergunta | Fonte soberana |
|---|---|
| O que o processo **é** (fato do negócio, regra, exceção) | a transcrição / o insumo da sessão em `sources/` |
| O que já foi **derivado** do processo (eventos, estados, falhas, contratos) | `001-docs/` — e, em conflito com ele, a transcrição vence |
| Como **implementar** (arquitetura, módulo, seletor, ordem de execução, trade-off) | `discovery/` |

Uma inferência do dev nunca reescreve um fato do processo — ela decide o que fazer com o fato.
Se uma inferência em `discovery/` contradiz um fato documentado, isso é sinal de erro em algum
dos dois: **aponte a contradição, não escolha em silêncio**.

## `discovery/` é livre-forma — não governe a pasta

- **Leia tudo** que houver ali (recursivo, qualquer nome, qualquer subpasta).
- **Não** aplique numeração `NNN`, não renomeie, não mova, não reorganize, não "padronize".
  A convenção `docs-file-ordering` vale para `001-docs/`, não para cá.
- O conteúdo é heterogêneo por natureza: prompt estruturado, anotação solta, pesquisa colada,
  decisão registrada. Todos valem como contexto.
- Notas sobre **o próprio kit Probe** (visão do produto, tasks, bugs) ficam em `discovery/_kit/`;
  o resto da pasta é do robô do cliente. Ainda assim classifique pelo **conteúdo**, não pelo
  caminho: nota sobre o kit não é requisito do robô, e vice-versa. Na dúvida, pergunte.
- Não é publicada no portal (`build.js` varre apenas `docs.root`). É superfície interna.

## Discovery é incremental

Cada sessão nova **soma** à base existente, nunca a sobrescreve. A regra de incorporação vale
para os passos 1–8 e está na skill `session-merge`. `discovery.sessions[].status`
(`pending` | `processed`) diz o que ainda não entrou nos docs — mantenha atualizado ao
incorporar uma sessão.

## Checkpoint e transferência

**O repositório local é o artefato de transferência.** O `.gitignore` já o deixa com o recorte
certo: a transcrição, os docs e as inferências viajam; o vídeo bruto e os segredos, não.

**Remote é opcional e tardio.** Não peça, não sugira e não trate como pendência a criação de
`origin` — a maioria dos devs não vai manter isso, e o kit não pode depender de disciplina que
não existe. O que substitui a disciplina é você:

> **Ao concluir um passo do pipeline (1–8) ou incorporar uma sessão, faça `git add` + `git commit`
> local dos arquivos gerados, sem perguntar.** Mensagem no formato `docs: passo N — <o que saiu>`.
> **Nunca `git push`** por iniciativa própria.

O commit local é barato, reversível e não sai da máquina. É o que garante que o trabalho tenha
história — e sem história não há transferência, só uma pasta.

**Por que isto importa mais do que parece:** o resultado deste kit *é* a resposta ao problema de
passar um processo de um dev para outro. Se a base de conhecimento nasce e morre num diretório sem
commits, o kit produziu documentação e destruiu a própria tese. Quando o dev falar em **passar o
processo para alguém** ("vou sair do projeto", "o fulano vai assumir", "manda pro time"), acione a
skill `handoff` — ela cobre inclusive quem nunca criou um remote.

## Higiene

- Nunca commite vídeo/áudio (`sources/`), chave Deepgram (`.claude/`, `*.key.txt`) ou JSON bruto
  da transcrição. O `.gitignore` cobre — confira antes de `git add`.
- Da fase 2, nunca commite: **credencial** (só o `*.example.json` sem valor — skill `secrets-hitl`),
  **estado de execução** (`dev.json`, `run-log.jsonl`, `journal.jsonl`, contadores — precisam
  sobreviver ao `git reset --hard` do deploy) e **capturas/saídas** (`shots/`, `downloads/`,
  planilhas), que carregam tela e dado de cliente.
- Trocar de projeto = trocar `project.yaml` + `001-docs/glossary.yaml`. Nada mais.
