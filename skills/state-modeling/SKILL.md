---
name: state-modeling
description: >
  Use esta skill para modelar processos de negócio como máquinas de estado determinísticas em projetos
  RPA Rocketbot — fluxos de cadastro, aprovação, integração com ERP, ciclo de vida de documentos.
  Ativa quando o usuário disser "estados do processo", "fluxo de aprovação", "ciclo de vida",
  "quando pode fazer X", "transições", "máquina de estados", ou ao trabalhar com
  os arquivos de glossário e eventos de domínio do projeto (docs.files.* em project.yaml). Passo 4
  do pipeline de documentação RPA — define o que pode acontecer em cada etapa e impede transições inválidas.
---

# State Modeling

## Posição no Pipeline

```
Passo 4 / 8

Entrada : project.yaml → docs.files.glossary      (terminologia canônica)
          project.yaml → docs.files.domain_events  (domain events como triggers de transição)
Saída   : project.yaml → docs.files.state_machine

Pré-requisitos : semantic-canonicalization (passo 3)
Próximo passo  : failure-analysis (→ failures)
```

> **Relação com diagram-as-code (passo 7):** o modelo de estados gerado aqui alimenta
> o diagrama Mermaid `stateDiagram-v2` em `project.yaml → docs.files.diagrams`.

---

## Objetivo

Transformar processo em **sistema determinístico** — onde dado o estado atual e uma entrada, o próximo estado é sempre previsível e as transições inválidas são impossíveis por construção.

## Princípio fundamental

Estado não é ação, não é tela, não é departamento. **Estado é uma condição persistente do domínio** que determina o que pode acontecer a seguir. Confundir esses conceitos é o anti-pattern mais grave da modelagem de processos.

## O que é (e o que não é) um estado

**É estado:**
- `PagamentoPendente` — condição do pagamento que persiste até ser resolvida
- `ContratoAtivo` — condição do contrato que habilita determinadas operações
- `ClienteBloqueado` — condição do cliente que impede novas operações

**Não é estado:**
- "Financeiro analisa" → isso é uma ação
- "Tela de aprovação" → isso é uma interface
- "Departamento Jurídico" → isso é um ator
- "Em processamento" → estado válido, mas onde começa e termina?

## Pensamento de autômato finito

Modele seu domínio como um autômato finito determinístico (DFA):
- **Estados** (S): conjunto finito de condições possíveis
- **Alfabeto** (Σ): conjunto de eventos/ações que causam transições
- **Transições** (δ): função S × Σ → S (dado estado + evento = próximo estado)
- **Estado inicial** (s₀): como o processo começa
- **Estados terminais** (F): condições de fim (reversível ou não)

## Processo de modelagem

### 1. Inventário de estados candidatos
Liste todas as condições do domínio que: persistem no tempo, determinam o que pode acontecer, e mudam apenas via eventos explícitos.

### 2. Definição de invariantes
Para cada estado, defina o que DEVE ser verdadeiro enquanto a entidade está nele:
```
Estado: ProrrogaçãoAprovada
Invariantes:
  - novo_vencimento > vencimento_original
  - aprovado_por != null
  - data_aprovação <= data_novo_vencimento
```

### 3. Mapeamento de transições
Para cada par (estado_origem, evento), defina:
- Estado destino
- Pré-condições (o que deve ser verdade para a transição ser possível)
- Efeitos colaterais (o que acontece durante a transição)

```
(PagamentoPendente, ProrrogaçãoAprovada) → ProrrogaçãoAtiva
  pré-condições: [solicitação_existe, aprovador_autorizado]
  efeitos: [atualizar_vencimento, notificar_cliente, registrar_auditoria]
```

### 4. Identificação de estados terminais
Classifique os estados terminais em:
- **Sucesso**: `PagamentoQuitado`, `ContratoEncerrado`
- **Falha**: `CobrançaInadimplente`, `ClienteJudicializado`
- **Cancelamento**: `SolicitaçãoCancelada` (requer motivo explícito)

### 5. Validação de completude
Para cada estado, pergunte: "De onde posso entrar aqui?" e "Para onde posso sair daqui?". Um estado sem entrada (exceto o inicial) é inalcançável. Um estado sem saída (exceto os terminais) é uma armadilha.

## Notação de diagrama

Use a seguinte convenção em Mermaid:
```
stateDiagram-v2
    [*] --> PagamentoPendente : CobrançaCriada
    PagamentoPendente --> ProrrogaçãoSolicitada : ClienteSolicitouProrrogação
    ProrrogaçãoSolicitada --> ProrrogaçãoAprovada : FinanceiroAprovouProrrogação
    ProrrogaçãoSolicitada --> ProrrogaçãoRecusada : FinanceiroRecusouProrrogação
    ProrrogaçãoAprovada --> PagamentoPendente : PrazoDefinido
    PagamentoPendente --> PagamentoQuitado : PagamentoRecebido
    PagamentoPendente --> Inadimplente : PrazoVencido
    PagamentoQuitado --> [*]
    Inadimplente --> [*]
```

## Anti-patterns graves

**Modelar ações como estados**: "Em análise" é ambíguo — análise de quê, por quem, com qual critério de saída? Prefira `AnáliseFinanceiraEmCurso` com tempo máximo definido.

**Estados sem invariantes**: um estado sem condições obrigatórias não é um estado — é uma label vazia.

**Transições implícitas**: toda mudança de estado deve ser causada por um evento nomeado e explícito. "Vira automaticamente" não é aceitável.

**God state**: um estado que tudo pode entrar e tudo pode sair é um sinal de que o modelo está incompleto.

## Checklist de validação do modelo

- [ ] Todo estado tem pelo menos uma transição de entrada (exceto estado inicial)
- [ ] Todo estado tem pelo menos uma transição de saída (exceto estados terminais)
- [ ] Toda transição é causada por um evento nomeado
- [ ] Todo estado tem invariantes definidas
- [ ] Os estados terminais de falha têm tratamento explícito
- [ ] Não existe loop infinito sem condição de escape
