---
name: read-docs
description: >
  Use esta skill ao iniciar qualquer tarefa relacionada ao projeto de automação do cliente — carrega
  o contexto completo lendo project.yaml, a documentação na pasta de docs e as inferências do dev
  em discovery/. Ativa quando o usuário disser "leia a documentação", "leia os docs", "carregue o
  contexto", "o que temos documentado", "me resume o projeto", "contexto do cliente", "abra os docs",
  ou ao iniciar uma sessão nova sobre qualquer processo de automação RPA. Esta skill é o ponto de
  entrada obrigatório antes de qualquer tarefa de análise, geração de documento, planejamento de
  robô ou resposta sobre o processo.
---

# Read Docs — Carregamento de Contexto do Projeto

## Objetivo

Carregar em contexto o estado atual da documentação do cliente antes de qualquer tarefa de análise ou geração. Sem ler os docs, qualquer resposta sobre o processo é especulação.

O contexto completo tem **duas** metades, e nenhuma delas é opcional:

| Metade | Onde | Responde |
|---|---|---|
| Conhecimento do processo | `docs.root/` (passos 2–7 abaixo) | o que o processo **é** |
| Inferência de engenharia | `discovery.inferences_dir/` (passo 8) | como **implementar** |

## Protocolo de carregamento

### Passo 1 — Ler project.yaml (sempre primeiro)

```
Ler: project.yaml  (raiz do repositório)
```

`project.yaml` é a fonte de verdade de todos os caminhos. Extrair:
- `project.*` — nome do cliente, ferramenta RPA, slug do processo
- `docs.root` — pasta raiz da documentação
- `docs.transcription_dir` — pasta de transcrições brutas
- `docs.files.*` — catálogo de arquivos com seus nomes reais
- `brand.*` — identidade visual do projeto
- `discovery.sessions[]` — **múltiplas** sessões de levantamento (calls, vídeos, documentos do cliente). Cada sessão é uma pasta em `discovery.sources_dir/session-N/`, numerada por ordem de chegada. A 1ª (`role: ssot`) é a referência base; as seguintes (`role: detail`) confirmam/detalham — o conhecimento de cada sessão nova é incorporado à base já existente, nunca a substitui em silêncio (skill `session-merge`). Sessões `type: video|meeting` têm transcrição sanitizada; sessões `type: document` são lidas direto (sem transcribe.py). **Anote quais têm `status: pending`** — são conhecimento que ainda não entrou nos docs.
- `discovery.inferences_dir` — pasta das inferências do dev (passo 8 deste protocolo).
- `systems[]` — inventário dos sistemas-alvo que o robô opera (`name`, `kind`, `role`, `access`). Base para SPOF (failure-analysis) e para os diagramas de integração.

A partir daqui, usar os caminhos resolvidos de `docs.root + docs.files.*`.

### Passo 2 — Ler a transcrição (fonte primária)

```
docs.transcription_dir/  ← arquivos .txt datados (transcrição bruta), um por sessão
docs.root/docs.files.transcription          ← sessão SSOT, limpa e timestampada
docs.root/docs.files.transcription_duvidas  ← sessões de detalhe (uma por sessão de discovery)
```

> A transcrição é a fonte de verdade de tudo. Em caso de conflito entre um doc derivado e a
> transcrição, a transcrição vence. **Leia TODAS as transcrições de sessão** (`docs.files.transcription*`),
> não só o SSOT — as sessões de detalhe carregam o nível de campo do processo.

### Passo 3 — Ler análise de domínio

```
docs.root/docs.files.domain_analysis   ← working doc completo da sessão de análise
docs.root/docs.files.domain_events     ← catálogo de domain events
```

### Passo 4 — Ler vocabulário

```
docs.root/docs.files.glossary  ← léxico canônico com aliases e bounded contexts
```

> Consultar este arquivo sempre que encontrar um termo ambíguo.

### Passo 5 — Ler modelo do processo

```
docs.root/docs.files.state_machine
docs.root/docs.files.failures
docs.root/docs.files.schema
docs.root/docs.files.diagrams
```

### Passo 6 — Ler entregáveis e guias

```
docs.root/docs.files.delta_info
docs.root/docs.files.client_guide
docs.root/docs.files.rpa_variables
docs.root/docs.files.stakeholder_junior
docs.root/docs.files.senior_insights
```

### Passo 7 — Ler o documento principal

```
docs.root/docs.files.pdd  ← Process Design Document — fonte de verdade do processo
```

> O PDD consolida tudo. Se só tiver tempo para um arquivo, leia o PDD.

### Passo 8 — Ler as inferências do dev (obrigatório antes de planejar ou codar)

```
discovery.inferences_dir/**/*.md  ← TODOS os .md, recursivo, qualquer nome
```

Pesquisa técnica, decisões de arquitetura, seletores, mapeamento de interface, specs e prompts
estruturados que o desenvolvedor escreveu para direcionar a construção do robô. **É instrução
primária, não material de apoio.**

> **Pasta livre-forma.** Não tem numeração `NNN`, não tem estrutura obrigatória, não tem índice.
> Leia tudo e não reorganize, não renomeie, não mova nada — a convenção `docs-file-ordering`
> vale para `docs.root`, não para cá.

O conteúdo é heterogêneo de propósito: prompt estruturado, anotação solta, pesquisa colada,
decisão registrada. A pasta também pode abrigar notas sobre **o próprio kit Probe** (visão do
produto, tasks, bugs da ferramenta). **Classifique pelo conteúdo, não pelo caminho:** nota sobre
o kit não é requisito do robô do cliente. Na dúvida, pergunte em vez de assumir.

### Precedência quando as fontes divergem

| Pergunta | Fonte soberana |
|---|---|
| O que o processo **é** (fato, regra, exceção) | a transcrição / o insumo bruto da sessão |
| O que foi **derivado** do processo (eventos, estados, falhas, contratos) | os docs em `docs.root` — e, em conflito com eles, a transcrição vence |
| Como **implementar** (arquitetura, módulo, seletor, ordem, trade-off) | as inferências em `discovery.inferences_dir` |

Uma inferência do dev nunca reescreve um fato do processo — ela decide o que fazer com o fato.
Se uma inferência contradiz um fato documentado, um dos dois está errado: **aponte a
contradição ao usuário, não escolha em silêncio**.

## Arquivos adicionais a checar

Se o usuário especificar outros arquivos fora da pasta de docs, inclua-os após os listados acima. Formatos aceitos: `.md`, `.txt`, `.yaml`, `.json`.

## Atalhos por tipo de tarefa

| Tarefa | Leia prioritariamente |
|---|---|
| Processo completo | `project.yaml` + PDD |
| **Planejar ou construir o robô** | `project.yaml` + PDD + **`inferences_dir/`** + `schema` + `failures` |
| Somente falhas / exceções | `project.yaml` + `failures` |
| Somente schema / campos | `project.yaml` + `schema` + `glossary` |
| Dúvida sobre o que foi dito | `project.yaml` + `transcription` |
| Termo ambíguo | `project.yaml` + `glossary` |
| Entrega ao cliente | `project.yaml` + `delta_info` + PDD |
| Incorporar sessão nova | `project.yaml` + tudo (é merge — ver skill `session-merge`) |

## O que fazer após ler

Confirmar ao usuário:
- Cliente e processo (de `project.*`)
- Versão do projeto (de `project.version`)
- Quantos arquivos foram lidos — separando docs do processo e inferências do dev
- Pendências em aberto encontradas em `delta_info`
- Se há inconsistências entre documentos que precisam de atenção
- **Sessões com `status: pending`** em `discovery.sessions[]` — conhecimento que chegou mas ainda não foi incorporado (rodar `session-merge`). Se o campo `status` não existir na sessão, verifique se há pasta em `discovery.sources_dir/` sem transcrição/menção correspondente nos docs
- Contradições entre uma inferência em `discovery/` e um fato documentado

## Quando NÃO usar esta skill

- Para tarefas puramente de code review ou infraestrutura sem relação com o processo de negócio
- Quando o usuário especificar explicitamente um único arquivo a ser lido

## Relação com o pipeline

Esta skill não produz documentos. Ela carrega contexto para que as skills do pipeline (passos 1–8) possam operar com informação completa. É o equivalente a um `git pull` antes de começar a trabalhar.

## Relação com a fase 2 (construir e operar o robô)

As skills de construção — `cdp-browser-control`, `remote-session-control`, `rocketbot-git-transport`,
`drift-guard`, `automation-test-loop`, `secrets-hitl` — são **agnósticas por construção**: o driver
não conhece o portal, o gate não conhece o projeto. Elas executam; **quem sabe o que executar é o
contexto carregado aqui**.

Por isso `read-docs` também é pré-requisito para operar, não só para documentar: antes de escolher
um seletor, decidir a ordem de um fluxo, marcar um ponto de HITL ou definir o que o modo `piloto`
pode escrever no sistema do cliente, carregue as duas metades. Ferramenta sem contexto clica no
lugar errado — e em servidor de cliente isso não é um teste, é um incidente.
