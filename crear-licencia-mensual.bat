@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Licencia MENSUAL (1 mes)

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo === Licencia MENSUAL (30 dias) ===
echo Plan Básico 1 PC - renovar con renovar-licencia.bat
echo.
set /p NOTA=Cliente / pedido (Enter para omitir): 
echo.

if "%NOTA%"=="" (
  node scripts/license-admin.mjs create --plan basic --devices 1 --monthly --months 1
) else (
  node scripts/license-admin.mjs create --plan basic --devices 1 --monthly --months 1 --note "%NOTA%"
)

:fin
echo.
pause
endlocal
