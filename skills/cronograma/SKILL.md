---
name: cronograma
description: >
  Use esta skill para criar, gerir e renderizar o CRONOGRAMA executivo do projeto — fases,
  tarefas, durações, dependências e marcos — em YAML, com a visualização (Gantt panorâmico)
  gerada direto no build. Ativa quando o usuário disser "cronograma", "linha do tempo",
  "timeline", "gantt", "sprints", "fases e tarefas", "prazo", "planejamento", "roadmap do
  projeto", "quando fica pronto", "caminho crítico", "gargalo/OTP/gate", ou pedir para estimar
  esforço/entrega. É OPT-IN e SOB DEMANDA — NÃO faz parte do pipeline inicial 1–8: só entra
  quando o processo já tem maturidade e o cliente/negócio pede prazos. Dona do SSOT
  `001-docs/cronograma.yaml` (dado) e da CONVENÇÃO de acoplamento ao `build.js` (apresentação
  SSR). Skill transversal e AGNÓSTICA — a máquina serve qualquer projeto; só o dado muda.
---

# Cronograma Executivo

Modela o cronograma do projeto como **dado computável** — fases, tarefas, durações e
dependências em um YAML — e delega a **apresentação** ao build, que desenha um **Gantt
panorâmico** (SVG SSR, zero dependência). O tomador de decisão entende **onde o projeto
está** e **onde fica o gargalo** em menos de 3 segundos, e o time edita **um arquivo** —
nunca o SVG à mão, nunca um Mermaid `gantt` cru.

## Posição no Pipeline

```
OPT-IN / SOB DEMANDA — NÃO roda no pipeline inicial 1–8.
Ative só quando o processo estiver MADURO e houver pedido explícito de prazo/planejamento
(em discovery inicial o processo ainda é instável demais para comprometer datas).

Dado     : 001-docs/cronograma.yaml            (SSOT do cronograma — muda por projeto)
Máquina  : 001-docs/build.js                   (loadCronograma + renderCronogramaSvg — agnóstica)
Marcador : bloco ```cronograma no doc          (gating por-doc; corpo carrega só OPÇÕES)
Página   : project.yaml → docs.files.cronograma (ex.: 075-cronograma-executivo.md)

Insumos (inteligência já gerada) : state_machine · failures · contract · domain_events
Próximo passo                    : executive-technical-synthesis (o cronograma entra no PDD/resumo)
```

> **Por que fora do pipeline inicial:** cronograma é compromisso. Comprometer datas antes de
> o domínio estar estável (passos 1–6) gera retrabalho e ruído executivo. Só se cria cronograma
> quando as [[failure-analysis]], [[state-modeling]] e [[contract-engineering]] já deram base técnica.

---

## Regra de ouro (não-negociável, agnóstica)

> **O dado mora no YAML; a apresentação mora no build.** Ninguém desenha Gantt à mão, ninguém
> versiona PNG de cronograma, ninguém depende de Mermaid `gantt` cru para a visão executiva.
> Editar o cronograma = editar `cronograma.yaml`. Ausente ⇒ o build roda igual (no-op).

Isso é o mesmo princípio do [[glossario]] (dado em `glossary.yaml`, máquina no `build.js`):
**copiar a skill + `build.js` para outro cliente e trocar só o `cronograma.yaml`** já entrega o recurso.

---

## O SSOT: `001-docs/cronograma.yaml`

Fonte única do cronograma. Modelo (parseado com `js-yaml`, já dependência do build):

```yaml
meta:
  projeto: "Sprints de Automação — EnvioBoletos"
  versao: "1.0.0"
  frequencia: "3 Semanas · Dias úteis"   # vira badge no header do card (opcional)
  inicio: "2026-08-03"                    # opcional — ativa o eixo por DATA (dd/mm)
  hoje: "2026-08-07"                      # opcional — posição da linha vertical de progresso

fases:
  - id: FASE_01
    nome: "S1 · Fundação"
    dependencias: []          # dependência entre FASES (metadado; o layout usa depende_de das tarefas)
    cor: "#6366F1"            # opcional — sobrescreve a cor da paleta semântica
    tarefas:
      - id: TSK_101
        nome: "Setup + variáveis de ambiente"
        responsavel: "Agente - RPA"
        duracao_estimada: 3d   # m | h | d  (ex.: 30m, 2h, 3d, 1.5d) — ou número (minutos)
        depende_de: []         # ids de tarefas predecessoras
      - id: TSK_102
        nome: "loginFNET (OTP)"
        responsavel: "Agente - RPA"
        duracao_estimada: 2d
        depende_de: [TSK_101]
        critico: true          # gargalo REAL na trilha → barra com contorno vermelho
      - id: TSK_G
        nome: "Gate de aprovação"
        duracao_estimada: 0
        depende_de: [TSK_102]
        tipo: gate             # checkpoint de BLOQUEIO (zero-duração) → círculo vermelho
      - id: TSK_M
        nome: "Go-Live em produção"
        duracao_estimada: 0
        depende_de: [TSK_G]
        tipo: milestone        # MARCO (zero-duração) → losango violeta
```

### Semântica dos campos

| Campo | Efeito |
|---|---|
| `duracao_estimada` | `m`/`h`/`d` (d = dia de 24h) ou número (min). Alimenta o **forward-pass**. |
| `depende_de: [ids]` | Agenda `start = max(fim das dependências)`. É o que ordena e conecta as barras. |
| `critico: true` | Tarefa de trabalho que é o **gargalo** → barra com **contorno vermelho**. |
| `tipo: gate` | Checkpoint de bloqueio (aprovação/OTP) → **círculo vermelho** (use `duracao_estimada: 0`). |
| `tipo: milestone` | Marco (Go-Live) → **losango violeta** (use `duracao_estimada: 0`). |
| `fase.cor` | Sobrescreve a cor da paleta para aquela trilha. |
| `meta.inicio` | Se presente (ISO), o eixo X vira **datas dd/mm**; senão, unidade abstrata (D1, D2 / S1, S2…). |

### Agendamento (forward-pass, sem datas obrigatórias)

O build calcula `start` de cada tarefa como o **máximo dos términos das suas `depende_de`**
(memoizado, com guarda de ciclo). Não é preciso informar datas — só durações e dependências.
`meta.inicio` é opcional e serve apenas para rotular o eixo por data. **`critico` é editorial**:
marque o gargalo real (o que trava a entrega) — deriva da [[failure-analysis]], não é chute.

---

## Como o build consome (acoplamento — mesmo padrão de mermaid/bpmn)

1. **Load (uma vez):** `loadCronograma('001-docs/cronograma.yaml')` → objeto ou `null`.
2. **Marcador no doc:** um bloco ` ```cronograma ` (gating por-doc). O **corpo** carrega só
   **opções de apresentação** — o DADO fica no SSOT. Bloco vazio = cronograma inteiro com defaults.
   ```
   ```cronograma
   today: 2026-08-10   # opcional — sobrescreve meta.hoje SÓ neste doc
   ```
   ```
3. **Render (build-time):** o build troca `<pre><code class="language-cronograma">…</code></pre>`
   pelo `<div class="cronograma-card">…<svg>…</svg></div>` de `renderCronogramaSvg`. **SSR puro**:
   nada de CDN, nada de JS no cliente → funciona **offline** e em **export PDF/print**.
4. **No-op seguro:** sem `cronograma.yaml`, o bloco vira uma nota discreta e o build passa igual.

> **Verificação:** `cd 001-docs && npm run build` e `grep -c 'cronograma-card' dist/<doc>.html`.
> Visual: `python3 .claude/skills/run-rocketbot-probe/driver.py` e olhe o print da página.

---

## Spec de apresentação (implementada no `renderCronogramaSvg`)

O visual segue a spec executiva — **time-to-insight < 3s**, zero *chartjunk*:

- **Layout panorâmico** (`viewBox 1200×H`, `width:100%`, scroll-x no mobile), card `#F8FAFC`,
  respiro de 24px. Rótulos **100% horizontais** numa **coluna fixa à esquerda**.
- **Paleta semântica** (não decorativa): fase cicla **Indigo `#6366F1` → Blue `#3B82F6` →
  Emerald `#10B981`**; **marco = Violet `#8B5CF6`** (losango); **gate/gargalo = Red `#EF4444`**;
  **hoje = vermelho da marca `#BC0017`**; dependência = `#94A3B8` tracejada sutil.
- **Redução de entropia:** eixo Y invisível (os rótulos alinham implícito); **1 gridline sutil
  por virada de semana** (opacidade ~6%); **1 linha de "hoje"** (1.5px, acento).
- **Barras:** `rx 6`, gap ~10px entre trilhas; duração **dentro** da barra quando cabe, senão à direita.
- **Marcos/gates:** losango ⬥ (Go-Live) e círculo ● (bloqueio) — glyphs distintos, rótulo na coluna esquerda.
- **Dependências:** elo tracejado (`4 3`, opacidade ~0.55) do predecessor primário → início da tarefa, sem cruzar texto.

Para mudar a **aparência** (paleta, geometria, granularidade do eixo), edite `renderCronogramaSvg`
em [build.js](001-docs/build.js) — **não** duplique estilo no doc. Para mudar o **conteúdo**, edite o YAML.

---

## Fonte da verdade das estimativas (não invente prazos)

Duração, dependências e gargalos **derivam da inteligência já produzida** — e de considerações
técnicas sobre as ferramentas. **Antes de comprometer números:**

- **Ordem e pré-condições** → [[state-modeling]] (máquina de estados) e [[domain-event-extraction]].
- **Gargalos / gates** → [[failure-analysis]]: um SPOF (ex.: login com **OTP**, sistema `source_of_truth`)
  vira `critico: true` ou `tipo: gate`. O gate executivo (aprovação humana) também é um `gate`.
- **Passos de integração e handoffs** → [[contract-engineering]] e `project.yaml → systems[]`.
- **Viabilidade na ferramenta** → **consulte os MCPs disponíveis** que dizem respeito às ferramentas
  operadas (ex.: o MCP **windows** para aferir automação de desktop/Rocketbot, telas, esperas). Uma
  duração só é honesta se a técnica por trás dela foi checada — não estime "no olho".

Registre no [[glossario]] toda sigla nova que o cronograma introduzir (ex.: `OTP`, `Shadow`).

---

## Manutenção viva

- **Gatilho de ativação:** o cliente pediu prazo, ou o processo amadureceu e o PDD precisa de um
  cronograma. Aí — e só aí — crie `cronograma.yaml` + o doc com o bloco ` ```cronograma `.
- **Numeração:** o doc segue [[docs-file-ordering]] (NNN step-10). `075-cronograma-executivo.md`
  posiciona entre os entregáveis (070+). Registre o slug em `project.yaml → docs.files.cronograma`.
- **Progresso:** mova `meta.hoje` conforme o projeto avança — a linha vermelha conta a história.
- **Build ao final:** compile/publique via [[rpa-docs-builder]].

## Anti-patterns

- **Cronograma no discovery inicial.** Comprometer datas com o domínio instável (passos 1–6) → retrabalho.
- **Gantt cru / PNG / Mermaid `gantt` para a visão executiva.** É o "cru" que esta skill substitui — sem controle sobre labels horizontais, today-line e losangos.
- **Estilo no doc.** Nada de CSS/estilo de cronograma no Markdown; a apresentação é 100% do `build.js`.
- **Prazo chutado.** Duração sem base nas docs/MCPs é ficção executiva. Derive de falhas, estados, contratos e viabilidade na ferramenta.
- **Datas hardcoded quando não precisa.** O forward-pass agenda por dependência; `meta.inicio` é só rótulo de eixo.
- **`tipo: gate`/`milestone` com duração > 0.** Gates e marcos são pontos (duração 0). Trabalho que é gargalo usa `critico: true` numa barra.

## Checklist

- [ ] Ativação é **sob demanda** (processo maduro / pedido explícito) — não entrou no pipeline inicial.
- [ ] `cronograma.yaml` válido: `meta` + `fases[].tarefas[]` com `duracao_estimada` e `depende_de`.
- [ ] Gargalos marcados (`critico`/`tipo: gate`) derivam da [[failure-analysis]]; marcos como `tipo: milestone`.
- [ ] Durações/dependências fundamentadas nas docs e nos **MCPs das ferramentas** — não chutadas.
- [ ] Doc com bloco ` ```cronograma ` registrado em `project.yaml → docs.files.cronograma` (NNN step-10).
- [ ] `npm run build` + `grep -c 'cronograma-card' dist/<doc>.html` = 1; print revisado (sem corte/overlap).
- [ ] Sem `cronograma.yaml`, o build ainda passa (no-op) — prova de agnosticismo.
- [ ] Siglas novas do cronograma registradas no [[glossario]].
