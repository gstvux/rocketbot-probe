---
name: cdp-browser-control
description: >
  Use esta skill sempre que a automação (ou você, agente) precisar OPERAR um navegador de verdade —
  logar em portal, preencher formulário, baixar arquivo, clicar numa tela renderizada dentro da aba —
  em vez de raspar HTTP. Ativa quando aparecer "chrome cdp", "remote-debugging-port", "playwright",
  "computer use no browser", "automatizar portal", "baixar do portal", "o robô não consegue clicar",
  "screenshot da automação". Ensina o padrão de Chrome dedicado com perfil isolado + porta CDP, a
  escolha entre manipular por DOM ou por coordenada, as armadilhas que falham em silêncio (escala
  dpr, janela minimizada, download cancelado, id que drifta) e a governança de nunca agir às cegas.
  Agnóstica de portal e de domínio: o driver não conhece o site, quem conhece é o seletor que você passa.
---

# Controle de navegador por CDP

O Chrome expõe, na porta `--remote-debugging-port`, o mesmo protocolo que o DevTools usa. Isso dá
um canal de automação que **não é um navegador fantasma**: é o Chrome real, com o login real do
usuário, cookies reais, certificado real. Para portais de governo, ERPs web e sessões remotas
corporativas isso deixa de ser conveniência e vira o **único** caminho viável — porque o login
frequentemente exige MFA, biometria ou certificado que ninguém vai automatizar.

## A regra que faz esta skill valer a pena

> **Nunca agir às cegas.** Toda ação é precedida de uma leitura do estado real (screenshot ou HTML),
> e seguida de uma linha no journal. Se o cenário esperado não apareceu, esperar e reler — nunca
> clicar "de memória" nem reaproveitar coordenada de sessão anterior.

Automação de navegador falha em silêncio: o clique acontece, a página não era aquela, e o erro só
aparece três passos adiante como algo sem relação. A leitura antes de cada decisão é o que troca
"o robô fez besteira e ninguém viu" por "o robô parou e mostrou onde".

---

## 1. Subir o Chrome dedicado (uma vez por sessão de trabalho)

```bash
bash skills/cdp-browser-control/scripts/chrome-up.sh --profile C:\\chrome-cdp --port 9222 --url https://portal.exemplo/login
```

Três decisões embutidas nesse script, e por que elas importam:

| Decisão | Por quê |
|---|---|
| **Perfil isolado** (`--user-data-dir` próprio) | A automação nunca derruba a sessão pessoal do usuário. São dois Chromes, dois perfis, duas vidas. |
| **Flags anti-backgrounding** | Sem elas o Chrome suspende o renderer quando a janela sai de vista e **a captura trava sem erro**. |
| **Aspas simples em cada flag** (no bash → Windows) | Sem elas o shell come a barra invertida e `--user-data-dir=C:\perfil` vira `C:perfil`: o Chrome sobe com perfil errado e o CDP não responde. Já custou login descartado. |

Confirme que subiu antes de qualquer outra coisa — e declare o atalho que o resto desta skill usa
(os caminhos são a partir da **raiz do projeto**):

```bash
CDP="node skills/cdp-browser-control/scripts/cdp.mjs"
$CDP tabs
```

Se o Chrome abrir em `chrome://intro/` em vez da URL pedida, force a aba: `$CDP goto <url>`.

---

## 2. Escolher o modo: DOM ou coordenada

Esta é a decisão mais importante da automação, e ela é ditada pelo que está dentro da aba.

| O que está na aba | Modo | Comando | Por quê |
|---|---|---|---|
| Uma **aplicação web** (formulário, tabela, menu) | **DOM** | `fill` / `click <seletor>` / `waitfor` | Seletor é estável, legível e não depende de resolução, tema ou posição de janela. |
| Um **desktop remoto renderizado** (sessão RDP/VNC/PAM dentro de um `<canvas>`) | **Coordenada** | `xclick x y` / `type` / `key` | Não há DOM: o conteúdo é um bitmap. Ver a skill `remote-session-control`. |

**Default é DOM.** Só cai para coordenada quando o DOM não existe. Coordenada é frágil por natureza:
muda com resolução, com zoom, com tamanho de janela.

---

## 3. O ciclo de trabalho

```bash
$CDP shot                       # 1. ler o estado  -> shots/NNN.png
$CDP html --out page.html       #    (ou o HTML, p/ descobrir seletor)
$CDP fill '#usuario' 'fulano'   # 2. agir
$CDP click 'button:has-text("Entrar")'
$CDP waitfor '#painel' 20000    # 3. confirmar que o próximo estado chegou
```

Comandos do driver:

| Comando | Faz |
|---|---|
| `tabs` / `frames` / `url` / `info` | inventário: abas, frames, URL corrente, viewport+dpr |
| `shot [--out f]` | screenshot numerado em `shots/` |
| `html [--out f]` | HTML da página/frame — é assim que se descobre seletor |
| `goto <url>` | navega |
| `fill <sel> <valor>` / `click <sel>` / `attr <sel> <attr>` | manipulação por DOM |
| `exists <sel>` / `waitfor <sel> [ms]` | verificação de estado |
| `type "<texto>"` / `press <Tecla>` / `key <Combo>` | teclado no foco atual (`Alt+F`, `Ctrl+C`) |
| `xclick <x> <y> [--double\|--right]` / `scroll <x> <y> <dy>` | manipulação por coordenada |
| `eval "<js>"` | JS na página; retorna JSON |
| `download <sel> [--dir d]` | clica e espera o arquivo cair na pasta (ver §4) |

Duas flags valem para quase todos: `--frame <nome|url>` escolhe o frame; `--tab <regex>` escolhe a
aba. **A ordem importa: o comando vem antes das flags.**

---

## 4. As cinco armadilhas que falham em silêncio

**1. Escala: screenshot em pixel de dispositivo, clique em pixel CSS.**
Com `devicePixelRatio = 1.25`, um screenshot de 1920×912 corresponde a uma página de 1536×730.
Clicar na coordenada lida no screenshot erra o alvo por 25%. O driver já converte — **passe sempre
a coordenada que você leu na imagem**, nunca faça a conta à mão. Confira o dpr da sessão com `info`.

**2. Janela minimizada mata a captura.** Medido: janela na frente, atrás de outras, ou em outra área
de trabalho → captura em ~200ms. **Minimizada → timeout.** Cobrir é permitido, minimizar não é.

**3. Download "cancela" sozinho no modo connectOverCDP.** O `saveAs` do Playwright não funciona
quando você conectou num Chrome existente. Use `Page.setDownloadBehavior {behavior:'allow',
downloadPath}` + **polling da pasta** — é o que o comando `download` faz. Espere o arquivo aparecer
E parar de crescer; um `.crdownload` de 0 byte não é entrega.

**4. Id gerado por framework drifta.** Ids do tipo `j_idt42`, `ctl00_ContentPlaceHolder`, hashes de
build: mudam entre releases e às vezes entre sessões. **Ancore em texto visível
(`button:has-text("Consultar")`), em `id$="sufixo_estavel"` ou em `name`** — nunca no id volátil.

**5. Frameset esconde o conteúdo.** Se `html` volta pequeno e sem os campos, você está no frame
errado: rode `frames`, ache o certo, e passe `--frame`. Atalho que economiza muito: depois de
logado, **navegar direto para a URL interna** costuma carregar o formulário standalone, sem frame
nenhum — teste isso antes de escrever navegação de menu.

---

## 5. Trilha auditável

Toda ação que muda estado grava uma linha em `journal.jsonl` (timestamp, ação, seletor/coordenada,
screenshot resultante) e todo screenshot é numerado em `shots/`. Isso serve a três coisas de uma
vez: depurar o que o robô fez, **provar** para o cliente que a automação rodou, e gerar o material
de vídeo/print da demo sem sessão extra de gravação.

Quando o gravador de tela der problema (é comum: fonte de captura errada no OBS entrega vídeo
preto), lembre que **o CDP é um canal de captura independente** — uma sequência de screenshots em
intervalo fixo vira vídeo com `ffmpeg` e serve de evidência igual.

```bash
ffmpeg -framerate 4 -pattern_type glob -i 'shots/*.png' \
       -c:v libx264 -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" evidencia.mp4
```

Diagnóstico útil quando o vídeo sai preto e você precisa descartar a hipótese cara ("é proteção de
conteúdo do portal"): `YMAX = 16` uniforme em todos os frames é preto de referência exato — sinal
uniformemente preto é **fonte de captura errada**, não tela escura, não DRM.

```bash
ffmpeg -v error -i video.mp4 -vf "fps=1/10,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=-" -f null -
```

---

## 6. Playwright ou CDP cru?

O driver tem os dois caminhos porque os dois quebram em situações diferentes:

- **Playwright** (`connectOverCDP`) — melhor ergonomia: seletores ricos, auto-wait, frames.
  **Quebra** quando o Chrome expõe alvos de UI interna (popups de omnibox em versões recentes): o
  handshake de nível de browser trava no timeout, mesmo com folga de 45s.
- **CDP cru** (WebSocket direto na aba, `ws://.../devtools/page/<id>`) — imune a isso, porque
  fala no nível da página e nunca enumera o browser. Mais verboso, mas não trava.

O `cdp.mjs` **usa CDP cru por padrão** e só carrega Playwright quando o comando pede seletor rico.
Se um comando DOM travar no handshake, `CDP_RAW=1` força tudo por CDP cru.

---

## 7. Limites — o que NÃO fazer por aqui

- **Não automatizar autenticação que pertence ao humano**: MFA com biometria, token físico,
  certificado em cartão. Abra o navegador no ponto certo e passe a bola. Ver `secrets-hitl`.
- **Não usar screenshot de tela cheia do SO** (`mcp__windows__Screenshot` e similares) quando você
  está no modo não-invasivo — essas ferramentas fotografam o desktop inteiro do usuário, que é
  exatamente o que se quer evitar. Ver `remote-session-control`.
- **Não deixar a automação apagar/alterar coisa em produção por navegador** sem confirmação humana.
  Mudança estrutural nasce no dev e viaja pela ponte git (`rocketbot-git-transport`).
