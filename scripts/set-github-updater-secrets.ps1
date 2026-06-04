# Configura los secretos de firma del updater en GitHub (una sola vez).
# Ejecutar desde la raíz del repo con `gh` autenticado.

$ErrorActionPreference = "Stop"
$keyPath = Join-Path $env:USERPROFILE ".tauri\gestion-comercios.key"

if (-not (Test-Path $keyPath)) {
  Write-Host "No existe $keyPath"
  Write-Host "Generá la clave con:"
  Write-Host '  npx tauri signer generate -w "$env:USERPROFILE\.tauri\gestion-comercios.key"'
  exit 1
}

Write-Host "Subiendo TAURI_SIGNING_PRIVATE_KEY al repo (no se muestra el contenido)..."
Get-Content -Raw $keyPath | gh secret set TAURI_SIGNING_PRIVATE_KEY

$pwd = Read-Host "Contraseña de la clave (Enter si no tiene)"
if ([string]::IsNullOrWhiteSpace($pwd)) {
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body ""
} else {
  gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body $pwd
}

Write-Host "Listo. Creá un release con: git tag v0.1.1 && git push origin v0.1.1"
