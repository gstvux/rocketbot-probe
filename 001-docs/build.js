const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const yaml = require('js-yaml');

// ─── Glossário: decodificação no hover (title nativo) ────────
// AGNÓSTICO: a máquina é genérica; só o dado (glossary.yaml) muda por projeto.
// Formato mínimo (parser dedicado — sem dependência, sem lib):
//   terms:
//     - term: PP
//       kind: acronym                 # acronym → <abbr> | term → <span class="gloss">
//       title: Planilha Principal — Excel único, insumo vivo do robô
//       aliases: Planilha Principal   # opcional, separado por vírgula (ou [a, b])
// Arquivo ausente/vazio ⇒ retorna [] e a injeção vira no-op (build roda igual).
function loadGlossary(glossaryPath) {
  if (!glossaryPath || !fs.existsSync(glossaryPath)) return [];
  const unquote = (v) => {
    v = v.trim();
    return (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))
      ? v.slice(1, -1) : v;
  };
  const terms = [];
  let cur = null;
  for (const line of fs.readFileSync(glossaryPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const mNew = trimmed.match(/^-\s+term:\s*(.+)$/);
    if (mNew) { cur = { term: unquote(mNew[1]), kind: 'term', title: '', aliases: [] }; terms.push(cur); continue; }
    if (!cur) continue; // ignora a chave `terms:` e qualquer lixo antes do 1º item
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim(); // split no 1º ':' → título pode conter ':'
    if (key === 'kind') cur.kind = unquote(val) === 'acronym' ? 'acronym' : 'term';
    else if (key === 'title') cur.title = unquote(val);
    else if (key === 'aliases') {
      let v = val;
      if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
      cur.aliases = v.split(',').map(unquote).filter(Boolean);
    }
  }
  return terms.filter(t => t.term && t.title);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escAttr(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Constrói o anotador uma vez: regex de termos+aliases (mais longo → mais curto,
// limites de palavra que respeitam acento). Retorna null se não há glossário (no-op).
function buildAnnotator(glossary) {
  if (!glossary.length) return null;
  const map = new Map();
  for (const t of glossary) {
    for (const key of [t.term, ...t.aliases]) {
      if (key && !map.has(key)) map.set(key, t);
    }
  }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp('(?<![\\wÀ-ú])(' + keys.join('|') + ')(?![\\wÀ-ú])', 'g');
  return (text) => text.replace(re, (m) => {
    const t = map.get(m);
    const title = escAttr(t.title);
    return t.kind === 'acronym'
      ? `<abbr title="${title}">${m}</abbr>`
      : `<span class="gloss" title="${title}">${m}</span>`;
  });
}

// Injeta os title só em nós de TEXTO do HTML já renderizado. Divide em segmentos
// tag/texto e pula o interior de código, links, headings e abbr já existentes —
// robusto e independente da versão do marked (opera na saída final).
function injectGlossaryTitles(html, annotate) {
  if (!annotate) return html;
  const parts = html.split(/(<[^>]+>)/g);
  const OPEN = /^<(code|pre|a|abbr|script|style|h[1-6])\b/i;
  const CLOSE = /^<\/(code|pre|a|abbr|script|style|h[1-6])>/i;
  let skip = 0;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (seg.startsWith('<')) {
      if (CLOSE.test(seg)) skip = Math.max(0, skip - 1);
      else if (OPEN.test(seg) && !seg.endsWith('/>')) skip++;
      continue; // tags nunca são anotadas (protege atributos)
    }
    if (skip === 0 && seg) parts[i] = annotate(seg);
  }
  return parts.join('');
}

// ─── Cronograma executivo (SSR SVG, zero dependência) ────────────────────────
// AGNÓSTICO: o dado vive em 001-docs/cronograma.yaml; esta máquina (render) é genérica.
// OPT-IN: sem cronograma.yaml OU sem bloco ```cronograma no doc ⇒ no-op (build roda igual).
// Modelo: meta + fases[] (cada uma com tarefas[]). O agendamento é um forward-pass a partir
// de `duracao_estimada` (m|h|d) + `depende_de` (ids) — datas são OPCIONAIS (meta.inicio).
// Paleta semântica da spec: fase cicla Indigo→Blue→Emerald…; marco=violeta; gate=vermelho.
const CRONO_PALETTE   = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#0EA5E9'];
const CRONO_MILESTONE = '#8B5CF6';  // losango (Go-Live)
const CRONO_GATE      = '#EF4444';  // gate / gargalo (círculo ou contorno crítico)
const CRONO_DEP       = '#94A3B8';  // linha de dependência (tracejada, sutil)
const CRONO_TODAY     = '#BC0017';  // linha de "hoje" (vermelho da marca)

function loadCronograma(cronogramaPath) {
  if (!cronogramaPath || !fs.existsSync(cronogramaPath)) return null;
  try {
    const data = yaml.load(fs.readFileSync(cronogramaPath, 'utf-8'));
    return (data && Array.isArray(data.fases)) ? data : null;
  } catch (e) {
    console.warn('⚠️  cronograma.yaml inválido — ignorado:', e.message);
    return null;
  }
}

// "30m" | "2h" | "3d" | "1.5d" | number(minutos) → minutos (d = dia de 24h)
function cronoDurToMin(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^([\d.]+)\s*([mhd]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = (m[2] || 'm').toLowerCase();
  return u === 'd' ? n * 1440 : u === 'h' ? n * 60 : n;
}

// minutos → rótulo humano compacto (3d | 2h | 30m)
function cronoFmtDur(min) {
  if (!min || min <= 0) return '';
  if (min % 1440 === 0) return (min / 1440) + 'd';
  if (min % 60 === 0)   return (min / 60) + 'h';
  return min + 'm';
}

// Recebe o objeto do cronograma + opções do bloco (view/today) → HTML self-contained
// (um <div> com <svg> inline; sem CDN, sem JS no cliente). PDF/print-friendly.
function renderCronogramaSvg(data, options) {
  options = (options && typeof options === 'object' && !Array.isArray(options)) ? options : {};
  const meta  = data.meta || {};
  const fases = Array.isArray(data.fases) ? data.fases : [];

  // 1) Achatar tarefas com índice de fase
  const tasks = [];
  fases.forEach((f, fi) => (Array.isArray(f.tarefas) ? f.tarefas : []).forEach(t => {
    const tipo = String(t.tipo || '').toLowerCase();
    tasks.push({
      id: t.id, nome: String(t.nome || t.id || ''), phaseIdx: fi,
      dur: cronoDurToMin(t.duracao_estimada),
      deps: Array.isArray(t.depende_de) ? t.depende_de : (t.depende_de ? [t.depende_de] : []),
      tipo, critico: t.critico === true, responsavel: String(t.responsavel || '')
    });
  }));
  if (!tasks.length) return '';
  const byId = new Map(tasks.map(t => [t.id, t]));

  // 2) Forward-pass: start = max(end das dependências). Memoizado + guarda de ciclo.
  function startOf(t, seen) {
    if (t._start != null) return t._start;
    seen = seen || new Set();
    if (seen.has(t.id)) return (t._start = 0);
    seen.add(t.id);
    let s = 0;
    t.deps.forEach(d => { const p = byId.get(d); if (p) s = Math.max(s, startOf(p, seen) + p.dur); });
    return (t._start = s);
  }
  tasks.forEach(t => { t.start = startOf(t); t.end = t.start + t.dur; });
  const total = Math.max(1, ...tasks.map(t => t.end));

  // 3) Geometria (spec: coluna de rótulos fixa à esquerda, barras à direita)
  const PAD = 24, LABEL_W = 236, AXIS_H = 30, ROW_H = 22, ROW_GAP = 10, PHASE_H = 28, W = 1200;
  const chartX = PAD + LABEL_W;
  const chartW = W - chartX - PAD;
  const sx = v => chartX + (v / total) * chartW;
  const color = fi => (fases[fi] && fases[fi].cor) ? fases[fi].cor : CRONO_PALETTE[fi % CRONO_PALETTE.length];

  // Linhas: header de fase + tarefas (mantém a ordem autoral); centro-Y por id p/ dependências
  let y = PAD + AXIS_H;
  const rows = [];
  const centerById = new Map();
  fases.forEach((f, fi) => {
    rows.push({ type: 'phase', fi, nome: String(f.nome || ('Fase ' + (fi + 1))), y });
    y += PHASE_H;
    tasks.filter(t => t.phaseIdx === fi).forEach(t => {
      rows.push({ type: 'task', t, y });
      centerById.set(t.id, y + ROW_H / 2);
      y += ROW_H + ROW_GAP;
    });
  });
  const H = y + PAD;

  // Eixo: granularidade + rótulo (data dd/mm se meta.inicio; senão unidade abstrata)
  const inicioDate = meta.inicio && /^\d{4}-\d{2}-\d{2}/.test(String(meta.inicio))
    ? new Date(String(meta.inicio).slice(0, 10) + 'T00:00:00Z') : null;
  let tick, unitLabel;
  if (total <= 8 * 60)        { tick = 60;        unitLabel = v => (v / 60) + 'h'; }
  else if (total <= 6 * 1440) { tick = 1440;      unitLabel = v => 'D' + Math.round(v / 1440 + 1); }
  else                        { tick = 7 * 1440;  unitLabel = v => 'S' + Math.round(v / (7 * 1440) + 1); }
  const tickText = v => {
    if (inicioDate) { const d = new Date(inicioDate.getTime() + v * 60000);
      return ('0' + d.getUTCDate()).slice(-2) + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2); }
    return unitLabel(v);
  };

  const esc = s => escAttr(s);
  const trunc = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  // 4) Partes do SVG
  const grid = [];
  for (let v = 0; v <= total + 1; v += tick) {
    const x = sx(v);
    grid.push(`<line x1="${x.toFixed(1)}" y1="${PAD + AXIS_H - 6}" x2="${x.toFixed(1)}" y2="${H - PAD}" stroke="#0F172A" stroke-opacity="0.06" stroke-width="1"/>`);
    grid.push(`<text x="${x.toFixed(1)}" y="${PAD + AXIS_H - 12}" text-anchor="middle" font-size="10" fill="#94A3B8" font-family="'IBM Plex Mono',monospace">${esc(tickText(v))}</text>`);
  }

  // Dependências: elo tracejado sutil do predecessor primário (deps[0]) → início da tarefa
  const deps = [];
  tasks.forEach(t => {
    if (!t.deps.length) return;
    const p = byId.get(t.deps[0]);
    if (!p) return;
    const y1 = centerById.get(p.id), y2 = centerById.get(t.id);
    if (y1 == null || y2 == null || y1 === y2) return;
    const x1 = sx(p.end), x2 = sx(t.start);
    const midx = x1 + Math.max(8, (x2 - x1) / 2);
    deps.push(`<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} H${midx.toFixed(1)} V${y2.toFixed(1)} H${x2.toFixed(1)}" fill="none" stroke="${CRONO_DEP}" stroke-width="1" stroke-dasharray="4 3" stroke-opacity="0.55"/>`);
  });

  const bars = [], labels = [];
  rows.forEach(r => {
    if (r.type === 'phase') {
      const c = color(r.fi), cy = r.y + PHASE_H / 2;
      labels.push(`<circle cx="${PAD + 4}" cy="${cy.toFixed(1)}" r="4" fill="${c}"/>`);
      labels.push(`<text x="${PAD + 14}" y="${(cy + 3.5).toFixed(1)}" font-size="11.5" font-weight="700" fill="#1E293B" font-family="'Montserrat',sans-serif">${esc(trunc(r.nome, 40))}</text>`);
      return;
    }
    const t = r.t, cy = r.y + ROW_H / 2, c = color(t.phaseIdx);
    // Rótulo à esquerda (100% horizontal, coluna fixa — spec)
    labels.push(`<text x="${PAD + 14}" y="${(cy + 3.5).toFixed(1)}" font-size="10.5" fill="#475569" font-family="'IBM Plex Sans',sans-serif">${esc(trunc(t.nome, 34))}</text>`);
    const xs = sx(t.start);
    if (t.dur === 0 || t.tipo === 'milestone' || t.tipo === 'gate') {
      // Zero-duração: marco (losango violeta) OU gate/gargalo (círculo vermelho)
      if (t.tipo === 'gate') {
        bars.push(`<circle cx="${xs.toFixed(1)}" cy="${cy.toFixed(1)}" r="6.5" fill="${CRONO_GATE}" stroke="#fff" stroke-width="1.5"/>`);
      } else {
        const s = 7;
        bars.push(`<path d="M${xs.toFixed(1)} ${(cy - s).toFixed(1)} L${(xs + s).toFixed(1)} ${cy.toFixed(1)} L${xs.toFixed(1)} ${(cy + s).toFixed(1)} L${(xs - s).toFixed(1)} ${cy.toFixed(1)} Z" fill="${CRONO_MILESTONE}" stroke="#fff" stroke-width="1.5"/>`);
      }
      // rótulo do marco/gate: só à ESQUERDA (coluna fixa) — evita corte na borda direita
    } else {
      // Barra normal (corner radius 6); crítica ganha contorno vermelho (gargalo na trilha)
      const xe = sx(t.end), bw = Math.max(3, xe - xs);
      bars.push(`<rect x="${xs.toFixed(1)}" y="${(cy - ROW_H / 2 + 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${ROW_H - 4}" rx="6" fill="${c}"${t.critico ? ` stroke="${CRONO_GATE}" stroke-width="2"` : ''}/>`);
      const dtxt = cronoFmtDur(t.dur);
      if (bw > 44) bars.push(`<text x="${(xs + bw / 2).toFixed(1)}" y="${(cy + 3.2).toFixed(1)}" text-anchor="middle" font-size="9.5" font-weight="600" fill="#fff" font-family="'IBM Plex Mono',monospace">${esc(dtxt)}</text>`);
      else if (dtxt) bars.push(`<text x="${(xe + 5).toFixed(1)}" y="${(cy + 3.2).toFixed(1)}" font-size="9.5" fill="#94A3B8" font-family="'IBM Plex Mono',monospace">${esc(dtxt)}</text>`);
    }
  });

  // Linha de "hoje": options.today | meta.hoje (data ISO se meta.inicio; senão duração)
  let today = '';
  const todayRaw = options.today != null ? options.today : meta.hoje;
  if (todayRaw != null) {
    let todayMin;
    if (inicioDate && /^\d{4}-\d{2}-\d{2}/.test(String(todayRaw))) {
      todayMin = Math.max(0, (new Date(String(todayRaw).slice(0, 10) + 'T00:00:00Z') - inicioDate) / 60000);
    } else todayMin = cronoDurToMin(todayRaw);
    if (todayMin >= 0 && todayMin <= total) {
      const x = sx(todayMin);
      today = `<line x1="${x.toFixed(1)}" y1="${PAD + AXIS_H - 8}" x2="${x.toFixed(1)}" y2="${H - PAD}" stroke="${CRONO_TODAY}" stroke-width="1.5"/>`
            + `<text x="${x.toFixed(1)}" y="${H - PAD + 12}" text-anchor="middle" font-size="9" font-weight="700" fill="${CRONO_TODAY}" font-family="'IBM Plex Mono',monospace">hoje</text>`;
    }
  }

  // 5) Legenda + header do card
  const legend = [];
  fases.forEach((f, fi) => legend.push(
    `<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.68rem;color:#475569"><span style="width:10px;height:10px;border-radius:3px;background:${color(fi)}"></span>${esc(trunc(String(f.nome || ('Fase ' + (fi + 1))), 28))}</span>`));
  legend.push(`<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.68rem;color:#475569"><span style="color:${CRONO_MILESTONE};font-size:0.9rem;line-height:1">&#9670;</span>Marco</span>`);
  legend.push(`<span style="display:inline-flex;align-items:center;gap:5px;font-size:0.68rem;color:#475569"><span style="color:${CRONO_GATE};font-size:0.8rem;line-height:1">&#9679;</span>Gate / gargalo</span>`);

  const titulo = esc(String(meta.projeto || 'Cronograma'));
  const badges = [];
  if (meta.frequencia) badges.push(`<span style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#4338CA;background:#EEF2FF;border:1px solid #C7D2FE;padding:2px 7px;border-radius:4px">${esc(String(meta.frequencia))}</span>`);
  if (meta.versao)     badges.push(`<span style="font-size:0.62rem;font-family:'IBM Plex Mono',monospace;color:#64748B">v${esc(String(meta.versao))}</span>`);

  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cronograma: ${titulo}" style="width:100%;height:auto;min-width:760px;display:block">`
    + `<rect x="0" y="0" width="${W}" height="${H}" fill="#F8FAFC"/>`
    + grid.join('') + deps.join('') + bars.join('') + labels.join('') + today
    + `</svg>`;

  return `<div class="cronograma-card" style="border:1px solid #E2E8F0;border-radius:10px;background:#F8FAFC;padding:16px 16px 12px;margin:1rem 0;box-shadow:0 1px 2px rgba(15,23,42,0.04)">`
    + `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px">`
    +   `<h4 style="margin:0;font-family:'Montserrat',sans-serif;font-size:0.95rem;font-weight:800;color:#1E293B">${titulo}</h4>`
    +   `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">${badges.join('')}</div>`
    + `</div>`
    + `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:8px">${legend.join('')}</div>`
    + `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">${svg}</div>`
    + `</div>`;
}

// ─── Parser de Transcrição ──────────────────────────────────
// Suporta formato legado [P000N] e novo formato enriquecido [U000N] com falante/confiança
function parseTranscript(txtPath) {
  if (!fs.existsSync(txtPath)) return null;
  const raw = fs.readFileSync(txtPath, 'utf-8');
  const lines = raw.split('\n');
  const paragraphs = [];
  let i = 0;
  // Pular header de metadados (=== METADADOS === ... === TRANSCRIÇÃO ===)
  while (i < lines.length && !lines[i].match(/^\[(?:P|U)\d{4}\]/)) i++;
  while (i < lines.length) {
    // [P0001] [MM:SS–MM:SS]  ou  [U0001] [MM:SS–MM:SS] [FALANTE_N] [conf: X.XX]
    const m = lines[i].match(/^\[([PU])(\d{4})\]\s*\[([^\]]+)\](?:\s*\[FALANTE_(\d+)\])?(?:\s*\[conf:\s*([^\]]+)\])?/);
    if (m) {
      const id        = m[1] + m[2];
      const timestamp = m[3];
      const speaker   = m[4] !== undefined ? `FALANTE_${m[4]}` : null;
      const conf      = m[5] ? parseFloat(m[5]) : null;
      const textLines = [];
      i++;
      while (i < lines.length && !lines[i].match(/^\[(?:P|U)\d{4}\]/)) {
        textLines.push(lines[i]);
        i++;
      }
      const entry = { id, timestamp, text: textLines.join('\n').trim() };
      if (speaker) entry.speaker = speaker;
      if (conf !== null) entry.confidence = conf;
      paragraphs.push(entry);
    } else {
      i++;
    }
  }
  return paragraphs.length ? paragraphs : null;
}

// ─── project.yaml — SSOT de identidade, caminhos e publicação ─────────────────
// A máquina é AGNÓSTICA: tudo que é específico de projeto/cliente vem daqui.
const REPO = path.join(__dirname, '..');
const projectPath = path.join(REPO, 'project.yaml');
if (!fs.existsSync(projectPath)) {
  console.error('❌ project.yaml não encontrado em', REPO);
  process.exit(1);
}
const project = yaml.load(fs.readFileSync(projectPath, 'utf-8')) || {};
const P     = project.project     || {};
const DOCS  = project.docs        || {};
const FILES = DOCS.files          || {};
const PUB   = project.publication || {};

// Título fixo do portal (padronizado — não é bikeshed de branding/estilo).
const PORTAL_TITLE = 'Rocketbot probe docs';
// Cliente e processo entram SOB DEMANDA (preenchidos pelas skills no project.yaml).
const CLIENT   = String(P.client || '').trim();
const PROCESS  = String(P.name   || '').trim();
const MAIN_DOC = String(FILES.pdd || '').trim();   // doc principal (destaque no Hub)
// Assinatura do portal: "Rocketbot probe docs" (+ " · <Cliente>" quando preenchido).
const BRAND_LINE = CLIENT ? `${PORTAL_TITLE} · ${CLIENT}` : PORTAL_TITLE;

const BUILD_VERSION = String(P.version || '0.0.0');
const DNS_SAFE_VERSION = BUILD_VERSION.replace(/\./g, '-');
const PUBLISH_DOMAIN = (PUB.domain_pattern || 'docs-rocketbot-probe-v{{version}}')
  .replace(/\{\{version\}\}/g, DNS_SAFE_VERSION) + '.surge.sh';

console.log(`📋 project.yaml: ${PROCESS || '(processo sem nome)'} v${BUILD_VERSION} → ${PUBLISH_DOMAIN}`);

// ─── Carregar glossário do projeto (SSOT dos títulos de decodificação) ──
const glossaryPath = path.join(__dirname, 'glossary.yaml');
const glossary = loadGlossary(glossaryPath);
const annotateGlossary = buildAnnotator(glossary);
if (glossary.length) console.log(`🏷️  Glossário: ${glossary.length} termo(s) → title no hover`);

// ─── Carregar cronograma do projeto (SSOT executivo — OPT-IN, convenção) ──
// Ausente ⇒ null e o bloco ```cronograma vira nota discreta (no-op seguro no build).
const cronogramaPath = path.join(__dirname, 'cronograma.yaml');
const cronograma = loadCronograma(cronogramaPath);
if (cronograma) console.log(`🗓️  Cronograma: ${(cronograma.fases || []).length} fase(s) → SVG SSR`);

// ─── Carregar Transcrição(ões) ───────────────────────────────
// Suporta `transcription_slug` (string, legado) e `transcription_slugs` (lista).
// Cada bloco recebe `source` = nome do arquivo .txt, para o painel mostrar a origem
// correta. IDs P#### (transcript 05-27) e U#### (call 06-17) não colidem no mapa.
const transcriptSlugs = ((project.discovery && project.discovery.sessions) || [])
  .map(s => s && s.slug).filter(Boolean);
const transcriptData = transcriptSlugs.reduce((acc, slug) => {
  const p = path.join(__dirname, 'transcription', `${slug}.txt`);
  if (!fs.existsSync(p)) { console.warn(`⚠️  Transcrição não encontrada: ${slug}.txt`); return acc; }
  const blocks = parseTranscript(p).map(b => ({ ...b, source: `${slug}.txt` }));
  console.log(`📝 Transcrição ${slug}: ${blocks.length} blocos`);
  return acc.concat(blocks);
}, []);
const transcriptJson = transcriptData.length ? JSON.stringify(transcriptData) : 'null';

// Configurar custom renderer para Marked para gerar IDs em cabeçalhos (âncoras)
const renderer = {
  heading(text, level, raw) {
    // Slugify raw text to match markdown anchors
    const slug = raw
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '') // remove tudo que não for letra, número, espaço ou traço
      .replace(/\s/g, '-');              // substitui espaços por traços
      
    return `<h${level} id="${slug}">${text}</h${level}>`;
  },

  // Intercepta [[PXXXX]](transcription/...) → <a class="cite-ref"> clicável
  link(href, title, text) {
    if (href && href.includes('transcription/') && href.includes('.txt')) {
      const m = (text || '').match(/([PU]\d{4})/);
      if (m) {
        const pid = m[1];
        return `<a class="cite-ref" data-pid="${pid}" href="#" title="Ver na transcrição: ${pid}">[${pid}]</a>`;
      }
    }
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${href || ''}"${titleAttr}>${text || ''}</a>`;
  }
};
marked.use({ renderer });

// Configurações de diretórios
const docsDir = __dirname;
const distDir = path.join(docsDir, 'dist');
const brandSrcDir = path.join(docsDir, 'brand');
const brandDistDir = path.join(distDir, 'brand');
const assetsSrcDir = path.join(docsDir, '..', 'assets');
const assetsDistDir = path.join(distDir, 'assets');

// Limpa HTMLs antigos do dist (evita stale files de builds anteriores)
if (fs.existsSync(distDir)) {
  fs.readdirSync(distDir).forEach(file => {
    if (file.endsWith('.html')) {
      fs.rmSync(path.join(distDir, file));
    }
  });
}

// Garante que os diretórios de destino existem
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(brandDistDir)) {
  fs.mkdirSync(brandDistDir, { recursive: true });
}
if (!fs.existsSync(assetsDistDir)) {
  fs.mkdirSync(assetsDistDir, { recursive: true });
}

// Copiar assets de evidência visual (frames do vídeo SSOT)
console.log('🖼️  Copiando assets de evidência...');
if (fs.existsSync(assetsSrcDir)) {
  const assetFiles = fs.readdirSync(assetsSrcDir);
  let assetCount = 0;
  assetFiles.forEach(file => {
    if (['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(path.extname(file).toLowerCase())) {
      fs.copyFileSync(path.join(assetsSrcDir, file), path.join(assetsDistDir, file));
      assetCount++;
    }
  });
  console.log(`   ✅ ${assetCount} assets copiados -> dist/assets/`);
}

// Passo de consumo de Assets da pasta brand
console.log('🎨 Carregando assets da marca...');
let brandAssets = [];
if (fs.existsSync(brandSrcDir)) {
  const files = fs.readdirSync(brandSrcDir);
  files.forEach(file => {
    const ext = path.extname(file).toLowerCase();
    // Copiar apenas imagens e SVGs leves (ignora ZIP e PDFs pesados de 95MB+)
    if (['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      const srcPath = path.join(brandSrcDir, file);
      const distPath = path.join(brandDistDir, file);
      fs.copyFileSync(srcPath, distPath);
      brandAssets.push(file);
      console.log(`   🖼️  Asset copiado: brand/${file} -> dist/brand/${file}`);
    }
  });
}

// Ler todos os arquivos markdown da pasta
const mdFiles = fs.readdirSync(docsDir)
  .filter(file => file.endsWith('.md') && file !== 'README.md')
  .sort((a, b) => a.localeCompare(b));

// Extrai metadados de cada arquivo
const documents = mdFiles.map(file => {
  const filePath = path.join(docsDir, file);
  const content = fs.readFileSync(filePath, 'utf-8');
  
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1] : file.replace('.md', '').replace(/-/g, ' ');
  const htmlFile = file.replace('.md', '.html');
  
  const isMain = MAIN_DOC ? file === MAIN_DOC : /^PDD-/i.test(file);
  
  return {
    filename: file,
    htmlFilename: htmlFile,
    title: title,
    rawContent: content,
    isMain: isMain
  };
});

// Separar documento principal das fontes de apoio
const mainDocs = documents.filter(d => d.isMain);
const supportDocs = documents.filter(d => !d.isMain);

// ─── Status git por arquivo (badges novo/atualizado no Hub) ───
// Untracked (??) → "novo"; modificado/add/rename → "atualizado"; limpo → sem badge.
// Decisão de fonte automática via git status (estado da árvore de trabalho no momento do build).
function getGitStatusMap(dir) {
  const map = {};
  try {
    const { execSync } = require('child_process');
    const out = execSync('git status --porcelain -- .', { cwd: dir, encoding: 'utf-8' });
    out.split('\n').forEach(line => {
      if (!line.trim()) return;
      const xy = line.slice(0, 2);
      let p = line.slice(3).trim();
      if (p.includes('->')) p = p.split('->').pop().trim(); // renomeados: "old -> new"
      const file = p.replace(/^.*\//, '').replace(/"/g, ''); // basename, sem aspas
      if (!file.endsWith('.md')) return;
      if (xy.includes('?')) map[file] = 'novo';             // untracked
      else if (/[MARC]/.test(xy)) map[file] = 'atualizado'; // modified/added/renamed/copied
    });
  } catch (e) { /* sem git → sem badges, degrada sem quebrar o build */ }
  return map;
}
const gitStatusMap = getGitStatusMap(docsDir);

// Badge de status para o card do Hub (verde = novo, azul = atualizado)
// Tons de contraste moderado, alinhados à estética clara dos docs.
function docBadgeHtml(filename) {
  const st = gitStatusMap[filename];
  if (st === 'novo')
    return '<span class="text-[9px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded uppercase tracking-wider">novo</span>';
  if (st === 'atualizado')
    return '<span class="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase tracking-wider">atualizado</span>';
  return '';
}

// ─── Script do Painel de Citação (gerado em build-time, injetado condicionalmente) ───
function getCitePanelScript() {
  return '<script>\n' +
'(function () {\n' +
'  if (!window.__TRANSCRIPT__ || !Array.isArray(window.__TRANSCRIPT__)) return;\n' +
'  var T = window.__TRANSCRIPT__;\n' +
'  var map = new Map();\n' +
'  T.forEach(function (p) { map.set(p.id, p); });\n' +
'\n' +
'  var overlay = document.createElement(\'div\');\n' +
'  overlay.id = \'cite-overlay\';\n' +
'\n' +
'  var panel = document.createElement(\'div\');\n' +
'  panel.id = \'cite-panel\';\n' +
'  panel.setAttribute(\'role\', \'dialog\');\n' +
'  panel.setAttribute(\'aria-modal\', \'true\');\n' +
'  panel.setAttribute(\'aria-label\', \'Transcrição — citação\');\n' +
'\n' +
'  var hdr = document.createElement(\'div\');\n' +
'  hdr.id = \'cite-panel-header\';\n' +
'  hdr.innerHTML =\n' +
'    \'<div id="cite-panel-header-left">\' +\n' +
'      \'<span class="cite-pid-badge" id="cite-active-pid"></span>\' +\n' +
'      \'<span class="cite-timestamp-badge" id="cite-active-ts"></span>\' +\n' +
'    \'</div>\' +\n' +
'    \'<div style="display:flex;align-items:center;gap:5px;min-width:0;">\' +\n' +
'      \'<span class="cite-panel-source-label" id="cite-active-source"></span>\' +\n' +
'      \'<button id="cite-panel-close" aria-label="Fechar painel">&#x2715;</button>\' +\n' +
'    \'</div>\';\n' +
'\n' +
'  var body = document.createElement(\'div\');\n' +
'  body.id = \'cite-panel-body\';\n' +
'\n' +
'  T.forEach(function (p) {\n' +
'    var el = document.createElement(\'div\');\n' +
'    el.className = \'cite-para\';\n' +
'    el.id = \'cite-para-\' + p.id;\n' +
'    var txt = (p.text || \'\')\n' +
'      .replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\').replace(/"/g, \'&quot;\');\n' +
'    el.innerHTML =\n' +
'      \'<div class="cite-para-header">\' +\n' +
'        \'<span class="cite-para-id">\' + p.id + \'</span>\' +\n' +
'        \'<span class="cite-para-ts">\' + p.timestamp + \'</span>\' +\n' +
'      \'</div>\' +\n' +
'      \'<div class="cite-para-text">\' + txt + \'</div>\';\n' +
'    body.appendChild(el);\n' +
'  });\n' +
'\n' +
'  panel.appendChild(hdr);\n' +
'  panel.appendChild(body);\n' +
'  overlay.appendChild(panel);\n' +
'  document.body.appendChild(overlay);\n' +
'\n' +
'  var elPid = document.getElementById(\'cite-active-pid\');\n' +
'  var elTs  = document.getElementById(\'cite-active-ts\');\n' +
'  var elSrc = document.getElementById(\'cite-active-source\');\n' +
'\n' +
'  function open(pid) {\n' +
'    var p = map.get(pid);\n' +
'    if (!p) return;\n' +
'    elPid.textContent = pid;\n' +
'    elTs.textContent  = p.timestamp;\n' +
'    if (elSrc) elSrc.textContent = p.source || \'\';\n' +
'    overlay.classList.add(\'active\');\n' +
'    document.body.style.overflow = \'hidden\';\n' +
'    panel.setAttribute(\'tabindex\', \'-1\');\n' +
'    panel.focus({ preventScroll: true });\n' +
'    var target = document.getElementById(\'cite-para-\' + pid);\n' +
'    if (!target) return;\n' +
'    requestAnimationFrame(function () {\n' +
'      requestAnimationFrame(function () {\n' +
'        target.scrollIntoView({ block: \'start\', behavior: \'instant\' });\n' +
'        body.scrollTop = Math.max(0, body.scrollTop - 6);\n' +
'        var prev = body.querySelector(\'.cite-highlighted\');\n' +
'        if (prev) { prev.classList.remove(\'cite-highlighted\'); void prev.offsetWidth; }\n' +
'        target.classList.add(\'cite-highlighted\');\n' +
'      });\n' +
'    });\n' +
'  }\n' +
'\n' +
'  function close() {\n' +
'    overlay.classList.remove(\'active\');\n' +
'    document.body.style.overflow = \'\';\n' +
'  }\n' +
'\n' +
'  document.addEventListener(\'click\', function (e) {\n' +
'    var ref = e.target.closest(\'.cite-ref\');\n' +
'    if (ref) {\n' +
'      e.preventDefault();\n' +
'      var pid = ref.getAttribute(\'data-pid\');\n' +
'      if (pid) open(pid);\n' +
'      return;\n' +
'    }\n' +
'    if (e.target.closest(\'#cite-panel-close\')) { close(); return; }\n' +
'    if (e.target === overlay) close();\n' +
'  });\n' +
'\n' +
'  document.addEventListener(\'keydown\', function (e) {\n' +
'    if (e.key === \'Escape\' && overlay.classList.contains(\'active\')) close();\n' +
'  });\n' +
'})();\n' +
'<\/script>';
}

// Template HTML centralizado com a identidade visual da Rocketbot
function getHtmlTemplate(activeDoc, bodyHtml, hasMermaid, hasCiteRefs, hasBpmn) {
  
  // Constrói itens do menu lateral
  const mainDocItemsHtml = mainDocs.map(item => {
    const isActive = activeDoc && item.htmlFilename === activeDoc.htmlFilename;
    const activeClass = isActive 
      ? 'bg-brand-accent text-brand-red font-bold border-l-4 border-brand-red pl-2' 
      : 'text-brand-dark hover:bg-brand-light hover:text-brand-red border-l-4 border-transparent pl-2';
    
    return `
      <a href="./${item.htmlFilename}" class="sidebar-item block py-1.5 rounded-sm text-xs transition-all duration-150 ${activeClass}">
        ${item.title}
      </a>
    `;
  }).join('');

  const supportDocItemsHtml = supportDocs.map(item => {
    const isActive = activeDoc && item.htmlFilename === activeDoc.htmlFilename;
    const activeClass = isActive 
      ? 'bg-brand-accent text-brand-red font-bold border-l-4 border-brand-red pl-2' 
      : 'text-[#4B5563] hover:bg-brand-light hover:text-brand-red border-l-4 border-transparent pl-2';
    
    return `
      <a href="./${item.htmlFilename}" class="sidebar-item block py-1.5 rounded-sm text-xs transition-all duration-150 ${activeClass}">
        ${item.title}
      </a>
    `;
  }).join('');

  // Identifica se temos o logotipo da Rocketbot na marca para renderizar na sidebar
  const hasLogo = brandAssets.includes('Isologo.svg');
  const logoHtml = hasLogo
    ? `<img src="./brand/Isologo.svg" class="h-6 w-auto" alt="Rocketbot Logo">`
    : `<div class="w-7 h-7 rounded bg-brand-red text-white font-bold flex items-center justify-center text-xs">R</div>`;

  const hubActiveClass = !activeDoc 
    ? 'bg-brand-dark text-white font-bold' 
    : 'text-brand-dark hover:bg-brand-light hover:text-brand-red';

  const docTitle = activeDoc ? activeDoc.title : 'Hub de Documentação';
  const pageTitle = activeDoc ? `${activeDoc.title} — ${BRAND_LINE}` : `Hub de Documentação — ${BRAND_LINE}`;

  return `<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${pageTitle}</title>
  
  <!-- Fontes do Google: Montserrat (Identidade) e IBM Plex -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <!-- Tailwind CSS com cores customizadas (Rocketbot) -->
  <script>
    window.tailwind = {
      config: {
        theme: {
          extend: {
            colors: {
              brand: {
                red: '#BC0017',     // Pantone 200C
                dark: '#263238',    // Pantone 432C
                light: '#F8F9FA',
                gray: '#E2E7EE',
                accent: '#FCE8E6',
              }
            }
          }
        }
      }
    };
  </script>
  <script src="https://cdn.tailwindcss.com"></script>
  
  ${hasMermaid ? '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>' : ''}
  ${hasBpmn ? '<link rel="stylesheet" href="https://unpkg.com/bpmn-js@17/dist/assets/diagram-js.css"><link rel="stylesheet" href="https://unpkg.com/bpmn-js@17/dist/assets/bpmn-js.css"><script src="https://unpkg.com/bpmn-js@17/dist/bpmn-navigated-viewer.production.min.js"></script>' : ''}
  ${hasCiteRefs ? `<script>window.__TRANSCRIPT__ = ${transcriptJson};</script>` : ''}

  <!-- Estilos Customizados de Alta Densidade (Clear Theme WCAG AAA) -->
  <style>
    body {
      font-family: 'IBM Plex Sans', sans-serif;
    }
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Montserrat', sans-serif;
    }
    .font-mono, code, pre {
      font-family: 'IBM Plex Mono', monospace;
    }
    
    /* Customização do visual Markdown para manter compacto e alinhado ao guia */
    .markdown-body h1 {
      font-size: 1.5rem;
      font-weight: 800;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      border-bottom: 1.5px solid #BC0017;
      padding-bottom: 0.25rem;
      color: #263238;
    }
    .markdown-body h2 {
      font-size: 1.15rem;
      font-weight: 700;
      margin-top: 1.25rem;
      margin-bottom: 0.375rem;
      border-bottom: 1px solid #E2E7EE;
      padding-bottom: 0.125rem;
      color: #263238;
    }
    .markdown-body h3 {
      font-size: 1.05rem;
      font-weight: 600;
      margin-top: 1rem;
      margin-bottom: 0.25rem;
      color: #263238;
    }
    .markdown-body p {
      margin-bottom: 0.5rem;
      line-height: 1.45;
      font-size: 0.85rem;
      color: #374151;
    }
    .markdown-body ul, .markdown-body ol {
      margin-bottom: 0.5rem;
      padding-left: 1.15rem;
      font-size: 0.85rem;
      color: #374151;
    }
    .markdown-body ul {
      list-style-type: disc;
    }
    .markdown-body ol {
      list-style-type: decimal;
    }
    .markdown-body li {
      margin-bottom: 0.15rem;
    }
    .markdown-body table {
      display: block;
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      font-size: 0.75rem;
      border-collapse: collapse;
      margin-top: 0.5rem;
      margin-bottom: 0.75rem;
      background-color: white;
      border: 1px solid #E2E7EE;
      border-radius: 4px;
    }
    .markdown-body th {
      background-color: #263238;
      color: white;
      font-weight: 600;
      padding: 0.4rem 0.6rem;
      text-align: left;
    }
    .markdown-body td {
      padding: 0.3rem 0.6rem;
      border-top: 1px solid #E2E7EE;
      color: #374151;
    }
    .markdown-body tr:hover {
      background-color: #F8F9FA;
    }
    .markdown-body code {
      background-color: #F3F4F6;
      color: #BC0017;
      padding: 0.1rem 0.2rem;
      border-radius: 3px;
      font-size: 0.75rem;
      word-break: break-word;
    }
    .markdown-body pre {
      background-color: #263238;
      color: #F8F9FA;
      padding: 0.6rem;
      border-radius: 4px;
      overflow-x: auto;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .markdown-body pre code {
      background-color: transparent;
      color: inherit;
      padding: 0;
      border-radius: 0;
      font-size: 0.75rem;
    }
    .markdown-body blockquote {
      border-left: 4px solid #BC0017;
      padding-left: 0.6rem;
      color: #374151;
      font-style: italic;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
      background-color: #FCE8E6;
      padding-top: 0.2rem;
      padding-bottom: 0.2rem;
      border-radius: 0 4px 4px 0;
    }
    .markdown-body a {
      color: #BC0017;
      text-decoration: underline;
      font-weight: 500;
    }
    .markdown-body a:hover {
      color: #930010;
    }

    /* ── Image Lightbox ── */
    .markdown-body img {
      cursor: zoom-in;
      border-radius: 6px;
      border: 1px solid #E2E7EE;
      transition: box-shadow 0.15s ease, transform 0.15s ease;
      max-width: 100%;
      max-height: 40vh;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .markdown-body img:hover {
      box-shadow: 0 2px 12px rgba(0,0,0,0.12);
      transform: scale(1.005);
    }
    .markdown-body figure {
      margin: 0.75rem 0;
      padding: 0;
    }
    .markdown-body figcaption {
      font-size: 0.7rem;
      color: #6B7280;
      margin-top: 0.25rem;
      padding-left: 2px;
      line-height: 1.3;
      font-style: italic;
    }
    #img-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.2s ease, visibility 0.2s ease;
      cursor: zoom-out;
    }
    #img-modal-overlay.active {
      opacity: 1;
      visibility: visible;
    }
    #img-modal-overlay img {
      max-width: 90vw;
      max-height: 90vh;
      width: auto;
      height: auto;
      object-fit: contain;
      border-radius: 6px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.4);
      transform: scale(0.92);
      transition: transform 0.2s ease;
    }
    #img-modal-overlay.active img {
      transform: scale(1);
    }
    #img-modal-caption {
      position: absolute;
      bottom: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(38,50,56,0.85);
      color: #F8F9FA;
      font-size: 0.7rem;
      padding: 4px 14px;
      border-radius: 4px;
      max-width: 80vw;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }
    #img-modal-close {
      position: absolute;
      top: 14px;
      right: 18px;
      background: rgba(38,50,56,0.7);
      border: none;
      color: #F8F9FA;
      font-size: 1.4rem;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease;
    }
    #img-modal-close:hover {
      background: #BC0017;
    }

    /* ══════════════════════════════════════════════
       CITATION PANEL — painel lateral de transcrição
       Desktop: painel lateral direito (40vw × 100dvh)
       Mobile:  modal centralizada (92vw × 88dvh)
    ══════════════════════════════════════════════ */

    /* ── Overlay ─────────────────────────────────── */
    #cite-overlay {
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.25);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.22s ease, visibility 0.22s ease;
    }
    #cite-overlay.active {
      opacity: 1;
      visibility: visible;
    }

    /* ── Painel principal ────────────────────────── */
    #cite-panel {
      position: fixed;
      top: 0;
      right: 0;
      z-index: 10001;
      width: clamp(320px, 40vw, 560px);
      height: 100dvh;
      background: #1C2226;
      border-left: 1px solid rgba(255, 255, 255, 0.07);
      box-shadow:
        -6px 0 24px rgba(0, 0, 0, 0.45),
        -1px 0 0 rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: translateX(100%);
      transition: transform 0.26s cubic-bezier(0.32, 0, 0.12, 1);
    }
    #cite-overlay.active #cite-panel {
      transform: translateX(0);
    }

    /* ── Header ──────────────────────────────────── */
    #cite-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px;
      background: #141a1d;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      flex-shrink: 0;
      gap: 6px;
    }
    #cite-panel-header-left {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      overflow: hidden;
    }
    .cite-panel-source-label {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.52rem;
      color: #546E7A;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      letter-spacing: 0.02em;
    }
    .cite-pid-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.62rem;
      font-weight: 700;
      background: #BC0017;
      color: #fff;
      padding: 1px 6px;
      border-radius: 3px;
      letter-spacing: 0.06em;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .cite-timestamp-badge {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.58rem;
      color: #607D8B;
      white-space: nowrap;
    }
    #cite-panel-close {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #90A4AE;
      font-size: 0.85rem;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      flex-shrink: 0;
      line-height: 1;
    }
    #cite-panel-close:hover {
      background: #BC0017;
      border-color: #BC0017;
      color: #fff;
    }

    /* ── Corpo ───────────────────────────────────── */
    #cite-panel-body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      background: #1C2226;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    #cite-panel-body::-webkit-scrollbar { width: 4px; }
    #cite-panel-body::-webkit-scrollbar-track { background: transparent; }
    #cite-panel-body::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.12);
      border-radius: 2px;
    }

    /* ── Parágrafos ──────────────────────────────── */
    .cite-para {
      padding: 6px 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      scroll-margin-top: 10px;
    }
    .cite-para:last-child { border-bottom: none; }
    .cite-para-header {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 2px;
    }
    .cite-para-id {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.55rem;
      font-weight: 700;
      color: rgba(188, 0, 22, 0.75);
      letter-spacing: 0.1em;
      background: rgba(188, 0, 23, 0.12);
      border: 1px solid rgba(188, 0, 23, 0.2);
      padding: 0 4px;
      border-radius: 2px;
      white-space: nowrap;
    }
    .cite-para-ts {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.52rem;
      color: #455A64;
    }
    .cite-para-text {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.66rem;
      line-height: 1.55;
      color: rgb(144 164 174 / 60%);
      white-space: pre-wrap;
      word-break: break-word;
    }

    /* ── Highlight: pulse amarelo 2s ─────────────── */
    @keyframes cite-highlight-pulse {
      0%   { background-color: transparent; }
      12%  { background-color: rgba(254, 240, 138, 0.22); }
      65%  { background-color: rgba(254, 240, 138, 0.22); }
      100% { background-color: transparent; }
    }
    .cite-para.cite-highlighted {
      animation: cite-highlight-pulse 2s ease forwards;
      border-radius: 2px;
    }
    .cite-para.cite-highlighted .cite-para-text {
      color: #CFD8DC;
      transition: color 0.3s ease;
    }

    /* ── Links de citação no documento ──────────── */
    .cite-ref {
      color: #BC0017;
      text-decoration: none;
      font-family: monospace;
      font-size: 0.85em;
      font-weight: 700;
      background: #f9ffac;
      padding: 0.1em 0.3em;
      letter-spacing: 0.1em;
      border-radius: 3px;
      cursor: pointer;
      transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
      white-space: nowrap;
      vertical-align: middle;
    }
    .cite-ref:hover {
     text-decoration: underline;
    }

    /* ── Glossário: decodificação no hover (title nativo, zero dep) ── */
    /* O tooltip é o próprio atributo title do browser — sem lib, sem JS. */
    abbr[title], .gloss[title] {
      text-decoration: underline dotted;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      cursor: help;
    }
    abbr[title] { text-decoration-color: #90A4AE; }

    /* ── Mobile: modal centralizada (<768px) ─────── */
    @media (max-width: 767px) {
      #cite-panel {
        top: 50%;
        right: auto;
        left: 50%;
        width: 92vw;
        height: 88dvh;
        max-height: 88dvh;
        border-left: none;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow:
          0 12px 40px rgba(0, 0, 0, 0.55),
          0 2px 8px rgba(0, 0, 0, 0.4);
        transform: translate(-50%, calc(-50% + 16px));
        transition: transform 0.24s cubic-bezier(0.32, 0, 0.12, 1),
                    opacity 0.22s ease;
        opacity: 0;
      }
      #cite-overlay.active #cite-panel {
        transform: translate(-50%, -50%);
        opacity: 1;
      }
    }

  </style>
</head>
<body class="h-full bg-brand-light text-brand-dark flex flex-col">

  <!-- Cabeçalho Superior Mobile -->
  <header class="lg:hidden bg-white border-b border-brand-gray px-3 py-2 flex items-center justify-between shadow-sm">
    <div class="flex items-center space-x-2">
      <div class="h-5 flex items-center">
        ${logoHtml}
      </div>
      <span class="text-xs font-bold text-brand-dark truncate max-w-[200px]">${docTitle}</span>
    </div>
    <button id="mobile-menu-btn" class="p-1 text-brand-dark hover:text-brand-red focus:outline-none">
      <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </header>

  <div class="flex flex-1 overflow-hidden relative">
    
    <!-- Sidebar de Navegação (Tema Claro) -->
    <aside id="sidebar" class="fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-brand-gray transform -translate-x-full lg:translate-x-0 lg:static flex flex-col transition-transform duration-200 ease-in-out shadow-md lg:shadow-none">
      
      <!-- Logo / Header Sidebar -->
      <div class="p-3 border-b border-brand-gray flex flex-col items-center space-y-1.5 bg-brand-light/50">
        <div class="w-full flex justify-center py-1">
          ${logoHtml}
        </div>
        <div class="w-full text-center border-t border-brand-gray/80 pt-1 mt-0.5">
          <h2 class="text-[10px] font-bold text-brand-dark leading-tight">${PORTAL_TITLE}</h2>
          <span class="text-[8px] font-semibold text-brand-red tracking-wider uppercase">Painel de Controle</span>
        </div>
      </div>

      <!-- Barra de Filtro / Pesquisa -->
      <div class="p-2 border-b border-brand-gray bg-white">
        <div class="relative">
          <input type="text" id="sidebar-search" oninput="filterSidebar()" placeholder="Filtrar documentos..." class="w-full pl-7 pr-2 py-1 rounded bg-brand-light border border-brand-gray text-[11px] placeholder-gray-400 text-brand-dark focus:outline-none focus:ring-1 focus:ring-brand-red focus:border-transparent">
          <span class="absolute inset-y-0 left-2.5 flex items-center pointer-events-none text-gray-400">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>
        </div>
      </div>

      <!-- Links de Navegação -->
      <nav class="flex-1 overflow-y-auto p-2.5 space-y-3" id="sidebar-items-list">
        
        <!-- Link Hub Home -->
        <div>
          <a href="./index.html" class="sidebar-item block px-2 py-1.5 rounded text-xs transition-colors duration-150 ${hubActiveClass}">
            🏠 Hub Central
          </a>
        </div>

        <!-- Seção: Documento Principal -->
        <div>
          <span class="block px-2 text-[9px] font-bold text-brand-red uppercase tracking-wider mb-1">
            Documento Principal
          </span>
          <div class="space-y-0.5">
            ${mainDocItemsHtml}
          </div>
        </div>

        <!-- Seção: Fontes de Apoio -->
        <div>
          <span class="block px-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            Fontes de Apoio
          </span>
          <div class="space-y-0.5">
            ${supportDocItemsHtml}
          </div>
        </div>

      </nav>

      <!-- Footer da Sidebar -->
      <div class="p-2 border-t border-brand-gray bg-brand-light/60 text-[9px] text-gray-400 flex items-center justify-between">
        <span>Total: ${documents.length} arquivos</span>
        <span>v${BUILD_VERSION}</span>
      </div>
    </aside>

    <!-- Overlay para fechar sidebar no mobile -->
    <div id="sidebar-overlay" class="fixed inset-0 z-30 bg-brand-dark/40 backdrop-blur-sm hidden lg:hidden"></div>

    <!-- Conteúdo Principal -->
    <main class="flex-1 overflow-y-auto bg-brand-light">
      <div class="max-w-4xl mx-auto px-4 py-6">
        
        <!-- Bloco de Conteúdo -->
        <article class="bg-white border border-brand-gray rounded-lg p-5 shadow-sm">
          <!-- Metadados da página -->
          <div class="border-b border-brand-gray pb-2.5 mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span class="text-[9px] font-bold text-brand-red uppercase tracking-widest bg-brand-accent px-1.5 py-0.5 rounded border border-brand-red/10">
                ${activeDoc ? (activeDoc.isMain ? 'Documento Principal' : 'Fonte de Apoio') : 'Portal Principal'}
              </span>
              <h1 class="text-lg font-bold text-brand-dark mt-1">${docTitle}</h1>
            </div>
            ${activeDoc ? `<div class="text-[10px] text-gray-400 font-mono">Arquivo: ${activeDoc.filename}</div>` : ''}
          </div>

          <!-- HTML Convertido ou Corpo do Dashboard -->
          <div class="markdown-body">
            ${bodyHtml}
          </div>
        </article>

      </div>
    </main>

  </div>

  <!-- Scripts Interativos -->
  <script>
    // 1. Filtro da Sidebar
    function filterSidebar() {
      const search = document.getElementById('sidebar-search').value.toLowerCase().trim();
      const items = document.querySelectorAll('.sidebar-item');
      items.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(search)) {
          item.classList.remove('hidden');
        } else {
          item.classList.add('hidden');
        }
      });
    }

    // 2. Mobile Sidebar Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');

    function toggleMobileMenu() {
      sidebar.classList.toggle('-translate-x-full');
      sidebarOverlay.classList.toggle('hidden');
    }

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener('click', toggleMobileMenu);
    }

    // 3. Botão de Copiar em Blocos de Código
    document.querySelectorAll('.markdown-body pre').forEach(pre => {
      if (pre.querySelector('code.language-mermaid')) return;
      if (pre.querySelector('code.language-bpmn')) return;

      pre.classList.add('relative', 'group');
      const btn = document.createElement('button');
      btn.className = 'absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 bg-brand-light hover:bg-brand-gray text-brand-dark text-[10px] px-1.5 py-0.5 rounded transition-all duration-150 border border-brand-gray focus:outline-none';
      btn.textContent = 'Copiar';
      btn.onclick = () => {
        const code = pre.querySelector('code') ? pre.querySelector('code').innerText : pre.innerText;
        navigator.clipboard.writeText(code.trim());
        btn.textContent = 'Copiado!';
        setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
      };
      pre.appendChild(btn);
    });

    // 4. Integração do Mermaid
    document.addEventListener("DOMContentLoaded", function() {
      const codeBlocks = document.querySelectorAll('.markdown-body pre code.language-mermaid');
      codeBlocks.forEach(codeEl => {
        const preEl = codeEl.parentElement;
        const div = document.createElement('div');
        div.className = 'mermaid bg-white border border-brand-gray rounded-lg p-3 my-3 flex justify-center overflow-x-auto';
        div.textContent = codeEl.textContent;
        preEl.replaceWith(div);
      });
      
      if (window.mermaid) {
        mermaid.initialize({
          startOnLoad: true,
          theme: 'default',
          flowchart: { useMaxWidth: true, htmlLabels: true }
        });
      }
    });

    // 4b. Integracao do BPMN (bpmn-js) — renderiza blocos de codigo bpmn como viewer interativo
    (function initBpmn() {
      var blocks = document.querySelectorAll('.markdown-body pre code.language-bpmn');
      if (!blocks.length) return;
      blocks.forEach(function(codeEl, i) {
        var xml = codeEl.textContent;
        var pre = codeEl.parentElement;

        var wrap = document.createElement('div');
        wrap.className = 'bpmn-wrap relative my-3 bg-white border border-brand-gray rounded-lg overflow-hidden';
        var container = document.createElement('div');
        container.id = 'bpmn-canvas-' + i;
        container.style.height = '480px';
        wrap.appendChild(container);

        // Toolbar: baixar .bpmn (Camunda) + copiar XML
        var bar = document.createElement('div');
        bar.className = 'absolute top-1.5 right-1.5 flex gap-1 z-10';
        var slug = (document.title || 'diagrama').replace(/[^\\w-]+/g, '_').slice(0, 40);
        var dl = document.createElement('a');
        dl.textContent = 'Baixar .bpmn';
        dl.className = 'bg-brand-light hover:bg-brand-gray text-brand-dark text-[10px] px-1.5 py-0.5 rounded border border-brand-gray no-underline';
        dl.href = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
        dl.download = slug + '-' + (i + 1) + '.bpmn';
        var cp = document.createElement('button');
        cp.textContent = 'Copiar XML';
        cp.className = 'bg-brand-light hover:bg-brand-gray text-brand-dark text-[10px] px-1.5 py-0.5 rounded border border-brand-gray focus:outline-none';
        cp.onclick = function() {
          navigator.clipboard.writeText(xml);
          cp.textContent = 'Copiado!';
          setTimeout(function() { cp.textContent = 'Copiar XML'; }, 2000);
        };
        bar.appendChild(dl);
        bar.appendChild(cp);
        wrap.appendChild(bar);

        pre.replaceWith(wrap);

        if (window.BpmnJS) {
          var viewer = new BpmnJS({ container: container });
          viewer.importXML(xml).then(function() {
            try { viewer.get('canvas').zoom('fit-viewport', 'auto'); } catch (e) {}
          }).catch(function(err) {
            container.innerHTML = '<pre style="padding:1rem;margin:0;color:#BC0017;overflow:auto">Erro ao renderizar BPMN: ' +
              (err && err.message ? err.message : err) + '</pre>';
          });
        } else {
          // Fallback sem a lib (ex.: offline): mostra o XML cru
          var fb = xml.replace(/[&<>]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
          container.innerHTML = '<pre style="padding:1rem;margin:0;overflow:auto">' + fb + '</pre>';
        }
      });
    })();

    // 5. Image Lightbox Modal with arrow navigation
    (function() {
      // Wrap each markdown image in <figure> + <figcaption>
      document.querySelectorAll('.markdown-body img').forEach(function(img) {
        if (img.closest('figure') || img.id === 'img-modal-img') return;
        var alt = img.getAttribute('alt') || '';
        var figure = document.createElement('figure');
        img.parentNode.insertBefore(figure, img);
        figure.appendChild(img);
        if (alt) {
          var caption = document.createElement('figcaption');
          caption.textContent = alt;
          figure.appendChild(caption);
        }
      });

      // Collect all document images in DOM order for navigation
      var allImages = Array.from(document.querySelectorAll('.markdown-body figure img'));
      var currentIndex = -1;

      // Inject modal markup
      var overlay = document.createElement('div');
      overlay.id = 'img-modal-overlay';
      overlay.innerHTML = '<button id="img-modal-close" aria-label="Fechar">\u00d7</button>'
        + '<button id="img-modal-prev" aria-label="Anterior" style="position:absolute;left:14px;top:50%;transform:translateY(-50%);background:rgba(38,50,56,0.7);border:none;color:#F8F9FA;font-size:1.6rem;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s ease;">\u2039</button>'
        + '<img id="img-modal-img" src="" alt="">'
        + '<button id="img-modal-next" aria-label="Próxima" style="position:absolute;right:14px;top:50%;transform:translateY(-50%);background:rgba(38,50,56,0.7);border:none;color:#F8F9FA;font-size:1.6rem;width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background 0.15s ease;">\u203a</button>'
        + '<div id="img-modal-caption"></div>';
      document.body.appendChild(overlay);

      var modalImg = document.getElementById('img-modal-img');
      var modalCaption = document.getElementById('img-modal-caption');
      var prevBtn = document.getElementById('img-modal-prev');
      var nextBtn = document.getElementById('img-modal-next');

      function showImage(idx) {
        if (idx < 0 || idx >= allImages.length) return;
        currentIndex = idx;
        var img = allImages[idx];
        modalImg.src = img.src;
        modalImg.alt = img.alt || '';
        modalCaption.textContent = img.alt || '';
        modalCaption.style.display = img.alt ? '' : 'none';
        // Update nav button visibility
        prevBtn.style.opacity = idx > 0 ? '1' : '0.3';
        prevBtn.style.pointerEvents = idx > 0 ? 'auto' : 'none';
        nextBtn.style.opacity = idx < allImages.length - 1 ? '1' : '0.3';
        nextBtn.style.pointerEvents = idx < allImages.length - 1 ? 'auto' : 'none';
      }

      function openModal(img) {
        var idx = allImages.indexOf(img);
        if (idx === -1) idx = 0;
        showImage(idx);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      }

      function closeModal() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        currentIndex = -1;
      }

      // Nav button clicks
      prevBtn.addEventListener('click', function(e) { e.stopPropagation(); showImage(currentIndex - 1); });
      nextBtn.addEventListener('click', function(e) { e.stopPropagation(); showImage(currentIndex + 1); });
      // Hover effect on nav buttons
      [prevBtn, nextBtn].forEach(function(btn) {
        btn.addEventListener('mouseenter', function() { btn.style.background = '#BC0017'; });
        btn.addEventListener('mouseleave', function() { btn.style.background = 'rgba(38,50,56,0.7)'; });
      });

      // Delegate clicks — open modal from img or figcaption
      document.querySelector('.markdown-body').addEventListener('click', function(e) {
        var img = null;
        if (e.target.tagName === 'IMG' && e.target.id !== 'img-modal-img') {
          img = e.target;
        } else if (e.target.tagName === 'FIGCAPTION') {
          img = e.target.parentElement.querySelector('img');
        }
        if (img) {
          e.preventDefault();
          openModal(img);
        }
      });

      // Close on overlay click, close button
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay || e.target.id === 'img-modal-close') closeModal();
      });

      // Keyboard: Escape to close, arrows to navigate
      document.addEventListener('keydown', function(e) {
        if (!overlay.classList.contains('active')) return;
        if (e.key === 'Escape') closeModal();
        else if (e.key === 'ArrowLeft') showImage(currentIndex - 1);
        else if (e.key === 'ArrowRight') showImage(currentIndex + 1);
      });
    })();
  </script>
  ${hasCiteRefs ? getCitePanelScript() : ''}
</body>
</html>
`;
}

// Compilar cada documento markdown
console.log('🏗️  Iniciando a compilação dos Markdowns...');

documents.forEach(doc => {
  console.log(`📄 Compilando ${doc.filename} -> ${doc.htmlFilename}`);
  
  let bodyHtml = marked.parse(doc.rawContent);
  bodyHtml = bodyHtml.replace(/href="([^"]+)\.md(#?[^"]*)"/g, 'href="./$1.html$2"');
  bodyHtml = bodyHtml.replace(/src="\.\.\/assets\//g, 'src="./assets/');
  bodyHtml = injectGlossaryTitles(bodyHtml, annotateGlossary);

  // ─── Cronograma: substitui blocos ```cronograma pela visualização SSR ───
  // Gating por-doc (mesmo padrão de mermaid/bpmn). O corpo do bloco carrega só
  // OPÇÕES de apresentação (view/today) — o DADO mora em cronograma.yaml (SSOT).
  if (bodyHtml.includes('language-cronograma')) {
    bodyHtml = bodyHtml.replace(/<pre><code class="language-cronograma">([\s\S]*?)<\/code><\/pre>/g, (_all, body) => {
      if (!cronograma) {
        return '<div style="border:1px dashed #CBD5E1;border-radius:8px;padding:16px;color:#64748B;font-size:0.8rem;background:#F8FAFC">'
          + '⏳ Cronograma não configurado — crie <code>001-docs/cronograma.yaml</code> para renderizar aqui.</div>';
      }
      const optsRaw = body
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
      let opts = {};
      try { opts = yaml.load(optsRaw) || {}; } catch (e) { opts = {}; }
      return renderCronogramaSvg(cronograma, opts);
    });
  }

  const hasMermaid = doc.rawContent.includes('```mermaid') || doc.rawContent.includes('class="language-mermaid"');
  // Injeta o viewer bpmn-js apenas em páginas com blocos ```bpmn
  const hasBpmn = doc.rawContent.includes('```bpmn') || bodyHtml.includes('class="language-bpmn"');
  // Injeta transcript JSON e painel apenas em páginas que têm links de citação
  const hasCiteRefs = bodyHtml.includes('class="cite-ref"');
  const fullHtml = getHtmlTemplate(doc, bodyHtml, hasMermaid, hasCiteRefs, hasBpmn);
  
  fs.writeFileSync(path.join(distDir, doc.htmlFilename), fullHtml, 'utf-8');
});

// Criar index.html como um painel centralizado (Hub Dashboard)
console.log('🏠 Gerando Hub Dashboard index.html...');

const mainDocCardsHtml = mainDocs.map(doc => `
  <div class="border-2 border-brand-red rounded-lg p-4 bg-brand-accent/20 hover:shadow-md transition-all duration-150 flex flex-col justify-between">
    <div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-bold text-brand-red bg-brand-accent border border-brand-red/20 px-2 py-0.5 rounded uppercase">Principal</span>
          ${docBadgeHtml(doc.filename)}
        </div>
        <span class="text-[10px] text-gray-400 font-mono">${doc.filename}</span>
      </div>
      <h3 class="text-base font-bold text-brand-dark mt-2">${doc.title}</h3>
      <p class="text-xs text-gray-600 mt-1">Documento de referência principal do processo${PROCESS ? ` — ${PROCESS}` : ''} (Process Design Document / PDD).</p>
    </div>
    <div class="mt-4 pt-2 border-t border-brand-gray flex justify-end">
      <a href="./${doc.htmlFilename}" class="inline-flex items-center text-xs font-bold text-brand-red hover:underline">
        Visualizar PDD Completo &rarr;
      </a>
    </div>
  </div>
`).join('');

const supportDocCardsHtml = supportDocs.map(doc => `
  <div class="border border-brand-gray rounded-lg p-3.5 bg-white hover:border-brand-red/40 hover:shadow-sm transition-all duration-150 flex flex-col justify-between">
    <div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-1.5">
          <span class="text-[9px] font-bold text-gray-500 bg-brand-light border border-brand-gray px-1.5 py-0.5 rounded uppercase">Referência</span>
          ${docBadgeHtml(doc.filename)}
        </div>
        <span class="text-[10px] text-gray-400 font-mono">${doc.filename}</span>
      </div>
      <h3 class="text-sm font-semibold text-brand-dark mt-2">${doc.title}</h3>
      <p class="text-xs text-gray-500 mt-1">Material de especificação técnica e análise para suportar a automação.</p>
    </div>
    <div class="mt-3 pt-2 border-t border-brand-light flex justify-end">
      <a href="./${doc.htmlFilename}" class="inline-flex items-center text-xs font-medium text-brand-red hover:underline">
        Acessar Documento &rarr;
      </a>
    </div>
  </div>
`).join('');

const dashboardBodyHtml = `
  <div class="space-y-6">
    <!-- Hero Banner -->
    <div class="relative overflow-hidden bg-brand-dark text-white rounded-lg p-5 shadow-sm">
      <div class="absolute -right-16 -top-16 w-36 h-36 rounded-full bg-brand-red/10 blur-xl"></div>
      <div class="relative z-10">
        <h2 class="text-lg sm:text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-brand-light">
          ${BRAND_LINE} — Hub de Documentação
        </h2>
        <p class="text-xs text-brand-light/80 mt-1 max-w-2xl">
          Portal central de governança, regras de negócio e especificações técnicas da automação${PROCESS ? ` — ${PROCESS}` : ''}.
        </p>
      </div>
    </div>

    <!-- Filtro de Busca do Dashboard -->
    <div class="flex items-center bg-brand-light border border-brand-gray rounded p-2">
      <span class="text-gray-400 mr-2">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </span>
      <input type="text" id="dashboard-search" oninput="filterDashboard()" placeholder="Pesquisar em todos os documentos por título..." class="bg-transparent border-none text-xs text-brand-dark w-full focus:outline-none placeholder-gray-400">
    </div>

    <!-- Documento Principal -->
    <div class="space-y-2 card-section">
      <h2 class="text-xs font-bold uppercase tracking-wider text-brand-red border-l-2 border-brand-red pl-2">
        Documento Principal
      </h2>
      <div class="grid grid-cols-1 gap-4" id="main-doc-grid">
        ${mainDocCardsHtml}
      </div>
    </div>

    <!-- Fontes de Apoio -->
    <div class="space-y-2 card-section">
      <h2 class="text-xs font-bold uppercase tracking-wider text-gray-400 border-l-2 border-brand-gray pl-2">
        Fontes de Apoio & Referências
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3" id="support-doc-grid">
        ${supportDocCardsHtml}
      </div>
    </div>
  </div>

  <script>
    function filterDashboard() {
      const search = document.getElementById('dashboard-search').value.toLowerCase().trim();
      
      // Filtrar os cards na página do Dashboard
      const cards = document.querySelectorAll('.grid > div');
      cards.forEach(card => {
        const title = card.querySelector('h3').textContent.toLowerCase();
        const filename = card.querySelector('.font-mono').textContent.toLowerCase();
        
        if (title.includes(search) || filename.includes(search)) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }
  </script>
`;

const fullIndexHtml = getHtmlTemplate(null, dashboardBodyHtml, false, false);
fs.writeFileSync(path.join(distDir, 'index.html'), fullIndexHtml, 'utf-8');

// Gera CNAME para que `npx surge ./dist` detecte o domínio automaticamente
fs.writeFileSync(path.join(distDir, 'CNAME'), PUBLISH_DOMAIN, 'utf-8');
console.log(`📌 CNAME gerado: ${PUBLISH_DOMAIN}`);

console.log('\n✅ Compilação concluída com sucesso na pasta dist/!');
console.log(`   Versão: v${BUILD_VERSION}`);
console.log(`   Domínio: ${PUBLISH_DOMAIN}`);
console.log('\n🚀 Servidor local: npm run dev    ·    Publicar no Surge: npm run publish');
