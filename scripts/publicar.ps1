# Publica una nueva versión en GitHub (instalador + actualizaciones automáticas).
# Uso: .\scripts\publicar.ps1
param([switch]$NoPush)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ""
Write-Host "=== Publicar actualizacion (GitHub Releases) ===" -ForegroundColor Cyan
Write-Host "1. Se sube el codigo a main"
Write-Host "2. Se crea tag vX.Y.Z"
Write-Host "3. GitHub Actions compila el .exe y latest.json"
Write-Host "4. Las apps instaladas se actualizan solas con internet"
Write-Host ""

$vis = gh repo view --json visibility -q .visibility 2>$null
if ($vis -eq "PRIVATE") {
  Write-Host "AVISO: El repo es PRIVADO. El updater de la app NO puede descargar releases." -ForegroundColor Yellow
  Write-Host "Ejecuta una vez: .\scripts\habilitar-releases-publicos.ps1" -ForegroundColor Yellow
  Write-Host ""
}

$status = git status --porcelain
if ($status) {
  Write-Host "Hay cambios sin commitear. Haciendo commit..." -ForegroundColor Yellow
  git add -A
  git reset HEAD -- "*.png" "ChatGPT*" 2>$null
  $msg = Read-Host "Mensaje de commit (Enter = 'chore: cambios antes de publicar')"
  if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "chore: cambios antes de publicar" }
  git commit -m $msg
  if (-not $NoPush) { git push origin main }
}

& "$PSScriptRoot\release.ps1" @PSBoundParameters
