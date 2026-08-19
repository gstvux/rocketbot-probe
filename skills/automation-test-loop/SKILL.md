---
name: automation-test-loop
description: >
  Use esta skill para tornar uma automação TESTÁVEL — quando o ciclo hoje é "roda tudo, olha a tela,
  torce" e cada tentativa custa dado real, licença de execução ou uma janela de sessão remota.
  Ativa em "como testar o robô", "testar sem sujar produção", "o teste demora demais", "não sei em
  que passo quebrou", "rodar só uma etapa", "demo para o cliente", "retomar de onde parou",
  "evidência da execução". Ensina os três modos de run (mock/piloto/produção) numa chave só, a
  configuração de dev que sobrevive ao deploy, o log append-only que vira retomada e evidência, e
  as pausas por etapa que servem de demo ao vivo. Agnóstica de ferramenta de RPA.
---

# Fazer a automação ser testável

Automação de interface tem um ciclo de teste hostil: cada rodada consome dado real, deixa registro
no sistema do cliente, depende de uma sessão remota que expira, e às vezes de licença com número
finito de execuções. O resultado padrão é o pior possível: **testa-se pouco, testa-se tudo de uma
vez, e quando quebra ninguém sabe em que passo.**

As quatro peças abaixo custam pouco para construir e mudam o custo de cada tentativa.

## A regra que faz esta skill valer a pena

> **Uma chave só decide de onde vem o dado, e ela vive fora do artefato versionado.** Sem isso,
> testar exige editar o robô — e aí você nunca testa o que vai para produção.

---

## 1. Três modos de run, uma chave

| Modo | Dado | Escreve no sistema do cliente? | Serve para |
|---|---|---|---|
| `mock` | gerado, sintético | sim, mas com marca clara | validar **navegação e orquestração** sem depender de dado real |
| `piloto` | real | sim, **com prefixo/marca** identificável | provar ponta a ponta e poder limpar depois |
| `prod` | real | sim, sem marca | operação |

O caminho de amadurecimento de uma automação é literalmente esse: `mock` → `piloto` → `prod`, e o
objetivo declarado do projeto é **tirar a marca** — quando `piloto` roda limpo, `prod` é a mesma
coisa sem o prefixo. Isso dá ao cliente um critério de pronto que ele entende.

Duas armadilhas que aparecem sempre:

- **A marca de teste tem que ser escape hatch, não default.** Se o prefixo ficar ligado por padrão,
  ele vaza para o modo mock e você acaba com registros `TMOCK123` sem entender por quê.
- **O contador do mock não pode viver dentro do artefato versionado.** Produção é pull-only: o
  `reset --hard` do deploy descarta o incremento, todo run pós-deploy repete o mesmo código e colide
  com registro já existente. Contador vive em **arquivo gitignored**, ao lado do artefato.

---

## 2. `dev.json` — configuração que sobrevive ao deploy

Uma fonte única para tudo que é *setting de desenvolvimento*: modo, escala de waits, quantidade do
mock, ponto de partida do contador, pausas.

```jsonc
{
  "modo": "mock",              // mock | piloto | prod
  "wait_escala": 1.3,          // multiplica TODA espera (ambiente lento = 1.5)
  "mock_qtd": 5,
  "mock_codigo_inicio": 400,
  "pausa": "off",              // off | etapa | grupo
  "//test_tag": "escape hatch: se presente, prefixa até no mock"
}
```

Três propriedades não-óbvias, e cada uma resolve um incidente conhecido:

1. **Fica `gitignored`, com um `dev.json.example` versionado.** Assim ele **sobrevive ao
   `git reset --hard`** do deploy — reset não toca em arquivo ignorado. É por isso que ele é o
   lugar certo para configuração de máquina.
2. **Leitura com fallback em cadeia**: `dev.json` → variável da ferramenta → default embutido no
   código. Nunca quebra por ausência do arquivo.
3. **A leitura precisa existir em todo artefato que a usa.** Um helper chamado mas não definido num
   dos robôs, com `try/except` engolindo o erro, faz o arquivo ser **silenciosamente ignorado**
   naquele ponto — o robô roda com o default e você depura o sintoma errado. Se você tem
   `try/except` em volta da leitura de config, logue a exceção.

**Waits escaláveis:** toda espera é `sleep(N * escala)` com o valor original em comentário, nunca
um wait fixo da ferramenta. Ambiente lento vira **um número** no `dev.json`, não uma varredura por
30 comandos. Durante remapeamento, ~30% a mais de folga evita falso negativo por latência.

---

## 3. Log append-only: retomada e evidência pelo mesmo arquivo

Um evento por etapa, uma linha JSON, append-only, em arquivo gitignored:

```bash
python3 skills/automation-test-loop/scripts/runlog.py registrar --etapa login --status ok --ref NF-12345 --modo piloto
python3 skills/automation-test-loop/scripts/runlog.py resumo         # o que passou, o que falhou, quanto demorou
python3 skills/automation-test-loop/scripts/runlog.py proximo --de itens.txt --campo ref   # o que ainda não rodou
```

O mesmo arquivo entrega três coisas:

- **Onde quebrou** — sem reler log de tela nem depender do que estava na janela.
- **Retomada** (`proximo`): rodar de novo processa só o que faltou. Em automação que leva horas ou
  depende de sessão que expira, isso é a diferença entre retomar e recomeçar.
- **Evidência para o cliente**: contagem por status, duração, referências processadas. Vira relatório
  sem trabalho extra.

---

## 4. Pausas por etapa: o modo demo

Uma chave (`pausa: etapa | grupo`) faz a automação **parar e anunciar** o que acabou de fazer antes
de seguir. Serve a dois públicos ao mesmo tempo:

- **Depuração**: parar no ponto exato, inspecionar a tela do sistema, continuar.
- **Demo ao vivo**: o texto da pausa vem da **descrição do próprio bloco** — se as descrições
  estiverem bem escritas, você ganha uma apresentação legendada de graça, sem construir nada só
  para a demo.

Investir na descrição de cada grupo deixa de ser burocracia e passa a ter retorno duplo: legenda da
demo e documentação viva.

---

## 5. Testar um pedaço só

Rodar um bloco isolado é o ganho maior de velocidade — e a fonte mais comum de falso negativo:

- **O sistema alvo precisa estar no estado inicial daquela etapa.** Bloco isolado sobre estado sujo
  falha por contexto, não por bug. Escreva o **procedimento exato de reset** no runbook do projeto
  (a sequência de teclas/cliques que devolve o sistema ao ponto de partida) — é o artefato mais
  reusado de um projeto desses.
- **Bloco que começa com envio de tecla não é testável isolado** quando a ferramenta manda a
  primeira tecla ~0,6s após o play: não dá tempo de trazer a janela certa para frente e as teclas
  caem no lugar errado. Valide esses rodando o fluxo inteiro, que começa com uma espera folgada.
- **Foco da janela é pré-requisito, não detalhe.** Reconhecimento de imagem fotografa a tela toda:
  se o alvo estiver atrás do editor, a automação procura a needle na janela errada e falha com
  "imagem não encontrada" — um erro que parece bug de automação e é bug de foco.

---

## 6. O loop que funciona

```
1. dev.json: modo=mock, pausa=etapa       (barato, sem dado real)
2. rodar -> falhou -> ler runlog + shot   (nunca "olhar e adivinhar")
3. corrigir no DEV, nunca em produção     (rocketbot-git-transport)
4. gate: drift.sh + snapshot em dia       (drift-guard)
5. deploy -> RECARREGAR o Studio          (senão testa a versão velha)
6. repetir até verde; então modo=piloto; depois prod
```

O passo 5 é o que mais se esquece e o que mais custa: sem recarregar, você mede a versão anterior e
conclui que a correção não funcionou.
