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
  else
    ln -s "../../skills/$name" "$target"
  fi
  n=$((n+1))
done

echo "$n skills ativas em .claude/skills/ (modo: $MODE)"
echo "Reinicie a sessão do Claude Code para que ele as carregue."
