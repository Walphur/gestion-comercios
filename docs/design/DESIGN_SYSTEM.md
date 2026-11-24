# WalQo — Design System

Documento de referencia para agentes y humanos. **Fuente de verdad en código:** `src/index.css` y `src/components/ui.tsx`.  
Reglas Cursor: `.cursor/rules/design-system.mdc`, `premium-ui.mdc`, `iconography.mdc`.

## Productos

| Producto | Stack UI | Notas de experiencia |
| --- | --- | --- |
| WalQo Desktop | React 19 + Vite 7 + Tailwind 4 + Tauri 2 | Prioridad mostrador, teclado, offline |
| WalQo Web | Misma app React (`walqo.pro/web`), Workers + DO SQLite | Responsive; sin features solo-PC |
| walqo.pro marketing | HTML/CSS en `docs/` | Paleta propia (`walqo.css` / `site.css`) |

Desktop y Web **comparten** kit y tokens; **no** obligan la misma navegación ni densidad. Modalidades de datos independientes.

## Tipografía

- **DM Sans** — UI / cuerpo (`font-sans`)
- **Sora** — títulos (`font-display`, `h1`–`h3`)

## Color

- **brand-*** — primario dinámico (`--wt-brand-*`, Apariencia)
- **accent-*** — teal fijo
- **success / warning / danger** (+ fondos)
- **surface / ink / ink-muted** + panel / input / border
- Alias: `--primary`, `--surface`, `--text`, `--background`
- Modo oscuro: `html.dark`

## Espaciado, radio, sombra

- Espacios: `--space-xs` … `--space-xl`
- Radios: `rounded-lg` (chico), `rounded-xl` (controles), `rounded-2xl` (modales)
- Sombras: `--shadow-sm|md|lg`
- Densidad: `html.density-compact`

## Iconografía

Solo **lucide-react**. Ver `iconography.mdc` (tamaños 14–32, `currentColor`, sin deformar SVG).

## Componentes (`src/components/ui.tsx`)

### Maduros — usar / extender

`Button`, `IconButton`, `Input`, `TextArea`, `NumericField`, `NumericInput`, `Select`, `Switch`, `SegmentToggle`, `Card`, `SelectableCard`, `PageHeader`, `PageContent`, `CardSectionTitle`, `SummaryTotalCard`, `Modal`, `Alert`, `Badge`, `EmptyState`, `FormSection`, `FormGrid`, `FormActions`, `DataTableShell`, `TablePagination`, `Spinner`, `TableNumberInput`, `fieldClass`

### Layout / navegación (fuera de ui.tsx)

- `Sidebar`, rail tooltips, `MobileBottomNav` / shell
- Reportes: charts SVG propios (`components/reports/charts`)

### Gaps conocidos (mejorar in-house, no shadcn)

| Pieza | Hoy | Dirección |
| --- | --- | --- |
| Tooltip | `title`, CSS `sidebar-rail-tooltip` | Componente liviano en `ui.tsx` si hace falta API |
| Dropdown menú | Select nativo + paneles ad-hoc | Unificar patrón accesible sin Radix masivo |
| Skeleton | Spinners / vacío | Skeleton opcional coherente con tokens |
| Toast / snackbar | Alert / modales | Evaluar solo si se repite el patrón |

**No** instalar MUI, Chakra ni registry shadcn. Skill `building-components` guía APIs accesibles sobre este kit.

## Responsive

- Mobile: `useIsMobile()` → `max-width: 767.98px`
- Referencias desktop: 1366 / 1600 / 1920
- Ver `responsive-design.mdc`

## Dependencias UI actuales (package.json)

- `react` / `react-dom` ^19.1
- `react-router-dom` ^7
- `tailwindcss` / `@tailwindcss/vite` ^4.3
- `lucide-react`
- `@tauri-apps/*` ^2 (Desktop)
- Sin librería de componentes de terceros

## Qué no hacer

- Cambiar matemática comercial, auth, DB o arquitectura Desktop/Web
- Fijar azules de marca a mano
- Duplicar componentes en vez de extender `ui.tsx`
