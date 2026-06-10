@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Licencia Pro

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo === Licencia PRO ===
echo.
set /p DEVICES=Cuantas PCs? [default 3]: 
if "%DEVICES%"=="" set DEVICES=3
set /p NOTA=Numero de pedido ML ^(Enter para omitir^): 
echo.

if "%NOTA%"=="" (
  node scripts/license-admin.mjs create --plan pro --devices %DEVICES%
) else (
  node scripts/license-admin.mjs create --plan pro --devices %DEVICES% --note "%NOTA%"
)

if not errorlevel 1 (
  echo.
  echo Instalador: https://github.com/Walphur/gestion-comercios/releases/latest
)

:fin
echo.
pause
endlocal
