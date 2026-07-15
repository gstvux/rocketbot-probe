---
name: failure-analysis
description: >
  Use esta skill para identificar pontos de falha em processos automatizados com Rocketbot — integrações
  com ERP, fluxos de aprovação, etapas de cadastro, dependências humanas e sistêmicas. Ativa quando o
  usuário disser "o que pode dar errado", "pontos de falha", "o robô falha quando", "resiliência",
  "exceções do processo", "o que acontece se X falhar", ou ao trabalhar com
  o arquivo de máquina de estados do projeto (docs.files.state_machine em project.yaml). Passo 5 do
  pipeline de documentação RPA — classifica falhas por evidência (EXPLICITA / INFERIDA / HIPOTETICA).
---

# Failure Analysis

## Posição no Pipeline

```
Passo 5 / 8

Entrada : project.yaml → docs.files.state_machine  (transições que podem falhar)
          project.yaml → docs.files.domain_events  (eventos que podem não ocorrer)
          project.yaml → systems[]                 (inventário de sistemas — candidatos a SPOF)
Saída   : project.yaml → docs.files.failures

Pré-requisitos : state-modeling (passo 4)
Próximo passo  : contract-engineering (→ schema)
```

> **Classificação de evidência no contexto RPA:**
> - `EXPLICITA` — falha mencionada diretamente na transcrição/documentação do cliente
> - `INFERIDA` — deduzida da análise do processo (alta confiança)
> - `HIPOTETICA` — risco arquitetural sem evidência direta (baixa confiança)

---

## Objetivo

Descobrir **fragilidade estrutural** antes que ela se manifeste em produção. Pensar como SRE, Chaos Engineer e Failure Architect simultaneamente.

## Mentalidade

Você está procurando o que vai quebrar, não confirmando que funciona. A postura correta é hostil ao sistema: assuma que cada componente vai falhar, cada integração vai ter problemas de timing, cada humano vai cometer erros.

O objetivo não é pessimismo — é antecipar falhas para que elas sejam explícitas, tratadas, e não catastroficamente surpresas.

## As perguntas fundamentais

### Sobre pontos únicos de falha (SPOF)
- Qual componente, se falhar, derruba o processo inteiro?
- Existe algum humano que é SPOF? (aprovador único, analista único)
- Existe algum sistema externo que é SPOF? (ERP, banco de dados central)
- Cada sistema com `role: source_of_truth` (ver `systems[]`): se cair, o processo para ou segue com dados locais?

### Sobre resiliência
- Existe retry? Com backoff exponencial ou linear?
- O retry é idempotente? (chamar duas vezes produz o mesmo resultado que chamar uma?)
- Existe circuit breaker? O sistema para de tentar quando o downstream está fora?
- Existe timeout definido? O que acontece quando o timeout estoura?

### Sobre consistência
- Existe reconciliação? Como o sistema detecta que ficou fora de sincronia?
- O que acontece em caso de falha parcial? (mensagem enviada mas banco não atualizado)
- Existe compensação? Como desfazer uma operação que falhou no meio?
- Os dados são consistentes eventualmente ou imediatamente?

### Sobre dependências humanas
- O humano é fallback de algum sistema? (se o sistema não funciona, o humano faz manualmente?)
- O humano é gargalo? (um único aprovador para todos os casos)
- O que acontece quando o humano não responde? Existe escalação automática?
- A decisão humana é reversível? Em quanto tempo?

## Taxonomia de falhas

### Falhas de infraestrutura
- Indisponibilidade de sistema (ERP fora, banco down, API timeout)
- Degradação silenciosa (sistema responde mas com dados errados)
- Perda de dados em trânsito (mensagem enviada mas não recebida)

### Falhas de processo
- Estado inconsistente (aprovação concedida sem registro)
- Condição de corrida (dois aprovadores aprovam simultaneamente)
- Deadlock (A espera B, B espera A)
- Starvation (processo legítimo nunca avança porque outros têm prioridade)

### Falhas humanas
- Erro de entrada (dado errado inserido)
- Omissão (campo não preenchido)
- Interpretação errada do estado atual
- Escalação não realizada por falta de visibilidade

## Formato de saída da análise

Para cada falha identificada:
```
FALHA: [nome descritivo]
Evidência : EXPLICITA | INFERIDA | HIPOTETICA
Componente: [sistema/processo/ator afetado]
Probabilidade: [Alta/Média/Baixa]
Impacto: [Catastrófico/Significativo/Menor]
Tipo: [SPOF / Consistência / Resiliência / Humano]
Sintoma: [como se manifesta]
Impacto no robô: [o que o robô Rocketbot faz neste caso]
Mitigação atual: [o que já existe, se algo]
Recomendação: [o que deveria existir]
```

## Checklist SRE para qualquer integração

- [ ] O endpoint tem SLA definido?
- [ ] Existe monitoring/alerting?
- [ ] A falha é detectável automaticamente ou só quando alguém reclama?
- [ ] Existe runbook para o operador?
- [ ] O retry não vai causar duplicação?
- [ ] A operação é idempotente?
- [ ] Existe dead letter queue para mensagens que falharam múltiplas vezes?
- [ ] Existe rollback testado?

## Checklist Chaos Engineering

Para cada componente crítico, pergunte: "o que acontece se eu remover isso agora?"
- ERP indisponível por 1 hora → o processo para ou continua?
- Mensagem perdida na fila → alguém detecta? quando?
- Aprovador em férias → processo bloqueia ou escalona?
- Banco de dados lento (10x) → timeout? retry? degradação aceitável?

## Anti-patterns de resiliência

**Retry sem idempotência**: chamar `AprovarPedido` duas vezes pode criar dois pedidos aprovados.

**Timeout infinito**: sem timeout, uma chamada lenta bloqueia o processo para sempre.

**Falha silenciosa**: "se der erro, não faz nada" — cria inconsistência sem visibilidade.

**Humano como único circuit breaker**: o humano só percebe quando o cliente reclama.
