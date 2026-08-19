#!/usr/bin/env bash
# ============================================================================
# chrome-up.sh — sobe um Chrome DEDICADO com porta CDP e perfil isolado.
#
# Por que existe: a automação nunca deve usar o Chrome pessoal do usuário
# (derruba sessão, mistura cookies, perde perfil). E o Chrome precisa das flags
# anti-backgrounding, senão o renderer suspende com a janela fora de vista e a
# captura CDP trava sem erro nenhum.
#
# Uso:
#   ./chrome-up.sh                                   # perfil padrao, porta 9222
#   ./chrome-up.sh --profile 'C:\chrome-cdp-acme' --port 9222 --url https://portal/login
#   ./chrome-up.sh --linux                           # forca modo linux nativo
#
# Detecta sozinho: WSL (lanca o Chrome do Windows via cmd.exe) ou Linux nativo.
# ============================================================================
set -euo pipefail

PORT=9222
PROFILE=''
URL='about:blank'
FORCE_LINUX=0

while [ $# -gt 0 ]; do
  case "$1" in
    --port)    PORT="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --url)     URL="$2"; shift 2 ;;
    --linux)   FORCE_LINUX=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "flag desconhecida: $1" >&2; exit 1 ;;
  esac
done

# ja esta no ar? nao subir outro (dois Chromes na mesma porta = confusao garantida)
if curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  echo "CDP ja responde em 127.0.0.1:${PORT} — reaproveitando."
  curl -s "http://127.0.0.1:${PORT}/json/version" | head -c 200; echo
  exit 0
fi

FLAGS_COMUNS=(
  "--remote-debugging-port=${PORT}"
  '--disable-backgrounding-occluded-windows'   # nao suspende janela coberta
  '--disable-renderer-backgrounding'           # nao suspende renderer fora de foco
  '--disable-background-timer-throttling'      # timers continuam correndo
  '--disable-features=CalculateNativeWinOcclusion'  # Windows nao marca a janela como oculta
  '--no-first-run'
  '--no-default-browser-check'
  '--new-window'
)

is_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

if [ "$FORCE_LINUX" = 0 ] && is_wsl; then
  # ---- WSL -> Chrome do Windows --------------------------------------------
  : "${PROFILE:=C:\\chrome-cdp}"
  CHROME_WIN='C:\Program Files\Google\Chrome\Application\chrome.exe'
  echo "WSL detectado. Chrome do Windows, perfil ${PROFILE}, porta ${PORT}."
  # ATENCAO: cada flag entre ASPAS SIMPLES. Sem elas o bash come a barra
  # invertida e 'C:\chrome-cdp' vira 'C:chrome-cdp' -> perfil errado, CDP mudo.
  ( cd /mnt/c && nohup cmd.exe /c start "" "$CHROME_WIN" \
      "${FLAGS_COMUNS[@]}" \
      "--user-data-dir=${PROFILE}" \
      "$URL" >/dev/null 2>&1 & )
else
  # ---- Linux nativo ---------------------------------------------------------
  : "${PROFILE:=$HOME/.chrome-cdp}"
  BIN=''
  for c in google-chrome google-chrome-stable chromium chromium-browser; do
    command -v "$c" >/dev/null 2>&1 && { BIN="$c"; break; }
  done
  [ -n "$BIN" ] || { echo "ERRO: nenhum chrome/chromium no PATH." >&2; exit 2; }
  echo "Linux. ${BIN}, perfil ${PROFILE}, porta ${PORT}."
  nohup "$BIN" "${FLAGS_COMUNS[@]}" "--user-data-dir=${PROFILE}" "$URL" >/dev/null 2>&1 &
fi

# ---- esperar o CDP responder (nunca assumir que subiu) ----------------------
for i in $(seq 1 30); do
  sleep 1
  if curl -s -m 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    echo "OK — CDP no ar em 127.0.0.1:${PORT} (${i}s)"
    curl -s "http://127.0.0.1:${PORT}/json/version" | head -c 200; echo
    exit 0
  fi
  printf '.'
done
echo
echo "ERRO: CDP nao respondeu em 30s. Confira o caminho do chrome.exe e as aspas das flags." >&2
exit 3
