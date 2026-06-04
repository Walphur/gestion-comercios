# Obtiene productos_supermercado.csv en la carpeta indicada (raíz del proyecto por defecto).
# Orden: archivo local → release catalog-data → CATALOG_CSV_URL
param(
    [string]$DestinationDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$csv = Join-Path $DestinationDir "productos_supermercado.csv"

if (Test-Path $csv) {
    $mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
    Write-Host "Catálogo local: productos_supermercado.csv ($mb MB)"
    exit 0
}

$repo = "Walphur/gestion-comercios"
Write-Host "Buscando catálogo en GitHub release catalog-data ($repo)..."
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
    Push-Location $DestinationDir
    try {
        gh release download catalog-data -p "productos_supermercado.csv" --repo $repo 2>$null
        if (Test-Path $csv) {
            $mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
            Write-Host "Descargado desde catalog-data ($mb MB)."
            exit 0
        }
    } finally {
        Pop-Location
    }
}

if ($env:CATALOG_CSV_URL) {
    Write-Host "Descargando desde CATALOG_CSV_URL..."
    Invoke-WebRequest -Uri $env:CATALOG_CSV_URL -OutFile $csv -UseBasicParsing
    if (Test-Path $csv) {
        Write-Host "Catálogo descargado por URL."
        exit 0
    }
}

Write-Host ""
Write-Host "No se pudo obtener productos_supermercado.csv." -ForegroundColor Red
Write-Host "  1) Copiá el archivo a: $csv"
Write-Host "  2) O publicá una vez: .\scripts\publicar-catalogo.ps1"
Write-Host "  3) O definí CATALOG_CSV_URL en GitHub Secrets / entorno"
exit 1
