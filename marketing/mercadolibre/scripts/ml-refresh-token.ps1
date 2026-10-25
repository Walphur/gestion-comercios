<#
  Renueva el access_token de Mercado Libre con el refresh_token guardado fuera del repo.
  Lee y reescribe el JSON de credenciales; nunca muestra tokens ni el client_secret.
  Formato esperado: client_id, client_secret, redirect_uri, access_token, refresh_token,
  user_id, expires_at (ISO 8601), scope.

  Uso:
    powershell -ExecutionPolicy Bypass -File marketing\mercadolibre\scripts\ml-refresh-token.ps1
    ... -Force          renueva aunque el token siga vigente
    ... -Check          solo dice si el token sirve (GET /users/me), sin renovar
#>
param(
  [string]$CredentialsPath = (Join-Path $env:LOCALAPPDATA 'WalQo\mercadolibre\credentials.json'),
  [switch]$Force,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $CredentialsPath)) {
  Write-Error "No existe $CredentialsPath. Primero hay que autorizar la app de Mercado Libre."
  exit 1
}

$creds = Get-Content -LiteralPath $CredentialsPath -Raw -Encoding UTF8 | ConvertFrom-Json

function Test-MlToken([string]$token) {
  try {
    $me = Invoke-RestMethod -Uri 'https://api.mercadolibre.com/users/me' -Headers @{ Authorization = "Bearer $token" }
    Write-Host ("Token OK: {0} (user_id {1}, {2})" -f $me.nickname, $me.id, $me.site_id)
    return $true
  } catch {
    Write-Host ("Token no valido: {0}" -f $_.Exception.Message)
    return $false
  }
}

if ($Check) {
  if (Test-MlToken $creds.access_token) { exit 0 } else { exit 2 }
}

$expiresAt = $null
if ($creds.expires_at) { $expiresAt = [DateTimeOffset]::Parse([string]$creds.expires_at) }
$margin = [TimeSpan]::FromMinutes(30)
if (-not $Force -and $expiresAt -and ($expiresAt - [DateTimeOffset]::Now) -gt $margin) {
  Write-Host ("El token sigue vigente hasta {0:yyyy-MM-dd HH:mm}. Usa -Force para renovarlo igual." -f $expiresAt.ToLocalTime())
  exit 0
}

foreach ($field in 'client_id', 'client_secret', 'refresh_token') {
  if (-not $creds.$field) {
    Write-Error "Falta '$field' en $CredentialsPath."
    exit 1
  }
}

try {
  $resp = Invoke-RestMethod -Method Post -Uri 'https://api.mercadolibre.com/oauth/token' `
    -ContentType 'application/x-www-form-urlencoded' `
    -Headers @{ Accept = 'application/json' } `
    -Body @{
      grant_type    = 'refresh_token'
      client_id     = [string]$creds.client_id
      client_secret = [string]$creds.client_secret
      refresh_token = [string]$creds.refresh_token
    }
} catch {
  $detail = $_.ErrorDetails.Message
  Write-Error ("No se pudo renovar el token: {0} {1}. Si el refresh_token vencio o se uso dos veces, hay que volver a autorizar la app." -f $_.Exception.Message, $detail)
  exit 1
}

$now = [DateTimeOffset]::Now
$updated = [ordered]@{}
foreach ($p in $creds.PSObject.Properties) { $updated[$p.Name] = $p.Value }
$updated['access_token'] = $resp.access_token
# ML entrega un refresh_token nuevo en cada renovacion y el anterior deja de servir.
if ($resp.refresh_token) { $updated['refresh_token'] = $resp.refresh_token }
$updated['user_id'] = $resp.user_id
$updated['scope'] = $resp.scope
$updated['expires_at'] = $now.AddSeconds([int]$resp.expires_in).ToString('o')
$updated['refreshed_at'] = $now.ToString('o')

$tmp = "$CredentialsPath.tmp"
([pscustomobject]$updated) | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $tmp -Encoding UTF8
Move-Item -LiteralPath $tmp -Destination $CredentialsPath -Force

Write-Host ("Token renovado. Vence {0:yyyy-MM-dd HH:mm}." -f $now.AddSeconds([int]$resp.expires_in).ToLocalTime())
