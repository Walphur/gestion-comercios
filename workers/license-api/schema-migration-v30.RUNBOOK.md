# Migración v30 — modalidad

> **Aplicada en D1 prod el 2026-11-17.** Backup: `.tmp/d1-backup-pre-v30-20261117-1404.sql`. Validación OK (8 desktop, 1 manual_review, 2 revoked intactas). Sin deploy de workers ni 403.

## Verificación previa (hecha 2026-11-17)

| Ítem | Resultado |
|------|-----------|
| Tabla formal `d1_migrations` | No existe; las migraciones se aplican a mano con `wrangler d1 execute --file` |
| v28 en prod | Sí (`rate_limits`, `admin_audit`) |
| v29 billing en prod | Sí (`licenses.billing_anchor_day`, columnas nuevas en `license_payments`, tabla `license_change_log`) |
| Columnas `modality*` | **No** existen aún → **v30 no colisiona** |
| Dry-run | 7 solo PC + 1 Permanente → desktop; 1 dual → revisión; 0 solo Web; 0 sin actividad; 2 revoked sin tocar |

## Regla de negocio — Permanente

| Condición | Significado |
|-----------|-------------|
| `billing_type = 'perpetual' AND plan != 'free'` | **Permanente paga** → siempre `modality = 'desktop'` |
| `billing_type = 'perpetual' AND plan = 'free'` | Plan gratis (también perpetual en D1) → **no** es Permanente; puede ser desktop/web según uso |

Coincide con el dry-run y con `is_permanent_plan` / panel. El paso 1 del SQL solo toca Permanente paga.

## Compatibilidad SQLite / D1

| Constructo | OK |
|------------|----|
| `ALTER TABLE … ADD COLUMN TEXT` nullable | Sí (una sola vez; no idempotente) |
| `CREATE INDEX … WHERE …` parcial | Sí (SQLite ≥3.8 / D1) |
| `CREATE TABLE IF NOT EXISTS` snapshot | Sí |
| `INSERT OR IGNORE` snapshot | Sí |
| `CHECK` al hacer `ADD COLUMN` | No usado (frágil al migrar); validar con `VALIDATION.sql` y en API al escribir |
| `datetime('now')` | UTC en SQLite; aceptable para auditoría |

## Archivos

- `schema-migration-v30.sql` — DDL + snapshot + UPDATES (solo `licenses` + tabla `_walqo_modality_v30_snapshot`)
- `schema-migration-v30.VALIDATION.sql` — SELECTs post-aplicación (incl. inválidos y revoked)
- Este runbook

## Protecciones incorporadas

1. **Dual no pisa clasificaciones humanas**  
   `modality IS NULL AND modality_source IS NULL` (además de `revoked = 0`). No toca `admin` / `signup` / `manual_review` / `inferred_safe` ya puestos.

2. **Pasos 1 y 2** también excluyen `admin` / `signup` / `manual_review` y exigen `modality IS NULL`.

3. **Revoked** sin ningún `UPDATE`.

4. **Snapshot pre-UPDATE** en `_walqo_modality_v30_snapshot` para rollback selectivo.

## Backup (antes de aplicar)

```powershell
cd workers/license-api
npx wrangler d1 export gestion-licenses --remote --output=../../.tmp/d1-backup-pre-v30-$(Get-Date -Format yyyyMMdd-HHmm).sql
```

Conservar el archivo fuera del deploy. Opcional: snapshot desde el dashboard de Cloudflare D1.

El propio v30 crea `_walqo_modality_v30_snapshot` **después** del `ALTER` y **antes** de los `UPDATE` (estado NULL), para poder deshacer solo lo que escribió la migración.

## Plan de ejecución (cuando Juan autorice)

1. Backup remoto (export completo).
2. Re-dry-run SELECT de buckets (por si cambió el universo).
3. Aplicar **solo** el archivo de modalidad:

```powershell
npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v30.sql
```

4. Correr `schema-migration-v30.VALIDATION.sql` y contrastar con lo esperado (abajo).
5. **No** deploy de workers, **no** publish frontend, **no** 403 en esta oleada.

## Esperado tras apply (primera vez, universo dry-run)

| Grupo | modality | modality_source | Cant. |
|-------|----------|-----------------|------:|
| Solo PC + Permanente | `desktop` | `inferred_safe` | 8 |
| Dual | `NULL` | `manual_review` | 1 |
| Revoked | `NULL` | `NULL` | 2 |
| Solo Web | — | — | 0 |

Checks que deben dar **0**:

- `invalid_modality_values`
- `invalid_modality_source_values`
- `modality_without_source`
- `permanent_not_desktop`
- `revoked_modified`

## Rollback

### A) Selectivo (preferido) — no borra clasificaciones manuales posteriores

Restaura desde `_walqo_modality_v30_snapshot` **solo** filas cuya `modality_source` actual sigue siendo de la migración (`inferred_safe` o `manual_review`). Deja intactas `admin` / `signup` (p. ej. duales ya resueltos a mano después).

```sql
UPDATE licenses
SET
  modality = (SELECT modality FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id),
  modality_source = (SELECT modality_source FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id),
  modality_set_at = (SELECT modality_set_at FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id)
WHERE id IN (SELECT license_id FROM _walqo_modality_v30_snapshot)
  AND IFNULL(modality_source, '') IN ('inferred_safe', 'manual_review');
```

Opcional después: `DROP TABLE IF EXISTS _walqo_modality_v30_snapshot;` (solo si ya no hace falta el respaldo selectivo).

### B) Total de columnas de modalidad (destructivo para manuales)

**No usar** si ya hubo clasificaciones `admin`/`signup` posteriores:

```sql
UPDATE licenses
SET modality = NULL, modality_source = NULL, modality_set_at = NULL;
```

### C) Restauración completa de D1

Reimportar el export `d1-backup-pre-v30-….sql` si algo más se corrompió (v30 no toca accounts/activations; esto es último recurso).

Código nuevo debe tratar `modality IS NULL` como «sin enforcement» (etapa 3 aún no).

## Fuera de alcance de v30

- accounts / activations / sesiones / dispositivos
- Bloqueos 403 activate/web/portal
- Panel admin UI (puede venir después leyendo las columnas)
- Publicar workers o walqo.pro
