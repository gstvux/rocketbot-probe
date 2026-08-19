---
name: drift-guard
description: >
  Use esta skill quando o mesmo arquivo existir em DOIS lugares — o repositório onde se edita e a
  pasta de onde a ferramenta realmente executa — e não houver sincronia automática entre eles.
  Ativa em "minha mudança não teve efeito", "está diferente lá e aqui", "drift", "editei direto no
  servidor", "qual versão está rodando", "o robô não reflete o código". Ensina a transformar essa
  duplicação inevitável num risco controlado: fonte única declarada, verificação por sha256 antes
  de rodar, e gate que trava o push. Agnóstica de linguagem e ferramenta — vale para scripts,
  imagens, binários, banco de configuração.
---

# Drift: a divergência que ninguém vê acontecer

Automação quase nunca executa de onde você edita. O código vive no repo (WSL, seu editor, o git),
mas a ferramenta lê de outro caminho (`D:\...\scripts`, `C:\Rocketbot\robots\...`, uma pasta que o
Studio aponta). São **duas cópias físicas do mesmo arquivo**, sem sincronia automática.

O drift nasce sempre igual, e nunca por má-fé: alguém edita direto no destino porque é mais rápido
("só testar rapidinho"), o teste passa, e ninguém copia de volta. O repo fica **cego** para aquela
mudança. Semanas depois, o deploy sobrescreve o destino e a correção desaparece — ou pior, o repo
recebe uma mudança que nunca foi testada de verdade.

## A regra que faz esta skill valer a pena

> **Uma fonte de verdade declarada, e a cópia provada por hash antes de rodar.** Não é disciplina,
> é verificação: `git` é a fonte, o destino é alvo de deploy, e nada roda sem `GATE VERDE`.

Disciplina sozinha não resolve — todo mundo tem boa intenção e mesmo assim o drift acontece. O que
resolve é a verificação ser **barata e automática**: um comando de dois segundos que dá verde ou
vermelho.

---

## 1. Declarar os pares

Copie `skills/drift-guard/scripts/drift.example.json` para a raiz do projeto como `drift.json` e liste cada par
fonte→destino:

```json
{
  "pares": [
    { "rotulo": "scripts", "fonte": "robot/scripts", "destino": "/mnt/d/.../scripts", "glob": "*.py" },
    { "rotulo": "robot.db", "fonte": "robot.db",     "destino": "/mnt/c/Rocketbot/robot.db" }
  ]
}
```

O ato de escrever esse arquivo já entrega metade do valor: ele **documenta** onde a automação
realmente executa. Em projeto herdado, essa informação costuma estar só na cabeça de alguém.

---

## 2. Rodar o gate

```bash
./skills/drift-guard/scripts/drift.sh                 # verifica tudo
./skills/drift-guard/scripts/drift.sh --fix           # realinha destino pela fonte (nunca o contrário)
./skills/drift-guard/scripts/drift.sh --quiet         # só o resumo, para hook
```

```
OK         scripts/coletar.py
DRIFT      scripts/login.py
           fonte   9bc63f3e495030aa  robot/scripts/login.py
           destino 1db65cc84535d882  /mnt/d/.../scripts/login.py
---
ok=1  drift=1  ausente/sem-fonte=0
GATE VERMELHO — nao rode o robo nem faca push antes de resolver.
```

Exit `0` verde, `1` drift, `2` erro de configuração — pronto para virar gate.

**`--fix` copia sempre fonte → destino.** Se a versão boa está no destino (você editou lá), traga-a
para o repo **à mão e revisando**, antes de rodar `--fix`. O `--fix` não pergunta.

---

## 3. Onde plugar (os três momentos que pegam 95% dos casos)

**Antes de rodar o robô.** É o mais valioso. Um `DRIFT` aqui mata, em dois segundos, o "por que o
robô não reflete minha mudança?" que consumiria meia hora no meio de uma execução.

**Antes do push** — hook local, uma linha:
```bash
printf '#!/usr/bin/env bash\n./skills/drift-guard/scripts/drift.sh --quiet\n' > .git/hooks/pre-push
chmod +x .git/hooks/pre-push
```

**No CI**, se houver runner com acesso aos dois caminhos. Onde não houver (caso comum: o destino é
o servidor do cliente), o gate roda na máquina de dev antes do deploy — e o resultado vai para o
runbook como evidência ("conferido, 0 drift").

---

## 4. Drift que hash de arquivo não pega

Nem toda divergência é byte a byte. Duas variantes valem atenção:

**Banco/binário que muda a cada save.** O `robot.db` do Rocketbot muda de bytes quando você só abre
e fecha o Studio. Comparar por sha256 daria falso positivo eterno. Use o fingerprint **semântico**:
`robotdb.py fingerprint`/`diff` normaliza o que é volátil (ids, índices) e compara o robô de
verdade. Ver `rocketbot-git-transport`.

**Duas fontes que se referenciam.** O db guarda o *nome* da imagem; o PNG vive no disco. O db pode
estar perfeito e a automação quebrar em runtime porque o PNG não foi replicado para a pasta certa.
Aqui a verificação não é "os dois lados são iguais", é **"toda referência tem alvo"** — vale um
gate próprio que percorre as referências e confere a existência dos arquivos antes do push.

---

## 5. A saída definitiva (quando der)

O gate é analgésico bom, mas a cura é **eliminar a segunda cópia**: apontar a ferramenta para dentro
do clone do git, e o problema deixa de existir. Nem sempre dá (caminho fixo por licença, pasta que
a ferramenta cria sozinha, servidor sem acesso ao repo). Quando não der, o par declarado + gate
verde é o segundo melhor — e é honesto sobre o risco, em vez de fingir que ele não existe.
