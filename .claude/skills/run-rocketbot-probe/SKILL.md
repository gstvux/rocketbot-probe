---
name: run-rocketbot-probe
description: Build, serve, run and screenshot the Rocketbot Probe portal (Hub). Use when asked to run/start/build/serve the docs portal, take a screenshot of the Hub or a doc page, verify a build.js / project.yaml / glossary / markdown change renders, or drive the site end-to-end. Also covers transcribe.py (vídeo→transcrição). Termos PT: rodar/subir/compilar/servir o portal, tirar print, ver o Hub.
---

O "app" deste repo é um **portal HTML estático** (o *Hub*): [001-docs/build.js](001-docs/build.js)
compila os Markdown de [001-docs/](001-docs/) — lendo identidade e caminhos de
[project.yaml](project.yaml) — para `001-docs/dist/`, e [001-docs/dev-server.js](001-docs/dev-server.js)
serve `dist/` em `http://localhost:<PORT>`. Você o dirige com o driver Python + Playwright
[.claude/skills/run-rocketbot-probe/driver.py](.claude/skills/run-rocketbot-probe/driver.py),
que **compila, sobe o servidor numa porta livre e tira print de cada página** num comando só.

**Todos os caminhos abaixo são relativos à raiz do repo (`rocketbot-probe/`).**

## Prerequisites

Neste container já estavam presentes: **Node** (v24), **Python 3** (3.13), **ffmpeg** e **xvfb-run**.
O driver não precisa de xvfb — o Chromium do Playwright roda headless.

O único extra é o **Playwright Python + Chromium** (o driver usa isso para abrir a página e tirar print):

```bash
python3 -m pip install --user --break-system-packages playwright   # já instalado aqui: v1.60.0
python3 -m playwright install chromium
```

> `--break-system-packages` é necessário neste sistema (PEP 668 bloqueia `pip install` puro).
> O pacote e o Chromium já estavam instalados aqui; os comandos acima são idempotentes.

## Setup

Instale as dependências Node do build (uma vez por clone):

```bash
cd 001-docs && npm install && cd ..
```

Nada mais é preciso para rodar/printar o portal. `project.yaml` já vem no repo (SSOT);
sem ele o build falha com mensagem clara. `client`/`name` vazios ⇒ o portal se apresenta
como **"Rocketbot probe docs"** (estado pristino — é o que você vê hoje, com 1 doc).

## Run (agent path) — build + serve + screenshot

Um comando, a partir da raiz do repo:

```bash
python3 .claude/skills/run-rocketbot-probe/driver.py
```

O driver: roda `node build.js` → sobe `dev-server.js` numa **porta livre** (evita colisão
de porta, veja Gotchas) → abre o Hub e **cada doc do sidebar**, printa em `.driver-shots/`
(gitignored) → verifica que nenhuma página vem em branco e que o glossário injeta tooltips →
derruba o servidor. Sai `!= 0` se alguma página falhar.

Saída real deste container:

```
🌐 dev-server em http://localhost:41968/
🏠 Hub → 'Hub de Documentação — Rocketbot probe docs'
📚 1 doc(s) no sidebar: ['./000-comece-aqui.html']
   01. ./000-comece-aqui.html  (1975 chars) [ok]
🏷️  glossário: 4 termo(s) com tooltip → ['RPA', 'PDD', 'BPMN', 'PDD']
📸 prints em .driver-shots/
✅ tudo renderizou
```

Depois **abra os PNGs e olhe** — `.driver-shots/00-hub.png` (o Hub) e um
`NN-<slug>.png` por doc. Blank/erro ⇒ não terminou.

Opções úteis:

```bash
python3 .claude/skills/run-rocketbot-probe/driver.py --out /tmp/shots    # outro diretório de prints
python3 .claude/skills/run-rocketbot-probe/driver.py --no-build          # usa o dist/ já compilado
python3 .claude/skills/run-rocketbot-probe/driver.py --port 8123         # porta fixa
python3 .claude/skills/run-rocketbot-probe/driver.py --keep              # deixa o servidor no ar p/ inspeção
python3 .claude/skills/run-rocketbot-probe/driver.py --url http://localhost:8123   # dirige um servidor já rodando (não sobe outro)
```

## Direct invocation — só o build, ou só o servidor

Para iterar em [001-docs/build.js](001-docs/build.js) ou no rendering, sem Playwright:

```bash
cd 001-docs && node build.js        # compila project.yaml + *.md → dist/  (exit 0)
```

`build.js` usa `__dirname` — é **cwd-agnóstico**: `node 001-docs/build.js` da raiz também
funciona. Depois, sirva e teste com `curl`:

```bash
cd 001-docs && PORT=8123 node dev-server.js &     # sobe o servidor
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://localhost:8123/         # → HTTP 200
curl -s http://localhost:8123/ | grep -oiE '<title>[^<]*</title>'            # sanity do título
```

## Run (human path)

`npm run dev` compila e serve em `http://localhost:8000` (Ctrl+C encerra) — abre no seu
navegador. Headless, isso não mostra nada; use o driver.

```bash
cd 001-docs && npm run dev          # build + serve em :8000  (PORT=8080 troca a porta)
```

## Transcribe (pipeline — segundo entry point)

[001-docs/transcription/transcribe.py](001-docs/transcription/transcribe.py) transforma um
vídeo declarado em `project.yaml → discovery.sessions[]` em `.txt` (ffmpeg → Deepgram). Requer
`DEEPGRAM_API_KEY` **e** um vídeo real, então aqui só dá para o smoke sem-rede:

```bash
python3 -c "import yaml, httpx; print('deps OK')"                    # pyyaml + httpx
python3 001-docs/transcription/transcribe.py --list                 # lista sessões e sai (exit 0)
```

Transcrição de verdade: ponha o vídeo em `sources/`, declare a sessão em `discovery.sessions[]`,
`export DEEPGRAM_API_KEY=...`, e rode `transcribe.py` (sem flag = 1ª sessão/SSOT).

## Test

Não há suíte de testes automatizada neste repo. O smoke é o próprio driver (build + render +
checagem de página em branco + glossário) — trate um `✅ tudo renderizou` + exit 0 como o "teste verde".

## Gotchas

- **Porta 8000 costuma estar ocupada.** Neste container um processo Python não-relacionado já
  escutava em `:8000` (servindo outro projeto). O driver contorna pegando **porta livre automática**;
  o `npm run dev` (fixo em 8000) daria `EADDRINUSE`. Use `PORT=<n>` ou o driver.
- **`dev-server.js` exige `dist/`.** Rodar `node dev-server.js` antes de `node build.js` sai com
  `❌ dist/ não existe. Rode 'npm run build' primeiro.` — o driver sempre compila antes (a menos de `--no-build`).
- **O sidebar linka o próprio Hub** (`./index.html`) junto com os docs; o driver filtra esse link
  para não printar o Hub duas vezes. Se editar o seletor, mantenha o filtro `index.html`.
- **Glossário = atributo `title` nativo** injetado pelo build em siglas (RPA/PDD/BPMN…). Não é um
  popover JS: para "ver" o tooltip, cheque o `[title]` no DOM (o driver conta e imprime), não espere um balão na screenshot.
- **`client`/`name` vazios são o normal.** Sem pipeline rodado, o Hub mostra só `000-comece-aqui` e
  o rodapé "1 arquivo". Não é bug — é o estado pristino do kit.
- **`transcribe.py` não tem `--help`.** `--help` cai no processamento default e **quebra**
  (`TypeError … PosixPath / NoneType`) quando não há sessão válida. Use `--list` para inspecionar.

## Troubleshooting

- **`ModuleNotFoundError: No module named 'playwright'`** → `python3 -m pip install --user --break-system-packages playwright`.
- **`Executable doesn't exist … ms-playwright/chromium`** → `python3 -m playwright install chromium`.
- **`error: externally-managed-environment` no pip** → falta `--break-system-packages` (PEP 668).
- **`Cannot find module 'marked'` / `'js-yaml'` no build** → você pulou o Setup: `cd 001-docs && npm install`.
- **`❌ project.yaml não encontrado`** → rode a partir da raiz do repo (ou `node 001-docs/build.js`); o build o procura em `../project.yaml` a partir de `001-docs/`.
- **Driver trava em "servidor não respondeu em 20s"** → outra coisa na porta escolhida, ou o build não gerou `dist/index.html`; rode `node 001-docs/build.js` sozinho e leia o erro.
