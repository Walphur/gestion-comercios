# Migración v30 — modalidad (preparación; sin ejecutar)

## Verificación previa (hecha 2026-11-17)

| Ítem | Resultado |
|------|-----------|
| Tabla formal `d1_migrations` | No existe; las migraciones se aplican a mano con `wrangler d1 execute --file` |
| v28 en prod | Sí (`rate_limits`, `admin_audit`) |
| v29 billing en prod | Sí (`licenses.billing_anchor_day`, columnas nuevas en `license_payments`, tabla `license_change_log`) |
| Columnas `modality*` | **No** existen aún → **v30 no colisiona** |
| Dry-run | 7 solo PC + 1 Permanente → desktop; 1 dual → revisión; 0 solo Web; 0 sin actividad; 2 revoked sin tocar |

## Archivos

- `schema-migration-v30.sql` — DDL + UPDATES (solo `licenses`)
- `schema-migration-v30.VALIDATION.sql` — SELECTs post-aplicación
- Este runbook

## Backup (antes de aplicar)

```powershell
cd workers/license-api
npx wrangler d1 export gestion-licenses --remote --output=../../.tmp/d1-backup-pre-v30-$(Get-Date -Format yyyyMMdd-HHmm).sql
```

Conservar el archivo fuera del deploy. Opcional: snapshot desde el dashboard de Cloudflare D1.

## Plan de ejecución (cuando Juan autorice)

1. Backup remoto (comando arriba).
2. Re-dry-run SELECT de buckets (mismas queries del dry-run) por si cambió el universo.
3. Aplicar **solo** el archivo de modalidad:

```powershell
npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v30.sql
```

4. Correr `schema-migration-v30.VALIDATION.sql` y contrastar con lo esperado.
5. **No** deploy de workers, **no** publish frontend, **no** 403 en esta oleada.

## Esperado tras apply

| Grupo | modality | modality_source | Cant. (dry-run) |
|-------|----------|-----------------|-----------------|
| Solo PC + Permanente | `desktop` | `inferred_safe` | 8 |
| Dual | `NULL` | `manual_review` | 1 |
| Revoked | `NULL` | `NULL` | 2 |
| Solo Web | — | — | 0 |

## Rollback

No hace falta DROP COLUMN (D1/SQLite). Neutralizar datos:

```sql
UPDATE licenses
SET modality = NULL, modality_source = NULL, modality_set_at = NULL;
```

Código nuevo debe tratar `modality IS NULL` como «sin enforcement» (etapa 3 aún no).

Restauración total: reimportar el export del backup si algo más se corrompió (v30 no toca otras tablas).

## Fuera de alcance de v30

- accounts / activations / sesiones / dispositivos
- Bloqueos 403 activate/web/portal
- Panel admin UI (puede venir después leyendo las columnas)
- Publicar workers o walqo.pro
