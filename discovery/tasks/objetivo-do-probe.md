o projeto leva o nome de proble, de sonda, pois é uma metafora ótima para a etapade discovery de um processo a ser automatizado. diferente dos demais artefatos conhecidos, a filosofia dessa ferramenta é servir de passos acionáveis, seja para um desenvolvedor ou seja para agentes de ia. a partir dessa docs, vamos gerar inteligencia sobre o processo, gerar contexto e awareness. Entregando com qualidade, orquestrado a IA, orientado ao aprendizado de todos os interessados e conectado com os objetivos de negócios.

Inicialmente temos o pipeline, refletem as skills/

que gera contexto inicial em markdown

suporta sessões de discovery para caso de requisitos, reuniões e insumos em geral virem em timmings diferentes, muito comum.

cada sessão vai considerar o que ja temos, e combinar as informações

além de gerar os markdowns, tbm é fornecido uma mecanica de converter os markdowns em html e formar um portal para consumir as docs.

---

# Rocketbot Probe — o objetivo do projeto

> Artigo elaborado a partir das notas acima, cruzando-as com o que o repositório já
> materializa (as 13 skills, o `project.yaml`, o `build.js`, o `transcribe.py` e o portal).
> Objetivo: sair da intuição das notas para a **ciência plena** do que este projeto é e por quê.

## 1. Por que "sonda": a metáfora que define o método

O nome não é decorativo. Uma **sonda** é o instrumento que se envia a um território ainda
desconhecido para trazer de volta **medições confiáveis** — não opiniões, não impressões, mas
dados que sustentam decisão. É exatamente esse o papel do Probe na fase de **discovery** de um
processo a ser automatizado.

Antes de qualquer robô existir, existe uma incerteza: *como esse processo realmente funciona?*
A resposta mora, quase sempre, na cabeça de quem opera — dispersa em uma call, uma reunião, um
áudio, um "a gente sempre fez assim". A sonda desce até esse território tácito e sobe com um
**mapa acionável**. A gravação de uma call de entendimento entra; documentação de automação
sai. O território é o processo; o instrumento é este kit.

A metáfora carrega uma disciplina embutida: uma sonda **não contamina** o que mede. Por isso o
passo 1 do pipeline é *forense* — [`transcription-forensics`](../../skills/transcription-forensics/SKILL.md)
existe para transcrever **sem distorção semântica**. O risco não é deixar sujeira; é limpar
demais e apagar a evidência de uma decisão, uma hesitação, uma condição ("se o jurídico
liberar"). Uma sonda que "arredonda" a leitura deixa de ser sonda.

## 2. O que o Probe **não** é — e por que isso importa

As notas dizem: *"diferente dos demais artefatos conhecidos"*. Vale nomear a diferença.

- **Não é um gerador de ata.** Uma ata resume o que foi dito. O Probe **reconstrói o domínio**:
  extrai eventos irreversíveis do negócio, modela estados, mapeia falhas, engenheira contratos.
  Ele não conta o que aconteceu na reunião — ele revela como o processo se comporta.
- **Não é um template a preencher.** Um template pede que um humano saiba de antemão a resposta.
  O Probe **descobre a resposta** a partir do insumo bruto e a torna rastreável até a fala de
  origem (via os IDs de utterance `[[U####]]` da transcrição).
- **Não é uma ferramenta presa a uma pessoa.** Um diagrama no Lucidchart morre na conta de quem
  o criou. Aqui, todo conhecimento operacional é **código versionável** (Mermaid, BPMN 2.0 XML,
  Markdown) que o git audita.

O artefato que o Probe produz não é um relatório: é uma **base de conhecimento executável**,
pensada para ser *consumida por quem age* — e o próximo tópico explica quem é esse "quem".

## 3. A tese central: passos acionáveis para humano **ou** agente

O coração das notas: *"a filosofia dessa ferramenta é servir de passos acionáveis, seja para
um desenvolvedor ou seja para agentes de IA."*

Isso é uma decisão de arquitetura, não um slogan. Documentação tradicional é escrita para ser
**lida**; a documentação do Probe é escrita para ser **executada** — por dois tipos de leitor
com a mesma necessidade: *contexto suficiente para agir sem perguntar de novo*.

- Para o **desenvolvedor RPA**, os entregáveis do passo 8 traduzem regra de negócio em
  precisão implementável: o [`contract-engineering`](../../skills/contract-engineering/SKILL.md)
  fecha a lacuna entre "data válida" e `dia útil, entre D+1 e D+90, não retroativa`. O teste de
  qualidade é literal: *um desenvolvedor consegue implementar sem fazer uma única pergunta?*
- Para o **agente de IA**, o formato é o que permite orquestração. A convenção de nomeação
  [`docs-file-ordering`](../../skills/docs-file-ordering/SKILL.md) (NNN step-10, zero-padded)
  garante que `ls`, GitHub, VS Code e um LLM lendo o diretório cheguem à **mesma ordem** sem
  heurística. A skill [`read-docs`](../../skills/read-docs/SKILL.md) é o "git pull" de contexto
  antes de qualquer tarefa. O `project.yaml` é o índice único que resolve todos os caminhos.

Não é coincidência que o mesmo artefato sirva os dois: **um passo acionável para um agente é,
por construção, um passo acionável para um humano.** Determinismo, rastreabilidade e ausência de
ambiguidade beneficiam ambos. O Probe não escolhe entre automação e pessoas — ele produz o
substrato de que os dois precisam.

## 4. O produto real: inteligência, contexto e *awareness*

> *"a partir dessa docs, vamos gerar inteligencia sobre o processo, gerar contexto e awareness."*

Três palavras, três camadas distintas de valor:

- **Inteligência** — o que o pipeline *deriva* que não estava dito. Ninguém na call fala "isto é
  um Single Point of Failure"; a skill [`failure-analysis`](../../skills/failure-analysis/SKILL.md)
  **infere** ao cruzar o inventário `systems[]` com a máquina de estados, e ainda classifica a
  evidência (`EXPLÍCITA` / `INFERIDA` / `HIPOTÉTICA`) para que a confiança de cada achado seja
  honesta. Inteligência aqui é análise que agrega, não transcrição que espelha.
- **Contexto** — o insumo pronto para consumo, carregável de uma vez. É o papel do `project.yaml`
  como fonte única e do portal como superfície navegável. Contexto é inteligência *acessível no
  momento da decisão*.
- **Awareness** — a redução de carga cognitiva que faz o conhecimento **pegar**. A
  [decodificação no hover](../../skills/glossario/SKILL.md) explica cada sigla sem tirar o leitor
  da página; a citação clicável abre a fala exata que originou uma afirmação; os diagramas
  transformam texto em modelo mental. Awareness é contexto que o leitor *internaliza* sem
  esforço.

A progressão importa: **inteligência** vira **contexto** que gera **awareness**. É o pipeline
inteiro comprimido em três palavras.

## 5. Os quatro compromissos de entrega

O fecho das notas — *"entregando com qualidade, orquestrado a IA, orientado ao aprendizado de
todos os interessados e conectado com os objetivos de negócios"* — são quatro compromissos que o
repositório já honra concretamente:

| Compromisso | Como o Probe cumpre |
| --- | --- |
| **Qualidade** | Determinismo dos artefatos: mesmo vídeo + mesmas skills ⇒ mesma estrutura. Tema Claro Absoluto WCAG AAA no portal. Cada passo tem checklist de validação próprio. |
| **Orquestrado por IA** | As skills **são** a orquestração — cada uma declara entrada, saída e posição no pipeline lendo do `project.yaml`. O agente conduz os passos 1→8; a máquina não precisa de código editado por projeto. |
| **Aprendizado de todos os interessados** | O passo 8 gera entregáveis **por público**: `delta_info` (cliente), `stakeholder_junior` (operador), `senior_insights` (time técnico), `pdd` (referência). Cada stakeholder recebe a camada de detalhe que consegue usar. |
| **Conectado ao negócio** | A síntese [`executive-technical-synthesis`](../../skills/executive-technical-synthesis/SKILL.md) traduz jargão técnico em consequência de negócio ("se o pagamento roda duas vezes, o cliente é cobrado em dobro") e preserva causalidade para que a decisão seja possível. |

## 6. O pipeline **é** o reflexo das skills

> *"Inicialmente temos o pipeline, refletem as skills/ que gera contexto inicial em markdown."*

O pipeline não é um script que chama skills — o pipeline **é** a sequência das skills. Cada uma
é um passo com contrato explícito (o bloco *"Posição no Pipeline"* de cada `SKILL.md`), e a saída
de uma é a entrada da próxima. A cadeia:

1. **`transcription-forensics`** → transcrição sanitizada (fala bruta → fonte de verdade, sem
   distorção). *Fundação: tudo abaixo depende da fidelidade daqui.*
2. **`domain-event-extraction`** → eventos de domínio (fatos irreversíveis do negócio, DDD/event
   storming). *Separa ação de intenção de evento factual.*
3. **`semantic-canonicalization`** → glossário canônico (linguagem ubíqua; um termo, um
   significado; sinônimos e colisões resolvidos).
4. **`state-modeling`** → máquina de estados determinística (o que pode acontecer em cada etapa;
   transições inválidas impossíveis por construção).
5. **`failure-analysis`** → pontos de falha (SPOF, resiliência, consistência, dependência
   humana), com evidência classificada.
6. **`contract-engineering`** → schema (tipos, invariantes, validações — ambiguidade
   computacional eliminada).
7. **`diagram-as-code`** / **`bpmn-2-0-generator`** → diagramas Mermaid + BPMN 2.0 AS-IS/TO-BE
   (conhecimento operacional versionável).
8. **`executive-technical-synthesis`** → PDD + entregáveis por público (do discovery à entrega).

E as **transversais** que sustentam o eixo: [`docs-file-ordering`](../../skills/docs-file-ordering/SKILL.md)
(numeração), [`glossario`](../../skills/glossario/SKILL.md) (hover), [`read-docs`](../../skills/read-docs/SKILL.md)
(contexto) e [`rpa-docs-builder`](../../skills/rpa-docs-builder/SKILL.md) (compilar/publicar).

A ordem tem uma lógica epistêmica: **não se pode modelar estado sem eventos; não se pode achar
falha sem estado; não se pode escrever contrato sem conhecer as falhas que ele previne.** Cada
passo pressupõe o rigor do anterior. O "contexto inicial em markdown" das notas é a saída
acumulada dessa cadeia.

## 7. Discovery é multi-sessão: o conhecimento chega em tempos diferentes

> *"suporta sessões de discovery para caso de requisitos, reuniões e insumos em geral virem em
> timings diferentes, muito comum. cada sessão vai considerar o que já temos, e combinar as
> informações."*

Este é um dos pontos mais maduros do projeto, porque modela a **realidade** do levantamento em
vez de um ideal. Requisito raramente chega inteiro numa única call. Vem a call inicial e, depois,
as calls de dúvida. O `project.yaml` trata isso de frente com `discovery.sessions[]`:

- A **1ª sessão** (`role: ssot`) é a **referência base** — o processo macro validado.
- As **seguintes** (`role: detail`) **confirmam e detalham** ao nível de campo, sem reescrever o
  que o SSOT já estabeleceu.

A regra de merge é deliberadamente conservadora (definida em `transcription-forensics`): uma
sessão de detalhe *afina*, marca a origem ("Fonte N / data") e, **em conflito real, preserva
ambas as versões com nota** — nunca sobrescreve às cegas. Cada sessão gera sua própria
transcrição numerada (SSOT em `010-…`, dúvidas em `011-…`), e os passos 2–8 combinam o acumulado.

Isso transforma o discovery de um **evento** em um **processo incremental** — que é como ele de
fato acontece. O `transcribe.py` opera por sessão (`--session <slug>`), com Deepgram Nova-2 em
pt-BR, diarização e IDs de utterance que depois viram as citações clicáveis do portal.

## 8. O que torna tudo isso reaproveitável: máquina agnóstica, dado no `project.yaml`

Um objetivo implícito nas notas, mas central ao projeto: o Probe não é feito para **um** cliente
— é um kit que serve **qualquer** processo sem editar código. O princípio é a separação estrita
entre **máquina** e **dado**:

- **A máquina é agnóstica** — `build.js`, `transcribe.py` e as 13 skills nunca citam nome de
  cliente, termo de domínio ou caminho hardcoded. Elas leem tudo do `project.yaml`.
- **O dado vive num lugar só** — o `project.yaml` é o SSOT de identidade, sistemas-alvo, sessões,
  catálogo de documentos, publicação e marca. Trocar de projeto = trocar o `project.yaml` (e o
  `glossary.yaml`, o vocabulário do cliente). Nada mais.

A prova viva do agnosticismo é o **no-op seguro**: sem `glossary.yaml`, o build roda igual, só
não injeta tooltips. Uma feature que degrada sem quebrar é uma feature portável. O mesmo vale
para o inventário `systems[]` — nasce vazio e é preenchido pela análise; ele modela que uma
automação real **toca vários sistemas de tipos diferentes** (web, desktop, terminal, arquivo,
e-mail, API), e não só um ERP — o que alimenta a análise de SPOF e os diagramas de integração.

## 9. Do markdown ao portal: por que o conhecimento precisa de uma superfície

> *"além de gerar os markdowns, tbm é fornecido uma mecânica de converter os markdowns em html e
> formar um portal para consumir as docs."*

Markdown é a **fonte**; o portal (o *Hub*) é o **produto de consumo**. O `build.js` compila os
`.md` em um site estático de alta densidade, e a mecânica não é cosmética — ela é o que fecha o
laço com a *awareness* do tópico 4:

- **Decodificação no hover** — injeta `title` nativo em cada sigla/termo, em todo doc, com
  **zero dependência**. O leitor decodifica passando o mouse.
- **Citação clicável da transcrição** — um link `[[U####]]` abre o painel na fala exata que
  originou a afirmação. Rastreabilidade até a fonte primária, em um clique.
- **BPMN 2.0 interativo e Mermaid** — bibliotecas pesadas injetadas **só** nas páginas que
  precisam (gating por conteúdo); o BPMN ganha viewer com zoom/pan e botões "Baixar .bpmn" /
  "Copiar XML" para reimportar no Camunda Modeler.
- **Evidências do vídeo** — frames em `assets/` com lightbox e legenda automáticos.

O portal é publicável (Surge, domínio derivado da `version`), então o conhecimento sai do
repositório e vira algo que o cliente **abre no navegador**. O Markdown serve ao git e ao agente;
o portal serve ao humano que precisa entender rápido.

## 10. Síntese: o objetivo em uma frase

> O **Rocketbot Probe** é uma sonda de discovery: um kit determinístico e agnóstico que desce à
> fala bruta de um levantamento de processo e sobe com uma base de conhecimento **executável** —
> passos acionáveis igualmente úteis para um desenvolvedor ou um agente de IA — gerando
> inteligência, contexto e *awareness* sobre o processo, entregues com qualidade, orquestrados por
> IA, dimensionados ao aprendizado de cada interessado e ancorados nos objetivos de negócio.

Cada palavra dessa frase agora tem um mecanismo por trás no repositório. É esse o alvo do
projeto — e o resto do trabalho é aprofundar e endurecer cada um desses mecanismos até que a
sonda meça sempre certo.
