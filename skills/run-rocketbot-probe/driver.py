#!/usr/bin/env python3
"""
driver.py — build, serve e SCREENSHOT do portal (Hub) do Rocketbot Probe.

O "app" deste projeto é um portal HTML estático: build.js compila os Markdowns
de 001-docs/ (lendo project.yaml) em dist/, e dev-server.js serve dist/. Este
driver faz o ciclo inteiro sem intervenção humana e tira print de cada página.

Uso (a partir da RAIZ do repo):
    python3 .claude/skills/run-rocketbot-probe/driver.py

Opções:
    --out DIR      onde salvar os PNGs           (default: ./.driver-shots)
    --port N       porta do dev-server           (default: porta livre automática)
    --no-build     não roda `node build.js`, usa o dist/ existente
    --url URL      NÃO sobe servidor; dirige um já rodando (ex.: http://localhost:8123)
    --keep         deixa o servidor no ar ao terminar (para inspeção manual)

Requer: node, e o pacote Python `playwright` com o chromium baixado
        (pip install playwright && python3 -m playwright install chromium).
Saída: um PNG por página (Hub + cada doc do sidebar) em --out, e um resumo
       no stdout. Exit != 0 se alguma página falhar ou vier em branco.
"""
import argparse, os, socket, subprocess, sys, time, urllib.request
from pathlib import Path

# Raiz do repo = dois níveis acima de .claude/skills/run-rocketbot-probe/
SKILL_DIR = Path(__file__).resolve().parent
REPO = SKILL_DIR.parents[1]
DOCS = REPO / "001-docs"


def log(msg): print(msg, flush=True)


def free_port() -> int:
    s = socket.socket(); s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]; s.close(); return p


def wait_http(url: str, timeout=20) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


def build():
    log("🏗️  node build.js")
    r = subprocess.run(["node", "build.js"], cwd=DOCS)
    if r.returncode != 0:
        log("❌ build falhou"); sys.exit(1)


def serve(port: int) -> subprocess.Popen:
    log(f"🌐 dev-server em http://localhost:{port}/")
    env = {**os.environ, "PORT": str(port)}
    proc = subprocess.Popen(["node", "dev-server.js"], cwd=DOCS, env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    if not wait_http(f"http://localhost:{port}/", 20):
        proc.terminate()
        log("❌ servidor não respondeu em 20s"); sys.exit(1)
    return proc


def drive(base: str, out: Path) -> int:
    from playwright.sync_api import sync_playwright
    out.mkdir(parents=True, exist_ok=True)
    failures = 0
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # 1) Hub (index)
        page.goto(base + "/", wait_until="networkidle")
        title = page.title()
        log(f"🏠 Hub → {title!r}")
        page.screenshot(path=str(out / "00-hub.png"), full_page=True)
        if "Hub" not in title:
            log("   ⚠️  título inesperado no Hub"); failures += 1

        # 2) Todo doc do sidebar (aside a[href$='.html']), menos o link do próprio Hub
        hrefs = page.eval_on_selector_all(
            "aside a[href$='.html']",
            "els => [...new Set(els.map(e => e.getAttribute('href')))]"
            ".filter(h => !/index\\.html$/.test(h))")
        log(f"📚 {len(hrefs)} doc(s) no sidebar: {hrefs}")
        for i, href in enumerate(hrefs, 1):
            page.goto(base + "/" + href.lstrip("/"), wait_until="networkidle")
            body = (page.inner_text("body") or "").strip()
            slug = href.lstrip("./").replace("/", "_").replace(".html", "")
            page.screenshot(path=str(out / f"{i:02d}-{slug}.png"), full_page=True)
            status = "ok" if len(body) > 50 else "VAZIO"
            if len(body) <= 50:
                failures += 1
            log(f"   {i:02d}. {href}  ({len(body)} chars) [{status}]")

        # 3) Feature: glossário injeta title="" no hover (build.js)
        page.goto(base + "/", wait_until="networkidle")
        # entra no 1º doc e conta os tooltips
        if hrefs:
            page.goto(base + "/" + hrefs[0].lstrip("/"), wait_until="networkidle")
            tips = page.eval_on_selector_all(
                "[title]", "els => els.map(e => e.textContent.trim()).filter(Boolean)")
            log(f"🏷️  glossário: {len(tips)} termo(s) com tooltip → {tips[:6]}")

        browser.close()
    return failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / ".driver-shots"))
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--no-build", action="store_true")
    ap.add_argument("--url", default=None)
    ap.add_argument("--keep", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)

    proc = None
    try:
        if args.url:
            base = args.url.rstrip("/")
            if not wait_http(base + "/", 5):
                log(f"❌ nada respondendo em {base}"); sys.exit(1)
        else:
            if not args.no_build:
                build()
            elif not (DOCS / "dist" / "index.html").exists():
                log("❌ --no-build mas dist/ não existe; rode sem --no-build"); sys.exit(1)
            port = args.port or free_port()
            proc = serve(port)
            base = f"http://localhost:{port}"

        failures = drive(base, out)
        log(f"\n📸 prints em {out}/")
        if failures:
            log(f"❌ {failures} página(s) com problema"); sys.exit(1)
        log("✅ tudo renderizou")
    finally:
        if proc and not args.keep:
            proc.terminate()
            try: proc.wait(timeout=5)
            except Exception: proc.kill()
        elif proc and args.keep:
            log(f"ℹ️  servidor deixado no ar (pid {proc.pid}); mate com: kill {proc.pid}")


if __name__ == "__main__":
    main()
