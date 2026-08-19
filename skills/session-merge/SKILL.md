---
name: session-merge
description: >
  Use esta skill ao incorporar uma sessão de discovery NOVA a uma base de documentação que JÁ
  EXISTE — quando chega a 2ª call, a call de dúvidas, um documento entregue depois, ou qualquer
  insumo que precisa se somar ao que já foi documentado. Ativa quando o usuário disser "chegou
  mais uma call", "nova sessão", "processar a session-N", "incorporar esse documento",
  "atualizar os docs com o que veio agora", "rodar o pipeline de novo", "isso muda o que a
  gente documentou?", ou ao encontrar sessão com `status: pending` em project.yaml. Skill
  transversal — governa a regra de merge em TODOS os passos 1–8, não só na transcrição.
---

# Session Merge — Incorporação Incremental de Sessões

Requisito raramente chega inteiro numa call. Vem a call inicial, depois as dúvidas, depois o
manual que o cliente esqueceu de mandar. Esta skill define **como o conhecimento novo entra na
base sem destruir o que já estava lá** — em cada um dos oito passos do pipeline.

## Posição no Pipeline

```
Transversal — aplica-se a TODO passo 1–8 sempre que a base já tem conteúdo.

Entrada  : project.yaml → discovery.sessions[] com `status: pending`
           sources_dir/<slug>/                    (material bruto da sessão)
Base     : docs.root/*                            (o que já foi documentado)
Saída    : os mesmos docs, ENRIQUECIDOS + `status: processed` na sessão

Passo 1 é o único com arquivo próprio por sessão (transcription-forensics).
Passos 2–8 têm UM artefato acumulativo cada — é neles que o merge acontece.
```

---

## Regra de ouro (não-negociável)

> Uma sessão nova **soma**. Ela confirma, detalha, refina e acrescenta. Ela **nunca**
> sobrescreve em silêncio o que uma sessão anterior estabeleceu — e **nunca** apaga um fato
> por não tê-lo repetido. Ausência de menção não é revogação.

Papéis (`discovery.sessions[].role`):

- **`ssot`** — a 1ª sessão. Referência base do processo macro.
- **`detail`** — as seguintes. Confirmam e detalham ao nível de campo.

---

## As quatro classes de conhecimento novo

Antes de escrever qualquer coisa, classifique **cada afirmação** da sessão nova contra a base:

| Classe | O que é | Ação |
|---|---|---|
| **NOVO** | não existe na base | acrescentar, marcando a fonte |
| **CONFIRMA** | a base já diz isso | não duplicar — adicionar a fonte à evidência existente (e promover o nível de evidência, se era inferência) |
| **REFINA** | a base diz o mesmo, porém mais vago | **substituir** pela versão precisa, citando a sessão que precisou |
| **CONTRADIZ** | a base diz o oposto | **preservar as duas versões** com nota e data — e escalar ao humano |

Só a classe REFINA autoriza reescrever texto existente. CONTRADIZ nunca resolve sozinho:

```markdown
> ⚠️ **CONFLITO** — `session-1` (2026-01-15): aprovação é do gestor da área.
> `session-3` (2026-02-03): aprovação é do financeiro acima de R$ 10 mil.
> Não reconciliado — confirmar com o cliente antes de implementar.
```

---

## Marcação de proveniência

Todo conhecimento acrescentado por sessão de detalhe carrega sua origem — é o que permite
auditar depois de onde veio cada regra:

```markdown
Fonte: session-2 (2026-01-22) · [[U0147]]
```

Para sessões `type: document`, cite arquivo + página/seção no lugar do ID de fala:
`Fonte: session-3 (2026-02-03) · [manual-operacional.pdf, p.4]`.

---

## O que "incorporar" significa em cada passo

| # | Skill / artefato | Incorporar significa |
|---|---|---|
| 1 | `transcription-forensics` | **Arquivo próprio por sessão** (SSOT em `010-…`, detalhes em `011-…`, `012-…`). É o único passo que não funde: nunca sobrescreva a transcrição do SSOT. |
| 2 | `domain-event-extraction` | Evento inédito → nova entrada. Evento já catalogado que a sessão detalha (gatilho, ator, payload, irreversibilidade) → **enriquecer a entrada existente**. Nunca renomear evento já canonizado — se o nome mudou, é colisão de glossário (passo 3). |
| 3 | `semantic-canonicalization` | Termo inédito → nova entrada. Termo que é sinônimo de um existente → **alias**, não entrada nova. Mesmo termo com significado diferente → **colisão explícita**: registre as duas leituras e o contexto de cada uma; não escolha. |
| 4 | `state-modeling` | Estado ou transição inédita → adicionar. Transição que a sessão contradiz → marcar CONFLITO, **não apagar**. Guarda inédita (condição para transitar) → adicionar à transição existente. |
| 5 | `failure-analysis` | Falha inédita → nova entrada com evidência classificada. Falha antes `INFERIDA` que a sessão confirma → **promover a `EXPLÍCITA`** e citar a fala. Rebaixamento de nível de evidência nunca é silencioso. |
| 6 | `contract-engineering` | Campo inédito → adicionar. Restrição mais precisa (`"data válida"` → `"dia útil, D+1 a D+90, não retroativa"`) → **substituir a versão vaga** citando a sessão: isso é REFINA, o caso típico de uma call de dúvidas. |
| 7 | `diagram-as-code` / `bpmn-2-0-generator` | **Regerar** a partir do modelo atualizado. Diagrama é derivado, não fonte — jamais edite o diagrama sem atualizar antes o estado/evento que o origina. |
| 8 | `executive-technical-synthesis` | Regerar as seções afetadas do PDD e dos entregáveis. `delta_info` ganha uma entrada com **o que esta sessão mudou** e o que ainda ficou em aberto. |

---

## Protocolo

1. **Localize** as sessões `status: pending` em `project.yaml → discovery.sessions[]`.
2. **Carregue a base** antes de tocar nela (skill `read-docs`) — merge sem contexto vira
   duplicação.
3. **Processe o passo 1** da sessão: `transcribe.py --session <slug>` (`video`/`meeting`) ou
   leitura direta dos arquivos (`document`) → arquivo de transcrição próprio.
4. **Classifique** cada afirmação nas quatro classes acima.
5. **Aplique** passo a passo (2→8), seguindo a tabela, marcando proveniência.
6. **Feche o ciclo**: `status: processed` + `processed_at` no `project.yaml`, entrada no
   `delta_info`, e `npm run build` para o portal refletir.
7. **Reporte** ao humano: o que entrou, o que refinou, e **a lista de conflitos não
   reconciliados** — essa lista é o entregável mais importante do merge.

---

## Checklist de validação

- [ ] Nenhum fato da base anterior desapareceu sem nota explícita.
- [ ] Todo acréscimo tem fonte (`session-N` + ID de fala ou arquivo/página).
- [ ] Nenhuma entrada duplicada por sinônimo (checado contra o glossário).
- [ ] Conflitos preservados com as duas versões, datados, e escalados — nenhum resolvido no chute.
- [ ] Diagramas regerados a partir do modelo, não editados à mão.
- [ ] `status` e `processed_at` atualizados no `project.yaml`.

---

## Quando NÃO usar

- **Primeira sessão de um projeto** (base vazia) — não há o que fundir; rode o pipeline 1–8 direto.
- **Correção pontual** de um doc a pedido do usuário, sem insumo novo de sessão.
- **Inferências do dev** em `discovery/` — aquela pasta é livre-forma e não passa por merge
  governado (ver `CLAUDE.md`).

---

## Por que a regra é conservadora

O custo dos dois erros é assimétrico. Duplicar uma informação gera ruído que uma revisão
resolve em minutos. Apagar uma regra de exceção que o cliente mencionou uma única vez, na
call 1, e que ninguém repetiu depois, gera um robô que falha em produção — e a evidência de
que a regra existia já não está mais em lugar nenhum. Na dúvida, **preserve e marque**.
