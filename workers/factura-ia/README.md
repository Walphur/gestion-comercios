# Factura con IA (web externa)

API para `docs/tools/factura-ia/` en GitHub Pages / walqo.pro.

## Motor de visión

1. **OpenAI GPT-4o** (si hay secret `OPENAI_API_KEY`) — recomendado, mejor multi-rubro
2. **Cloudflare Workers AI** Llama 3.2 Vision — fallback gratis

### Configurar OpenAI

```bash
cd workers/factura-ia
npx wrangler secret put OPENAI_API_KEY
# pegá la key sk-...
# opcional:
# npx wrangler secret put OPENAI_MODEL   # default gpt-4o
npx wrangler deploy
```

Verificá: `GET https://gestion-factura-ia.walphur.workers.dev/health`
→ `{ "openai": true, "model": "gpt-4o" }`

## Desplegar

```bash
cd workers/factura-ia
npm install
npx wrangler deploy
```

## Endpoints

| Método | Ruta | Uso |
|--------|------|-----|
| `POST` | `/` o `/extract` | `{ image_base64, mime_type }` → `{ items, learned }` |
| `POST` | `/learn` | `{ items: [...] }` → memoria de correcciones |
| `GET` | `/health` | ping + si OpenAI está activo |

## Tipos de factura

- **A** Mayorista FACTURA CONTADO (PRODUCTO / DETALLE / CANTIDAD / PRECIO)
- **B** Tique Factura B (Cant / Descripción / Precio / Total)
- **C** Petshop (Quantity / Item PR… / Unit Price / Amount)
- **D** Remito sin precios (Código / Cant / Descripción) — taller, etc.

## Aprendizaje

Al descargar CSV o confirmar ingreso en la app se guarda en KV `LEARN` y mejora lecturas futuras del mismo código.
