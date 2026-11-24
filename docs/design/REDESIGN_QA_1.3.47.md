# QA rediseño global — 1.3.47 (sin publicar)

Fecha: 2026-11-24 (pasada color + componentes)

## Alcance verificado

| Chequeo | Resultado |
| --- | --- |
| `npx tsc --noEmit` | OK |
| Pantallas `src/pages/*` sin `emerald`/`red-*` operativos | OK |
| Componentes alto tráfico → tokens semánticos | OK (alertas, import, QR, caja, admin cards, ui errors, sync, odontograma, etc.) |
| Excepciones conscientes | `DashboardSnake`, `AdminPrinterCard` (consola) |
| Kit: StatCard, SearchInput, FilterBar, StatusBadge, SectionCard, LoadingState | En código + CSS |
| Preview tokens `appearance-qa-preview.html` — Claro/Oscuro × Clásico/Esmeralda | OK (pasada anterior) |
| Login Web ~1366 / ~390 | OK (pasada anterior) |

## Smoke autenticado Desktop (E2E CDP)

| Suite | Resultado |
| --- | --- |
| Login admin | 1 passed |
| Productos + Caja | 11 passed, 1 skipped |
| Ventas (POS + anular/editar) | 7 passed |

## Criterio Etapa 8

Tokens + deuda de color + smoke autenticado Login/Productos/Caja/Ventas: **cerrado**.  
Suite completa `npm run qa` queda para antes de «publicá».

## No publicado

Sin `release.ps1`, sin deploy worker, sin `publish:web`.
