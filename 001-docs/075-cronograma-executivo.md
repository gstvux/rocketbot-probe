# Cronograma Executivo

Visão panorâmica das sprints de automação — **onde o projeto está** e **onde fica o
gargalo** em menos de 3 segundos. Os dados vivem no SSOT `cronograma.yaml`; a
visualização abaixo é gerada no build (SVG, sem dependência) a partir das durações e
dependências de cada tarefa.

```cronograma
```

## Como ler

- **Trilhas (S1 · S2 · S3):** cada fase é um bloco de cor semântica — Fundação (Indigo),
  Miolo & Shadow (Blue), Validação (Emerald). A cor sinaliza o momento do projeto.
- **Contorno vermelho:** tarefa **crítica** — o gargalo real na trilha (ex.: `loginFNET (OTP)`).
- **Círculo vermelho ●:** *gate* de bloqueio (checkpoint de aprovação, duração zero).
- **Losango violeta ◆:** *marco* / milestone (ex.: **Go-Live em produção**).
- **Linha vermelha vertical:** **hoje** — o progresso atual contra o planejado.
- **Elos tracejados:** dependências (a saída de um bloco alimenta a entrada do próximo).

## Onde mexer

| Quero mudar… | Edito… |
|---|---|
| Tarefas, durações, dependências, fases | `001-docs/cronograma.yaml` (SSOT) |
| Posição da linha de "hoje" só neste doc | opção `today:` dentro do bloco ` ```cronograma ` |
| Cor de uma fase | campo `cor:` na fase, em `cronograma.yaml` |
| A aparência do gráfico (paleta, geometria) | `renderCronogramaSvg` em `001-docs/build.js` |

> As estimativas de duração e as dependências **não** são chutadas: derivam das docs já
> geradas (máquina de estados, análise de falhas, contratos de integração) e das
> considerações técnicas sobre as ferramentas. Ver a skill **`cronograma`**.
