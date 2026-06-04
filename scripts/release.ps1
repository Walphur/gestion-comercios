# Sube versión patch, commit, tag y push → dispara GitHub Actions (instalador + latest.json).
param(
  [string]$Version = "",
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$current = $conf.version
if (-not $Version) {
  $parts = $current.Split(".")
  $patch = [int]$parts[2] + 1
  $Version = "$($parts[0]).$($parts[1]).$patch"
}

$tag = "v$Version"
Write-Host "Versión: $current -> $Version (tag $tag)"

(Get-Content "package.json" -Raw) -replace '"version": "[^"]+"', "`"version`": `"$Version`"" | Set-Content "package.json" -NoNewline
(Get-Content "src-tauri\tauri.conf.json" -Raw) -replace '"version": "[^"]+"', "`"version`": `"$Version`"" | Set-Content "src-tauri\tauri.conf.json" -NoNewline

git add package.json src-tauri/tauri.conf.json
git commit -m "chore: release $Version"
git tag $tag

if (-not $NoPush) {
  git push origin main
  git push origin $tag
  Write-Host "Push hecho. Mirá Actions en GitHub: release de $tag"
} else {
  Write-Host "Tag local $tag (sin push). Usá: git push origin main && git push origin $tag"
}
