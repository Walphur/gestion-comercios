# Asegura productos_supermercado.csv en la raíz del proyecto antes de compilar instalador completo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$csv = Join-Path $root "productos_supermercado.csv"

if (Test-Path $csv) {
    $mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
    Write-Host "OK: productos_supermercado.csv ($mb MB)"
    exit 0
}

& "$PSScriptRoot\download-catalog-csv.ps1" -DestinationDir $root
if ($LASTEXITCODE -eq 0) { exit 0 }

Write-Host ""
Write-Host "FALTA productos_supermercado.csv en:" -ForegroundColor Red
Write-Host "  $csv"
Write-Host ""
Write-Host "Copialo ahí (~200 MB), ejecutá .\scripts\publicar-catalogo.ps1 (una vez),"
Write-Host "o define CATALOG_CSV_URL."
exit 1
