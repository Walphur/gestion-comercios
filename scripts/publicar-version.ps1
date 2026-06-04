# Sincroniza versión en package/tauri, commitea, etiqueta y dispara el release en GitHub Actions.
param(
  [Parameter(Mandatory = $true)]
  [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$tag = "v$Version"
$files = @(
  "package.json",
  "src-tauri\tauri.conf.json",
  "src-tauri\Cargo.toml"
)

foreach ($f in $files) {
  $c = Get-Content $f -Raw
  $c = $c -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
  $c = $c -replace 'version = "[^"]+"', "version = `"$Version`""
  Set-Content $f $c -NoNewline
}

Write-Host "Versión $Version en archivos de proyecto."
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "Release $tag"
git tag $tag
git push origin main
git push origin $tag
Write-Host "Pusheado $tag — mirá Actions en GitHub: https://github.com/Walphur/gestion-comercios/actions"
