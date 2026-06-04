# El updater de Tauri necesita descargar latest.json y el .exe sin login.
# Con repo privado eso falla (404). Este script deja el repo publico (solo codigo + releases).
$ErrorActionPreference = "Stop"

Write-Host "Gestión Comercios: las actualizaciones automaticas requieren releases publicos." -ForegroundColor Cyan
Write-Host "Se cambiara Walphur/gestion-comercios a PUBLICO (cualquiera puede ver el codigo en GitHub)."
Write-Host ""
$ok = Read-Host "Continuar? (s/N)"
if ($ok -notmatch '^[sS]') { exit 0 }

gh repo edit Walphur/gestion-comercios --visibility public --accept-visibility-change-consequences
Write-Host "Listo. Proba: https://github.com/Walphur/gestion-comercios/releases/latest/download/latest.json"
