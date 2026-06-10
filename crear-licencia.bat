@echo off
chcp 65001 >nul
setlocal EnableExtensions
title Waltech - Crear licencia

call "%~dp0scripts\_licencias-env.bat"
if errorlevel 1 goto :fin

echo.
echo ========================================
echo   GESTION COMERCIOS - NUEVA LICENCIA
echo ========================================
echo.
echo  1) Basico  - 1 PC
echo  2) Pro     - 2 PCs
echo  3) Pro     - 3 PCs
echo  4) Pro     - cantidad custom
echo  5) Listar licencias
echo  6) Revocar licencia
echo  0) Salir
echo.
set /p OPCION=Elige una opcion [1-6, 0]: 

if "%OPCION%"=="0" goto :fin
if "%OPCION%"=="5" goto :listar
if "%OPCION%"=="6" goto :revocar

set PLAN=basic
set DEVICES=1

if "%OPCION%"=="1" goto :pedir_nota
if "%OPCION%"=="2" (set PLAN=pro& set DEVICES=2& goto :pedir_nota)
if "%OPCION%"=="3" (set PLAN=pro& set DEVICES=3& goto :pedir_nota)
if "%OPCION%"=="4" (
  set PLAN=pro
  set /p DEVICES=Cuantas PCs permite esta licencia Pro? 
  goto :pedir_nota
)

echo Opcion invalida.
goto :fin

:pedir_nota
echo.
set /p NOTA=Numero de pedido ML o nota ^(Enter para omitir^): 
echo.
echo Creando licencia %PLAN% ^(%DEVICES% PC^)...
echo.

if "%NOTA%"=="" (
  node scripts/license-admin.mjs create --plan %PLAN% --devices %DEVICES%
) else (
  node scripts/license-admin.mjs create --plan %PLAN% --devices %DEVICES% --note "%NOTA%"
)

if errorlevel 1 goto :fin

echo.
echo ----------------------------------------
echo Copia la clave y mandala al comprador con:
echo https://github.com/Walphur/gestion-comercios/releases/latest
echo ----------------------------------------
goto :fin

:listar
echo.
node scripts/license-admin.mjs list
goto :fin

:revocar
echo.
set /p CLAVE=Clave a revocar ^(GC-XXXX-XXXX-XXXX^): 
if "%CLAVE%"=="" (
  echo Cancelado.
  goto :fin
)
node scripts/license-admin.mjs revoke --key %CLAVE%
goto :fin

:fin
echo.
pause
endlocal
