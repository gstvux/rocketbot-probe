---
name: handoff
description: >
  Use esta skill para PASSAR UM PROCESSO DE UM DEV PARA OUTRO — quando alguém assume o projeto,
  quando o dono sai, entra de férias, divide o trabalho ou precisa entregar ao time/cliente. Ativa
  em "vou sair do projeto", "o fulano vai assumir", "passar o processo pra outra pessoa", "manda
  pro time", "como entrego isso", "compartilhar a documentação", "empacotar o projeto", "handoff",
  "transferir", "não tenho repo no GitHub", "está tudo só na minha máquina". Decide o meio pelo
  que a pessoa que RECEBE vai fazer (ler vs. assumir o desenvolvimento) e funciona mesmo em
  projeto que nunca teve remote — sem exigir conta, permissão ou disciplina prévia.
---

# Handoff — passar o processo adiante

## Por que esta skill existe

Passar um processo de um dev para outro é o problema que este kit resolve. A base de conhecimento
em `001-docs/` existe exatamente para que quem recebe não dependa da cabeça de quem entrega.

Só que isso **falha por um motivo banal**: o trabalho fica numa pasta na máquina de uma pessoa.
Não é falta de ferramenta — é que exigir `git remote` no dia 1 é exigir disciplina que a maioria
não vai manter, e quem projeta contando com essa disciplina projeta para um dev que não existe.

Sua função aqui é fechar essa lacuna **no momento em que ela aparece**, com o que o dev tem em
mãos naquela hora: um repositório local, possivelmente sem remote, possivelmente sem commit desde
ontem.

## Antes de qualquer coisa: consolidar

Não empacote trabalho não commitado. Rode e resolva:

```bash
cd "$(git rev-parse --show-toplevel)"
git status --short
git log --oneline -5
```

Havendo pendência, commite (`docs: consolidação para handoff`). Confira também que nenhum segredo
ou mídia entrou: `git ls-files | grep -iE 'cred|\.env|\.pem|\.pfx|\.mp4|\.xlsx'` deve voltar vazio.

## Escolher o meio pelo que quem recebe vai FAZER

Esta é a decisão, e ela não é sobre ferramenta — é sobre destino. Pergunte se ainda não souber.

| Quem recebe vai… | Meio | Comando |
|---|---|---|
| **Ler / entender** o processo (gestor, analista, cliente, dev avaliando) | **portal publicado** — link, sem instalar nada | `cd 001-docs && npm run publish` |
| **Assumir o desenvolvimento**, e o projeto **não tem remote** | **bundle** — um arquivo, histórico inteiro | ver abaixo |
| **Assumir o desenvolvimento**, e o projeto **tem remote** | push + acesso | `git push -u origin main` |

**Na dúvida, faça os dois primeiros.** O portal é o que a pessoa abre em 10 segundos; o bundle é o
que ela precisa na semana seguinte. Custam um comando cada.

### Bundle — para quem nunca criou remote

```bash
git bundle create ../<projeto>-handoff.bundle --all
```

Um arquivo, todo o histórico, **nenhuma conta ou permissão envolvida**. Mande por onde já mandam
arquivo (Drive, chat corporativo, pendrive). Do outro lado:

```bash
git clone <projeto>-handoff.bundle <projeto>
cd <projeto> && ./install-skills.sh && (cd 001-docs && npm install)
```

E aí quem recebeu abre o Claude Code na pasta e usa a skill `onboarding` — o diagnóstico dela vai
acusar docs presentes e insumo ausente, que é exatamente o estado de um projeto herdado.

## O que atravessa e o que não atravessa

O `.gitignore` do kit já dá o recorte certo — **não o contorne para "mandar tudo"**:

| Atravessa | Fica para trás | Por quê |
|---|---|---|
| `001-docs/` — docs do pipeline | `sources/` — vídeo/áudio bruto | pesado, e a transcrição já é a fonte soberana |
| `001-docs/transcription/*.txt` | credenciais, `.env`, certificados | segredo não viaja em pacote (skill `secrets-hitl`) |
| `discovery/` — inferências do dev | `dev.json`, `run-log.jsonl` | estado de execução é da máquina, não do processo |
| `project.yaml`, `glossary.yaml` | `node_modules/`, `dist/` | reconstruíveis com um comando |

**Sobre `sources/` não viajar:** é correto e deliberado, mas **avise quem recebe**. Se a gravação
original for necessária depois (uma dúvida que a transcrição não fecha), ela mora com quem
entregou — combine onde ficam. É uma linha na entrega e poupa uma busca depois.

## O que a documentação não transfere

Seja honesto sobre o limite. Mesmo com a base completa, três coisas ficam com quem sai — nomeie-as
explicitamente na entrega, porque nenhuma delas sai do repositório:

1. **Acessos e credenciais** — nunca estão no repo, por desenho. Liste *o que* é preciso e *com
   quem* se pede; a transferência é com o time de segurança/cliente, não no pacote.
2. **A relação com o cliente** — quem responde dúvida, quem aprova, quem realmente decide.
3. **O que ainda é incerto** — o que está marcado `INFERIDA`/`HIPOTÉTICA` nos docs e as perguntas
   em aberto. Se você entrega como se estivesse tudo fechado, quem recebe descobre a lacuna em
   produção.

Gere um resumo curto dessas três coisas junto do pacote. É a única parte do handoff que não sai
automática do repositório.

## Checklist

- [ ] `git status` limpo, histórico com os passos do pipeline
- [ ] nenhum segredo ou mídia em `git ls-files`
- [ ] portal publicado, link em mãos (se alguém vai só ler)
- [ ] bundle gerado e testado com `git clone` num diretório temporário
- [ ] resumo dos três não-transferíveis (acessos, relação, incertezas) escrito
- [ ] combinado onde ficam as gravações originais
