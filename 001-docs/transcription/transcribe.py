#!/usr/bin/env python3
"""
Transcreve o vídeo SSOT via Deepgram Nova-2 com diarização e utterances.

Configuração lida de project.yaml (repo root) → discovery.sessions[]. Outputs:
  .claude/<slug>.json          — resposta bruta da API
  transcription_dir/<slug>.mp3 — áudio extraído (skip se já existe)
  transcription_dir/<slug>.txt — transcrição estruturada com falantes

Uso: python3 transcribe.py [--session <slug>] [--force] [--list]
  --session <slug>: processa a sessão de discovery.sessions[] com esse slug
                    (sem flag, processa a 1ª sessão = SSOT)
  --force: reprocessa mesmo que o .json já exista em .claude/
  --list:  lista os slugs de sessão disponíveis e sai
"""
import subprocess, sys, json, os, httpx
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("ERRO: PyYAML não instalado — execute: pip install pyyaml")

REPO = Path(__file__).resolve().parents[2]

cfg        = yaml.safe_load((REPO / "project.yaml").read_text(encoding="utf-8"))
proj       = cfg["project"]
disc       = cfg["discovery"]
docs       = cfg["docs"]

# ─── Resolução de sessão (multi-sessão) ──────────────────────────────────────
# Compat: aceita o formato antigo (campos ssot_* direto em discovery) caso não
# exista sessions[].
sessions = disc.get("sessions")
if not sessions:
    sessions = [{
        "slug":             disc.get("transcription_slug") or f"{disc.get('session_date')}-{proj['process_slug']}",
        "file":             disc.get("ssot_file"),
        "type":             disc.get("ssot_type", "video"),
        "date":             disc.get("session_date"),
        "duration_minutes": disc.get("ssot_duration_minutes"),
    }]

if "--list" in sys.argv:
    print("Sessões disponíveis (discovery.sessions[]):")
    for s in sessions:
        print(f"  - {s['slug']:40s} {s.get('file','?')}  ({s.get('role','—')})")
    sys.exit(0)

if "--session" in sys.argv:
    sel = sys.argv[sys.argv.index("--session") + 1]
    session = next((s for s in sessions if s["slug"] == sel), None)
    if session is None:
        avail = ", ".join(s["slug"] for s in sessions)
        sys.exit(f"ERRO: sessão '{sel}' não encontrada. Disponíveis: {avail}")
else:
    session = sessions[0]  # default = SSOT

# ─── Slug e caminhos ─────────────────────────────────────────────────────────
slug         = session["slug"]
src_dir      = session.get("sources_dir", disc.get("sources_dir", ".sources"))
trans_dir    = REPO / docs["transcription_dir"]
video        = REPO / src_dir / session["file"]
audio        = trans_dir / f"{slug}.mp3"
json_out     = REPO / ".claude" / f"{slug}.json"
txt_out      = trans_dir / f"{slug}.txt"
key_file     = REPO / ".claude" / "deepgram.key.txt"
session_date = session.get("date", "—")

# ─── API key ─────────────────────────────────────────────────────────────────
# Ordem de resolução: variável de ambiente DEEPGRAM_API_KEY → arquivo .claude/deepgram.key.txt
# (formato: a chave crua, ou `DEEPGRAM_API_KEY=...`). O arquivo é gitignored — nunca commite a chave.
api_key = os.environ.get("DEEPGRAM_API_KEY")
if not api_key and key_file.exists():
    for line in key_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        api_key = line.split("=", 1)[1].strip() if "DEEPGRAM_API_KEY" in line else line
        api_key = api_key.strip().strip('"').strip("'")
        break
if not api_key:
    sys.exit("ERRO: defina a env var DEEPGRAM_API_KEY ou crie .claude/deepgram.key.txt")

force = "--force" in sys.argv

# ─── Step 1: Extrair áudio ───────────────────────────────────────────────────
if not audio.exists():
    if not video.exists():
        sys.exit(f"ERRO: vídeo não encontrado em {video}")
    print(f">> Extraindo áudio de {video.name}...", flush=True)
    r = subprocess.run([
        "ffmpeg", "-i", str(video),
        "-vn", "-ar", "16000", "-ac", "1", "-b:a", "128k",
        str(audio), "-y"
    ], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"ERRO ffmpeg:\n{r.stderr[-800:]}")
    print(f"   Áudio: {audio.stat().st_size / 1024 / 1024:.1f} MB", flush=True)
else:
    print(f">> Áudio já existe: {audio.name} ({audio.stat().st_size / 1024 / 1024:.1f} MB)", flush=True)

# ─── Step 2: Chamar API Deepgram ─────────────────────────────────────────────
if json_out.exists() and not force:
    print(f">> JSON já existe: {json_out.name} (use --force para reprocessar)", flush=True)
    data = json.loads(json_out.read_text(encoding="utf-8"))
else:
    print(">> Enviando para Deepgram Nova-2 (pt-BR, diarize + utterances)...", flush=True)
    audio_bytes = audio.read_bytes()

    params = {
        "model":        "nova-2",
        "language":     "pt-BR",
        "diarize":      "true",
        "utterances":   "true",
        "paragraphs":   "true",
        "punctuate":    "true",
        "smart_format": "true",
    }
    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type":  "audio/mp3",
    }

    with httpx.Client(timeout=600.0) as client:
        resp = client.post(
            "https://api.deepgram.com/v1/listen",
            params=params,
            headers=headers,
            content=audio_bytes,
        )

    if resp.status_code != 200:
        sys.exit(f"ERRO API {resp.status_code}:\n{resp.text[:600]}")

    data = resp.json()
    json_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f">> JSON salvo: {json_out.name}", flush=True)

# ─── Step 3: Gerar TXT enriquecido a partir de utterances ────────────────────
utterances = data.get("results", {}).get("utterances")
if not utterances:
    # Fallback para parágrafos se utterances não disponível
    print(">> AVISO: utterances não encontrado — fallback para parágrafos", flush=True)
    try:
        paragraphs = data["results"]["channels"][0]["alternatives"][0]["paragraphs"]["paragraphs"]
    except (KeyError, IndexError) as e:
        sys.exit(f"ERRO estrutura resposta: {e}")

    blocks = []
    for i, para in enumerate(paragraphs, 1):
        start = para.get("start", 0)
        end   = para.get("end", 0)
        ts    = f"{int(start // 60):02d}:{int(start % 60):02d}–{int(end // 60):02d}:{int(end % 60):02d}"
        text  = " ".join(s["text"] for s in para.get("sentences", []))
        blocks.append(f"[P{i:04d}] [{ts}]\n{text}")

    txt_out.write_text("\n\n".join(blocks), encoding="utf-8")
    print(f">> TXT salvo (fallback parágrafos): {txt_out.name} ({len(paragraphs)} blocos)", flush=True)
    sys.exit(0)

# Contagem de falantes únicos
speakers = sorted({u.get("speaker", 0) for u in utterances})
n_speakers = len(speakers)

# Duração total
meta    = data.get("metadata", {})
dur_s   = meta.get("duration", (session.get("duration_minutes") or 0) * 60)
dur_min = int(dur_s // 60)
model_name = "nova-2"
req_id     = meta.get("request_id", "—")
for m in meta.get("model_info", {}).values():
    model_name = m.get("name", model_name)
    break

# Header de metadados
header_lines = [
    "=== METADADOS ===",
    f"Projeto   : {proj['name']}",
    f"Cliente   : {proj['client']}",
    f"Data      : {session_date}",
    f"Duração   : {dur_s:.0f}s ({dur_min}min)",
    f"Falantes  : {n_speakers} identificado{'s' if n_speakers != 1 else ''}",
    f"Modelo    : {model_name} (pt-BR)",
    f"Request ID: {req_id}",
    "",
    "=== TRANSCRIÇÃO ===",
]

# Gera blocos de utterance agrupando falantes consecutivos iguais
def fmt_ts(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"

blocks = []
uid = 0
prev_speaker = None
current_group: list[str] = []
current_start = 0.0
current_end   = 0.0
current_conf  = 0.0

def flush_group(uid_val, start, end, speaker, texts, conf):
    ts   = f"{fmt_ts(start)}–{fmt_ts(end)}"
    text = " ".join(texts)
    return f"[U{uid_val:04d}] [{ts}] [FALANTE_{speaker}] [conf: {conf:.2f}]\n{text}"

for utt in utterances:
    speaker = utt.get("speaker", 0)
    text    = utt.get("transcript", "").strip()
    start   = utt.get("start", 0.0)
    end     = utt.get("end", 0.0)
    conf    = utt.get("confidence", 0.0)

    if not text:
        continue

    if speaker == prev_speaker:
        # Mesmo falante — agrupar
        current_group.append(text)
        current_end  = end
        current_conf = (current_conf + conf) / 2
    else:
        # Troca de falante — descarregar grupo anterior
        if current_group:
            uid += 1
            blocks.append(flush_group(uid, current_start, current_end, prev_speaker, current_group, current_conf))
        current_group   = [text]
        current_start   = start
        current_end     = end
        current_conf    = conf
        prev_speaker    = speaker

# Último grupo
if current_group:
    uid += 1
    blocks.append(flush_group(uid, current_start, current_end, prev_speaker, current_group, current_conf))

output = "\n".join(header_lines) + "\n\n" + "\n\n".join(blocks)
txt_out.write_text(output, encoding="utf-8")
print(f">> TXT salvo: {txt_out.name} ({uid} blocos, {n_speakers} falantes)", flush=True)
print(f">> Slug: {slug}", flush=True)
