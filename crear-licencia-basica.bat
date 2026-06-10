@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Licencia Basica (1 PC)

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo === Licencia BASICA (1 PC) ===
echo.
set /p NOTA=Numero de pedido ML ^(Enter para omitir^): 
echo.

if "%NOTA%"=="" (
  node scripts/license-admin.mjs create --plan basic --devices 1
) else (
  node scripts/license-admin.mjs create --plan basic --devices 1 --note "%NOTA%"
)

if not errorlevel 1 (
  echo.
  echo Instalador: https://github.com/Walphur/gestion-comercios/releases/latest
)

:fin
echo.
pause
endlocal
