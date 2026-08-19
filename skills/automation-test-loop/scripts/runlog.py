#!/usr/bin/env python3
# ============================================================================
# runlog.py — log append-only de execucao. Um evento por etapa, uma linha JSON.
#
# O mesmo arquivo serve a tres coisas que normalmente exigiriam tres:
#   • diagnostico  — em que etapa quebrou, com que erro
#   • retomada     — o que ainda nao rodou ("iniciar do proximo")
#   • evidencia    — contagem/duracao para mostrar ao cliente
#
# Append-only de proposito: nunca reescreve, nunca perde historico, e sobrevive
# a processo morto no meio (cada linha e' fechada no momento em que e' escrita).
# O arquivo e' GITIGNORED — e estado de execucao, nao codigo.
#
# Uso:
#   ./runlog.py registrar --etapa login --status ok [--ref NF-123] [--modo piloto]
#                         [--erro "texto"] [--extra chave=valor ...]
#   ./runlog.py resumo               [--run-id X] [--desde 2026-08-01]
#   ./runlog.py proximo --de itens.txt [--campo ref]
#   ./runlog.py falhas               [--run-id X]
#
# Env: RUNLOG (caminho do .jsonl, default ./run-log.jsonl)
#      RUN_ID (agrupa etapas de uma mesma execucao; default = data-hora do 1o uso)
# ============================================================================
import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone

CAMINHO = os.environ.get("RUNLOG", "run-log.jsonl")


def agora():
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def run_id_corrente():
    return os.environ.get("RUN_ID") or datetime.now().strftime("%Y%m%d-%H%M")


def ler(run_id=None, desde=None):
    if not os.path.exists(CAMINHO):
        return []
    out = []
    for i, linha in enumerate(open(CAMINHO, encoding="utf-8"), 1):
        linha = linha.strip()
        if not linha:
            continue
        try:
            ev = json.loads(linha)
        except json.JSONDecodeError:
            print(f"aviso: linha {i} ilegivel, ignorada", file=sys.stderr)
            continue
        if run_id and ev.get("run_id") != run_id:
            continue
        if desde and ev.get("ts", "") < desde:
            continue
        out.append(ev)
    return out


def cmd_registrar(a):
    ev = {
        "ts": agora(),
        "run_id": a.run_id or run_id_corrente(),
        "etapa": a.etapa,
        "status": a.status,
    }
    if a.ref:
        ev["ref"] = a.ref
    if a.modo:
        ev["modo"] = a.modo
    if a.erro:
        ev["erro"] = a.erro[:500]
    for par in a.extra or []:
        if "=" in par:
            k, v = par.split("=", 1)
            ev[k] = v
    with open(CAMINHO, "a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    print(json.dumps(ev, ensure_ascii=False))


def _duracao(evs):
    if len(evs) < 2:
        return None
    try:
        t0 = datetime.fromisoformat(evs[0]["ts"])
        t1 = datetime.fromisoformat(evs[-1]["ts"])
        return t1 - t0
    except Exception:
        return None


def cmd_resumo(a):
    evs = ler(a.run_id, a.desde)
    if not evs:
        print("sem eventos.")
        return
    por_run = defaultdict(list)
    for e in evs:
        por_run[e.get("run_id", "?")].append(e)

    for rid in sorted(por_run):
        grupo = por_run[rid]
        st = Counter(e.get("status", "?") for e in grupo)
        dur = _duracao(grupo)
        modos = {e.get("modo") for e in grupo if e.get("modo")}
        cab = f"run {rid}  ({len(grupo)} eventos"
        if dur:
            cab += f", {dur}"
        if modos:
            cab += f", modo={'/'.join(sorted(modos))}"
        print(cab + ")")
        for s, n in st.most_common():
            print(f"    {s:<10} {n}")
        etapas = Counter(e.get("etapa", "?") for e in grupo if e.get("status") != "ok")
        if etapas:
            print("    etapas com problema: " + ", ".join(f"{k}({v})" for k, v in etapas.most_common(5)))
        print()

    total = Counter(e.get("status", "?") for e in evs)
    ok = total.get("ok", 0)
    print(f"TOTAL: {len(evs)} eventos, {ok} ok, {len(evs) - ok} nao-ok, {len(por_run)} run(s)")
    refs = {e["ref"] for e in evs if e.get("ref") and e.get("status") == "ok"}
    if refs:
        print(f"referencias concluidas: {len(refs)}")


def cmd_falhas(a):
    evs = [e for e in ler(a.run_id) if e.get("status") not in ("ok", "skip")]
    if not evs:
        print("nenhuma falha registrada.")
        return
    for e in evs:
        print(f"{e.get('ts','')}  {e.get('etapa','?'):<18} {e.get('status','?'):<8} "
              f"{e.get('ref','')}  {str(e.get('erro',''))[:90]}")
    print(f"\n{len(evs)} falha(s)")


def cmd_proximo(a):
    """Le a lista de trabalho e imprime so o que ainda NAO concluiu com ok.
    E' isto que transforma 'recomecar' em 'retomar'."""
    if not os.path.exists(a.de):
        sys.exit(f"ERRO: lista nao encontrada: {a.de}")
    itens = [l.strip() for l in open(a.de, encoding="utf-8") if l.strip() and not l.startswith("#")]
    feitos = {e.get(a.campo) for e in ler() if e.get("status") == "ok"}
    faltam = [i for i in itens if i not in feitos]
    for i in faltam:
        print(i)
    print(f"# {len(faltam)} de {len(itens)} pendente(s)", file=sys.stderr)


def main():
    p = argparse.ArgumentParser(description="Log append-only de execucao (diagnostico + retomada + evidencia).")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("registrar", help="grava um evento")
    s.add_argument("--etapa", required=True)
    s.add_argument("--status", required=True, help="ok | erro | skip | ...")
    s.add_argument("--ref", help="identificador do item processado")
    s.add_argument("--modo", help="mock | piloto | prod")
    s.add_argument("--erro")
    s.add_argument("--run-id")
    s.add_argument("--extra", nargs="*", metavar="chave=valor")
    s.set_defaults(func=cmd_registrar)

    s = sub.add_parser("resumo", help="contagem por status, duracao, etapas com problema")
    s.add_argument("--run-id")
    s.add_argument("--desde", help="ISO date, ex.: 2026-08-01")
    s.set_defaults(func=cmd_resumo)

    s = sub.add_parser("falhas", help="lista so o que nao ficou ok")
    s.add_argument("--run-id")
    s.set_defaults(func=cmd_falhas)

    s = sub.add_parser("proximo", help="itens da lista que ainda nao concluiram")
    s.add_argument("--de", required=True, help="arquivo com 1 item por linha")
    s.add_argument("--campo", default="ref")
    s.set_defaults(func=cmd_proximo)

    a = p.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
