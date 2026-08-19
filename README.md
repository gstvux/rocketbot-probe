# Rocketbot Probe

Kit determinístico que transforma a gravação de uma **call de entendimento de processo** em
**documentação de automação (RPA) acionável** — e a compila num **portal HTML navegável** (o *Hub*).

Aponte um vídeo → transcreve (Deepgram) → 8 passos de análise (skills) → `npm run build` → portal.
Insumo novo chega depois? Vira mais uma **sessão** e **soma** à base, sem sobrescrever. No fim,
suas **inferências de dev** em `discovery/` fecham o contexto que os agentes usam para construir o robô.

E o kit não para na documentação: a **fase 2** entrega as ferramentas de **construir e operar** o
robô — navegador controlável por CDP, servidor do cliente operável sem instalar nada nele, robô
versionado em git com diff legível, gate anti-drift e teste barato. Do levantamento à produção,
no mesmo repositório.

| Fase | O que resolve | Skills |
|---|---|---|
| **1 — Descobrir e documentar** | o que o processo **é**: transcrição forense → eventos → glossário → estados → falhas → contratos → diagramas → PDD | 18 |
| **2 — Construir e operar** | como o robô **roda**: navegador, sessão remota, transporte por git, drift, teste, segredos | 6 |

**Tudo que muda por cliente vive em `project.yaml`.** A máquina (`build.js`, `transcribe.py`, skills)
é agnóstica: o mesmo kit serve qualquer processo, sem editar código.

---

## Começar aqui (projeto novo a partir do kit)

### 0. O caminho de um comando (recomendado)

Passe ao colega **o link do repo e esta linha**. Ela baixa o kit, cria o repositório dele, ativa as
skills, instala o portal e **abre o Claude Code já com o prompt de onboarding dentro**:

```bash
curl -fsSL https://raw.githubusercontent.com/gstvux/rocketbot-probe/main/bootstrap.sh | bash -s <nome-do-projeto>
```

> **Por que o comando precisa terminar abrindo o Claude Code:** as skills carregam de
> `.claude/skills/` **da pasta onde a sessão bootou**. A sessão que clona o kit nunca pode ser a
> sessão que o usa — a pasta ainda não existia quando ela abriu. Por isso o prompt não serve como
> ponto de entrada sozinho: ele é o segundo passo, e o `bootstrap.sh` existe para encadear os dois.

Se preferir fazer à mão, ou se o `curl` não for uma opção no ambiente, os passos 1–3 abaixo são
exatamente o que o script faz.

### 1. Ter uma cópia desacoplada (à mão)

O `bootstrap.sh` já faz isto. Se preferir manual:

```bash
git clone --depth 1 https://github.com/gstvux/rocketbot-probe.git <projeto-cliente>
cd <projeto-cliente>
rm -rf .git                                    # ← a linha que desacopla de verdade
git init -b main && git add -A && git commit -m "chore: base do kit Rocketbot Probe"
```

O histórico começa do zero e o kit já nasce agnóstico — `project.yaml` sem cliente, glossário só
com termos de método, `sources/` vazio. Não há faxina a fazer depois do clone.

> **Remote não entra aqui — e é de propósito.** Repare que não há `gh repo create` acima. O
> repositório **local** basta para trabalhar, e exigir disciplina de remote no dia 1 é exigir
> justamente o que não acontece. O commit local é automático nos checkpoints do pipeline; o remote
> vira necessário só na hora de **passar o processo adiante** — e aí a skill `handoff` resolve em
> um comando, inclusive para quem nunca criou remote nenhum. Ver **Transferir o processo** abaixo.

> **Sem vínculo significa sem atualização automática.** Melhoria futura no kit não chega sozinha ao
> seu projeto. Se quiser puxar depois: `git remote add upstream https://github.com/gstvux/rocketbot-probe.git`
> e faça cherry-pick do que interessar.

### 2. Os três comandos do primeiro dia

```bash
./install-skills.sh                       # 1. ativa as skills no Claude Code  ← comece por aqui
cd 001-docs && npm install && cd ..       # 2. dependências do portal
export DEEPGRAM_API_KEY="sua-chave"       # 3. só se houver áudio/vídeo a transcrever
```

### 3. Reiniciar o Claude Code e colar este prompt

```text
Repo recém-clonado. Roda o onboarding e me diz a próxima ação.
```

**Não fique esperando o chat te dizer o que fazer** — é essa frase que abre o kit. O agente
diagnostica o estado do repo (skills ativas? insumo? sessão declarada?) e conduz **uma ação por
vez**, do clone ao primeiro documento, aplicando as guardas do discovery. Detalhe importante: as
skills só carregam no **próximo boot** do Claude Code — rodar o `install-skills.sh` sem reiniciar
é o tropeço número um.

O resto deste README é referência para quando você quiser entender o porquê de cada peça. Para
começar, os três comandos e a frase acima bastam.

---

## O que você precisa (pré-requisitos)

| Ferramenta | Para quê | Instalação |
|---|---|---|
| **Node.js ≥ 18** | compilar e servir o portal | https://nodejs.org |
| **Python ≥ 3.9** | rodar a transcrição | `python3 --version` |
| **ffmpeg** | extrair áudio do vídeo | `apt install ffmpeg` / `brew install ffmpeg` |
| **Chave Deepgram** | transcrição (Nova-2, pt-BR) | https://deepgram.com (env `DEEPGRAM_API_KEY`) |
| **Conta Surge** (opcional) | publicar o portal | `npx surge login` |
| **Google Chrome** | fase 2 — operar portal/sessão remota por CDP | https://google.com/chrome |
| **`playwright-core`** (opcional) | fase 2 — seletores ricos (`:has-text`); sem ele o driver cai em `querySelector` | `npm i playwright-core` |

---

## Setup (uma vez por projeto)

```bash
# 1. Ativar as skills no Claude Code  ← comece por aqui
./install-skills.sh          # liga skills/ em .claude/skills/ (símlink; --copy se preferir)

# 2. Dependências do build (Node)
cd 001-docs && npm install && cd ..

# 3. Dependências da transcrição (Python)
pip install pyyaml httpx

# 4. Chave Deepgram — via variável de ambiente (recomendado)
export DEEPGRAM_API_KEY="sua-chave-aqui"
#    ...ou em arquivo local (gitignored):  echo "sua-chave" > .claude/deepgram.key.txt
```

> **Por que o passo 1 existe:** o Claude Code carrega skills de `.claude/skills/`, mas o kit as
> versiona em `skills/` — um lugar só, visível e revisável em diff. O `install-skills.sh` liga os
> dois por símlink (editar a skill no repo vale na hora) e é idempotente. `.claude/` é gitignored:
> o que está lá é gerado. Reinicie a sessão do Claude Code depois de rodar.
> Confira com `./install-skills.sh --list`.

---

## Fluxo de trabalho

### 1. Preencher a identidade em `project.yaml`
`project.client`, `project.name`, `process_slug` e o inventário `systems[]` (sistemas-alvo) —
**as skills preenchem isso** ao processar a call, mas você pode adiantar. Enquanto vazios, o portal
se apresenta só como **"Rocketbot probe docs"**.

> **`systems[]` (não `erp_system`):** uma automação real toca vários sistemas e nem todos são ERPs
> (web, desktop, terminal, arquivo, e-mail, API…). Cada sistema tem `kind`, `role`
> (`source_of_truth`/`target`/…) e `access` — o que alimenta a análise de falha (SPOF) e os
> diagramas de integração.

### 2. Colocar o insumo e declarar a sessão
Cada chegada de material é uma **sessão**, numerada por ordem de chegada. Crie a pasta
`sources/session-N/` e ponha **tudo que aquela chegada trouxe** dentro dela (vídeo, áudio, PDF,
planilha, export de transcrição do cliente) — o conteúdo é gitignored, **nunca commite
vídeo/áudio**. Depois declare a sessão em `discovery.sessions[]` no `project.yaml`
(há exemplo comentado lá):

```text
sources/
├── session-1/    ← call inicial          (role: ssot)
├── session-2/    ← call de dúvidas       (role: detail)
└── session-3/    ← manual do cliente     (role: detail, type: document)
```

O `N` guarda a **ordem**; o assunto vai no campo `title` da sessão. Marque `status: pending`
quando o material chegar e `processed` depois de incorporá-lo aos docs.

### 3. Transcrever
```bash
python3 001-docs/transcription/transcribe.py --list          # lista as sessões
python3 001-docs/transcription/transcribe.py                 # processa a 1ª (SSOT)
python3 001-docs/transcription/transcribe.py --session <slug> # uma sessão específica
```
Gera o `.txt` enriquecido (falantes, timestamps, confiança) em `001-docs/transcription/`.

### 4. Rodar o pipeline (skills, passos 1–8)
Abra o projeto no Claude Code e conduza os passos na ordem. Cada skill lê o `project.yaml` e escreve
o doc do seu passo em `001-docs/` (nomes no catálogo `docs.files`):

| # | Skill | Saída |
|---|---|---|
| 1 | `transcription-forensics` | `010-transcricao-sanitizada.md` |
| 2 | `domain-event-extraction` | `015-analise-dominio.md`, `020-eventos-dominio.md` |
| 3 | `semantic-canonicalization` | `025-glossario-canonico.md` |
| 4 | `state-modeling` | `030-maquina-estados.md` |
| 5 | `failure-analysis` | `040-falhas.md` |
| 6 | `contract-engineering` | `050-schema.md` |
| 7 | `diagram-as-code` / `bpmn-2-0-generator` | `060-diagrama.md`, `065-bpmn-processo.md` |
| 8 | `executive-technical-synthesis` | `070-delta-informacao.md`, PDD e demais entregáveis |

Transversais: `session-merge` (incorporar sessão nova à base), `docs-file-ordering` (numeração
NNN), `glossario` (decodificação no hover), `read-docs` (carregar contexto), `rpa-docs-builder`
(compilar/publicar).

> **Da 2ª sessão em diante o pipeline não recomeça — ele funde.** Cada sessão nova **soma** ao
> que já foi documentado: confirma, detalha, refina e acrescenta, sem sobrescrever em silêncio.
> A regra (classes NOVO / CONFIRMA / REFINA / CONTRADIZ, marcação de fonte e tratamento de
> conflito) está na skill `session-merge`, e vale nos oito passos. Conflito real entre sessões
> **não é resolvido no chute**: as duas versões ficam registradas e você decide.

### 5. Compilar e ver
```bash
cd 001-docs
npm run build      # gera dist/ (Hub + páginas)
npm run dev        # compila e serve em http://localhost:8000  (PORT=8080 para trocar a porta)
```

### 6. Publicar (opcional)
```bash
npm run publish    # build + deploy no Surge (domínio de publication.domain_pattern)
```

### 7. Direcionar o desenvolvimento (`discovery/`)
Com a base de conhecimento pronta, você escreve as **inferências de desenvolvedor** — o que o
pipeline não deriva sozinho porque depende de decisão de engenharia: pesquisa técnica, escolha de
arquitetura, módulos do Rocketbot, seletores e mapeamento de tela, exceções a tratar, specs e
prompts estruturados para os agentes executarem.

Solte `.md` direto em `discovery/`, **do jeito que você preferir** — a pasta é livre-forma: sem
numeração, sem estrutura obrigatória, sem índice. São anotações e prompts estruturados, não
entregável de cliente; por isso não entram no portal (o build só varre `001-docs/`).

> `discovery/_kit/` guarda notas sobre o **próprio Probe** (visão, tasks, ideias). O resto da pasta
> é seu: o que está lá fora é sobre o robô do cliente.

### 8. Construir e operar o robô (fase 2)
Com o contexto fechado, as skills de construção entram. Elas são **agnósticas de portal, de cliente
e de ferramenta de RPA** — quem conhece o sistema é o seletor que você passa, não o driver.

---

## Fase 2 — construir e operar o robô

| Situação | Skill | O que entrega |
|---|---|---|
| Preciso logar/clicar/baixar num portal | **`cdp-browser-control`** | Chrome dedicado (perfil isolado + porta CDP) e um driver único — DOM e coordenada — com as 5 armadilhas que falham em silêncio |
| O alvo é o servidor do cliente, por sessão remota no navegador | **`remote-session-control`** | modo **não-invasivo** (o usuário continua trabalhando), fronteira do que é humano, fallback de desktop com trava |
| Levar o robô do meu PC para produção | **`rocketbot-git-transport`** | pipeline dev→git→produção **pull-only**, `robot.db` com diff legível, rollback |
| "Minha mudança não teve efeito" | **`drift-guard`** | gate sha256 entre fonte e execução; `exit 1` trava o push |
| Testar está caro, lento ou arriscado | **`automation-test-loop`** | 3 modos de run numa chave (mock/piloto/prod), config que sobrevive ao deploy, log que vira retomada **e** evidência |
| Onde guardo a senha / o portal pede MFA | **`secrets-hitl`** | segredo fora do repo, fronteira do humano escrita, plano de rotação |

### Os 5 comandos que resolvem o dia

```bash
# 1. subir o navegador de automação (perfil isolado, porta CDP)
bash skills/cdp-browser-control/scripts/chrome-up.sh --url https://portal/login

# 2. operar o navegador — ler antes de agir, sempre
CDP="node skills/cdp-browser-control/scripts/cdp.mjs"
$CDP shot && $CDP click 'button:has-text("Entrar")'

# 3. tornar o robô legível para o git (1 .json por robô)
python3 skills/rocketbot-git-transport/scripts/robotdb.py snapshot robot.db --out robots/

# 4. provar que dev e execução são o mesmo arquivo (antes de rodar ou dar push)
./skills/drift-guard/scripts/drift.sh

# 5. saber onde quebrou / retomar de onde parou
python3 skills/automation-test-loop/scripts/runlog.py resumo
```

### As 7 regras (o resumo do resumo)

1. **Nunca agir às cegas.** Screenshot ou HTML antes de decidir; journal depois de agir.
2. **DOM por default, coordenada só quando não há DOM.** Seletor sobrevive a resolução; coordenada não.
3. **Coordenada de sessão remota se relê a cada sessão.** A geometria é renegociada; reaproveitar erra.
4. **Produção é pull-only.** Nada nasce no servidor do cliente.
5. **Depois do deploy, recarregar o Studio.** Ele executa da memória — sem recarregar você testa a versão velha.
6. **Segredo fora do repo; MFA é do humano.** A automação vai até a porta e passa a bola.
7. **Gate verde antes de rodar.** `drift.sh` + snapshot em dia: dois segundos economizam meia hora.

### Ciclo completo de uma automação nova

```text
1. chrome-up.sh                → navegador de automação no ar
2. cdp.mjs html/shot           → descobrir seletores do portal (ler, não adivinhar)
3. escrever o robô no DEV      → nunca no servidor do cliente
4. dev.json modo=mock          → validar navegação sem dado real
5. drift.sh + robotdb snapshot → gate verde
6. git push → deploy.ps1       → produção puxa (pull-only)
7. RECARREGAR o Studio         → senão você mede a versão anterior
8. runlog resumo               → onde quebrou; corrigir e voltar ao 4
9. modo=piloto → modo=prod     → tirar a marca de teste é o critério de "pronto"
```

---

## Transferir o processo (handoff)

Cada dev é dono de um processo — mas processo troca de dono: alguém sai, alguém assume, alguém
divide. **É para isso que a base de conhecimento existe.** Quem recebe não deveria depender da
cabeça de quem entrega.

O que costuma quebrar não é a documentação, é a logística: o trabalho está numa pasta na máquina
de uma pessoa. Por isso o kit **não pede remote no dia 1** — pede no dia do handoff, e resolve com
o que você tiver:

| Quem recebe vai… | Meio | Comando |
|---|---|---|
| **ler / entender** (gestor, analista, cliente) | portal publicado — um link, sem instalar nada | `cd 001-docs && npm run publish` |
| **assumir o desenvolvimento**, sem remote no projeto | **bundle** — um arquivo, histórico inteiro | `git bundle create ../<projeto>-handoff.bundle --all` |
| **assumir o desenvolvimento**, com remote | push + acesso | `git push -u origin main` |

O bundle é o caminho para quem nunca criou remote: **nenhuma conta, nenhuma permissão** — vai por
Drive, chat ou pendrive, e do outro lado `git clone <arquivo>.bundle` devolve o repositório
completo, com todo o histórico. Peça a skill **`handoff`** que ela conduz, checa se algum segredo
ou mídia entrou no pacote e lembra dos três itens que a documentação **não** transfere: acessos,
relação com o cliente e o que ainda está incerto.

> **Os commits acontecem sozinhos.** A cada passo do pipeline concluído o agente faz commit local
> (nunca `push`). Você não precisa lembrar — quando o handoff chegar, a história já existe.

---

## As três camadas

| Camada | Pasta | O que é | Quem escreve |
|---|---|---|---|
| 1 — Insumo | `sources/session-N/` | material bruto, por ordem de chegada | você, soltando arquivos |
| 2 — Conhecimento | `001-docs/` | o que o processo **é** (pipeline 1–8, publicável) | as skills |
| 3 — Inferência | `discovery/` | como **implementar** (decisão de engenharia) | você, em `.md` livre |

> **Regra para agentes de código:** camada 2 + camada 3 são o **contexto definitivo e acionável**.
> Antes de planejar ou gerar qualquer código de robô, o agente carrega as duas (skill `read-docs`).
> Em divergência: a transcrição é soberana sobre **o que o processo é**; `discovery/` é soberano
> sobre **como implementar**. Uma inferência nunca reescreve um fato do processo — ela decide o
> que fazer com o fato. A regra completa está em [`CLAUDE.md`](CLAUDE.md).

---

## Criar documentos além dos iniciais

O pipeline gera a base (`010`–`110`). Para acrescentar docs próprios você **não cria arquivo, nem pensa
em numeração ou nomenclatura** — isso é trabalho das skills. Abra o projeto no Claude Code (com as skills
carregadas) e **peça em linguagem natural** o documento que quer. Exemplos de prompt:

- *"documente as decisões de arquitetura do robô e o porquê de cada uma"*
- *"crie um doc de resiliência/HITL do processo, com os pontos de intervenção humana"*
- *"mapeie as telas do sistema X passo a passo, com um diagrama do fluxo"*
- *"gere um doc de auditoria cruzando o passo-a-passo com o mapa de eventos"*

O agente cuida de todo o resto: **numeração NNN step-10** e onde encaixar (skill `docs-file-ordering`),
o arquivo em `001-docs/`, o registro em `project.yaml → docs.files` quando fizer sentido, o rigor
analítico (skills 1–8 + `read-docs`) e os recursos abaixo. No fim, peça *"compila e publica os docs"*
(skill `rpa-docs-builder`) — ou rode você mesmo `npm run build` / `npm run publish`.

### Recursos que você pode pedir no doc

- **Diagramas** — *"faça um fluxograma / máquina de estados / sequência em Mermaid"*.
- **BPMN 2.0 interativo** — *"gere o BPMN AS-IS e TO-BE"* → viewer com zoom/pan + botões "Baixar .bpmn" / "Copiar XML".
- **Evidências do vídeo** — imagens dos frames (`assets/`) com lightbox e legenda automáticos.
- **Citação clicável da transcrição** — *"referencie a fala em que ele fala disso"* → link que abre o painel na fala exata.
- **Decodificação no hover** — siglas/termos ganham tooltip; *"adiciona o termo X ao glossário"* mantém o `glossary.yaml` vivo (skill `glossario`).

> Ou seja: descreva **o que** você quer documentar; as skills resolvem **como** (arquivo, número, formato, rigor).
> Os números `120`+ ficam livres para o conhecimento específico do robô/processo que nasce depois do discovery.

---

## `project.yaml` é a fonte única da verdade

Um único arquivo governa identidade, caminhos, sessões de discovery, publicação e marca. **Não se
edita a máquina nem as skills** para trocar de projeto — só o `project.yaml` (e o `glossary.yaml`,
o vocabulário do cliente). O bloco `brand:` é **padronizado** (Rocketbot) e não é ponto de customização.

## Estrutura

```text
rocketbot-probe/
├── project.yaml                 # SSOT — identidade, caminhos, sessões, publicação, marca
├── CLAUDE.md                    # regra operacional dos agentes (camadas + precedência)
├── README.md                    # este guia
├── install-skills.sh            # ativa skills/ em .claude/skills/ (símlink idempotente)
├── skills/                      # 22 skills — TODAS as do kit, agnósticas
│   ├── (15) pipeline de discovery     transcription-forensics … executive-technical-synthesis
│   ├── (6)  construção e operação      cdp-browser-control, remote-session-control,
│   │                                   rocketbot-git-transport, drift-guard,
│   │                                   automation-test-loop, secrets-hitl
│   ├── (1)  operação do portal         run-rocketbot-probe
│   └── <skill>/scripts/               executáveis da skill (cdp.mjs, drift.sh, robotdb.py…)
├── sources/                     # camada 1 — insumo bruto por sessão (session-N/, gitignored)
├── discovery/                   # camada 3 — inferências do dev (.md livre-forma)
│   └── _kit/                    # notas sobre o próprio Probe (não sobre o robô do cliente)
├── assets/                      # frames/evidências referenciados nos docs (../assets/…)
└── 001-docs/                    # camada 2 — conhecimento do processo (vira o portal)
    ├── build.js                 # compilador (lê project.yaml) — agnóstico
    ├── dev-server.js            # servidor estático portátil (zero-dependência)
    ├── glossary.yaml            # SSOT dos tooltips (decodificação no hover)
    ├── package.json             # deps: marked, js-yaml (+ surge dev)
    ├── brand/Isologo.svg        # logo (assets pesados são gitignored)
    ├── transcription/
    │   └── transcribe.py        # vídeo → áudio (ffmpeg) → Deepgram → .txt enriquecido
    ├── 000-comece-aqui.md       # orientação dentro do portal
    └── (010-… 020-… gerados pelo pipeline)
```

---

## ⚠️ Não commite arquivos grandes nem segredos

O `.gitignore` já bloqueia, mas confira antes de `git add`:

- **Vídeos/áudios** (`sources/session-N/`, `*.mp4`, `*.mp3`, …) — pesados (centenas de MB), ficam **locais**.
- **Chave Deepgram** (`.claude/`, `*.key.txt`) e **JSON bruto da API** (`transcription/*.json`).
- **`node_modules/`**, **`dist/`** e o brandbook PDF/ZIP.
- **Credenciais do robô** (`*cred*`, `*.pem`, `*.pfx`, `.env`) — só o `*.example.json` (a forma, sem
  valor) é versionado. A regra completa está na skill `secrets-hitl`.
- **Estado de execução** (`dev.json`, `run-log.jsonl`, `journal.jsonl`, contadores) — precisa
  **sobreviver ao `git reset --hard`** do deploy; por isso é ignorado, não versionado.
- **Capturas e saídas** (`shots/`, `downloads/`, `*.xlsx`, `*.csv`) — contêm tela e dado de cliente.

Transcrições `.txt` podem conter fala sensível do cliente — decida por projeto se versiona.

---

## Como funciona por dentro (para revisores)

- **Agnosticismo:** `build.js` deriva **título, cliente, processo, doc principal, versão e domínio**
  do `project.yaml`; o título do portal é fixo (`"Rocketbot probe docs"`) e o cliente, quando
  preenchido, vira sufixo da assinatura. Sem `project.yaml`, o build falha com mensagem clara.
- **Decodificação no hover:** o `build.js` injeta `title` nativo (zero-dependência) em cada termo do
  `glossary.yaml`, em todo doc. Arquivo ausente ⇒ no-op (build roda igual) — prova de portabilidade.
- **Determinismo dos artefatos:** a numeração NNN step-10 (`docs-file-ordering`) garante ordenação
  idêntica em `ls`, GitHub, VS Code e no build; o mesmo vídeo + mesmas skills ⇒ mesma estrutura.
- **Fase 2 também é agnóstica:** os scripts (`cdp.mjs`, `drift.sh`, `robotdb.py`, `runlog.py`,
  `deploy.ps1`) não conhecem portal, cliente nem processo — recebem seletor, par fonte→destino ou
  caminho por argumento. O que é específico do projeto mora em `drift.json`, `dev.json` e no
  arquivo de credenciais — os três **fora** do que se versiona (ou sem valor dentro).
