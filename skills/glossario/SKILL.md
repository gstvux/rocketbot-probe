---
name: glossario
description: >
  Use SEMPRE que precisar criar/atualizar o glossário do projeto, decodificar siglas, ou
  garantir que HTML gerado explique termos "no hover". Ativa quando o usuário disser
  "glossário", "página de glossário", "atualizar o glossário", "surgiu um termo novo",
  "decodificar sigla", "tooltip", "title no hover", "reduzir carga cognitiva das docs", ou
  ao introduzir um acrônimo/nome de lógica interna novo em qualquer doc. Dona do SSOT
  `glossary.yaml` (que alimenta os `title` nativos injetados pelo build) e da CONVENÇÃO
  de decodificação no hover. Skill transversal e AGNÓSTICA — a máquina serve qualquer
  projeto/cliente; só o dado (glossário) muda. Complementa `semantic-canonicalization`
  (que faz o clustering de termos do discovery) mantendo o glossário vivo daí em diante.
---

# Glossário & Decodificação no Hover

Reduz a **carga cognitiva** das docs: todo acrônimo, abreviação ou menção a uma
lógica/nomenclatura interna do projeto é **decodificado no hover** por um atributo `title`
nativo — o leitor passa o mouse e entende, sem sair da página e sem re-explicação inline.
Definido **uma vez** no glossário; aplicado em **todo** HTML gerado.

## Posição no Pipeline

```
Transversal — rode sempre que surgir termo novo e ao final de cada iteração de docs.

Dado    : 001-docs/glossary.yaml            (SSOT dos títulos — muda por projeto)
Máquina : 001-docs/build.js                 (injeta `title` em todo doc — agnóstica)
Config  : convenção — o SSOT é 001-docs/glossary.yaml (sem arquivo de config à parte)
Página  : 001-docs/025-glossario-canonico.md (glossário humano, sincronizado com o SSOT)
```

---

## Regra de ouro (não-negociável, agnóstica)

> **Nada de sigla/abreviação/nomenclatura interna aparece "cru".** Toda ocorrência carrega um
> **`title` nativo** que a decodifica. O tooltip é o `title` do browser — **zero dependência**:
> nenhuma lib de tooltip, nenhum CSS-framework, nenhum JS de hover, nenhum CDN.

Elemento por tipo:

| Tipo (`kind`) | Elemento | Quando |
|---|---|---|
| `acronym` | `<abbr title="…">SIGLA</abbr>` | siglas/abreviações (SSOT, HITL, BPMN, PDD…) |
| `term` | `<span class="gloss" title="…">termo</span>` | lógica/nomenclatura interna (barramento, nomes de variáveis internas, códigos de processo…) |

`<abbr>` é semanticamente **errado** para não-siglas — por isso `term` usa `<span class="gloss">`.
Nas páginas do portal isso é **automático** (o `build.js` injeta). Ao escrever HTML **à mão**
(páginas interativas, e-mails, etc.), aplique a mesma convenção puxando o texto do SSOT.

---

## O SSOT: `001-docs/glossary.yaml`

Fonte única da verdade dos `title`. Formato mínimo (parser dedicado no `build.js`, sem lib):

```yaml
terms:
  - term: PDD
    kind: acronym          # acronym → <abbr> | term → <span class="gloss">
    title: "Process Design Document — documento de referência do processo"
    aliases: "Process Design Document"   # opcional; vírgula ou [a, b]
  - term: barramento
    kind: term
    title: "Nome interno do hand-off entre dois robôs (o que um produz, o outro consome)"
```

Regras do `title`: **curto** (por extenso + gloss de 1 linha, ~≤90 chars). A explicação **longa**
(aliases, conflitos, notas) mora no `025`. Aspas no `title` são escapadas pelo build. Chaves
ordenadas da mais longa para a mais curta na hora de casar (evita `SOT` comer `SSOT`); limites de
palavra respeitam acento; interior de código, links, headings e `<abbr>` já existentes **não** é tocado.

**Como o build consome:** `build.js` lê `glossary_file`, monta o anotador uma vez e injeta o `title`
em cada nó de texto de todo doc. **Arquivo ausente ⇒ no-op** (o build roda igual). É isso que torna a
feature **portável**: copiar a skill + `build.js` para outro cliente e trocar só o `glossary.yaml`.

---

## Manutenção viva (o glossário cresce com o projeto)

**Gatilho:** cunhou/encontrou um acrônimo, abreviação ou nome de lógica interna novo em **qualquer**
doc? → **adiciona uma entrada em `glossary.yaml`** (e a linha humana correspondente no `025`).
Isso vale para você e deve estar embutido nas skills que produzem docs
(`semantic-canonicalization`, `executive-technical-synthesis`, `rpa-docs-builder`).

**Sincronia `glossary.yaml ↔ 025`:** todo termo do SSOT tem entrada humana no `025` e vice-versa.
Ao divergir, o lint aponta.

## Lint / scan de termos não-definidos

Rode para achar candidatos ainda fora do SSOT (recipe inicial — ajuste ao projeto):

```bash
# Acrônimos (2+ maiúsculas, com dígitos opcionais) presentes nos docs mas ausentes do glossário
comm -23 \
  <(grep -rhoE '\b[A-Z]{2,}[0-9]*\b' 001-docs/*.md | sort -u) \
  <(grep -oE '[A-Z]{2,}[0-9]*' 001-docs/glossary.yaml | sort -u)
```

Revise a lista à mão (nem todo CAPS é termo). Para lógica interna (minúsculas: `barramento`,
prefixos de variáveis, códigos de processo) o scan é editorial: ao ler os docs, capture o que um
recém-chegado não entenderia e promova ao SSOT.

## Gerar/atualizar a página humana (`025`)

O `025-glossario-canonico.md` é a visão rica (tabelas `termo_canonico | aliases | nota`). Mantenha-o
como superconjunto legível do SSOT: cada `- term:` do YAML tem uma linha lá, com a nota longa. Ao
adicionar termos técnicos/robô, agrupe-os em seções próprias (ex.: **Robôs & Variáveis**).

---

## Anti-patterns

- **Tooltip com dependência.** Qualquer lib/JS/CSS-framework de tooltip é proibido — só o `title` nativo.
- **`<abbr>` em não-sigla.** Use `<span class="gloss">` para lógica/nomenclatura interna.
- **Termo hardcoded na máquina.** `build.js` e as skills nunca citam termo de cliente; só `glossary.yaml`/`025` carregam dado.
- **`title` longo demais.** Curto no hover; o detalhe vai pro `025`.
- **Definir e não propagar.** Termo novo que não entra no SSOT deixa a doc "crua" de novo.
- **Re-explicar inline.** Em vez de reescrever "PDD = Process Design Document" em cada doc, deixe o `title` decodificar.

## Checklist

- [ ] Todo acrônimo/nomenclatura interna tem entrada em `glossary.yaml` (`kind` correto).
- [ ] `title` curto; explicação longa no `025`.
- [ ] `npm run build` e `grep -oE 'title="[^"]*"' dist/<doc>.html` mostram os termos decodificados.
- [ ] Zero dependência nova (`title` nativo; sem CDN/lib).
- [ ] Sem `glossary.yaml`, o build ainda passa (no-op) — prova de agnosticismo.
- [ ] `glossary.yaml` e `025` em sincronia (lint sem divergência).
