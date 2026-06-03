@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "CARGO_TARGET_DIR=%~dp0src-tauri\target"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

echo Compilando Gestión Comercios (release + instalador)...
echo Esto puede tardar varios minutos la primera vez.
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
