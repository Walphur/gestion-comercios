@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "CARGO_TARGET_DIR=%~dp0src-tauri\target"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

if not exist "%~dp0productos_supermercado.csv" (
  echo.
  echo [ERROR] Falta productos_supermercado.csv en esta carpeta.
  echo Copialo aqui para que el instalador lo incluya (~200 MB):
  echo   %~dp0productos_supermercado.csv
  echo.
  pause
  exit /b 1
)

echo Compilando Gestion Comercios (release + instalador)...
echo Si el CSV esta presente, el instalador pesara ~200 MB mas.
echo La primera vez que abran la app cargara el catalogo automaticamente.
echo.

call npm run build:win
if errorlevel 1 (
  echo.
  echo ERROR en la compilacion.
  pause
  exit /b 1
)

echo.
echo Listo. Instaladores en:
echo   %CARGO_TARGET_DIR%\release\bundle\nsis\
echo   %CARGO_TARGET_DIR%\release\bundle\msi\
echo.
start "" "%CARGO_TARGET_DIR%\release\bundle\nsis"
pause
