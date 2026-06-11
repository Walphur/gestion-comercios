# Requisitos del sistema — Gestión Comercios

## Windows compatible

| Sistema | ¿Funciona? |
|---------|------------|
| **Windows 11** | Sí (recomendado) |
| **Windows 10** (64 bits) | Sí |
| Windows 8 / 8.1 | No garantizado |
| **Windows 7** | **No** |

## Por qué no funciona en Windows 7

La app usa **Microsoft Edge WebView2** (motor moderno de Chromium).  
El instalador intenta instalar WebView2 y en Windows 7 falla con errores como:

> `GetPackagesByPackageFamily` no se encuentra en `KERNEL32.dll`

Eso **no es un bug de la versión 0.1.61 ni 0.1.69**: es el sistema operativo demasiado viejo. Microsoft dejó de dar soporte a WebView2 en Windows 7 desde 2023.

## Qué necesita el cliente

- **Windows 10 o 11** (64 bits)
- Conexión a internet la **primera vez** (activar licencia y, si hace falta, WebView2)
- Mínimo **4 GB RAM** y **1280×720** de pantalla

## Cómo ver qué Windows tiene

1. Tecla **Windows + R**
2. Escribir `winver` y Enter
3. Si dice **Windows 7** → hay que actualizar el sistema para usar la app

## Texto para Mercado Libre

> Requisitos: PC con **Windows 10 u 11 (64 bits)**. No compatible con Windows 7.  
> Incluye licencia + instalador. Primera activación requiere internet.
