---
name: executive-technical-synthesis
description: >
  Use esta skill para transformar análises de processo RPA em documentos executivos e técnicos entregáveis
  ao cliente — delta de informação, checklist acionável, doc para estagiário operador, insights para
  analista sênior, ou PDD consolidado. Ativa para projetos Rocketbot quando o usuário disser "resumir
  para o cliente", "síntese executiva", "o que falta para o robô funcionar", "entregável", "documento
  de entrega", "simplificar sem perder o essencial", ou ao trabalhar com os arquivos de diagramas e
  schema do projeto (docs.files.* em project.yaml). Passo 8 do pipeline — fecha o ciclo do
  discovery à entrega.
---

# Executive Technical Synthesis

## Posição no Pipeline

```
Passo 8 / 8 — ENTREGA

Entrada : project.yaml → docs.files.diagrams       (representação visual)
          project.yaml → docs.files.schema          (especificação de campos e regras)
          project.yaml → docs.files.failures        (riscos e lacunas identificadas)
          project.yaml → docs.files.state_machine  (fluxo completo do processo)
          project.yaml → docs.files.glossary
Saída   : project.yaml → docs.files.delta_info         (lacunas + checklist ao cliente)
          project.yaml → docs.files.stakeholder_junior  (guia operacional para operador)
          project.yaml → docs.files.senior_insights     (análise para time técnico)
          project.yaml → docs.files.pdd                 (Process Design Document principal)

Pré-requisitos : diagram-as-code (passo 7) — todos os passos anteriores
Próximo passo  : rpa-docs-builder (compilar e publicar HTML)
```

> **Saídas e públicos:**
> - `delta_info` → cliente (responsáveis pelo processo) — lacunas que bloqueiam a automação
> - `stakeholder_junior` → estagiário/operador — como usar e monitorar o robô
> - `senior_insights` → analista sênior/time técnico — análise crítica, riscos, arquitetura
> - `pdd` → documento principal — regras de negócio, fluxos AS-IS/TO-BE

---

## Objetivo

Transformar análise técnica em **ativo operacional** — uma comunicação que preserva causalidade, mantém rastreabilidade, e permite ao tomador de decisão agir com confiança sem precisar ler toda a análise subjacente.

## A tensão fundamental

Síntese executiva vive entre dois abismos:
- **Simplificação demais**: perde a causalidade ("o sistema tem problemas" não permite nenhuma decisão)
- **Detalhe demais**: o executivo ignora ou não consegue priorizar ("147 vulnerabilidades identificadas")

O objetivo é compressão semântica: remover ruído enquanto preserva o que importa para a decisão.

## Princípio da preservação de causalidade

Toda síntese executiva deve responder implicitamente: "por que isso está acontecendo?" Sem causalidade, a decisão correta é impossível.

❌ "O processo de aprovação está lento."
✅ "O processo de aprovação leva em média 4 dias porque depende de um único aprovador que também tem outras responsabilidades. O risco é: qualquer ausência dele paralisa novos contratos."

A segunda versão permite três decisões diferentes: contratar backup, redistribuir responsabilidades, ou automatizar. A primeira não permite nenhuma decisão específica.

## Estrutura da síntese executiva técnica

### 1. Situação (o que está acontecendo)
Máximo 2-3 frases. Estado atual, sem jargão técnico, com dados concretos.

### 2. Causa raiz (por que está acontecendo)
A cadeia causal mais curta que explica o problema. Um nível de profundidade abaixo do sintoma.

### 3. Impacto em linguagem de negócio
Translate o problema técnico para consequências de negócio:
- Risco financeiro (quanto custa se nada mudar?)
- Risco operacional (o que para de funcionar?)
- Risco de compliance (alguma regra está sendo violada?)
- Risco de reputação (afeta clientes externamente?)

### 4. Opções (não recomendações unilaterais)
Apresente 2-3 caminhos com tradeoffs explícitos:
```
Opção A: [o que resolve] → [quanto custa] → [quanto tempo] → [o que ainda fica em aberto]
Opção B: [o que resolve] → [quanto custa] → [quanto tempo] → [o que ainda fica em aberto]
```

### 5. Recomendação (quando solicitada)
Uma recomendação clara, com a premissa que a torna válida. Se a premissa mudar, a recomendação muda.

### 6. Próximo passo imediato
Uma ação específica, com responsável e prazo. Não uma lista de 10 ações.

## Técnicas de compressão semântica

### Substitua jargão por consequência
- ❌ "O sistema não tem idempotência"
- ✅ "Se o pagamento for processado duas vezes por erro de rede, o cliente é cobrado em dobro"

### Substitua métricas por decisões
- ❌ "Latência p99 de 2.3 segundos"
- ✅ "1% das operações demora mais de 2 segundos — suficiente para causar timeout em mobile e perder a transação"

### Substitua achados por riscos priorizados
- ❌ Lista de 15 vulnerabilidades
- ✅ "3 itens críticos que requerem ação esta semana, 12 itens que podem ser endereçados no próximo ciclo"

### Preserve rastreabilidade sem expor detalhes
- Referencie a análise completa: "Detalhes em [Análise Técnica v2 - link]"
- Mencione premissas: "Esta estimativa assume que o volume permanece abaixo de X"

## Checklist de qualidade

Antes de entregar a síntese, verifique:
- [ ] Um executivo pode tomar uma decisão específica a partir deste texto?
- [ ] A causa raiz está explícita ou inferível?
- [ ] O impacto está em linguagem de negócio (não técnica)?
- [ ] As opções têm tradeoffs honestos (nenhuma opção é obviamente melhor)?
- [ ] Existe um próximo passo claro com responsável?
- [ ] A rastreabilidade está preservada (onde encontrar mais detalhes)?

## Anti-patterns

**O relatório de status vazio**: "Estamos trabalhando no problema e esperamos resolver em breve." Nenhuma informação acionável.

**A lista sem prioridade**: "Identificamos 23 oportunidades de melhoria." Qual é a número 1? Por quê?

**O jargão não traduzido**: "Precisamos implementar event sourcing com CQRS para resolver o problema de consistência eventual." Tradução: "Precisamos de um registro imutável de todas as operações para poder reconstruir o estado correto após falhas." — E quando a sigla/termo interno **precisar** aparecer: registre-a no SSOT `glossary.yaml` (skill `glossario`) para que o portal a **decodifique no hover**; termo novo cunhado aqui ⇒ entrada nova no glossário.

**A recomendação sem premissa**: "Recomendo reescrever o sistema." Sob quais condições? O que precisa ser verdade para isso ser a melhor opção?

**A certeza falsa**: evite afirmações absolutas quando há incerteza. "Estimamos entre X e Y com base em [premissa]" é mais honesto e mais útil que "vai custar X".

## Template rápido

```
SITUAÇÃO
[2-3 frases sobre o estado atual com dados concretos]

CAUSA RAIZ
[A cadeia causal mais curta que explica o problema]

IMPACTO
- Financeiro: [valor ou estimativa]
- Operacional: [o que para ou degrada]
- Timeline: [urgência — quando isso vira crítico?]

OPÇÕES
A) [solução] → [custo] → [prazo] → [tradeoff]
B) [solução] → [custo] → [prazo] → [tradeoff]

RECOMENDAÇÃO
[Opção X] porque [premissa que a torna válida].
Se [condição], reconsiderar [opção Y].

PRÓXIMO PASSO
[Ação específica] por [responsável] até [data].

Análise completa: [referência]
```
