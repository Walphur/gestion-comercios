# Imágenes de marketing — WalQo

Las capturas en `shots/` se generan automáticamente con datos realistas de kiosco (precios en pesos, productos comunes).

## Regenerar todas las imágenes

```bash
npm run marketing:shots
```

Genera:

| Archivo | Uso |
|---------|-----|
| `shots/portada-redes.png` | Instagram, WhatsApp, Facebook — planes Gratis / Permanente / $35k |
| `shots/portada-ml.png` | Mercado Libre (1200×1200) |
| `shots/pos.png` | Captura POS con venta real |
| `shots/productos.png` | Listado con precios |
| `shots/stock.png` | Inventario y alertas |
| `branding/walqo-promo-lockup.png` | Logo limpio (sin ruido PNG) |
| `walqo completo.png` (raíz) | Copia del logo para compartir |

## Editar contenido

- **Mock de la app:** `mock/pos.html`, `mock/productos.html`, `mock/stock.html`
- **Portada redes (3 planes):** `portada-redes.html`
- **Portada ML:** `portada-mercadolibre.html`
- **Logo:** `logo-lockup.html` (SVG vectorial + tipografía Sora)

Después de editar, volvé a correr `npm run marketing:shots`.

## Orden sugerido para publicar

**Grupo WhatsApp / Instagram:**
1. `portada-redes.png` (primera imagen — planes)
2. `pos.png`
3. `productos.png` o `stock.png`

**Mercado Libre:**
1. `portada-ml.png`
2. `pos.png` → `productos.png` → `stock.png`

## Capturas reales de la app (opcional)

Si preferís capturas del programa instalado:

1. En el asistente inicial elegí **Catálogo de demostración** (precios actualizados 2026).
2. `Win + Shift + S` sobre la ventana maximizada.
3. Reemplazá los PNG en `shots/` manualmente.

El mock HTML suele verse mejor en redes porque no depende de datos locales ni versión instalada.
