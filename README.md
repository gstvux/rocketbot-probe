# Rocketbot Probe

Kit determinístico que transforma a gravação de uma **call de entendimento de processo** em
**documentação de automação (RPA) acionável** — e a compila num **portal HTML navegável** (o *Hub*).

Aponte um vídeo → transcreve (Deepgram) → 8 passos de análise (skills) → `npm run build` → portal.
**Tudo que muda por cliente vive em `project.yaml`.** A máquina (`build.js`, `transcribe.py`, skills)
é agnóstica: o mesmo kit serve qualquer processo, sem editar código.

---

## O que você precisa (pré-requisitos)

| Ferramenta | Para quê | Instalação |
|---|---|---|
| **Node.js ≥ 18** | compilar e servir o portal | https://nodejs.org |
| **Python ≥ 3.9** | rodar a transcrição | `python3 --version` |
| **ffmpeg** | extrair áudio do vídeo | `apt install ffmpeg` / `brew install ffmpeg` |
| **Chave Deepgram** | transcrição (Nova-2, pt-BR) | https://deepgram.com (env `DEEPGRAM_API_KEY`) |
| **Conta Surge** (opcional) | publicar o portal | `npx surge login` |

---

## Setup (uma vez por projeto)

```bash
# 1. Dependências do build (Node)
cd 001-docs && npm install && cd ..

# 2. Dependências da transcrição (Python)
pip install pyyaml httpx

# 3. Chave Deepgram — via variável de ambiente (recomendado)
export DEEPGRAM_API_KEY="sua-chave-aqui"
#    ...ou em arquivo local (gitignored):  echo "sua-chave" > .claude/deepgram.key.txt
```

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

### 2. Colocar o vídeo e declarar a sessão
Ponha o arquivo em `.sources/` (gitignored — **nunca commite vídeo/áudio**) e adicione uma entrada
em `discovery.sessions[]` no `project.yaml` (há um exemplo comentado lá).

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

Transversais: `docs-file-ordering` (numeração NNN), `glossario` (decodificação no hover),
`read-docs` (carregar contexto), `rpa-docs-builder` (compilar/publicar).

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

---

## Criar documentos além dos iniciais

O pipeline gera a base (`010`–`110`). Para acrescentar docs próprios — decisões de arquitetura,
esqueleto do robô, mapa de telas do sistema, resiliência/HITL, passo-a-passo, auditorias — bastam 3 passos:

**1. Numere pela convenção NNN step-10** (skill `docs-file-ordering`). Docs principais em múltiplos de 10
(`120`, `130`…); sub-docs preenchem os gaps (`131`–`139`). Para inserir entre dois existentes, use um gap
livre; se uma seção passar de 9 sub-docs, promova o conteúdo a uma seção nova (`140`).

**2. Crie `001-docs/NNN-slug.md`** com um `# Título` (H1) na 1ª linha — ele vira o título no portal.
**O build descobre qualquer `.md` automaticamente** (não precisa registrar nada): já aparece como card em
"Fontes de Apoio".
- Registre em `project.yaml → docs.files` (ex.: `arch_decisions: "130-...md"`) **só** se quiser que as
  **skills** referenciem o doc por slug.
- Para ser o **doc principal** (destaque no Hub), nomeie-o igual a `docs.files.pdd`.

**3. Compile e publique:** `npm run build` (ou `npm run dev` para ver), depois `npm run publish`.

### Recursos disponíveis em qualquer doc

- **Mermaid** — bloco ` ```mermaid ` renderiza fluxo/estado/sequência.
- **BPMN 2.0 interativo** — bloco ` ```bpmn ` com o XML → viewer com zoom/pan + botões "Baixar .bpmn" / "Copiar XML".
- **Imagens/evidências** — `![legenda](../assets/frame.png)` → lightbox automático (a legenda vira `<figcaption>`).
- **Citação clicável da transcrição** — `[[U0042]](transcription/<slug>.txt)` abre o painel na fala exata.
- **Decodificação no hover** — siglas/termos do `glossary.yaml` ganham tooltip nativo em todo doc.
  **Cunhou um termo novo? Adicione ao `glossary.yaml`** (skill `glossario`).
- **Badges "novo/atualizado"** — derivados do git status, aparecem sozinhos nos cards do Hub.

> Os números `120`+ são livres: use-os para o conhecimento específico do robô/processo que nasce
> depois do discovery. Precisa de rigor analítico (não só um `.md` solto)? Rode a skill do passo
> correspondente — as skills 1–8 e o `read-docs` continuam valendo para qualquer doc novo.

---

## `project.yaml` é a fonte única da verdade

Um único arquivo governa identidade, caminhos, sessões de discovery, publicação e marca. **Não se
edita a máquina nem as skills** para trocar de projeto — só o `project.yaml` (e o `glossary.yaml`,
o vocabulário do cliente). O bloco `brand:` é **padronizado** (Rocketbot) e não é ponto de customização.

## Estrutura

```
rocketbot-probe/
├── project.yaml                 # SSOT — identidade, caminhos, sessões, publicação, marca
├── README.md                    # este guia
├── skills/                      # 13 skills do pipeline (agnósticas)
├── assets/                      # frames/evidências referenciados nos docs (../assets/…)
└── 001-docs/
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

- **Vídeos/áudios** (`.sources/`, `*.mp4`, `*.mp3`, …) — pesados (centenas de MB), ficam **locais**.
- **Chave Deepgram** (`.claude/`, `*.key.txt`) e **JSON bruto da API** (`transcription/*.json`).
- **`node_modules/`**, **`dist/`** e o brandbook PDF/ZIP.

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
