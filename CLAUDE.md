# Rocketbot Probe — regras para agentes

Kit de automação (RPA) em duas fases. **Fase 1 — descobrir e documentar:** transforma insumo bruto
de levantamento em base de conhecimento acionável sobre o processo. **Fase 2 — construir e operar:**
as ferramentas que fazem o robô rodar (navegador por CDP, sessão remota, transporte por git, gate
anti-drift, teste, segredos). A fase 1 diz **o que** construir; a fase 2 é **como** operar.

Todas as skills vivem em `skills/` — um lugar só. O Claude Code as carrega de `.claude/skills/`,
que é **gerado** pelo `./install-skills.sh` (símlink) e gitignored. Não versione nada em `.claude/`.

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

## Higiene

- Nunca commite vídeo/áudio (`sources/`), chave Deepgram (`.claude/`, `*.key.txt`) ou JSON bruto
  da transcrição. O `.gitignore` cobre — confira antes de `git add`.
- Da fase 2, nunca commite: **credencial** (só o `*.example.json` sem valor — skill `secrets-hitl`),
  **estado de execução** (`dev.json`, `run-log.jsonl`, `journal.jsonl`, contadores — precisam
  sobreviver ao `git reset --hard` do deploy) e **capturas/saídas** (`shots/`, `downloads/`,
  planilhas), que carregam tela e dado de cliente.
- Trocar de projeto = trocar `project.yaml` + `001-docs/glossary.yaml`. Nada mais.
