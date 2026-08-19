#!/usr/bin/env bash
# ============================================================================
# install-skills.sh — ativa as skills do kit no Claude Code.
#
# Por que existe: o Claude Code carrega skills de `.claude/skills/`, mas o kit
# versiona as suas em `skills/` (um lugar só, visível, revisável em diff). Este
# script liga os dois: cria um link de `skills/<nome>` em `.claude/skills/<nome>`.
# Editar a skill no repo passa a valer na hora — não há cópia para sincronizar.
#
# Uso:
#   ./install-skills.sh            # liga todas as skills do repo
#   ./install-skills.sh --copy     # copia em vez de linkar (sistemas sem symlink)
#   ./install-skills.sh --list     # só mostra o que está ativo
#
# Idempotente: rodar de novo apenas reconcilia. `.claude/` é gitignored — o que
# está aqui é gerado, nunca versionado.
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT/skills"
DEST="$ROOT/.claude/skills"
MODE="link"

for arg in "$@"; do
  case "$arg" in
    --copy) MODE="copy" ;;
    --list) MODE="list" ;;
    -h|--help) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "opção desconhecida: $arg" >&2; exit 2 ;;
  esac
done

[ -d "$SRC" ] || { echo "ERRO: pasta skills/ não encontrada em $ROOT" >&2; exit 2; }

if [ "$MODE" = "list" ]; then
  echo "Ativas em .claude/skills/:"
  [ -d "$DEST" ] && ls -1 "$DEST" || echo "  (nenhuma — rode ./install-skills.sh)"
  exit 0
fi

mkdir -p "$DEST"
n=0
for dir in "$SRC"/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/SKILL.md" ] || { echo "  ignorada (sem SKILL.md): $name"; continue; }
  target="$DEST/$name"
  rm -rf "$target"
  if [ "$MODE" = "copy" ]; then
    cp -r "$dir" "$target"
  elif ln -s "../../skills/$name" "$target" 2>/dev/null; then
    :
  else
    # Windows sem Developer Mode não cria symlink — cai para cópia em vez de morrer.
    cp -r "$dir" "$target"
    fallback=1
  fi
  n=$((n+1))
done

if [ "${fallback:-0}" = "1" ]; then
  MODE="copy (symlink indisponível — normal no Windows sem Developer Mode)"
  echo "  nota: as skills foram COPIADAS. Editar skills/ não vale na hora —"
  echo "        rode ./install-skills.sh de novo depois de alterar uma skill."
fi

echo "$n skills ativas em .claude/skills/ (modo: $MODE)"
echo
echo "─────────────────────────────────────────────────────────────────────────────"
echo "  PRÓXIMO PASSO — as skills só entram no PRÓXIMO boot do Claude Code."
echo
echo "  1. Reinicie a sessão do Claude Code (saia e abra de novo)."
echo "  2. Cole este prompt no chat:"
echo
echo "       Repo recém-clonado. Roda o onboarding e me diz a próxima ação."
echo
echo "  O agente diagnostica o estado do repo e conduz do clone ao primeiro doc,"
echo "  uma ação por vez. Sem passo 1, ele não enxerga skill nenhuma e improvisa."
echo "─────────────────────────────────────────────────────────────────────────────"
