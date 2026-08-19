---
name: rocketbot-git-transport
description: >
  Use esta skill para transportar uma solução do Rocketbot Studio entre máquinas usando git —
  do dev para o servidor de produção — quando não existe pipeline de deploy nativo. Ativa em
  "levar o robô para produção", "deploy do robô", "robot.db", "o robô é diferente lá e aqui",
  "como versionar automação", "rollback do robô", "transportar a automação", "ponte git". Ensina o
  modelo dev→remote→produção PULL-ONLY, como tornar o `robot.db` (SQLite com JSON em base64)
  legível para o git via snapshot, o que fica FORA do repositório, e o passo que todo mundo esquece
  e que faz o teste medir a versão errada: recarregar o Studio depois do pull.
---

# Transportar a automação por git

O Rocketbot Studio guarda os robôs num **`robot.db`** — um SQLite onde cada robô é uma linha e o
corpo do robô é JSON codificado em base64. Ele não foi feito para ser transportado: o fluxo
"natural" é exportar/importar à mão, ou editar direto no servidor. Os dois caminhos produzem o
mesmo resultado — ninguém sabe o que está rodando em produção.

Git resolve isso, mas só se você resolver antes um problema: **para o git, o `robot.db` é um blob
binário.** Dois commits seguidos mostram "arquivo alterado" e mais nada. Sem diff não há revisão,
não há bisect, não há rollback confiável.

## As duas regras que fazem esta skill valer a pena

> **1. Produção é PULL-ONLY.** Nunca se edita no servidor. Toda mudança nasce no dev, viaja por
> commit, e a produção só puxa.
>
> **2. Commite o `robot.db` E o snapshot.** O db é o que executa; o snapshot `.json` é o que se lê,
> revisa e compara. Um sem o outro perde metade do valor.

---

## 1. Geografia (não confundir os três lugares)

| Lugar | O que é | O que se faz |
|---|---|---|
| **dev** | sua máquina: Studio local + clone do repo | edita, testa, commita, `push` |
| **remote** | repositório privado (git) | transporta e guarda o histórico |
| **produção** | o servidor do cliente, alcançável só pela sessão remota | `git pull`, roda, lê log. **Nunca commita.** |

Se o Studio local grava num caminho e o repo em outro, você tem **duas cópias físicas do mesmo
robô** — e drift latente. Ou aponte o Studio para dentro do clone, ou trate a cópia como alvo de
deploy verificado (skill `drift-guard`).

---

## 2. Tornar o `robot.db` legível para o git

```bash
python3 skills/rocketbot-git-transport/scripts/robotdb.py list     robot.db              # o que tem dentro
python3 skills/rocketbot-git-transport/scripts/robotdb.py snapshot robot.db --out robots/  # 1 .json por robô + _index.json
git add robot.db robots/ && git commit -m "cadastro: trata retorno vazio do portal"
```

O snapshot normaliza o que muda a cada save sem mudar comportamento (`id`, `index`, `line`,
`screenshot`) — sem isso, todo save vira ruído de diff e o gate perde valor. O que sobra é o robô
de verdade: comandos, parâmetros, variáveis, grupos.

A partir daí o git funciona como funciona em qualquer código:

```bash
git diff HEAD~1 -- robots/meuRobo.json    # exatamente qual comando mudou
git log --oneline -- robots/meuRobo.json  # a história daquele robô
```

Comparar duas máquinas, ou o db contra o que está commitado:

```bash
python3 skills/rocketbot-git-transport/scripts/robotdb.py diff dev/robot.db prod/robot.db --detalhe
python3 skills/rocketbot-git-transport/scripts/robotdb.py diff robot.db --snapshot robots/     # exit 1 se divergir
```

O `exit 1` é o que faz esse comando servir de **gate de pre-push**: se o snapshot não está em dia
com o db, o push para.

---

## 3. O pipeline completo

**1) Editar no dev.** Pelo Studio local, ou por script contra o SQLite, ou pelo MCP do Rocketbot.
Se o Studio estiver aberto, **prefira o MCP a mexer no SQLite direto** — o Studio reescreve a
versão em memória por cima da sua edição e o trabalho some.

**2) Snapshot + push.**
```bash
python3 skills/rocketbot-git-transport/scripts/robotdb.py snapshot robot.db --out robots/
python3 skills/rocketbot-git-transport/scripts/robotdb.py diff robot.db --snapshot robots/   # tem que sair limpo
git add -A robot.db robots/ assets/ && git commit -m "..." && git push
```

**3) Pull na produção** (pela sessão remota; ver `remote-session-control`):
```powershell
.\deploy.ps1 -Repo C:\rocketbot-repo
```
O script faz backup do db atual, descarta a sujeira local (**rodar o robô ALTERA o `robot.db`** —
o Studio grava estado de execução nele), puxa, e replica os assets. Pull-only: nada de commit ou
push do lado de produção.

**4) Recarregar o Studio — o passo que todo mundo esquece.**
O Studio executa **a partir da memória**, não relê o disco sozinho. Depois de um pull, ou você
recarrega o projeto pela tela inicial, ou fecha e reabre. **Sem isso o teste mede a versão
anterior** e você depura um bug que já tinha sido corrigido. Se aparecer "unsaved changes" ao
recarregar, aceitar descartar — a memória velha é justamente o que se quer jogar fora.

**5) Ler o resultado pelo visualizador de log embutido**, não abrindo terminal elevado no servidor.

---

## 4. O que NÃO entra no repositório

| Fica fora | Por quê | Onde vive |
|---|---|---|
| Credenciais, tokens, certificados | segredo não se versiona (`secrets-hitl`) | arquivo fora do repo, no servidor |
| Contadores, estado de execução, `run-log` | produção é pull-only: `git reset --hard` **apaga** o incremento e o robô repete o mesmo código, colidindo com registro já existente | arquivo **gitignored** ao lado do db |
| Configuração de dev (waits, modo mock) | precisa **sobreviver ao reset** — reset não toca em arquivo ignorado | `dev.json` gitignored + `dev.json.example` versionado |
| Saídas: planilhas, PDFs, downloads | volume e dado do cliente | pasta de trabalho ignorada |

**Entram**: `robot.db`, `robots/` (snapshot), imagens/needles usadas em runtime, scripts auxiliares,
e o script de deploy.

**Cuidado com o esquema de duas fontes:** o `robot.db` guarda no comando apenas o **nome do
arquivo** da imagem; o runtime abre o PNG no disco. Se o db aponta uma needle cujo PNG não foi
replicado, o robô quebra em runtime com "arquivo não encontrado" — e o db está "correto". Por isso
as imagens moram no repo e o deploy as replica; e por isso existe verificação antes do push
(`drift-guard`).

---

## 5. Rollback

É o argumento que vende o modelo para quem decide:

```bash
git log --oneline -- robot.db          # achar o commit bom
git checkout <sha> -- robot.db robots/ # voltar só o robô
```
e na produção, `deploy.ps1` de novo. Backups automáticos ficam em `robot.db.bak-<timestamp>` a cada
deploy — se o pull der errado, o estado anterior está a um `Copy-Item` de distância.

Para trazer **um arquivo só** do remote sem levar o deploy inteiro:
`git fetch origin -q && git checkout origin/main -- <arquivo>`.
