# WalQo — Matriz de rediseño global (Desktop + Web)

Auditoría visual previa a la implementación por etapas.  
**Reglas:** no tocar matemática de ventas, permisos, aislamiento ni datos. Apariencia 5 colores (813ca2a / v1.3.46) es prerequisito, no el alcance.

Leyenda de estado: `todo` · `kit-ready` · `in-progress` · `done` · `n/a`

Prioridad: **P0** (impacto diario) · **P1** · **P2**

## Etapas

| Etapa | Alcance | Estado |
| --- | --- | --- |
| 1 | Kit compartido (`ui.tsx` + CSS), tokens semánticos, esta matriz | `done` |
| 2 | Dashboard / Inicio | `done` |
| 3 | Productos, Stock, Proveedores, Clientes | `done` |
| 4 | Caja, Gastos, Tesorería, Ventas | `done` |
| 5 | Punto de venta (+ Mesas/Cocina si aplica) | `done` |
| 6 | Reportes, Facturación | `done` |
| 7 | Configuración, Sugerencias, Historial | `done` (Sugerencias + Historial; Config Apariencia ya ok) |
| 8 | QA integral claro/oscuro × paletas × Desktop/Web | `todo` |

## Kit compartido (Etapa 1)

| Componente | Ubicación | Notas |
| --- | --- | --- |
| PageHeader / PageContent | `ui.tsx` | Maduro |
| Card / EmptyState / Modal / Form* | `ui.tsx` | Maduro |
| DataTableShell / TablePagination | `ui.tsx` | Maduro; móvil = tarjetas |
| StatCard | `ui.tsx` + `.stat-card` | Nuevo — unificar KPIs |
| SearchInput | `ui.tsx` + `.search-input` | Nuevo |
| FilterBar | `ui.tsx` + `.filter-bar` | Nuevo — colapsa en móvil |
| StatusBadge | `ui.tsx` + `.status-badge` | Nuevo (+ Badge `info`) |
| LoadingState | `ui.tsx` + `.loading-state` | Nuevo |
| SectionCard | `ui.tsx` + `.section-card` | Nuevo |
| SummaryTotalCard | `ui.tsx` | Acentos semánticos (no emerald/red sueltos) |
| app-tabs | `index.css` | Clase CSS lista; wire opcional por página |
| ConfirmDialog | fuera de `ui.tsx` | Mantener; no duplicar |

## Pantallas

| # | Pantalla | Archivo(s) | Prio | Problemas concretos | Etapa | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Inicio / Dashboard | `Dashboard.tsx`, `HomeNotices`, `FirstStepsCard`, `ClinicFrontDesk` | P0 | StatCard + SectionCard + StatusBadge; semánticos; tabs más vendidos; accesos etiquetados. Clínica sin cambio de datos. | 2 | `done` |
| 2 | Punto de venta | `POS.tsx` | P0 | Semánticos + panel cobro; tonos de pago vía tokens; total más legible. Lógica de venta intacta. | 5 | `done` |
| 3 | Productos | `Products.tsx`, `ProductForm`, `GastroProductForm` | P0 | Toolbar: SearchInput + FilterBar + app-tabs. Forms quedan para polish posterior. | 3 | `done` |
| 4 | Stock | `Stock.tsx` | P1 | SearchInput + StatusBadge vencido + filtro stock bajo | 3 | `done` |
| 5 | Proveedores | `Suppliers.tsx` + modales | P1 | StatCards resumen, app-tabs, SearchInput | 3 | `done` |
| 6 | Clientes | `Customers.tsx`, historial, fiado | P1 | SearchInput + FilterBar organismo; historial modal pendiente polish | 3 | `done` |
| 7 | Caja | `CashSession.tsx` | P1 | Semánticos success/danger/warning en movimientos y arqueo | 4 | `done` |
| 8 | Gastos | `Expenses.tsx` | P1 | StatCards + app-tabs | 4 | `done` |
| 9 | Tesorería | `Treasury.tsx` | P1 | StatCards por cuenta + app-tabs | 4 | `done` |
| 10 | Ventas | `Sales.tsx` | P1 | StatCards KPIs + StatusBadge medios de pago | 4 | `done` |
| 11 | Reportes | `Reports.tsx`, `components/reports/*` | P1 | Botón Resumen hoy semántico; dashboard ya premium | 6 | `done` |
| 12 | Facturación | `Invoicing.tsx` | P2 | StatusBadge Aprobada/Rechazada | 6 | `done` |
| 13 | Sugerencias | `BusinessIntelligence.tsx` | P2 | SectionCard comparación; SummaryTotalCard intacto | 7 | `done` |
| 14 | Historial | `AuditLog.tsx` | P2 | StatCards KPIs | 7 | `done` |
| 15 | Configuración | `Admin.tsx` + paneles | P2 | Apariencia 5 colores hecha; resto de paneles OK estructuralmente | 7 | `done` |

### Relacionadas (mismo lenguaje visual)

| Pantalla | Notas | Etapa |
| --- | --- | --- |
| Mesas / Cocina | Estados libres → success tokens | 5 `done` (Mesas) |
| Login / PIN / licencia | Hardcodes `#2563eb`, emerald/red | 7 o 8 (QA) |
| Comisiones, Turnos, Órdenes, Presupuestos | Listados estándar → kit | 3–4 según módulo |
| Ayuda | Contenido OK; shell consistente | 7 |

## Deuda de color (global)

- Sustituir `text-emerald-*` / `text-red-*` / `bg-emerald-*` operativos por `var(--color-success|danger|…)` o utilidades `.text-semantic-*`.
- Eliminar gradientes `violet` / hardcodes `#2563eb` en pantallas de gestión (excepto marketing / lock de marca WalQo).
- Semánticos **no** dependen de la paleta del comercio.

## Criterios de aceptación por etapa

1. Tema claro y oscuro.
2. Al menos 2 paletas distintas (p. ej. Clásica + una alternativa).
3. Desktop ~1366 y móvil ~390 (sin scroll horizontal).
4. Misma UI en build Desktop y `dev:web` / Web.
5. Ninguna acción/botón perdido; mismos datos reales en KPIs.

## Progreso

- **2026-11-24** — Etapa 1: StatCard, SearchInput, FilterBar, StatusBadge, LoadingState, SectionCard, Badge info, CSS kit + tabs + utilidades semánticas; matriz creada.
- **2026-11-24** — Etapa 2: Dashboard migrado al kit (KPIs, paneles, badges, tabs).
- **2026-11-24** — Etapa 3: Productos / Stock / Clientes / Proveedores alineados al kit de búsqueda y filtros.
- **2026-11-24** — Etapa 4: Caja / Gastos / Tesorería / Ventas (StatCards, semánticos, tabs).
- **2026-11-24** — Etapa 5: POS + Mesas (semánticos, panel cobro, tonos de pago).
- **2026-11-24** — Etapas 6–7: Reportes/Facturación/Sugerencias/Historial alineados al kit. Pendiente Etapa 8 QA visual.
