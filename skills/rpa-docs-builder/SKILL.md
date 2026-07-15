---
name: rpa-docs-builder
description: >
  Use esta skill para compilar, atualizar, visualizar ou publicar a documentação de processo RPA
  do projeto — converte arquivos Markdown de 001-docs/ em páginas HTML navegáveis com branding
  Rocketbot e serve ou publica via Surge. Ativa quando o usuário disser "compilar a documentação",
  "gerar o HTML", "publicar os docs", "npm run build", "npm run dev", "surge", "ver os docs",
  "build.js", ou após concluir qualquer passo do pipeline (1-8) e querer visualizar o resultado.
  Skill transversal — usada ao final de cada iteração do ciclo de documentação.
---

# RPA Docs Builder & Publisher

## Posição no Pipeline

```
Transversal — executar após qualquer passo 1–8 para visualizar e publicar

Caminho : project.yaml → docs.root / build.js     (compilador Node.js)
Config  : project.yaml → project.version + publication.domain_pattern  (versão/domínio)
Saída   : project.yaml → docs.root / dist/         (site estático pronto para publicação)
Brand   : project.yaml → brand.*                   (cores, fontes, logo)
```

---

## Objetivo
Compilar documentos Markdown (`.md`) da pasta `project.yaml → docs.root` em uma estrutura de site estático HTML navegável e de alta densidade visual (Tema Claro Absoluto), aplicando o branding de `project.yaml → brand` e suportando âncoras/links e diagramas Mermaid.

---

## Especificações de identidade

As páginas HTML geradas refletem a identidade visual definida em `project.yaml → brand`:
- **Cor principal:** `brand.primary_color`
- **Cor escura:** `brand.dark_color`
- **Tipografia principal:** `brand.font_title` (Google Fonts — títulos e navegação)
- **Tipografia secundária:** `brand.font_body` (corpo de prosa técnica)
- **Tipografia funcional:** `brand.font_mono` (blocos de código e terminais)
- **Logo:** `brand.logo_file` / fallback: `brand.logo_fallback`
- **Tema:** Claro Absoluto (fundo `#F8F9FA`, superfícies brancas) — WCAG AAA

---

## Arquitetura do compilador (`build.js`)

### Convenção de nomeação e ordenação
A ordenação segue a convenção **NNN step-10** de `docs-file-ordering`. Sort no `build.js`: usar `a.localeCompare(b)` — **nunca `parseFloat`**, que quebra prefixos como `0015`.

### Separação de documentos (taxonomia)
- **Documento Principal:** `PDD-automacao-*.md` — exibido em destaque no dashboard
- **Fontes de Apoio:** todos os outros Markdowns numerados — exibidos como referências

### Filtro seletivo de assets
- Varre `brand/` e copia apenas `.svg`, `.png`, `.jpg`, `.webp` para `dist/brand/`
- Ignora arquivos pesados (PDFs, ZIPs) para manter o pacote < 500KB

### Mecanismo de âncoras e slugs Unicode
Renderer customizado de cabeçalhos no `marked` — garante que links internos em português funcionem:
```javascript
const renderer = {
  heading(text, level, raw) {
    const slug = raw
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s/g, '-');
    return `<h${level} id="${slug}">${text}</h${level}>`;
  }
};
```

---

## Configuração (tudo em `project.yaml`)

Não há `build_config.yaml`: o build lê versão, domínio e identidade direto do `project.yaml`.

```yaml
project:
  version: "0.1.0"                 # versão do pacote de docs
publication:
  domain_pattern: "docs-rocketbot-probe-v{{version}}"
  # Resultado: docs-rocketbot-probe-v0-1-0.surge.sh
```

O título do portal é fixo — **"Rocketbot probe docs"**; `project.client`/`project.name`, quando
preenchidos pelas skills, enriquecem a assinatura. O doc principal (destaque no Hub) é `docs.files.pdd`.

---

## Guia de operação

### Comandos

| Ação | Comando | Detalhes |
|---|---|---|
| **Compilar HTML** | `npm run build` | Limpa `dist/`, processa Markdowns, gera dashboard e `CNAME` |
| **Desenvolvimento local** | `npm run dev` | Compila + servidor na porta `8001` (WSL) + proxy Windows porta `8000` |
| **Smoke test** | `npm run build && test -s dist/index.html && grep -q '<title>' dist/index.html` | Build + confirma que o Hub saiu |
| **Publicar no Surge** | `npm run publish` | Compila e faz deploy automático |
| **Remover deploy** | `npx surge teardown <subdominio>.surge.sh` | Remove a URL publicada |

> **Servidor local:** `npm run dev` compila e serve em `http://localhost:8000` (servidor Node
> zero-dependência, cross-platform; porta via `PORT=8080 npm run dev`).

---

## Especificações de renderização de assets

### Layout inline
- Tamanho máximo: `max-height: 40vh` com `object-fit: contain`
- Legenda automática: texto `alt` vira `<figcaption>` estilizado dentro de `<figure>`

### Modal interativo (lightbox)
- Ativação: clique na imagem ou legenda → overlay escuro
- Tamanho: `90vw × 90vh`
- Navegação: setas `←` / `→` ou botões na tela
- Fechamento: `Esc`, clique fora, ou botão `×`

---

## Renderização de diagramas client-side (gating por-doc)

O `build.js` injeta libs pesadas **apenas nas páginas que precisam**, via flags derivadas do conteúdo do doc. Padrão isomórfico para três recursos:

| Recurso | Fence/marcador | Flag (`build.js`) | CDN injetado no `<head>` | Hidratação |
|---|---|---|---|---|
| Mermaid | ` ```mermaid ` | `hasMermaid` | `mermaid.min.js` | troca `pre code.language-mermaid` por `div.mermaid` |
| **BPMN** | ` ```bpmn ` | `hasBpmn` | `bpmn-navigated-viewer.production.min.js` + `diagram-js.css` + `bpmn-js.css` (`bpmn-js@17`, expõe `window.BpmnJS`) | `initBpmn()` troca `pre code.language-bpmn` por viewer interativo |
| Citações | link `[[Pxxxx]](transcription/…txt)` | `hasCiteRefs` | — (JSON `__TRANSCRIPT__` embutido) | painel/modal de transcrição |

### Suporte a BPMN 2.0 XML (visualizador)
- **Como um doc declara que precisa do viewer:** basta um bloco de código com a linguagem `bpmn` contendo o XML BPMN 2.0 inline (não use `xml`, senão não renderiza). Coloque-o no doc de BPMN do projeto (`docs.files.bpmn`).
- **Comportamento:** cada bloco `bpmn` vira um container de **480px** com zoom/pan (bpmn-js *navigated viewer*), `fit-viewport` automático. Suporta **múltiplos diagramas por página** (ids únicos `bpmn-canvas-N`).
- **Afordância de exportação:** cada viewer ganha botões **“Baixar .bpmn”** (Blob → arquivo para Camunda Modeler / bpmn.io) e **“Copiar XML”**. O `<pre>` original é substituído, então o XML cru permanece acessível por esses botões.
- **Fallback:** se `window.BpmnJS` não carregar (ex.: offline), o container mostra o XML cru escapado — degrada sem quebrar a página.
- **Gating:** o CDN do bpmn-js + CSS entram **só** nas páginas com `hasBpmn`; a função `initBpmn()` faz `return` cedo quando não há blocos, então é inócua nas demais.

---

## Decodificação no hover (injeção de `title` — convenção da skill `glossario`)

O `build.js` injeta um atributo **`title` nativo** em cada termo conhecido, em **todo** doc
compilado, para reduzir a carga cognitiva (o leitor passa o mouse e decodifica a sigla/lógica
interna). **Zero dependência** — é o `title` do browser, sem lib/CDN de tooltip.

- **Entrada:** `001-docs/glossary.yaml` (por convenção) — o SSOT dos títulos.
  Ver a skill **`glossario`** para o formato e a regra de manutenção.
- **Máquina (agnóstica):** `loadGlossary()` + `buildAnnotator()` + `injectGlossaryTitles()` no
  `build.js`. Opera na saída final do `marked`, envolvendo cada ocorrência em `<abbr title>`
  (siglas) ou `<span class="gloss" title>` (lógica interna). **Não** toca em código, links,
  headings nem `<abbr>` já existentes.
- **No-op seguro:** sem `glossary.yaml`, o build roda igual (nenhum `title` injetado). É o que
  torna a feature **portável** para outros projetos/clientes — troca-se só o dado.
- **CSS:** um único par de regras (`abbr[title], .gloss[title]`) no `<style>` do template dá a
  afordância visual (sublinhado pontilhado + `cursor:help`); o tooltip continua sendo o `title`.
- **Verificação:** `npm run build` e `grep -oE 'title="[^"]*"' dist/<doc>.html`.
