# Actualizaciones automáticas (Tauri Updater)

La app instalada **busca sola** parches en GitHub cuando hay internet (al entrar y desde **Administración → Buscar actualización**).

## Una sola vez: secretos en GitHub

La clave privada de firma **no** va al repositorio. Debe estar en **Settings → Secrets and variables → Actions** (secretos del repo, no de “environment”):

| Secreto | Valor |
|--------|--------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido completo de `%USERPROFILE%\.tauri\gestion-comercios.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Contraseña de la clave (vacío si la generaste sin contraseña) |

Desde PowerShell (con `gh` logueado):

```powershell
.\scripts\set-github-updater-secrets.ps1
```

O manualmente:

```powershell
Get-Content -Raw "$env:USERPROFILE\.tauri\gestion-comercios.key" | gh secret set TAURI_SIGNING_PRIVATE_KEY
```

La clave pública ya está en `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`.

## Publicar una nueva versión (recomendado)

1. Subí tus cambios a `main`.
2. Ejecutá:

```powershell
.\scripts\release.ps1
```

Eso incrementa el patch (ej. `0.1.0` → `0.1.1`), hace commit, crea el tag `v0.1.1` y hace push.
3. GitHub Actions (`.github/workflows/release.yml`) compila el `.exe`, firma el updater y publica el release con **`latest.json`**.
4. Los usuarios con la app anterior reciben la actualización sin reinstalar manualmente.

También podés crear el tag a mano:

```powershell
git tag v0.1.2
git push origin v0.1.2
```

## Comportamiento en la app

- Con internet, al iniciar sesión busca actualizaciones en silencio e instala si hay versión nueva.
- En **Administración → Con internet** podés forzar “Buscar actualización ahora”.
- El endpoint es: `https://github.com/Walphur/gestion-comercios/releases/latest/download/latest.json`

## Desarrollo local (sin CI)

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$env:USERPROFILE\.tauri\gestion-comercios.key"
$env:CARGO_TARGET_DIR = "F:\Juan Archivos\Apps de gestion\Kiosco y comercios\src-tauri\target"
npm run build:win
```

Luego subí el instalador y `latest.json` al release de GitHub (o usá solo el workflow de arriba).
