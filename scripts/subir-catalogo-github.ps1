# Sube productos_supermercado.csv al release fijo "catalog-data" para que CI embeba el catálogo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$csv = Join-Path $root "productos_supermercado.csv"
if (-not (Test-Path $csv)) {
    Write-Host "Falta: $csv" -ForegroundColor Red
    Write-Host "Copiá el CSV ahí y volvé a ejecutar este script."
    exit 1
}
$mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
Write-Host "Subiendo catalogo ($mb MB) al release catalog-data..."
gh release view catalog-data --repo Walphur/gestion-comercios 2>$null
if ($LASTEXITCODE -ne 0) {
    gh release create catalog-data --repo Walphur/gestion-comercios --title "Datos catálogo supermercado" --notes "Asset para builds con CSV embebido. No es una version de la app."
}
gh release upload catalog-data $csv --repo Walphur/gestion-comercios --clobber
Write-Host "Listo. Los proximos tags v* en Actions podran embeber el catalogo."
