# Actualizaciones automáticas (sin reinstalar a mano)

## Cómo funciona para vos (usuario de la app)

1. **Instalá una sola vez** el `.exe` del release en GitHub.
2. Con **internet**, al abrir la app (unos segundos después) busca si hay versión nueva.
3. Si hay parche, **se descarga e instala solo** y reinicia.
4. También podés forzar la búsqueda en **Administración → Con internet → Buscar actualización ahora**.

No hace falta volver a bajar el instalador por cada cambio chico.

## Cómo publicar una versión nueva (desarrollador)

### Una sola vez: secretos en GitHub

En PowerShell, desde la carpeta del proyecto:

```powershell
.\scripts\setup-github-updater.ps1
```

Eso sube la clave privada de `~\.tauri\gestion-comercios.key` como secreto del repo (nunca la subas a git).

### Cada versión nueva

1. Cambiá la versión en `package.json`, `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml` (mismo número, ej. `0.1.2`).
2. Commiteá y pusheá a `main`.
3. Creá el tag y pushealo (dispara GitHub Actions):

```powershell
git tag v0.1.2
git push origin v0.1.2
```

O usá el script:

```powershell
.\scripts\publicar-version.ps1 -Version 0.1.2
```

4. Esperá el workflow **Release** en: https://github.com/Walphur/gestion-comercios/actions  
5. Cuando termine, el release tendrá el instalador + `latest.json` firmado. Las apps instaladas se actualizan solas.

### Build local (opcional)

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "$env:USERPROFILE\.tauri\gestion-comercios.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""   # o tu contraseña
$env:CARGO_TARGET_DIR = "F:\Juan Archivos\Apps de gestion\Kiosco y comercios\src-tauri\target"
npm run build:win
```

`createUpdaterArtifacts: true` en `tauri.conf.json` genera los archivos que el updater necesita.
