# QA Apariencia 1.3.46 — cierre

Fecha: 2026-11-24. Sin publish / deploy.

## Alcance

Cierre de calidad del sistema de 5 colores (primario, barra, acento, fondo, superficies) en la **app de gestión** Desktop + Web. No tienda online.

## Correcciones hechas en este cierre

| Problema | Fix |
| --- | --- |
| Sidebar usaba `text-brand-*` (escala del primario) → contraste roto si barra ≠ primario | Clases `sidebar-muted` / `sidebar-icon-btn` / `sidebar-group-label` con `--color-sidebar-ink/muted` |
| Acento casi no se veía en la UI | EmptyState, FormSection, CardSection y SelectableCard (idle) usan `--color-accent-*`; activo seleccionado sigue en primario |
| Indicador activo compacto del menú atado al primario | Punto / glow usan `--color-accent-500` |
| `var(--color-accent)` en paneles legacy sin alias | `--color-accent` = accent-500 en CSS + `applyAccentScale` |

## Auditoría hardcoded

- Pantallas de **login / PIN / licencia** (`.walqo-auth`, `.walqo-brand-lock`): azul WalQo fijo a propósito (identidad del producto, no del comercio).
- Semánticos (`success` / `warning` / `danger` / `info`): protegidos en `SEMANTIC_COLORS` y reaplicados en cada `applyAppearanceColors`.
- Resto de la shell de gestión: tokens `brand-*`, `accent-*`, `sidebar-*`, `surface` / `panel`.

## Persistencia y aislamiento

- Settings SQLite por comercio: `brand_primary`, `brand_sidebar`, `brand_accent`, `brand_page_bg_*`, `brand_surface_*`, `brand_preset` (+ tema/densidad/logo/tagline).
- Desktop: DB local AppData. Web: Durable Object `acc:<accountId>`. Un comercio no ve la paleta de otro.
- Migración: primary viejo se conserva; sidebar/accent/fondos se completan si faltan.

## Pruebas ejecutadas

| Prueba | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK |
| `npx tsx scripts/run-appearance-branding-selftest.ts` | PASS (HEX, 6 presets, custom, legacy, independencia de slots) |
| `npm run tauri dev` | Vite OK; `tauri-app.exe` levantó |
| `npm run dev:web` (5174) | Vite OK; API local espera worker en 8790 (arranque parcial) |
| Preview tokens `docs/design/appearance-qa-preview.html` | Claro/oscuro + 6 paletas verificados en browser |
| E2E Playwright `cambiar tema` | Abortado (conflicto con `tauri dev` ya corriendo; no bloqueante) |

## Capturas

- [Claro · Azul clásico](shots/appearance-qa-light-classic.png)
- [Oscuro · Azul clásico](shots/appearance-qa-dark-classic.png)
- Preview interactivo: `docs/design/appearance-qa-preview.html`

## Desktop vs Web

| | Desktop | Web |
| --- | --- | --- |
| Código de tokens | Mismo `branding.ts` + `AppearanceContext` | Igual |
| Persistencia | SQLite local | DO por cuenta |
| Shell login | Brand-lock WalQo | Brand-lock + sesión web |
| QA visual in-app Apariencia | Ventana abierta; control remoto de escritorio cancelado por el usuario | Requiere login + worker en puerto esperado |

## Limitaciones pendientes (no bloquean 1.3.46)

1. Recorrido manual completo dentro de Configuración → Apariencia (persistencia reload / restore) en una sesión logueada: conviene 5 min con `tauri dev` ya levantado.
2. Worker web en este entorno quedó en 8788; el cliente apunta a 8790 en localhost — alinear puerto si se prueba Web login local.
3. Algunos `text-brand-*` en módulos de contenido (Reportes, etc.) siguen siendo **primario** a propósito (selección / highlights). No son del sidebar.

## Criterio de aceptación

- Cinco colores independientes: sí (código + selftest).
- Tema claro/oscuro sin perder marca: sí.
- Semánticos protegidos: sí (preview + código).
- Contraste sidebar vs primario: corregido.
- Acento visible en UI: corregido.
- Sin publish: respetado.
