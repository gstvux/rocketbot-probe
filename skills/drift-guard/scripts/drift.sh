#!/usr/bin/env bash
# ============================================================================
# drift.sh — gate anti-drift: prova, por sha256, que a COPIA de execucao e
# byte-identica a FONTE DE VERDADE no git.
#
# O problema que resolve: quase toda automacao acaba com o mesmo arquivo em
# dois lugares — o repo (onde se edita e commita) e a pasta de onde a
# ferramenta REALMENTE executa. Sem sincronia automatica, alguem edita direto
# no destino "so pra testar rapidinho" e o repo fica cego. O sintoma chega
# depois, disfarcado: "por que minha mudanca nao teve efeito?".
#
# Uso:
#   ./drift.sh                      # le drift.json da pasta atual
#   ./drift.sh -c caminho/drift.json
#   ./drift.sh --fix                # copia FONTE -> DESTINO nos que driftaram
#   ./drift.sh --quiet              # so o resumo (bom p/ hook)
#
# Exit: 0 = tudo OK | 1 = drift encontrado | 2 = erro de configuracao
# Sem dependencia alem de sha256sum/awk. Feito para rodar em pre-push.
# ============================================================================
set -uo pipefail

CONF="drift.json"
FIX=0
QUIET=0
while [ $# -gt 0 ]; do
  case "$1" in
    -c|--config) CONF="$2"; shift 2 ;;
    --fix)       FIX=1; shift ;;
    --quiet)     QUIET=1; shift ;;
    -h|--help)   sed -n '2,22p' "$0"; exit 0 ;;
    *) echo "flag desconhecida: $1" >&2; exit 2 ;;
  esac
done

[ -f "$CONF" ] || { echo "ERRO: config nao encontrada: $CONF (veja drift.example.json)" >&2; exit 2; }
command -v python3 >/dev/null || { echo "ERRO: python3 necessario para ler o JSON de config." >&2; exit 2; }

# Expande a config em linhas "fonte<TAB>destino<TAB>rotulo".
# Cada par pode ser arquivo unico ou pasta + glob.
PARES=$(python3 - "$CONF" <<'PY'
import glob, json, os, sys
conf = json.load(open(sys.argv[1], encoding="utf-8"))
raiz = os.path.dirname(os.path.abspath(sys.argv[1]))
for par in conf.get("pares", []):
    fonte = os.path.expanduser(par["fonte"])
    destino = os.path.expanduser(par["destino"])
    if not os.path.isabs(fonte):
        fonte = os.path.join(raiz, fonte)
    rotulo = par.get("rotulo", "")
    padrao = par.get("glob")
    if padrao:
        for f in sorted(glob.glob(os.path.join(fonte, padrao))):
            b = os.path.basename(f)
            print(f"{f}\t{os.path.join(destino, b)}\t{rotulo}/{b}")
    else:
        print(f"{fonte}\t{destino}\t{rotulo or os.path.basename(fonte)}")
PY
) || exit 2

ok=0; drift=0; falta=0
while IFS=$'\t' read -r fonte destino rotulo; do
  [ -n "${fonte:-}" ] || continue
  if [ ! -f "$fonte" ]; then
    echo "SEM FONTE  $rotulo  ($fonte)"; falta=$((falta+1)); continue
  fi
  h1=$(sha256sum "$fonte" | awk '{print $1}')
  h2=$(sha256sum "$destino" 2>/dev/null | awk '{print $1}')
  if [ -z "$h2" ]; then
    echo "AUSENTE    $rotulo  -> $destino"
    falta=$((falta+1))
    if [ "$FIX" = 1 ]; then mkdir -p "$(dirname "$destino")" && cp "$fonte" "$destino" && echo "  copiado."; fi
  elif [ "$h1" = "$h2" ]; then
    ok=$((ok+1)); [ "$QUIET" = 1 ] || echo "OK         $rotulo"
  else
    echo "DRIFT      $rotulo"
    echo "           fonte   ${h1:0:16}  $fonte"
    echo "           destino ${h2:0:16}  $destino"
    drift=$((drift+1))
    if [ "$FIX" = 1 ]; then cp "$fonte" "$destino" && echo "           corrigido (fonte -> destino)."; fi
  fi
done <<< "$PARES"

echo "---"
echo "ok=$ok  drift=$drift  ausente/sem-fonte=$falta"
if [ "$FIX" = 1 ]; then
  echo "modo --fix: destinos realinhados pela fonte. Rode de novo para confirmar."
  exit 0
fi
if [ $((drift + falta)) -gt 0 ]; then
  echo "GATE VERMELHO — nao rode o robo nem faca push antes de resolver." >&2
  exit 1
fi
echo "GATE VERDE"
