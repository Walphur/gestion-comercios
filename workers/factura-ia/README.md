# Factura con IA (web externa)

API para `docs/tools/factura-ia/` en GitHub Pages / walqo.pro.

## Desplegar

```bash
cd workers/factura-ia
npm install
npx wrangler deploy
```

URL: `https://gestion-factura-ia.walphur.workers.dev`

Requiere Workers AI + KV `LEARN` (ya en `wrangler.toml`).

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `POST` | `/` o `/extract` | `{ image_base64, mime_type }` → `{ items, learned }` |
| `POST` | `/learn` | `{ items: [{ codigo, nombre, costo, precio }] }` → guarda memoria |
| `GET` | `/health` | ping |

## Aprendizaje automático

Al **descargar el CSV** (web) o **confirmar ingreso** (app), se llama a `/learn`.
La próxima lectura aplica memoria por código de proveedor y por nombre:

- Completa costos en 0
- Corrige nombres mal leídos
- Refuerza mapeos que se repiten (`hits`)

Datos en Cloudflare KV (gratis en el free tier razonable).

## Flujo

1. Usuario abre Factura IA desde la app o [walqo.pro/tools/factura-ia/](https://walqo.pro/tools/factura-ia/)
2. Sube foto → Worker lee con visión → enriquece con memoria → JSON
3. Usuario corrige → descarga CSV → se guarda aprendizaje
4. En la app: Ingreso compra → Cargar guía CSV (o foto directa)
