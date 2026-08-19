---
name: remote-session-control
description: >
  Use esta skill quando o alvo da automação NÃO estiver na sua máquina — está num servidor do
  cliente alcançado por uma sessão remota que abre dentro de uma aba do navegador (broker de acesso
  privilegiado — cofre de senhas / PAM —, ou um RDP/VNC publicado via web). Ativa em "sessão
  remota", "PAM", "cofre de senhas", "broker de acesso", "acessar o servidor do cliente",
  "operar a máquina de produção",
  "não consigo instalar nada no servidor", "a sessão caiu", "Windows MCP". Ensina o modo
  NÃO-INVASIVO (opera pela aba sem sequestrar o desktop do usuário), onde termina a automação e
  começa o humano, como o fallback de automação de desktop entra sem virar risco, e as regras de
  segurança que evitam estragar um servidor de produção alheio.
---

# Operar um servidor remoto que você não controla

O cenário: o servidor onde a automação roda é do cliente. Não dá para instalar agente, não dá para
abrir SSH, não dá para rodar nada lá dentro. O acesso é uma **sessão remota renderizada numa aba do
navegador local**, publicada por um broker de acesso privilegiado. O que você vê na aba é o desktop
do servidor; o que você clica na aba, o broker encaminha para lá.

Isso muda três coisas de uma vez: a **capacidade** (você só tem pixels e input), o **risco** (é
produção de terceiro) e o **limite** (a entrada é do humano, não sua).

## A regra que faz esta skill valer a pena

> **A sessão é do humano; a operação é sua.** O login (MFA, biometria, token) nunca se automatiza —
> tente contornar e você queima acesso. O que se automatiza é tudo o que vem depois, e por um canal
> que não sequestra a máquina de quem está trabalhando.

---

## 1. Não-invasivo é o modo padrão

Existem dois jeitos de clicar naquela aba, e a diferença não é técnica, é de convivência:

| | **Pela aba (CDP)** — padrão | **Pelo desktop (automação de SO)** — fallback |
|---|---|---|
| Como | input vai direto ao renderer da aba | mouse/teclado reais do sistema operacional |
| Enquanto roda | o usuário **continua trabalhando**: pode cobrir a janela, mandá-la para outra área de trabalho | o usuário **não pode tocar na máquina** |
| Captura | só o conteúdo da aba | **o desktop inteiro do usuário** — inclusive o que não é do projeto |
| Quebra quando | a janela é **minimizada** | raramente |

Chame de **sessão invasiva** o modo em que a automação toma a máquina, e trate isso como exceção. O
default é o CDP: `$CDP xclick / type / key / shot`, com
`CDP="node skills/cdp-browser-control/scripts/cdp.mjs"` (ver `cdp-browser-control`).

**Medido:** janela na frente, atrás de outras janelas ou em outra área de trabalho → captura em
~200ms nos três casos. **Minimizada → timeout.** Cobrir pode; minimizar não.

Por que isso importa além do conforto: capturas de desktop inteiro **vazam a tela do usuário** para
dentro dos artefatos do projeto (screenshots, vídeos, logs enviados ao cliente). O modo pela aba
elimina a classe inteira de problema.

---

## 2. Onde termina a automação e começa o humano

Marque isso explicitamente no runbook do projeto — é o que evita a sessão perdida:

- **Abrir a sessão é HITL.** O broker costuma exigir o link exato de entrada (não aceita outro
  caminho), mais MFA com biometria no celular. Abra o navegador no link e **passe a bola**.
- **A sessão expira sozinha** (na prática, 30–60 min). Quando expira, a aba volta para a tela de
  entrada do broker e toda automação para. Reconectar é HITL; depois disso a automação retoma sem
  ajuste. **Planeje o trabalho em blocos que cabem numa sessão** e grave estado o suficiente para
  retomar de onde parou.
- **Nada de aceitar prompt de elevação (UAC) por conta própria.** Se apareceu, pare e mostre.

---

## 3. Coordenada em sessão remota: reler sempre, nunca reaproveitar

Duas armadilhas, ambas silenciosas:

**Escala.** O screenshot sai em pixels de dispositivo, o clique usa pixels CSS. Com `dpr = 1.25`,
1920×912 na imagem = 1536×730 na página. **Passe a coordenada que você leu no screenshot** — o
driver converte.

**Geometria muda a cada sessão.** O cliente do broker **renegocia a resolução remota** conforme o
tamanho da janela do navegador. Entre duas sessões, uma barra de tarefas pode ir de `y=925` para
`y=893` e um ícone de `x=366` para `x=387`. **Nunca reaproveite coordenada de sessão anterior** —
releia da captura, sempre, em toda sessão nova. Se seu robô tem coordenadas fixas gravadas, ele
está com data de validade.

Corolário prático: quando a automação depender de reconhecimento de imagem (needle), **ancore o
recorte em cromo estável** (bordas, títulos, rótulos) e **nunca no conteúdo que muda de estado** —
o item selecionado de uma lista muda de cor entre execuções e destrói a comparação. Regra que
funciona: comece o recorte **logo abaixo** da área que fica destacada.

---

## 4. O fallback de automação de desktop — quando entra e com que trava

Há um caso em que o CDP não resolve: a captura pela aba trava com a janela **minimizada**, e há
telas do SO (diálogos nativos, seletor de arquivos, prompts de sistema) que não vivem dentro da aba.
Aí entra a automação de desktop do SO (no ambiente Windows, as ferramentas `mcp__windows__*`:
`Screenshot`, `Click`, `Type`, `Scroll`, `App`). Elas operam a **máquina local** — e como a sessão
remota é renderizada nela, operar a janela opera o servidor.

**Três travas obrigatórias nesse modo:**

1. **Screenshot ANTES de todo `Type`.** Confirme o foco. Nunca encadeie clique + digitação sem
   verificar no meio — foco errado num servidor de produção já gerou cascata de dezenas de prompts
   de elevação.
2. **Não clicar em atalho que lance aplicativo elevado.** Para ler log, prefira o visualizador
   embutido da ferramenta ou a ponte git — nunca abrir um terminal elevado.
3. **Não misturar os dois modos na mesma tarefa.** Ou você está no não-invasivo (e então
   `mcp__windows__*` está proibido, porque fotografa o desktop inteiro), ou está no invasivo com o
   usuário avisado. Metade e metade produz screenshot com a tela do usuário no meio do relatório.

Se as ferramentas de desktop não aparecerem na sessão, elas podem estar apenas não carregadas —
procure-as antes de declarar que não dá.

---

## 5. O que nunca se faz pela sessão remota

Mudança estrutural **não nasce em produção**. Editar o robô direto no servidor, apagar arquivo,
alterar configuração pelo Studio remoto: tudo isso é caminho sem rastro e sem volta.

O caminho certo é: **editar no dev → transportar por git → puxar em produção → recarregar**
(skill `rocketbot-git-transport`). Produção é **pull-only**. Assim toda alteração tem autor, data,
diff e rollback — e a sessão remota volta a ser o que deve ser: um lugar de **executar e observar**,
não de editar.

---

## 6. Checklist de abertura de sessão

```
[ ] Chrome dedicado no ar com perfil isolado e porta CDP   -> chrome-up.sh
[ ] Humano logou no broker e abriu a sessão do servidor
[ ] $CDP tabs                -> a aba da sessão aparece
[ ] $CDP info                -> anotar dpr e viewport DESTA sessão
[ ] $CDP shot                -> ler a geometria (barra de tarefas, ícones) DESTA sessão
[ ] Janela não está minimizada (coberta pode)
[ ] Estado do trabalho anterior recuperado (log/journal), não a memória
```

Se algum item falhar, resolva antes de agir. Metade dos incidentes desta classe de projeto nasce de
começar a clicar antes de confirmar que a aba é a certa.
