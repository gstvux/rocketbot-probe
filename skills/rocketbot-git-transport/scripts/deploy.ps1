# ============================================================================
# deploy.ps1 — lado PRODUCAO da ponte git. PULL-ONLY, com backup e verificacao.
#
# Roda no servidor (pela sessao remota), num PowerShell NAO-ELEVADO.
# Nunca commita, nunca faz push: producao so recebe.
#
# Uso:
#   .\deploy.ps1 -Repo C:\rocketbot-repo
#   .\deploy.ps1 -Repo C:\rocketbot-repo -Branch main -GitDir 'C:\MinGit\cmd'
#   .\deploy.ps1 -Repo C:\rocketbot-repo -DryRun      # so mostra o que viria
#
# Depois de rodar: RECARREGUE O STUDIO. Ele executa da memoria e nao rele o
# disco sozinho — sem recarregar, o teste mede a versao anterior.
# ============================================================================
param(
  [Parameter(Mandatory = $true)][string]$Repo,
  [string]$Branch = 'main',
  [string]$GitDir = 'C:\MinGit\cmd',   # git portatil costuma ficar fora do PATH
  [string]$AssetsScript = '.\setup-imgs.ps1',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# git portatil fora do PATH + pager desligado (senao o git trava esperando 'q')
if (Test-Path $GitDir) { $env:Path += ";$GitDir" }
$env:GIT_PAGER = 'cat'

if (-not (Test-Path $Repo)) { throw "Repo nao encontrado: $Repo" }
Set-Location $Repo

Write-Host "== deploy pull-only em $Repo (branch $Branch) ==" -ForegroundColor Cyan

# 1. Backup ANTES de qualquer coisa. Rollback tem que ser local e instantaneo.
if (Test-Path 'robot.db') {
  $bak = "robot.db.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
  Copy-Item 'robot.db' $bak
  Write-Host "backup  -> $bak"
}

# 2. O que viria do remote
git fetch origin --quiet
$novos = git log --oneline "HEAD..origin/$Branch"
if (-not $novos) {
  Write-Host "ja esta em dia com origin/$Branch — nada a puxar." -ForegroundColor Green
} else {
  Write-Host "commits a aplicar:" -ForegroundColor Yellow
  $novos | ForEach-Object { Write-Host "  $_" }
}
if ($DryRun) { Write-Host "(dry-run: nada foi alterado)"; exit 0 }

# 3. Descartar sujeira local. RODAR O ROBO ALTERA o robot.db (o Studio grava
#    estado de execucao dentro dele) — sem descartar, o pull conflita sempre.
#    Estado que precisa sobreviver (contador, dev.json) e GITIGNORED de proposito:
#    o reset nao toca em arquivo ignorado.
git checkout -- robot.db 2>$null
git reset --hard "origin/$Branch" --quiet
Write-Host "codigo  -> $(git rev-parse --short HEAD)"

# 4. Assets que o runtime le do disco (imagens/needles) precisam ser replicados
if (Test-Path $AssetsScript) {
  Write-Host "assets  -> $AssetsScript"
  & $AssetsScript
}

# 5. Prova de que o db que ficou no disco e o db do commit
$sha = (Get-FileHash 'robot.db' -Algorithm SHA256).Hash.Substring(0, 16)
Write-Host "robot.db sha256[0:16] = $sha"

Write-Host ''
Write-Host '>>> AGORA RECARREGUE O STUDIO (ele executa da memoria).' -ForegroundColor Magenta
Write-Host '    Tela inicial -> abrir o projeto de novo. "unsaved changes" -> descartar.'
