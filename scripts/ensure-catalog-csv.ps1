# Asegura productos_supermercado.csv en la raíz del proyecto antes de compilar instalador completo.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$csv = Join-Path $root "productos_supermercado.csv"

if (Test-Path $csv) {
    $mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
    Write-Host "OK: productos_supermercado.csv ($mb MB)"
    exit 0
}

if ($env:CATALOG_CSV_URL) {
    Write-Host "Descargando catálogo desde CATALOG_CSV_URL..."
    Invoke-WebRequest -Uri $env:CATALOG_CSV_URL -OutFile $csv -UseBasicParsing
    Write-Host "OK: descargado."
    exit 0
}

Write-Host ""
Write-Host "FALTA productos_supermercado.csv en:" -ForegroundColor Red
Write-Host "  $csv"
Write-Host ""
Write-Host "Copialo ahí (~200 MB) o define CATALOG_CSV_URL para descargarlo."
Write-Host "Sin este archivo el instalador no trae el catálogo supermercado."
exit 1
