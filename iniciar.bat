@echo off
title Gestion Comercios
cd /d "%~dp0"

REM Asegura que Rust (cargo) este en el PATH
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where cargo >nul 2>&1
if errorlevel 1 (
    echo.
    echo [ERROR] No se encuentra Rust/cargo.
    echo Instalalo con: winget install Rustlang.Rustup
    echo Luego reinicia Cursor/VS Code y volve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

echo Iniciando Gestion Comercios...
echo (La primera vez puede tardar 1-2 minutos en compilar)
echo.
call npm run tauri dev
pause
