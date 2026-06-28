@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Marcar PAGO y renovar 30 dias

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo === Marcar PAGO + renovar 30 dias ===
echo.
set /p CLAVE=Clave GC-...: 
if "%CLAVE%"=="" goto :fin

node scripts/license-admin.mjs pay --key "%CLAVE%" --months 1

:fin
echo.
pause
endlocal
