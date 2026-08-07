# Quita fondo negro y recorta PNG de logos WalQo.
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

Add-Type -AssemblyName System.Drawing

function Remove-DarkBackground {
  param([string]$Src, [string]$Dest, [byte]$Threshold = 55)

  $srcBmp = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Src))
  $bmp = New-Object System.Drawing.Bitmap $srcBmp.Width, $srcBmp.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.DrawImage($srcBmp, 0, 0)
  $g.Dispose()
  $srcBmp.Dispose()

  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.R -le $Threshold -and $c.G -le $Threshold -and $c.B -le $Threshold) {
        $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      }
    }
  }

  $minX = $bmp.Width; $minY = $bmp.Height; $maxX = 0; $maxY = 0
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      if ($bmp.GetPixel($x, $y).A -gt 0) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -ge $minX) {
    $pad = [Math]::Max(8, [int](($maxX - $minX) * 0.04))
    $minX = [Math]::Max(0, $minX - $pad)
    $minY = [Math]::Max(0, $minY - $pad)
    $maxX = [Math]::Min($bmp.Width - 1, $maxX + $pad)
    $maxY = [Math]::Min($bmp.Height - 1, $maxY + $pad)
    $w = $maxX - $minX + 1
    $h = $maxY - $minY + 1
    $crop = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $cg = [System.Drawing.Graphics]::FromImage($crop)
    $cg.DrawImage($bmp, 0, 0, (New-Object System.Drawing.Rectangle $minX, $minY, $w, $h), [System.Drawing.GraphicsUnit]::Pixel)
    $cg.Dispose()
    $bmp.Dispose()
    $bmp = $crop
  }

  $dir = Split-Path $Dest -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  $bmp.Save($Dest, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$files = @(
  "public\branding\walqo-mark.png",
  "public\branding\walqo-logo.png",
  "public\branding\walqo-wordmark.png",
  "public\branding\walqo-lockup.png"
)

foreach ($rel in $files) {
  $path = Join-Path $Root $rel
  if (-not (Test-Path $path)) { continue }
  $tmp = Join-Path $env:TEMP ("knockout-" + [IO.Path]::GetFileName($path))
  Copy-Item $path $tmp -Force
  Remove-DarkBackground -Src $tmp -Dest $path
  $doc = Join-Path $Root ("docs\branding\" + [IO.Path]::GetFileName($path))
  Copy-Item $path $doc -Force
  if ($rel -match "walqo-mark|walqo-logo") {
    Copy-Item $path (Join-Path $Root "src\assets\branding\walqo-logo.png") -Force
  }
  Write-Host "ok $rel"
}
