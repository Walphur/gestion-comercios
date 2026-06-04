# Configura secretos de firma del updater en GitHub (una sola vez).
$ErrorActionPreference = "Stop"
$keyPath = Join-Path $env:USERPROFILE ".tauri\gestion-comercios.key"
if (-not (Test-Path $keyPath)) {
  Write-Host "No existe $keyPath"
  Write-Host "Generá la clave con: npx tauri signer generate -w `"$keyPath`""
  exit 1
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Instalá GitHub CLI: https://cli.github.com/"
  exit 1
}

gh auth status | Out-Null
Write-Host "Subiendo TAURI_SIGNING_PRIVATE_KEY al repo Walphur/gestion-comercios ..."
Get-Content $keyPath -Raw | gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Walphur/gestion-comercios

$pwd = Read-Host "Contraseña de la clave (Enter si no tiene)"
if ([string]::IsNullOrWhiteSpace($pwd)) {
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body "" --repo Walphur/gestion-comercios
} else {
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body $pwd --repo Walphur/gestion-comercios
}

Write-Host "Listo. Publicá una versión con: git tag v0.1.1; git push origin v0.1.1"
