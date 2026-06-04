# Genera src-tauri/resources/catalog/categories_index.json (rápido al abrir categorías).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$csv = Join-Path $root "productos_supermercado.csv"
if (-not (Test-Path $csv)) {
    Write-Host "Sin CSV: se mantiene el índice existente."
    exit 0
}
Push-Location (Join-Path $root "src-tauri")
try {
    cargo run --release --bin gen_catalog_index -- $csv
} finally {
    Pop-Location
}
