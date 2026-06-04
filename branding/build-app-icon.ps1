# Genera icono 1024px: fondo negro → transparente, logo grande (barra de tareas + ventana + instalador)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Add-Type -AssemblyName System.Drawing

$srcPath = $null
foreach ($name in @("waltech-logo-large.png", "waltech-icon-transparent.png", "waltech-app-icon.png")) {
  $p = Join-Path $PSScriptRoot $name
  if (Test-Path $p) { $srcPath = $p; break }
}
if (-not $srcPath) { throw "No se encontró imagen en branding/" }

function Remove-DarkBackground([System.Drawing.Bitmap]$img, [int]$threshold = 40) {
  for ($y = 0; $y -lt $img.Height; $y++) {
    for ($x = 0; $x -lt $img.Width; $x++) {
      $c = $img.GetPixel($x, $y)
      if ($c.R -le $threshold -and $c.G -le $threshold -and $c.B -le $threshold) {
        $img.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      }
    }
  }
  return $img
}

$size = 1024
$fill = 0.92
$out = Join-Path $PSScriptRoot "waltech-app-icon.png"

$srcRaw = [System.Drawing.Image]::FromFile($srcPath)
$srcBmp = New-Object System.Drawing.Bitmap $srcRaw.Width, $srcRaw.Height
$g0 = [System.Drawing.Graphics]::FromImage($srcBmp)
$g0.DrawImage($srcRaw, 0, 0)
$g0.Dispose()
$srcRaw.Dispose()
Remove-DarkBackground $srcBmp | Out-Null

$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

$maxSide = [Math]::Max($srcBmp.Width, $srcBmp.Height)
$scale = ($size * $fill) / $maxSide
$w = [int]($srcBmp.Width * $scale)
$h = [int]($srcBmp.Height * $scale)
$x = [int](($size - $w) / 2)
$y = [int](($size - $h) / 2)
$g.DrawImage($srcBmp, $x, $y, $w, $h)
$g.Dispose()
$srcBmp.Dispose()

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "Icono: $out ($size px, fill $fill, fuente: $(Split-Path $srcPath -Leaf))"

Push-Location $root
try {
  & npm run tauri -- icon (Join-Path $PSScriptRoot "waltech-app-icon.png")
  if ($LASTEXITCODE -ne 0) { throw "tauri icon falló" }
  Write-Host "Iconos en src-tauri/icons/"
} finally {
  Pop-Location
}
