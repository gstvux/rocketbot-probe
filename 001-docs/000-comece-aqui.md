# Comece aqui — Rocketbot Probe

Este portal foi gerado pelo **Rocketbot Probe**: um kit que transforma a gravação de uma
**call de entendimento de processo** em **documentação acionável** de automação (RPA), de forma
determinística e reaproveitável entre projetos.

> **Portal recém-criado?** Enquanto o pipeline não roda, este é o único documento aqui. Aponte um
> vídeo, rode a transcrição e execute os passos 1–8 (veja o `README.md` na raiz do projeto).

## O que o kit produz

A partir de **um vídeo/áudio** de levantamento, o pipeline gera um conjunto padronizado de documentos
em `001-docs/` (transcrição forense → eventos de domínio → glossário → máquina de estados → falhas →
schema → diagramas → PDD e entregáveis) e compila tudo neste **Hub** navegável.

## O pipeline (8 passos + transversais)

| Passo | Skill | Entrega |
|---|---|---|
| 1 | `transcription-forensics` | Transcrição sanitizada (sem distorção semântica) |
| 2 | `domain-event-extraction` | Eventos de domínio (fatos irreversíveis do negócio) |
| 3 | `semantic-canonicalization` | Glossário canônico (linguagem ubíqua) |
| 4 | `state-modeling` | Máquina de estados determinística |
| 5 | `failure-analysis` | Pontos de falha (EXPLÍCITA / INFERIDA / HIPOTÉTICA) |
| 6 | `contract-engineering` | Schema (tipos, invariantes, validações) |
| 7 | `diagram-as-code` / `bpmn-2-0-generator` | Diagramas Mermaid e BPMN 2.0 |
| 8 | `executive-technical-synthesis` | PDD + entregáveis (cliente, operador, sênior) |
| ⟲ | `docs-file-ordering`, `glossario`, `rpa-docs-builder`, `read-docs` | Transversais (ordenação, hover, build, contexto) |

## Como este portal foi compilado

O `001-docs/build.js` lê **`project.yaml`** (identidade, caminhos, publicação) e compila os `.md`
desta pasta em HTML. Passe o mouse sobre siglas sublinhadas para **decodificá-las no hover**
(fonte: `glossary.yaml`). Tudo que é específico do cliente vive no `project.yaml` — a máquina é agnóstica.
