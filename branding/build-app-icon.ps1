# Genera icono cuadrado 1024px con fondo transparente y logo grande (barra de tareas + instalador)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing

$srcPath = $null
foreach ($name in @("waltech-icon-transparent.png", "waltech-app-icon.png")) {
  $p = Join-Path $PSScriptRoot $name
  if (Test-Path $p) { $srcPath = $p; break }
}
if (-not $srcPath) { throw "No se encontró imagen en branding/" }

$size = 1024
$fill = 0.82
$out = Join-Path $PSScriptRoot "waltech-app-icon.png"

$src = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$maxSide = [Math]::Max($src.Width, $src.Height)
$scale = ($size * $fill) / $maxSide
$w = [int]($src.Width * $scale)
$h = [int]($src.Height * $scale)
$x = [int](($size - $w) / 2)
$y = [int](($size - $h) / 2)
$g.DrawImage($src, $x, $y, $w, $h)
$g.Dispose()
$src.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Icono guardado: $out ($size x $size, fill $fill)"

Push-Location $root
try {
  $iconPng = Join-Path $PSScriptRoot "waltech-app-icon.png"
  & npm run tauri -- icon $iconPng
  if ($LASTEXITCODE -ne 0) { throw "tauri icon falló con código $LASTEXITCODE" }
  Write-Host "Iconos Tauri regenerados en src-tauri/icons/"
} finally {
  Pop-Location
}
