@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
set "GESTION_SUPERMARKET_CSV=%~dp0productos_supermercado.csv"

if not exist "%GESTION_SUPERMARKET_CSV%" (
  echo No esta productos_supermercado.csv en esta carpeta.
  echo Copialo aqui: %~dp0
  pause
  exit /b 1
)

echo El CSV tiene unas 190.000 filas.
echo Abrí la app con iniciar.bat y en Productos toca "Catalogo supermercado".
echo O deja este archivo en la carpeta y usa ese boton desde la app.
echo.
start "" "%~dp0iniciar.bat"
