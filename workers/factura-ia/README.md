# Factura con IA (web externa)

API para `docs/tools/factura-ia.html` en GitHub Pages.

## Desplegar

```bash
cd workers/factura-ia
npm install
npx wrangler deploy
```

La URL queda en `https://gestion-factura-ia.<tu-subdominio>.workers.dev` (o el nombre configurado en `wrangler.toml`).

Requiere Workers AI habilitado en la cuenta Cloudflare. La primera vez puede hacer falta aceptar la licencia Meta del modelo vision:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai/run/@cf/meta/llama-3.2-11b-vision-instruct" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"prompt":"agree"}'
```

## Flujo

1. Usuario abre la web desde la app (**Productos → Factura con IA**).
2. Sube foto de factura → Worker lee con visión → devuelve ítems JSON.
3. La web genera CSV compatible con **Productos → Importar** (marcar «Actualizar si existe»).
