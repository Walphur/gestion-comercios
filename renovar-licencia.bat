@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Renovar suscripcion (+30 dias)

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo === Renovar licencia mensual (+30 dias) ===
echo.
set /p CLAVE=Clave GC-XXXX-XXXX-XXXX: 
if "%CLAVE%"=="" (
  echo Falta la clave.
  goto :fin
)

node scripts/license-admin.mjs extend --key %CLAVE% --months 1

:fin
echo.
pause
endlocal
