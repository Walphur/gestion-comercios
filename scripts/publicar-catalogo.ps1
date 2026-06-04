# Sube productos_supermercado.csv al release fijo "catalog-data" (una vez; CI lo usa en cada versión).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$csv = Join-Path $root "productos_supermercado.csv"

if (-not (Test-Path $csv)) {
    Write-Host "Falta el archivo en la raíz del proyecto:" -ForegroundColor Red
    Write-Host "  $csv"
    exit 1
}

$mb = [math]::Round((Get-Item $csv).Length / 1MB, 1)
Write-Host "Subiendo catálogo ($mb MB) al release catalog-data..."

$exists = $false
gh release view catalog-data 2>$null
if ($LASTEXITCODE -eq 0) { $exists = $true }

if (-not $exists) {
    gh release create catalog-data $csv `
        --title "Catálogo kiosco (datos)" `
        --notes "Archivo usado por GitHub Actions para embeber el CSV en cada instalador. No eliminar."
} else {
    gh release upload catalog-data $csv --clobber
}

Write-Host ""
Write-Host "Listo. Los próximos releases (v*) incluirán el catálogo en el .exe automáticamente." -ForegroundColor Green
