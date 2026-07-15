---
name: transcription-forensics
description: >
  Use esta skill ao receber transcrições de reuniões, vídeos de levantamento, gravações de áudio ou notas
  brutas de processo RPA — especialmente para projetos Rocketbot. Ativa quando o usuário disser
  "transcrição", "limpar o texto", "sanitizar reunião", "o que foi dito", "extrair do vídeo", "reunião
  gravada", ou ao trabalhar com a pasta de docs de um projeto de automação (leia o root em project.yaml → docs.root). Esta skill é o passo 1 do
  pipeline de documentação RPA: transforma fala bruta em fonte de verdade estruturada sem distorção
  semântica — preservando entidades, decisões, intenções e contexto que uma limpeza descuidada destruiria.
---

# Transcription Forensics

## Posição no Pipeline

```
Passo 1 / 8

Entrada : project.yaml → discovery.sessions[].slug  → <transcription_dir>/<slug>.txt
          project.yaml → discovery.sessions[]        (metadados de cada sessão)
Saída   : project.yaml → docs.files.transcription           (sessão SSOT)
          project.yaml → docs.files.transcription_duvidas   (sessões de detalhe)

Pré-requisitos : nenhum — é o ponto de partida do pipeline
Próximo passo  : domain-event-extraction (→ domain_analysis, domain_events)
```

> **Convenção de nomes:** use `docs-file-ordering` para prefixar arquivos.
> Transcrições brutas ficam em `project.yaml → docs.transcription_dir`.

---

## Múltiplas sessões de discovery

O processo de levantamento pode ter **mais de uma sessão** (call inicial + calls de
dúvidas/detalhamento). Cada uma é uma entrada em `discovery.sessions[]`:

- `role: ssot` — a 1ª sessão, referência base do processo.
- `role: detail` — sessões seguintes que **confirmam e detalham** o SSOT (nível de campo).

Cada sessão gera sua própria transcrição sanitizada (arquivo numerado próprio — ex.
`010-…` para o SSOT, `011-…` para a 1ª call de dúvidas). **Nunca** sobrescreva a transcrição
do SSOT ao processar uma sessão de detalhe. Para transcrever uma sessão específica:

```
python3 <transcription_dir>/transcribe.py --session <slug>   # --list mostra os slugs
```

**Regra de merge nos passos 2–8:** uma sessão de detalhe deve *confirmar/afinar* o que o SSOT
já estabeleceu — marque a origem (ex. "Fonte N / <data>") e **não** reescreva o processo macro
já validado; em conflito real entre sessões, preserve ambas as versões com nota e data.

---

## Transcrição prévia do cliente (export de ferramenta de reunião)

Às vezes o cliente entrega um `.txt` já "transcrito" pela ferramenta de reunião dele
(`discovery.sessions[].client_transcript`) — tipicamente no formato *nome do falante + timestamp + prosa*,
que **não** segue nosso padrão enriquecido nem tem garantia de fidelidade fonética.

**Não confie nela como fonte primária.** Em vez disso, **reconcilie**:

1. Re-transcreva o vídeo/áudio com **nosso método** (`transcribe.py` → Deepgram Nova-2) → `.txt` enriquecido.
2. Use o export do cliente como **referência de nomes reais e timestamps** (a diarização nossa só dá `FALANTE_N`).
3. Use a **nossa** transcrição como **referência de fidelidade** do que foi dito (termos de domínio, números, códigos).
4. Produza a transcrição sanitizada final cruzando as duas: nomes/papéis do cliente + fidelidade nossa, anotando
   divergências relevantes com `[DIVERGÊNCIA: cliente="…" / nosso="…"]`.

Resumos prévios gerados por IA do cliente (ex. ata) **não** são fonte — só servem para *cross-check*; nunca
importe afirmação que a transcrição/vídeo não sustente.

---

## Formato de Entrada Enriquecido (Deepgram Nova-2 com diarização)

O arquivo `.txt` gerado por `transcribe.py` tem a seguinte estrutura:

```
=== METADADOS ===
Projeto   : <nome do projeto>
Cliente   : <cliente>
Data      : <session_date>
Duração   : <segundos>s (<minutos>min)
Falantes  : N identificados
Modelo    : nova-2 (pt-BR)
Request ID: <uuid>

=== TRANSCRIÇÃO ===

[U0001] [MM:SS–MM:SS] [FALANTE_0] [conf: 0.98]
Texto agrupado do bloco de fala.

[U0002] [MM:SS–MM:SS] [FALANTE_1] [conf: 0.95]
Texto agrupado do bloco de fala.
```

**Regras de leitura:**
- `[U000N]` — ID único do bloco de fala (utterances consecutivos do mesmo falante agrupados)
- `[FALANTE_N]` — label automático de diarização; N não é ordenado por hierarquia, só por aparição
- `[conf: X.XX]` — confiança média do bloco (0.0–1.0); blocos com conf < 0.80 merecem revisão
- Blocos do mesmo falante sem interrupção são agrupados numa única entrada

**Passo adicional no Step 1 — mapeamento de falantes:**

Logo no início da análise forense, construa um mapa `FALANTE_N → nome real` a partir das primeiras autoidentificações no texto (ex: "eu sou o [nome]", "aqui é o [nome]"). Inclua esse mapa no topo do arquivo de saída (leia o nome em `project.yaml → docs.files.transcription`):

```markdown
## Mapeamento de Falantes
| Label | Nome | Papel |
|---|---|---|
| FALANTE_0 | [nome identificado] | [cargo / papel no processo] |
| FALANTE_1 | [nome identificado] | [cargo / papel no processo] |
| FALANTE_2 | [nome identificado] | [cargo / papel no processo] |
```

A partir desse mapeamento, substitua os labels pelo nome real em toda a transcrição sanitizada.

---

## Objetivo

Extrair dado bruto de transcrições **sem distorção semântica**. O risco principal não é deixar sujeira — é limpar demais e destruir significado.

## Princípio fundamental

Você está lidando com linguagem falada convertida em texto. Essa linguagem é ambígua por natureza (pronomes soltos, elipses, referências implícitas), rica em contexto implícito (o que não foi dito pode ser tão importante quanto o que foi), e frágil sob edição (uma "limpeza" pode apagar a evidência de uma decisão, conflito ou compromisso).

Seu trabalho é o de um **perito forense**, não de um editor. Preserve tudo que pode ser evidência.

## O que preservar sempre

**Entidades nomeadas** — pessoas, sistemas, datas, valores, departamentos: mesmo que apareçam com grafia inconsistente (ex: "o ERP", "o sistema", "o SAP" podem ser a mesma coisa — anote a ambiguidade, não resolva arbitrariamente).

**Termos de domínio** — palavras do negócio com semântica específica: "prorrogação", "aprovação", "bloqueio", "liberação" têm peso jurídico e operacional. Não substitua por sinônimos genéricos.

**Marcadores de incerteza e condição**: "acho que", "se aprovado", "depende do financeiro" são informação, não ruído. Apagá-los transforma hipótese em fato.

**Conflitos e hesitações**: quando alguém corrige a si mesmo ("não, na verdade é..."), preserve ambas as versões com nota.

## O que tratar como ruído real

Apenas remova o que não carrega informação: preenchedores puros sem contexto ("ahn", "né", "tá" soltos), repetições exatas de palavras de articulação, e ruído técnico de transcrição — mas **anote** onde ocorreram os trechos inaudíveis.

## Processo de análise

### 1. Leitura forense (antes de qualquer edição)
Leia a transcrição completa sem alterar nada. Identifique quem fala (mapeie vozes/nomes), qual o assunto central, e onde há ambiguidades estruturais.

### 2. Anotação de ambiguidades
Para cada trecho ambíguo, crie uma nota lateral:
```
[AMBIGUIDADE: "ele aprovou" — quem é "ele"? Candidatos: João (CFO), Pedro (Gerente)]
```

### 3. Extração estruturada
Organize o conteúdo preservado em: participantes confirmados, decisões declaradas (verbos no passado + confirmação explícita), intenções sinalizadas (verbos no futuro/condicional), pendências identificadas, e entidades mencionadas (sistemas, documentos, valores, datas).

### 4. Flag de qualidade
```
QUALIDADE DA TRANSCRIÇÃO:
- Trechos inaudíveis: N
- Ambiguidades não resolvidas: N
- Entidades com referência incerta: [lista]
```

## Anti-patterns a evitar

Não faça: substituir jargão por linguagem "mais clara", resolver pronomes ambíguos sem evidência explícita, remover repetições que revelam ênfase, normalizar datas/valores sem confirmar a fonte, ou parafrasear em vez de transcrever.

**Exemplo:**
> Original: "o financeiro falou que tá analisando ainda, né, mas que provavelmente vai aprovar se o jurídico liberar"
> ❌ Errado: "Financeiro vai aprovar."
> ✅ Certo: "Financeiro em análise, aprovação condicional à liberação do Jurídico [PENDÊNCIA: confirmar prazo]"

## Ferramentas mentais

- **Linguística computacional**: trate cada palavra como token com peso semântico
- **Speech-to-text QA**: questione homófonos e erros de transcrição automática
- **Semantic preservation**: antes de alterar qualquer trecho, pergunte — "o que se perde se eu remover isso?"
