# Actualizaciones (Tauri Updater)

El archivo **`latest.json` lo genera GitHub Actions** en cada release (`v*`). No edites el de la raíz para producción.

Los clientes leen:

`https://github.com/Walphur/gestion-comercios/releases/latest/download/latest.json`

**Importante:** el repositorio debe ser **público** (o los instaladores deben estar en una URL pública). Si el repo es privado, la app no puede descargar actualizaciones sin autenticación.

## Publicar una versión nueva

```powershell
.\scripts\publicar.ps1
```

Eso sube el código, crea el tag `v0.1.x` y GitHub compila el instalador + `latest.json` automáticamente.
