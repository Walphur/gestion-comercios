@echo off
setlocal EnableExtensions
set "ROOT=%~dp0.."
set "SECRET_FILE=%ROOT%\workers\license-api\.admin-secret.txt"

if not exist "%SECRET_FILE%" (
  echo.
  echo [ERROR] No se encontro el secreto admin:
  echo   %SECRET_FILE%
  echo.
  echo Configuralo una vez con el deploy de Cloudflare ^(ver docs\LICENCIAS.md^).
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado. Descargalo de https://nodejs.org
  exit /b 1
)

cd /d "%ROOT%"
exit /b 0
