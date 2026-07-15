---
name: contract-engineering
description: >
  Use esta skill para transformar requisitos de processo RPA em especificações técnicas precisas —
  definir tipos, validações e regras de negócio para campos do ERP, telas de cadastro, variáveis do
  Rocketbot e integrações. Ativa quando o usuário disser "o que é válido", "quais são as regras",
  "preciso especificar o campo X", "validação", "contrato", "tipos e constraints", "schema do processo",
  ou ao trabalhar com os arquivos de falhas e glossário do projeto (docs.files.* em project.yaml).
  Passo 6 do pipeline de documentação RPA — elimina ambiguidade que parece aceitável no levantamento
  mas destroça a automação em produção.
---

# Contract Engineering

## Posição no Pipeline

```
Passo 6 / 8

Entrada : project.yaml → docs.files.failures       (restrições reveladas pelas falhas)
          project.yaml → docs.files.glossary       (tipos e termos canônicos)
          project.yaml → docs.files.state_machine  (pré-condições de cada transição)
Saída   : project.yaml → docs.files.schema

Pré-requisitos : failure-analysis (passo 5)
Próximo passo  : diagram-as-code (→ diagrams)
```

> **`schema` é insumo direto para o PDD** (`project.yaml → docs.files.pdd`) — é onde as
> regras de negócio ganham precisão computacional suficiente para implementação no `project.yaml → project.rpa_tool`.

---

## Objetivo

Eliminar **ambiguidade computacional** — traduzir linguagem natural em tipos, constraints, invariantes e validações que um sistema pode verificar e um desenvolvedor pode implementar sem ambiguidade.

## Por que isso é crítico

Linguagem natural é projetada para ser interpretada por humanos com contexto compartilhado. Código é executado por máquinas sem contexto. A lacuna entre "data válida" e `Date where day is not a weekend and not a holiday and is within 30 days from today` é o lugar onde os bugs vivem.

O contract engineer fecha essa lacuna antes da implementação, não depois.

## Princípio da boundary definition

Toda string não é simplesmente uma string. Todo número não é simplesmente um número. Toda data não é simplesmente uma data.

- `string` qualquer ≠ CPF válido (11 dígitos numéricos + algoritmo de verificação)
- `date` ≠ data útil (exclui finais de semana e feriados do calendário relevante)
- `string` ≠ email válido (formato RFC 5321 + domínio existente)
- `number` ≠ valor monetário (precisão decimal, moeda, negativo permitido?)
- `string` ≠ status (enum finito e consistente)

## Processo de engenharia de contratos

### 1. Identificação de conceitos primitivos
Liste todos os conceitos que aparecem no requisito. Para cada um, pergunte: "qual é o tipo computacional exato?"

### 2. Decomposição em tipos
Para cada conceito, defina:
```
Conceito: CPF
Tipo base: string
Formato: \d{11} (11 dígitos, sem pontuação na persistência)
Algoritmo: validação dos dois dígitos verificadores
Invariantes:
  - não pode ser sequência repetida (111.111.111-11)
  - deve pertencer a um CPF ativo (se validação online disponível)
Representação na UI: ###.###.###-##
Representação no banco: 11 dígitos sem formatação
```

### 3. Definição de invariantes de domínio
Invariantes são condições que devem ser verdadeiras em qualquer estado válido:
```
Invariante: Prorrogação
  - novo_vencimento > vencimento_original
  - novo_vencimento - vencimento_original <= 90 dias
  - novo_vencimento é dia útil
  - aprovado_em <= novo_vencimento
  - aprovador tem permissão nível >= 2
```

### 4. Especificação de validações
Para cada campo de entrada, defina:
```
Campo: valor_prorrogação
Tipo: Decimal(10,2)
Range: 0.01 <= valor <= 999999.99
Moeda: BRL
Negativo: não permitido
Nulo: não permitido se tipo = "financeiro"
Mensagem de erro: "Valor deve ser positivo e não pode exceder R$ 999.999,99"
```

### 5. Contratos de API / integração Rocketbot
```
POST /prorrogacoes
Request:
  {
    cobranca_id: UUID (required, deve existir e estar em estado PagamentoPendente),
    novo_vencimento: Date (required, dia útil, entre D+1 e D+90),
    motivo: string (required, min:10 max:500 chars),
    aprovador_id: UUID (required, deve ter role: aprovador_financeiro)
  }

Response 201:
  {
    prorrogacao_id: UUID,
    status: "aprovada",
    evento: "ProrrogaçãoAprovada",
    timestamp: ISO8601
  }

Errors:
  400: dados inválidos (detalhar qual campo e por quê)
  404: cobrança não encontrada
  409: cobrança não está em estado elegível
  403: aprovador sem permissão
  422: nova data não é dia útil
```

## Tipos de constraints

| Tipo | Exemplo |
|------|---------|
| Formato | CPF, CNPJ, CEP, email, UUID |
| Range | valor entre X e Y, data entre D e D+N |
| Cardinalidade | lista com 1 a 5 itens |
| Unicidade | campo único no contexto X |
| Existência | referência deve existir na tabela Y |
| Estado | entidade deve estar no estado Z |
| Temporal | data futura, dia útil, dentro do mês vigente |
| Permissão | ator deve ter role/permissão específica |
| Negócio | regra calculada (ex: prazo máximo por tipo de cliente) |

## Anti-patterns de especificação

**"Campo obrigatório"** → obrigatório em qual contexto? Para qual tipo de operação?

**"Data válida"** → válida como o quê? Formato? Dia útil? Não retroativa? Dentro de qual janela?

**"Status pode ser X ou Y"** → é enum? Quem pode mudar de X para Y? Toda mudança de status?

**"Valor positivo"** → positivo e não-nulo? Zero é permitido? Qual precisão decimal?

**"Nome do usuário"** → min/max chars? Permite números? Permite caracteres especiais? Case sensitive?

## Entregável final

Um contrato de engenharia completo contém: definição de tipos com precisão computacional, invariantes de domínio explícitas, validações por campo com mensagens de erro, contratos de API com todos os casos de erro, e regras de negócio sem ambiguidade.

O teste de qualidade: um desenvolvedor consegue implementar sem fazer uma única pergunta?
