#!/usr/bin/env bash
# ============================================================================
# bootstrap.sh — do zero a uma sessão de Claude Code pronta, em um comando.
#
#   curl -fsSL https://raw.githubusercontent.com/gstvux/rocketbot-probe/main/bootstrap.sh | bash -s <nome-do-projeto>
#
#   --no-launch   não abre o CLI ao final (use no desktop app: a sessão abre pela UI)
#
# Faz, nesta ordem (a ordem importa):
#   1. baixa a árvore do kit SEM o histórico do repo de origem  (projeto desacoplado)
#   2. `git init` + commit inicial                              (o diagnóstico do kit exige um repo git)
#   3. ./install-skills.sh                                      (liga skills/ em .claude/skills/)
#   4. npm install do portal
#   5. abre o Claude Code JÁ COM O PROMPT DE ONBOARDING         (skills só carregam num boot novo)
#
# O passo 5 é o ponto: a sessão que clona nunca pode ser a sessão que usa o kit.
# ============================================================================
set -euo pipefail

KIT_REPO="${KIT_REPO:-gstvux/rocketbot-probe}"
KIT_URL="${KIT_URL:-https://github.com/$KIT_REPO.git}"   # override p/ testar contra um clone local
PROMPT="Repo recém-clonado. Roda o onboarding e me diz a próxima ação."
DEST=""
LAUNCH=1
for arg in "$@"; do
  case "$arg" in
    --no-launch) LAUNCH=0 ;;          # desktop app: a sessão se abre pela UI, não pelo CLI
    -*) echo "opção desconhecida: $arg" >&2; exit 2 ;;
    *)  [ -z "$DEST" ] && DEST="$arg" ;;
  esac
done

say()  { printf '\033[1;36m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "$DEST" ] || die "uso: bash bootstrap.sh <nome-do-projeto>"
[ -e "$DEST" ] && die "'$DEST' já existe — escolha outro nome (nunca sobrescrevo pasta existente)"
command -v git >/dev/null || die "git não encontrado"

# ─── 1. árvore do kit, sem o histórico de origem ────────────────────────────
say "baixando o kit em ./$DEST"
git clone --depth 1 "$KIT_URL" "$DEST" >/dev/null 2>&1 || die "falha ao clonar $KIT_URL"
rm -rf "$DEST/.git"          # descarta o histórico de origem → projeto desacoplado
cd "$DEST"
[ -f install-skills.sh ] || die "o repo baixado não tem install-skills.sh — versão incompatível do kit"

# ─── 2. repo próprio (o diagnóstico do CLAUDE.md depende de um repo git) ────
say "iniciando o repositório do projeto"
git init -q -b main
git add -A
git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo probe)}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo probe@local)}" \
    commit -qm "chore: base do kit Rocketbot Probe"

# ─── 3. skills ──────────────────────────────────────────────────────────────
say "ativando as skills"
./install-skills.sh >/dev/null || die "install-skills.sh falhou"
n_skills=$(ls -1 .claude/skills 2>/dev/null | wc -l)

# ─── 4. portal ──────────────────────────────────────────────────────────────
if command -v npm >/dev/null 2>&1; then
  say "instalando dependências do portal (pode demorar)"
  (cd 001-docs && npm install --silent >/dev/null 2>&1) || warn "npm install falhou — rode depois: cd 001-docs && npm install"
else
  warn "npm não encontrado — o portal não vai compilar até instalar o Node ≥18"
fi

printf '\n\033[1;32m✓\033[0m kit pronto em \033[1m%s\033[0m — %s skills ativas\n\n' "$(pwd)" "$n_skills"

# ─── 5. abrir o Claude Code com o prompt (boot novo = skills carregadas) ────
if [ "$LAUNCH" = "1" ] && command -v claude >/dev/null 2>&1 && { : </dev/tty; } 2>/dev/null; then
  say "abrindo o Claude Code…"
  exec claude "$PROMPT" < /dev/tty
else
  [ "$LAUNCH" = "0" ] || command -v claude >/dev/null 2>&1 || warn "Claude Code não encontrado no PATH"
  cat <<EOF
Último passo — abra uma sessão do Claude Code NESTA pasta e mande:

    $PROMPT

  · Desktop app: aba Code → Project folder = $(pwd) → cole o prompt acima
  · CLI:         cd $(basename "$(pwd)") && claude "$PROMPT"

Em ambos, tem de ser uma sessão NOVA — as skills carregam no boot.
EOF
fi
