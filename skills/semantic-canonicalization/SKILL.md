---
name: semantic-canonicalization
description: >
  Use esta skill quando precisar resolver conflitos de terminologia em projetos de automação RPA,
  criar um glossário canônico de processo, alinhar linguagem entre equipes técnicas e clientes, ou
  quando aparecerem sinônimos contraditórios em transcrições de levantamento. Ativa para projetos
  Rocketbot ao trabalhar com nomes de campos do ERP, telas do sistema, etapas de processo ou termos
  que variam entre departamentos. Ative quando o usuário disser "glossário", "o que significa X",
  "temos nomes diferentes para a mesma coisa", "linguagem ubíqua", ou ao processar o arquivo
  de eventos de domínio do projeto (docs.files.domain_events em project.yaml). Passo 3 do pipeline.
---

# Semantic Canonicalization

## Posição no Pipeline

```
Passo 3 / 8

Entrada : project.yaml → docs.files.domain_events
          project.yaml → docs.files.transcription   (fonte primária de termos)
Saída   : project.yaml → docs.files.glossary

Pré-requisitos : domain-event-extraction (passo 2)
Próximo passo  : state-modeling (→ state_machine)
```

> **Uso cruzado:** o glossário gerado aqui alimenta TODOS os documentos subsequentes.
> Qualquer termo que aparecer em `state_machine`, `failures`, `schema` deve ter entrada em `glossary`.

---

## Objetivo

Criar **linguagem ubíqua do domínio** — um vocabulário canônico onde cada termo tem exatamente um significado, todos os sinônimos são mapeados, e os donos de cada conceito são identificados.

## Por que isso é crítico

Colisões semânticas destroem sistemas. "Aprovação" pode significar aprovação jurídica, aprovação financeira ou aprovação operacional — três conceitos completamente diferentes que, se tratados como um só, causam bugs impossíveis de depurar e processos que falham silenciosamente.

A canonicalização semântica transforma linguagem natural ambígua em contrato computacional.

## Os três problemas a resolver

**Sinônimos** — termos diferentes que referem ao mesmo conceito:
- "prorrogação" = "adiamento" = "extensão de prazo" → qual é o canônico?

**Colisões semânticas** — o mesmo termo com significados diferentes em contextos distintos:
- "aprovação" no Jurídico ≠ "aprovação" no Financeiro ≠ "aprovação" no Operacional

**Jargões contraditórios** — termos que evoluíram com significados opostos em diferentes times:
- "bloqueio" para o time de cobrança = cliente não pode pagar; para o time de TI = sistema travado

## Processo de canonicalização

### 1. Inventário de termos
Colete todos os termos usados no domínio: transcrições, documentos, código, conversas. Não filtre ainda.

### 2. Agrupamento por conceito
Agrupe termos que parecem referir ao mesmo conceito. Use entrevistas com especialistas de domínio para confirmar ou refutar agrupamentos.

### 3. Eleição do canônico
Para cada grupo, eleja um termo canônico baseado em: clareza semântica, uso predominante, alinhamento com o negócio (não com tecnologia), e ausência de ambiguidade cross-contexto.

### 4. Documentação estruturada
Para cada termo canônico, produza a entrada do glossário:

```json
{
  "Prorrogação": {
    "meaning": "Extensão do prazo financeiro da cobrança, aprovada pelo setor responsável",
    "aliases": ["adiamento", "extensão", "postergação"],
    "NOT": ["cancelamento", "suspensão"],
    "owner": "Financeiro",
    "bounded_context": "Cobrança",
    "invariants": [
      "Requer aprovação antes de ser efetivada",
      "Não pode ultrapassar 90 dias do vencimento original"
    ],
    "events": ["ProrrogaçãoSolicitada", "ProrrogaçãoAprovada", "ProrrogaçãoRecusada"]
  }
}
```

### 5. Validação cross-context
Para cada termo, verifique se o mesmo nome é usado com significado diferente em outros bounded contexts. Se sim, qualifique: `Aprovação.Financeira`, `Aprovação.Jurídica`.

## Campos do glossário canônico

| Campo | Propósito |
|-------|-----------|
| `meaning` | Definição precisa em linguagem de negócio |
| `aliases` | Sinônimos aceitos que mapeiam para este canônico |
| `NOT` | Termos que parecem sinônimos mas NÃO são |
| `owner` | Departamento/papel responsável pelo conceito |
| `bounded_context` | Em qual contexto delimitado este termo vive |
| `invariants` | Regras que sempre se aplicam a este conceito |
| `events` | Domain events relacionados |

## Anti-patterns

**Definições circulares**: "Aprovação é quando algo é aprovado" → inútil. Defina o estado que a aprovação produz.

**Definições tecnológicas**: "Status é um campo na tabela X" → use linguagem de negócio, não de banco de dados.

**Glossário sem dono**: se ninguém é responsável pelo termo, ele vai derivar e se tornar ambíguo novamente.

**Sinônimos não mapeados**: deixar "adiamento" e "prorrogação" como termos separados sem declarar equivalência garante futura confusão.

## Entregável ideal

Um glossário vivo (não um documento estático) com:
- Termos canônicos com definições inequívocas
- Mapa completo de aliases
- Fronteiras explícitas entre bounded contexts
- Responsável por cada termo
- Integrado ao código (tipos, enums, comentários)
- **Espelhado no SSOT `glossary.yaml`** (skill `glossario`): cada termo/sigla ganha um `title`
  curto e vira **decodificação no hover** em todo o portal. Regra viva: **termo canônico novo
  aqui ⇒ entrada nova no `glossary.yaml`** (e a linha rica no `025-glossario-canonico.md`).
