# WalQo — flujo UI/UX (calidad visual)

Compilar **no** cierra una interfaz. Usar este flujo junto a `.cursor/rules/ui-quality-control.mdc`.

## 1. Ciclo del agente

1. Analizar la UI actual  
2. Listar problemas (jerarquía, densidad, overflow, a11y, estados)  
3. Proponer solución con tokens / `ui.tsx`  
4. Implementar (sin lógica de negocio / DB / auth)  
5. Ejecutar app (Desktop y/o Web)  
6. Capturar pantallas  
7. Comparar con referencia / pantallas hermanas  
8. Corregir defectos  
9. Recién entonces: commit  

## 2. Cómo ejecutar

| Modo | Comando | Notas |
| --- | --- | --- |
| Desktop | `npm run tauri dev` | Puerto Vite habitual `:1420` |
| Web | `npm run dev:web` | Worker `workers/walqo-web` si se necesita RPC real |
| E2E funcional | `npm run test:e2e` / `npm run qa` | Suite existente; no inflar infra (`e2e-policy.mdc`) |

## 3. Herramientas de captura

| Herramienta | Uso |
| --- | --- |
| **Playwright MCP** (`@playwright/mcp` en Cursor MCP) | Exploración visual/funcional interactiva, snapshots de accesibilidad |
| **cursor-ide-browser** | Capturas y revisión rápida en el IDE |
| **@playwright/test** (`tests/`) | Regresión funcional; screenshots on failure ya configurados |
| Checklist manual | `docs/design/visual-checklist.md` |

No crear CI pesada ni stress visual masivo por iniciativa propia.

## 4. Viewports

| Nombre | Tamaño | Obligatorio |
| --- | --- | --- |
| Mobile | 390 × 844 | Sí (Web / shell angosta) |
| Tablet | 768 × 1024 | Al tocar layout |
| Notebook | 1366 × 768 | Sí (Desktop) |
| Desktop | 1600 × 900 | Sí |
| Wide | 1920 × 1080 | Al tocar tablas/POS densos |

Temas: **claro** y **oscuro** al menos en un desktop y un mobile.

## 5. Pantallas prioritarias

Orden sugerido para rediseño / QA visual (datos de prueba / e2e, **nunca** prod real):

1. Login  
2. Inicio (Dashboard)  
3. POS / Vender  
4. Productos  
5. Stock  
6. Clientes  
7. Caja  
8. Tesorería  
9. Reportes  
10. Configuración  

## 6. Checklist rápido por pantalla

- [ ] Sin scroll horizontal del viewport  
- [ ] Jerarquía clara; sin exceso de cards  
- [ ] Estados vacíos / carga / error coherentes  
- [ ] Íconos Lucide alineados (`iconography.mdc`)  
- [ ] Foco visible y labels en controles  
- [ ] Mobile: bottom nav / cajón sin duplicar menús  
- [ ] Desktop: densidad útil para mostrador  
- [ ] Claro + oscuro aceptables  

## 7. Scaffolding liviano

- Lista de rutas / nombres: `docs/design/visual-checklist.md`  
- Script opcional de recordatorio: `scripts/design/visual-smoke-hint.mjs` (no abre ventas reales)

## 8. MCP — notas

- **Playwright MCP**: configurado en el MCP de Cursor del usuario (`playwright` → `npx @playwright/mcp@latest`).  
- **shadcn MCP**: no instalado — el kit es `ui.tsx` custom, no registry shadcn.  
- **Figma MCP**: plugin disponible; autenticación pendiente si se incorpora Figma al flujo.  
- **Browser MCP**: ya disponible en el IDE para capturas.
