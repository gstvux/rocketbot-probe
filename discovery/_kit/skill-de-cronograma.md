camos criar uma skill para gerir e criar um cronograma em yaml, segue um schema:

meta:
  projeto: Automação do Relatório Executivo Mensal
  versao: 1.0.0
  frequencia: Mensal (Dia 1 ao Dia 5)

fases:
  - id: FASE_01
    nome: Extração e Consolidação
    dependencias: []
    tarefas:
      - id: TSK_101
        nome: Trigger de atualização de dados (ERP/CRM)
        responsavel: Agente - RPA
        duracao_estimada: 30m
        depende_de: []
      - id: TSK_102
        nome: Validação de consistência e schema
        responsavel: Sistema / Script
        duracao_estimada: 15m
        depende_de: [TSK_101]

  - id: FASE_02
    nome: Análise Executive Summary
    dependencias: [FASE_01]
    tarefas:
      - id: TSK_201
        nome: Geração de insights via LLM
        responsavel: Agente - IA
        duracao_estimada: 10m
        depende_de: [TSK_102]
      - id: TSK_202
        nome: Revisão e aprovação humana (Human-in-the-loop)
        responsavel: Diretor / Executivo
        duracao_estimada: 2h
        depende_de: [TSK_201]

---

a spec do cronograma nao deve ser considerada no pipeline inicial a menos que especificado (devido a maturidade de processo em sessões de discovery inicial)

deve considerar toda a inteligencia gerada com as docs, sempre consultar mcp's disponiveis que dizem respeito as ferramentas para planejar e fazer considerações tecnias

separar os dados no yaml da apresentacao, que deve ser integrado diretamente no processo de build.

---

spec para apresentar

### 1. Layout & Grid (Aproveitamento Espacial)

- **Aspect Ratio:** Otimizado para proporção `21:9` ou `16:6` (layout panorâmico e horizontal).
- **Container Width:** `100%` da largura do documento (`full-width` / desabilitar colunas no container do gráfico).
- **Min-Height:** `320px` (garante respiro entre as tracks de atividades).
- **Padding:** `24px` interno para respiro das bordas sem achatar os elementos.

```
+-----------------------------------------------------------------------------------+
|  [Header / Marco Principal]                                                      |
|  +-----------------------------------------------------------------------------+  |
|  | Eixo X: Semanas / Dias Úteis (Linha do Tempo Clean)                          |  |
|  +-----------------------------------------------------------------------------+  |
|  | [Track S1] === Bar (Fundação & Auth) ===> [Gate OTP]                        |  |
|  | [Track S2] ========= Bar (Coleta & Disparo Shadow) ========>                 |  |
|  | [Track S3] ================= Bar (Validação & Go-Live) ==========> [Diamond] |  |
+-----------------------------------------------------------------------------------+
```

### 2. Hierarquia Visual & Redução de Entropia

Para zerar o ruído visual (princípio de Gestalt de Continuidade e Proximidade):

- **Direcionamento do Texto (Labels):** 100% Horizontais. Rotações em 45° ou 90° aumentam o tempo de leitura.
- **Posicionamento de Labels:** Texto **à esquerda** das barras (em coluna fixa alinhada à esquerda) ou **dentro** da própria barra quando a largura permitir.
- **Remoção de Ruído (Chartjunk):**
    - **Eixo Y:** Invisível (sem linha vertical de eixo). As descrições das tarefas fazem o alinhamento implícito.
    - **Gridlines Vertical:** Apenas 1 linha sutil (opacidade 10%) por virada de Semana. Sem linhas para dias individuais.
    - **Linha de Hoje / Progresso:** Uma única linha vertical destacada (1.5px, cor acentuada) indicando o status atual.

### 3. Paleta de Cores Semanticamente Otimizada

Substituir cores genéricas por estados com significado funcional imediato:

| **Elemento** | **Propriedade** | **Token / Hex** | **Função Cognitiva** |
| --- | --- | --- | --- |
| **Background do Card** | Surface | `#F8FAFC` (Slate-50) | Neutro, isola o gráfico do texto do documento. |
| **Fase 1 (S1 - Crítica)** | Primary Fill | `#6366F1` (Indigo-500) | Foco inicial, alta energia. |
| **Fase 2 (S2 - Execução)** | Secondary Fill | `#3B82F6` (Blue-500) | Continuidade e fluxo. |
| **Fase 3 (S3 - Entrega)** | Accent Fill | `#10B981` (Emerald-500) | Sucesso, entrega e homologação. |
| **Gargalo / Ponto Cego** | Alert Indicator | `#EF4444` (Red-500) | Chama atenção imediata para o gate (ex: OTP). |
| **Milestones (Marcos)** | Shape Fill | `#8B5CF6` (Violet-500) | Losango (Diamond) para o Go-Live. |

### 4. Componentização das Barras e Anotações

- **Corner Radius das Barras:** `6px` (traz suavidade sem perder precisão técnica).
- **Espaçamento entre Tracks (Gap):** `12px` de respiro entre linhas paralelas.
- **Indicação de Dependência:** Linhas de fluxo sutis (`stroke-dasharray: 4`, tom neutro `#94A3B8`) conectando a saída de um bloco à entrada do outro, sem cruzar sobre textos.
- **Milestones (Gates Executivos):**
    - Representados por ícones distintos: **Losangos ⬥** para Go-Live e **Círculos 🔴** para Ponto de Bloqueio/Gate de Aprovação.

### 5. Exemplo de Implementação (Mermaid Ajustado)

Se estiver gerando a visualização via Mermaid no próprio ambiente de documentação, use esta estrutura estilizada que força a distribuição horizontal:

Snippet de código

```
gantt
    dateFormat  YYYY-MM-DD
    axisFormat  %d/%m (S%W)
    title Sprints de Automação — Exemplo (3 Semanas)

    section S1 · Fundação
    Setup + Variáveis           :done,    s1_1, 2026-08-03, 3d
    login sistema-alvo (OTP)  [Gate]      :crit, active, s1_2, after s1_1, 2d

    section S2 · Miolo & Shadow
    Títulos + Tabela + Junção   :active,  s2_1, after s1_2, 3d
    Disparo (Shadow)            :         s2_2, after s2_1, 2d

    section S3 · Validação
    Orquestração & Resiliência  :         s3_1, after s2_2, 2d
    Homologação + Adjusts       :         s3_2, after s3_1, 2d
    Go-Live em Produção         :milestone, m1, after s3_2, 0d
```

### Benefícios Práticos da Spec

1. **Leitura Zero-Fricção:** O tomador de decisão entende onde o projeto está e onde fica o gargalo em menos de 3 segundos (Time-to-Insight).
2. **Integração Visual:** O layout wide casa perfeitamente com a caixa vermelha de aviso que está acima dele no documento, mantendo o mesmo eixo horizontal de leitura.
3. **Escalabilidade:** Funciona nativamente em telas desktop ou relatórios exportados em PDF sem achatar nem encavalar fontes.

---