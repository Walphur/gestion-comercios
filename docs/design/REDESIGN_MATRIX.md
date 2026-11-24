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
| 4 | Caja, Gastos, Tesorería, Ventas | `todo` |
| 5 | Punto de venta (+ Mesas/Cocina si aplica) | `todo` |
| 6 | Reportes, Facturación | `todo` |
| 7 | Configuración, Sugerencias, Historial | `todo` |
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
| 2 | Punto de venta | `POS.tsx` | P0 | Densidad alta; carrito vs catálogo; totales/medios con `emerald`/`red` hardcode; touch targets; filtros no unificados con FilterBar | 5 | `todo` |
| 3 | Productos | `Products.tsx`, `ProductForm`, `GastroProductForm` | P0 | Toolbar: SearchInput + FilterBar + app-tabs. Forms quedan para polish posterior. | 3 | `done` |
| 4 | Stock | `Stock.tsx` | P1 | SearchInput + StatusBadge vencido + filtro stock bajo | 3 | `done` |
| 5 | Proveedores | `Suppliers.tsx` + modales | P1 | StatCards resumen, app-tabs, SearchInput | 3 | `done` |
| 6 | Clientes | `Customers.tsx`, historial, fiado | P1 | SearchInput + FilterBar organismo; historial modal pendiente polish | 3 | `done` |
| 7 | Caja | `CashSession.tsx` | P1 | Ingresos/egresos con emerald/red; EmptyState vs botones duplicados ya arreglado parcialmente; resumen visual plano | 4 | `todo` |
| 8 | Gastos | `Expenses.tsx` | P1 | Formulario + listado; fijos del mes poco destacados | 4 | `todo` |
| 9 | Tesorería | `Treasury.tsx` | P1 | Cuentas/saldos; traslados; semántica de números | 4 | `todo` |
| 10 | Ventas | `Sales.tsx` | P1 | KPI card con gradiente `violet` (rompe tema); chips de medio `emerald`; filtros | 4 | `todo` |
| 11 | Reportes | `Reports.tsx`, `components/reports/*` | P1 | Ya premium en olas 1–5; quedan `emerald` en acciones y polish FilterBar/tabs | 6 | `todo` |
| 12 | Facturación | `Invoicing.tsx` | P2 | Listado + estados; alinear StatusBadge / SectionCard | 6 | `todo` |
| 13 | Sugerencias | `BusinessIntelligence.tsx` | P2 | Cards genéricas; poca jerarquía de insights | 7 | `todo` |
| 14 | Historial | `AuditLog.tsx` | P2 | Tabla densa; tipografía monótona | 7 | `todo` |
| 15 | Configuración | `Admin.tsx` + paneles | P2 | Navegación por secciones OK; unificar paneles con SectionCard; Apariencia ya hecha | 7 | `todo` |

### Relacionadas (mismo lenguaje visual)

| Pantalla | Notas | Etapa |
| --- | --- | --- |
| Mesas / Cocina | Estados emerald; cards de mesa | 5 (con POS) |
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
