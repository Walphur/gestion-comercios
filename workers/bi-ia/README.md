# gestion-bi-ia

Worker Cloudflare para **interpretación IA** de Inteligencia de Negocio (Fase 4).

- **No calcula métricas** — recibe el payload ya calculado en la app.
- OpenAI (`gpt-4o-mini`) si hay `OPENAI_API_KEY`; si no, Workers AI (`llama-3.1-8b-instruct`).

## Deploy

```bash
cd workers/bi-ia
npm install
npx wrangler secret put OPENAI_API_KEY   # opcional, recomendado
npx wrangler deploy
```

URL producción: `https://gestion-bi-ia.walphur.workers.dev`

## Endpoints

- `GET /health` — estado del servicio
- `POST /interpret` — `{ "payload": { ... } }` → `{ summary, insights, priorities, caveats }`
