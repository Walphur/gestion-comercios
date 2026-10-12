# Arquitectura

Propuesta inicial. Ajustala cuando el código lo contradiga.

## Mapa
- `src/` y `src-tauri/`: la app de escritorio. La interfaz está en React y los datos del local en SQLite, por Rust.
- `workers/`: lo que vive en internet. El celular, los turnos web, las licencias y los avisos no escriben la caja directo.
- `docs/`: walqo.pro. Carta, taller, turnos públicos y la descarga del APK.
- `apps/catalogo-nativo/`: el mismo celular empaquetado para Android e iOS. La interfaz va adentro; la API sigue en el worker.
- `scripts/`, `tests/` y `updater/`: publicación, pruebas y actualización del instalador de Windows.

## Ya está en el repositorio
- apps/
- branding/
- docs/
- public/
- scripts/
- src/
- src-tauri/
- tests/
- updater/
- workers/

## Criterio
Una responsabilidad por área. No agregues capas hasta que una función no entre en este mapa.
