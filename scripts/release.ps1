# Sube versión patch, commit, tag y push → dispara GitHub Actions (instalador + latest.json).
# Si package.json / tauri.conf ya tienen una versión más alta que el último tag v*,
# usa esa (no vuelve a sumar +1). Así no se saltean versiones al bumpear a mano + release.
param(
  [string]$Version = "",
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Compare-SemVer([string]$a, [string]$b) {
  $pa = $a.Split(".") | ForEach-Object { [int]$_ }
  $pb = $b.Split(".") | ForEach-Object { [int]$_ }
  for ($i = 0; $i -lt 3; $i++) {
    $da = if ($i -lt $pa.Count) { $pa[$i] } else { 0 }
    $db = if ($i -lt $pb.Count) { $pb[$i] } else { 0 }
    if ($da -gt $db) { return 1 }
    if ($da -lt $db) { return -1 }
  }
  return 0
}

$conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$current = $conf.version

$latestTag = (git tag -l "v*" --sort=-v:refname | Select-Object -First 1)
$latestVer = if ($latestTag) { $latestTag.TrimStart("v") } else { "0.0.0" }

if (-not $Version) {
  if ((Compare-SemVer $current $latestVer) -gt 0) {
    # Ya bumpeada a mano respecto del último tag publicado
    $Version = $current
    Write-Host "Usando versión ya preparada: $Version (último tag: v$latestVer)"
  } else {
    $parts = $current.Split(".")
    $patch = [int]$parts[2] + 1
    $Version = "$($parts[0]).$($parts[1]).$patch"
    Write-Host "Versión: $current -> $Version (tag v$Version)"
  }
} else {
  Write-Host "Versión forzada: $Version (tag v$Version)"
}

$tag = "v$Version"

# Evitar retaguear la misma versión
$existing = git tag -l $tag
if ($existing) {
  Write-Host "ERROR: El tag $tag ya existe. Abortando." -ForegroundColor Red
  exit 1
}

(Get-Content "package.json" -Raw) -replace '"version": "[^"]+"', "`"version`": `"$Version`"" | Set-Content "package.json" -NoNewline
(Get-Content "src-tauri\tauri.conf.json" -Raw) -replace '"version": "[^"]+"', "`"version`": `"$Version`"" | Set-Content "src-tauri\tauri.conf.json" -NoNewline

git add package.json src-tauri/tauri.conf.json
$pending = git status --porcelain -- package.json src-tauri/tauri.conf.json
if ($pending) {
  git commit -m "chore: release $Version"
} else {
  Write-Host "Versión ya estaba en $Version; solo se crea el tag."
}

git tag $tag

if (-not $NoPush) {
  git push origin main
  git push origin $tag
  Write-Host "Push hecho. Mirá Actions en GitHub: release de $tag"
} else {
  Write-Host "Tag local $tag (sin push). Usá: git push origin main && git push origin $tag"
}
