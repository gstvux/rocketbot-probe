---
name: docs-file-ordering
description: >
  Use esta skill para nomear, numerar ou ordenar arquivos de documentação em projetos RPA Rocketbot
  — especialmente arquivos na pasta 001-docs/. Aplica a convenção NNN step-10 (sparse step-10
  zero-padded naming) que garante ordenação consistente em filesystem, GitHub, VS Code e agentes LLM.
  Ativa quando o usuário disser "como nomear os docs", "inserir um doc entre dois existentes",
  "ordenação de arquivos", "qual prefixo usar", ou ao criar qualquer novo .md na pasta 001-docs/.
  Skill transversal — aplica-se em qualquer passo do pipeline 1–8.
---

# Convenção de Ordenação de Arquivos de Documentação

## Posição no Pipeline

```
Transversal — aplica-se em qualquer passo 1–8 ao criar novos arquivos

Diretório principal : project.yaml → docs.root
Catálogo atual      : project.yaml → docs.files  (slugs → nomes de arquivo)
Documento principal : project.yaml → docs.files.pdd
```

> Para ver os nomes e prefixos reais dos arquivos deste projeto, consulte `project.yaml`.

---

## Objetivo

Garantir que arquivos `.md` de documentação ordenem de forma **idêntica** em: filesystem (`ls`), GitHub Explorer, VS Code, ferramentas de build, e agentes LLM — sem lógica customizada de sort em nenhuma dessas camadas.

---

## A Convenção: NNN step-10

### Estrutura

```
000-[slug].md          ← âncora zero / documento raiz
010-[slug].md          ← seção 1 (doc principal)
011-[slug].md          ← sub-doc 1.1
012-[slug].md          ← sub-doc 1.2
...
019-[slug].md          ← sub-doc 1.9 (teto da seção)
020-[slug].md          ← seção 2 (doc principal)
...
090-[slug].md          ← seção 9
100-[slug].md          ← seção 10 — escala natural sem quebrar o padrão
```

### Regras

1. **Docs principais** usam múltiplos de 10 exatos: `000, 010, 020, 030...`
2. **Sub-docs** preenchem os gaps: `011–019`, `021–029`, `031–039`...
3. **Prefixo sempre 3 dígitos com zero-padding**: `010`, nunca `10`
4. **Docs meta** (sem posição lógica na sequência) ficam fora do esquema numérico e usam nomes descritivos:
   - Documento principal do processo: `PDD-nome-do-processo.md`
   - Análises datadas: `YYYY-MM-DD-slug.md`
   - Esses arquivos naturalmente sortam ao final — comportamento correto e intencional

---

## Capacidade

| Nível | Slots |
|---|---|
| Seções principais (`000` a `990`) | 100 |
| Sub-docs por seção | 9 |
| Total dentro do padrão | até 990 documentos |

Para uma documentação de processo técnico, 990 é praticamente ilimitado.

---

## Por que funciona: isomorfismo de sort

O zero-padding de 3 dígitos garante que **lexicográfico = numérico = visual**:

```
"010" < "011" < "019" < "020"   ← qualquer comparador de string
```

GitHub Explorer, `ls`, e um agente LLM lendo um diretório chegam à mesma ordem sem nenhuma heurística. O número é autoexplicativo: `floor(n / 10)` = grupo, `n % 10` = posição dentro do grupo.

---

## A Regra do Fracture Point

Se uma seção precisar de mais de 9 sub-docs, **o sistema está sinalizando que o tópico cresceu demais para ser subdivisão**. A resposta correta é **arquitetural**: elevar o conteúdo para uma nova seção principal.

```
❌ Errado: criar 0110, 0111... ou sufixos como 019a, 019b
✅ Certo:  promover para 020, empurrar as seções seguintes
```

O teto de 9 é uma propriedade desejável — impede que seções cresçam sem controle e força organização.

---

## Sort em ferramentas de build

Usar sort de string puro. **Nunca `parseFloat`**:

```javascript
// ✅ CORRETO — lexicográfico preserva o padrão intacto
.sort((a, b) => a.localeCompare(b))

// ❌ ERRADO — parseFloat("0015") = 15, quebra a ordenação
.sort((a, b) => parseFloat(a) - parseFloat(b))
```

---

## Raízes do Padrão

Não tem nome canônico único. É uma composição de três sistemas:

| Sistema | Contribuição |
|---|---|
| **BASIC Line Numbering** (1964) | O passo-10 para permitir inserção sem renumerar em cascata |
| **Johnny.Decimal** (2018) | Hierarquia 2-níveis; teto de 10 itens como sinal arquitetural |
| **Dewey Decimal Classification** (1876) | Hierarquia encodada nos próprios dígitos do número |

Nome descritivo: **"sparse step-10 zero-padded naming"**.
