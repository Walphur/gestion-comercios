@echo off

chcp 65001 >nul

cd /d "%~dp0"

set "CARGO_TARGET_DIR=%~dp0src-tauri\target"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"



echo Verificando catalogo supermercado...

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ensure-catalog-csv.ps1"

if errorlevel 1 exit /b 1



echo Compilando instalador COMPLETO (CSV dentro del paquete)...

echo.



call npm run tauri build -- --config src-tauri/tauri.conf.catalog.json

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

