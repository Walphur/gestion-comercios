# Actualizaciones automáticas (Tauri Updater)

## Primera vez (desarrollador)

1. Generá el par de claves (no subir la clave privada a Git):

```bash
cd src-tauri
npm run tauri signer generate -w ~/.tauri/gestion-comercios.key
```

2. Copiá la clave pública que imprime el comando a `tauri.conf.json` → `plugins.updater.pubkey`.

3. En cada release en GitHub:
   - Subí el instalador `.exe` / `.msi`
   - Firmá el artefacto: `npm run tauri signer sign ~/.tauri/gestion-comercios.key ...`
   - Actualizá `updater/latest.json` con versión, URL y firma
   - Adjuntá `latest.json` al release como `latest.json`

## Comportamiento en la app

- Con internet, al iniciar sesión busca actualizaciones en silencio.
- En **Administración → Con internet** podés forzar “Buscar actualización ahora”.
