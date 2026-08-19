#!/usr/bin/env python3
# ============================================================================
# robotdb.py — torna o robot.db do Rocketbot Studio LEGÍVEL PARA O GIT.
#
# O problema: o robot.db é um SQLite cujo campo `data` é JSON em base64. Para o
# git ele é um blob binário — dois commits seguidos mostram "arquivo alterado" e
# nada mais. Sem diff, não há revisão, não há bisect, não há rollback confiável,
# e drift entre dev e produção passa despercebido.
#
# A solução: um SNAPSHOT versionável ao lado do db. Cada robô vira um .json
# indentado e ordenado; o git passa a mostrar exatamente qual comando mudou.
#
#   snapshot   robot.db -> pasta de .json (commitar JUNTO com o db)
#   list       robôs e versões do db
#   show       JSON de um robô (stdout)
#   diff       compara DOIS dbs (ou db x snapshot): quem mudou, o que mudou
#   fingerprint  hash estável por robô — é o gate anti-drift do CI
#
# Uso:
#   ./robotdb.py list        robot.db
#   ./robotdb.py snapshot    robot.db --out robots/
#   ./robotdb.py show        robot.db --robot meuRobo
#   ./robotdb.py diff        dev/robot.db prod/robot.db
#   ./robotdb.py diff        robot.db --snapshot robots/
#   ./robotdb.py fingerprint robot.db
#
# Nenhuma dependência além da stdlib. Abre sempre em modo read-only.
# ============================================================================
import argparse
import base64
import difflib
import hashlib
import json
import os
import sqlite3
import sys

# ---- leitura ---------------------------------------------------------------

def _conn(path):
    if not os.path.exists(path):
        sys.exit(f"ERRO: nao encontrei {path}")
    return sqlite3.connect(f"file:{os.path.abspath(path)}?mode=ro", uri=True)


def _decode(data):
    """O campo `data` e JSON em base64. Alguns dbs guardam JSON puro."""
    if data is None:
        return None
    raw = data if isinstance(data, (bytes, bytearray)) else data.encode()
    try:
        return json.loads(base64.b64decode(raw))
    except Exception:
        try:
            return json.loads(raw)
        except Exception:
            return None


def carregar(path, todas_versoes=False):
    """Devolve {nome: {'id':.., 'version':.., 'project':{...}}} da versao MAIS
    RECENTE de cada robo (o Studio guarda historico: varias linhas por nome)."""
    cur = _conn(path).execute(
        "select id, name, version, data_type, description, data from bots order by id"
    )
    out = {}
    for rid, name, version, dtype, desc, data in cur:
        proj = _decode(data)
        if proj is None:
            continue
        reg = {"id": rid, "name": name, "version": version, "data_type": dtype,
               "description": desc, "project": proj.get("project", proj)}
        if todas_versoes:
            out.setdefault(name, []).append(reg)
        else:
            out[name] = reg  # id crescente => a ultima linha vence
    return out


# ---- normalizacao ----------------------------------------------------------
# Campos que mudam a cada save do Studio sem mudar o comportamento do robo.
# Ficam FORA do fingerprint, senao todo save vira "drift" e o gate perde valor.
VOLATEIS = {"id", "index", "line", "screenshot", "mode_live", "execute_debugg"}


def normalizar(project, manter_ids=False):
    def limpa(node):
        if isinstance(node, dict):
            return {k: limpa(v) for k, v in sorted(node.items())
                    if manter_ids or k not in VOLATEIS}
        if isinstance(node, list):
            return [limpa(x) for x in node]
        return node
    return limpa(project)


def dumps(obj):
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True)


def fingerprint(project):
    return hashlib.sha256(dumps(normalizar(project)).encode()).hexdigest()[:16]


def resumo(project):
    """Contagem plana de comandos, inclusive filhos de grupos/ifs."""
    def conta(cmds):
        n = 0
        for c in cmds or []:
            n += 1 + conta(c.get("children")) + conta(c.get("else"))
        return n
    prof = project.get("profile", {}) or {}
    return {
        "titulo": prof.get("name", ""),
        "versao": prof.get("version", ""),
        "comandos": conta(project.get("commands")),
        "vars": len(project.get("vars") or []),
    }


# ---- comandos --------------------------------------------------------------

def cmd_list(a):
    robos = carregar(a.db)
    print(f"{'ROBO':<34} {'VER':<10} {'CMDS':>5} {'VARS':>5}  FINGERPRINT")
    for nome in sorted(robos):
        r = robos[nome]
        s = resumo(r["project"])
        print(f"{nome:<34} {str(r['version'] or ''):<10} {s['comandos']:>5} {s['vars']:>5}  {fingerprint(r['project'])}")
    print(f"\n{len(robos)} robo(s) em {a.db}")


def cmd_show(a):
    robos = carregar(a.db)
    if a.robot not in robos:
        sys.exit(f"ERRO: robo '{a.robot}' nao esta no db. Disponiveis: {', '.join(sorted(robos))}")
    print(dumps(normalizar(robos[a.robot]["project"], manter_ids=a.raw)))


def cmd_snapshot(a):
    robos = carregar(a.db)
    os.makedirs(a.out, exist_ok=True)
    escritos, index = [], {}
    for nome, r in sorted(robos.items()):
        # nome de arquivo seguro: o Studio aceita nomes com espaco/acento
        safe = "".join(ch if (ch.isalnum() or ch in "-_.") else "_" for ch in nome)
        dest = os.path.join(a.out, f"{safe}.json")
        conteudo = dumps(normalizar(r["project"])) + "\n"
        antigo = open(dest, encoding="utf-8").read() if os.path.exists(dest) else None
        if antigo != conteudo:
            open(dest, "w", encoding="utf-8").write(conteudo)
            escritos.append(safe)
        index[nome] = {"arquivo": f"{safe}.json", "versao": r["version"],
                       "fingerprint": fingerprint(r["project"]), **resumo(r["project"])}
    open(os.path.join(a.out, "_index.json"), "w", encoding="utf-8").write(dumps(index) + "\n")

    # arquivos orfaos: robo apagado no Studio nao pode ficar vivo no snapshot
    vivos = {v["arquivo"] for v in index.values()} | {"_index.json"}
    orfaos = [f for f in os.listdir(a.out) if f.endswith(".json") and f not in vivos]
    for f in orfaos:
        os.remove(os.path.join(a.out, f))

    print(f"snapshot de {len(index)} robo(s) em {a.out}")
    if escritos:
        print("  alterados: " + ", ".join(escritos))
    if orfaos:
        print("  removidos (nao existem mais no db): " + ", ".join(orfaos))
    if not escritos and not orfaos:
        print("  nada mudou.")


def cmd_fingerprint(a):
    for nome, r in sorted(carregar(a.db).items()):
        print(f"{fingerprint(r['project'])}  {nome}")


def _lado_b(a):
    """O lado B do diff: outro db, ou um snapshot em pasta."""
    if a.snapshot:
        out = {}
        for f in sorted(os.listdir(a.snapshot)):
            if not f.endswith(".json") or f == "_index.json":
                continue
            proj = json.load(open(os.path.join(a.snapshot, f), encoding="utf-8"))
            nome = (proj.get("profile") or {}).get("name") or f[:-5]
            out[nome] = {"project": proj, "version": (proj.get("profile") or {}).get("version")}
        return out, a.snapshot
    if not a.outro:
        sys.exit("ERRO: informe o segundo db, ou --snapshot <pasta>")
    return carregar(a.outro), a.outro


def cmd_diff(a):
    A, B = carregar(a.db), None
    B, nome_b = _lado_b(a)
    so_a = sorted(set(A) - set(B))
    so_b = sorted(set(B) - set(A))
    comuns = sorted(set(A) & set(B))

    mudados = []
    for nome in comuns:
        fa, fb = fingerprint(A[nome]["project"]), fingerprint(B[nome]["project"])
        if fa != fb:
            mudados.append((nome, fa, fb))

    print(f"A = {a.db}\nB = {nome_b}\n")
    for nome in so_a:
        print(f"  SO EM A   {nome}")
    for nome in so_b:
        print(f"  SO EM B   {nome}")
    for nome, fa, fb in mudados:
        print(f"  DIFERE    {nome}   A:{fa}  B:{fb}")
    iguais = len(comuns) - len(mudados)
    print(f"\n{iguais} igual(is), {len(mudados)} diferente(s), {len(so_a)} so em A, {len(so_b)} so em B")

    if a.detalhe:
        for nome, _, _ in mudados:
            print(f"\n===== {nome} =====")
            la = dumps(normalizar(A[nome]["project"])).splitlines(keepends=True)
            lb = dumps(normalizar(B[nome]["project"])).splitlines(keepends=True)
            sys.stdout.writelines(difflib.unified_diff(la, lb, fromfile="A/" + nome, tofile="B/" + nome, n=2))

    # exit code 1 se houve qualquer divergencia -> serve de gate em CI/pre-push
    if mudados or so_a or so_b:
        sys.exit(1)


def main():
    p = argparse.ArgumentParser(description="Torna o robot.db do Rocketbot legivel para o git.")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("list", help="robos, versoes e fingerprints do db")
    s.add_argument("db"); s.set_defaults(func=cmd_list)

    s = sub.add_parser("show", help="JSON normalizado de um robo")
    s.add_argument("db"); s.add_argument("--robot", required=True)
    s.add_argument("--raw", action="store_true", help="manter ids/indices volateis")
    s.set_defaults(func=cmd_show)

    s = sub.add_parser("snapshot", help="exporta cada robo como .json versionavel")
    s.add_argument("db"); s.add_argument("--out", default="robots")
    s.set_defaults(func=cmd_snapshot)

    s = sub.add_parser("fingerprint", help="hash estavel por robo")
    s.add_argument("db"); s.set_defaults(func=cmd_fingerprint)

    s = sub.add_parser("diff", help="compara dois dbs, ou db x snapshot (exit 1 se divergir)")
    s.add_argument("db"); s.add_argument("outro", nargs="?")
    s.add_argument("--snapshot", help="pasta de snapshot como lado B")
    s.add_argument("--detalhe", action="store_true", help="diff unificado linha a linha")
    s.set_defaults(func=cmd_diff)

    a = p.parse_args()
    a.func(a)


if __name__ == "__main__":
    main()
