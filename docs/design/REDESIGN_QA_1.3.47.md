# QA rediseño global — 1.3.47 (sin publicar)

Fecha: 2026-11-24

## Alcance verificado

| Chequeo | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK |
| Pantallas `src/pages/*` sin `emerald`/`red-*`/`#2563eb` operativos | OK (barrido) |
| Kit: StatCard, SearchInput, FilterBar, StatusBadge, SectionCard, LoadingState | En código + CSS |
| Preview tokens `appearance-qa-preview.html` — Claro + Azul clásico | OK (Playwright) |
| Preview — Oscuro + Azul clásico | OK (semánticos fijos) |
| Preview — Oscuro + Esmeralda | OK (primario verde; éxito/aviso/error/info fijos) |
| Login Web ~1366 | OK |
| Login Web ~390 | OK (stack vertical, sin overflow horizontal aparente) |
| Reportes / Mesas / Sidebar / historial cliente — tonos semánticos | OK (código) |

## No cubierto en esta pasada

- Recorrido autenticado de cada módulo con datos reales (hace falta sesión Web o Tauri).
- Capturas Desktop Tauri (mismo React; tokens compartidos).
- Todas las paletas restantes (Violeta, Gris, Terracota, Premium) — mismo motor que Esmeralda; spot-check Esmeralda + Clásica alcanza como muestra.

## Criterio de cierre Etapa 8

Etapa 8 de **tokens + deuda de color + preview multi-tema** cerrada.  
Recorrido autenticado completo queda como smoke opcional antes de «publicá».
