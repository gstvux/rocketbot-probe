---
name: read-docs
description: >
  Use esta skill ao iniciar qualquer tarefa relacionada ao projeto de automação do cliente — carrega
  o contexto completo lendo project.yaml e a documentação na pasta de docs. Ativa quando o usuário
  disser "leia a documentação", "leia os docs", "carregue o contexto", "o que temos documentado",
  "me resume o projeto", "contexto do cliente", "abra os docs", ou ao iniciar uma sessão nova sobre
  qualquer processo de automação RPA. Esta skill é o ponto de entrada obrigatório antes de qualquer
  tarefa de análise, geração de documento ou resposta sobre o processo.
---

# Read Docs — Carregamento de Contexto do Projeto

## Objetivo

Carregar em contexto o estado atual da documentação do cliente antes de qualquer tarefa de análise ou geração. Sem ler os docs, qualquer resposta sobre o processo é especulação.

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
- `discovery.sessions[]` — **múltiplas** sessões de levantamento (calls/vídeos). A 1ª (`role: ssot`) é a referência base; as seguintes (`role: detail`) confirmam/detalham. Cada uma tem `slug`, `file`, `date` e pode ter sua própria transcrição sanitizada.
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

## Arquivos adicionais a checar

Se o usuário especificar outros arquivos fora da pasta de docs, inclua-os após os listados acima. Formatos aceitos: `.md`, `.txt`, `.yaml`, `.json`.

## Atalhos por tipo de tarefa

| Tarefa | Leia prioritariamente |
|---|---|
| Processo completo | `project.yaml` + PDD |
| Somente falhas / exceções | `project.yaml` + `failures` |
| Somente schema / campos | `project.yaml` + `schema` + `glossary` |
| Dúvida sobre o que foi dito | `project.yaml` + `transcription` |
| Termo ambíguo | `project.yaml` + `glossary` |
| Entrega ao cliente | `project.yaml` + `delta_info` + PDD |

## O que fazer após ler

Confirmar ao usuário:
- Cliente e processo (de `project.*`)
- Versão do projeto (de `project.version`)
- Quantos arquivos foram lidos
- Pendências em aberto encontradas em `delta_info`
- Se há inconsistências entre documentos que precisam de atenção

## Quando NÃO usar esta skill

- Para tarefas puramente de code review ou infraestrutura sem relação com o processo de negócio
- Quando o usuário especificar explicitamente um único arquivo a ser lido

## Relação com o pipeline

Esta skill não produz documentos. Ela carrega contexto para que as skills do pipeline (passos 1–8) possam operar com informação completa. É o equivalente a um `git pull` antes de começar a trabalhar.
