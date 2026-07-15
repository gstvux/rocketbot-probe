---
name: domain-event-extraction
description: >
  Use esta skill quando precisar analisar transcrições de levantamento de processo RPA, reuniões,
  workflows ou requisitos para identificar o que realmente acontece no domínio. Ativa para projetos
  Rocketbot ao mapear fluxos de cadastro, aprovação, integração com ERP ou qualquer operação descrita
  em vídeo/reunião. Ative quando o usuário disser "mapear o processo", "o que acontece quando",
  "eventos do sistema", "modelar o fluxo", "DDD", "event storming", ou ao trabalhar com o arquivo
  de transcrição sanitizada do projeto (docs.files.transcription em project.yaml). É o passo 2 do
  pipeline de documentação RPA — transforma fala transcrita em fatos de domínio rastreáveis.
---

# Domain Event Extraction

## Posição no Pipeline

```
Passo 2 / 8

Entrada : project.yaml → docs.files.transcription
Saída   : project.yaml → docs.files.domain_analysis  (working doc — análise completa)
          project.yaml → docs.files.domain_events    (catálogo de domain events DDD)

Pré-requisitos : transcription-forensics (passo 1)
Próximo passo  : semantic-canonicalization (→ glossary)
```

> **Relação entre as saídas:** `domain_analysis` é o working doc (anotações, hipóteses, revisões).
> `domain_events` é o catálogo limpo de eventos, formatado para consumo por outros passos.

---

## Objetivo

Descobrir **eventos irreversíveis do negócio** — os fatos que realmente aconteceram e que não podem ser desfeitos sem uma compensação explícita.

## Por que isso importa

A diferença entre um evento de domínio bem nomeado e uma descrição vaga é a diferença entre um sistema rastreável e um sistema opaco. Eventos bem extraídos permitem: causalidade (o que causou o quê), trilhas de auditoria, side effects (o que deve acontecer em reação), e replayability (reproduzir o estado do sistema a partir dos eventos).

## A tríade fundamental

Antes de nomear qualquer evento, separe com clareza:

**Ação humana** — o que um ator fez. Ex: "Maria clicou em aprovar", "João enviou o formulário"

**Intenção** — o que o ator pretendia. Ex: "financeiro quer analisar", "cliente solicitou prorrogação"

**Evento factual** — o que o domínio registrou como irreversível. Ex: `ProrrogaçãoAprovada`, `PagamentoRecebido`, `ContratoEncerrado`

Só o terceiro merece ser modelado como Domain Event.

## Critérios de um bom evento de domínio

Um evento de domínio válido é:
- **Nomeado no passado** (algo já aconteceu)
- **Irreversível** sem uma ação compensatória explícita
- **Significativo para o negócio** (alguém se importaria se não ocorresse)
- **Rastreável** (existe quem o causou, quando, com quais dados)

## Processo de extração

### 1. Varredura de verbos
Leia o texto e identifique todos os verbos. Verbos no presente contínuo ("está analisando") indicam ações em andamento — não são eventos ainda. Verbos no passado ("foi aprovado", "foi recebido") são candidatos a eventos.

### 2. Teste da irreversibilidade
Para cada candidato, pergunte: "Se isso aconteceu, preciso de uma ação explícita para desfazer?" Se sim, é um evento. Se pode ser simplesmente cancelado sem rastro, provavelmente é só uma intenção.

### 3. Nomeação em PascalCase
Nomeie eventos como substantivo + verbo no particípio:
- ✅ `ProrrogaçãoAprovada`
- ✅ `PagamentoRecebido`
- ✅ `ClienteBloqueado`
- ❌ `FinanceiroAnalisando` (ação, não evento)
- ❌ `AprovacaoPendente` (estado, não evento)

### 4. Enriquecimento do evento
Para cada evento extraído, capture:
```json
{
  "evento": "ProrrogaçãoAprovada",
  "ator": "Financeiro",
  "trigger": "Solicitação do cliente aprovada pelo gerente",
  "dados": ["id_cobrança", "novo_vencimento", "motivo"],
  "side_effects": ["NotificarCliente", "AtualizarERP", "GerarHistórico"]
}
```

## Anti-patterns clássicos

**"Financeiro analisa"** → não é evento, é ação em andamento. O evento seria `AnáliseFinanceiraIniciada` ou `AnáliseFinanceiraCompletada`.

**"Status pendente"** → estado, não evento. O evento que causou esse estado pode ser `SolicitaçãoCriada` ou `AprovacaoBloqueada`.

**"Sistema processa"** → descrição de implementação. O evento de negócio é o que o processamento produz: `PedidoProcessado`, `NotaFiscalEmitida`.

**Nomes vagos**: `Atualização`, `Mudança`, `Processamento` → sempre pergunte: atualização de quê? mudança em quê?

## Exemplo completo

**Texto bruto:**
> "Quando o cliente pede prorrogação, o financeiro analisa e, se aprovado, atualiza o sistema e avisa o cliente."

**Extração:**
```
Ações: cliente solicita, financeiro analisa, financeiro atualiza, sistema avisa
Intenções: cliente quer mais prazo, financeiro quer validar
Eventos:
  - ProrrogaçãoSolicitada  (trigger: ação do cliente)
  - ProrrogaçãoAprovada    (trigger: decisão do financeiro)
  - ClienteNotificado      (trigger: aprovação confirmada)
```

## Pensamento orientado a eventos

Ao extrair eventos, você começa a enxergar o domínio como uma sequência de fatos imutáveis. Cada evento é uma verdade do passado que o sistema deve honrar. Isso é a base para Event Sourcing, CQRS, e qualquer arquitetura orientada a auditoria.
