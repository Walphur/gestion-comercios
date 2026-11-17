-- Modalidad operativa por licencia (desktop | web).
-- Basado en dry-run D1 2026-11-17 (solo SELECT): 7 solo PC + 1 Permanente → desktop;
-- 1 dual → modality NULL + modality_source=manual_review; 2 revoked → sin tocar.
--
-- Historial prod verificado (PRAGMA / tablas):
--   v28 aplicada (rate_limits, admin_audit)
--   v29 billing aplicada (billing_anchor_day, columnas license_payments, license_change_log)
--   modality / modality_source / modality_set_at AÚN NO existen → v30 libre
--
-- Regla de negocio Permanente:
--   billing_type = 'perpetual' AND plan != 'free'  (= Permanente paga; free también es
--   perpetual pero NO es Permanente). Siempre modality = desktop.
--
-- Compatibilidad SQLite/D1:
--   ALTER TABLE … ADD COLUMN TEXT nullable — soportado.
--   CREATE INDEX … WHERE … (índice parcial) — SQLite ≥3.8; D1 lo soporta.
--   CHECK en ADD COLUMN no se usa (limitado al recrear tabla); validación en VALIDATION.sql
--   y en license-api al escribir.
--   ALTER ADD COLUMN NO es idempotente: correr este archivo una sola vez.
--
-- RESTRICCIONES:
--   - No tocar accounts, activations, dispositivos ni sesiones.
--   - No implementa 403 ni cambia workers de runtime.
--   - NO EJECUTAR en productivo hasta autorización expresa de Juan.
--
-- Aplicar (solo cuando se autorice):
--   npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v30.sql

-- ── Schema ──────────────────────────────────────────────────────────────
ALTER TABLE licenses ADD COLUMN modality TEXT;
-- Valores cuando está fijada: 'desktop' | 'web'. NULL = sin asignar / dual pendiente / revoked.
ALTER TABLE licenses ADD COLUMN modality_source TEXT;
-- signup | admin | inferred_safe | manual_review
ALTER TABLE licenses ADD COLUMN modality_set_at TEXT;

-- Índices parciales (D1/SQLite). IF NOT EXISTS permite reintentar solo el CREATE si falló a medias.
CREATE INDEX IF NOT EXISTS idx_licenses_modality
  ON licenses(modality)
  WHERE modality IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_licenses_modality_review
  ON licenses(modality_source)
  WHERE modality_source = 'manual_review';

-- Snapshot pre-UPDATE: estado actual (NULL) de cada licencia, para rollback selectivo.
-- No guarda PII. Solo id + columnas de modalidad.
CREATE TABLE IF NOT EXISTS _walqo_modality_v30_snapshot (
  license_id TEXT PRIMARY KEY NOT NULL,
  modality TEXT,
  modality_source TEXT,
  modality_set_at TEXT,
  snapshotted_at TEXT NOT NULL
);

INSERT OR IGNORE INTO _walqo_modality_v30_snapshot (
  license_id, modality, modality_source, modality_set_at, snapshotted_at
)
SELECT
  id,
  modality,
  modality_source,
  modality_set_at,
  datetime('now')
FROM licenses;

-- Fuentes que esta migración NUNCA debe pisar (clasificación humana / alta).
-- inferred_safe y NULL sí pueden ser tocados por los pasos automáticos según cada WHERE.

-- ── 1) Permanente paga → desktop (regla de negocio) ─────────────────────
-- Coincide con is_permanent_plan / panel: perpetual + no free. Nunca web.
UPDATE licenses
SET
  modality = 'desktop',
  modality_source = 'inferred_safe',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND billing_type = 'perpetual'
  AND plan != 'free'
  AND modality IS NULL
  AND IFNULL(modality_source, '') NOT IN ('admin', 'signup', 'manual_review');

-- ── 2) Solo Escritorio (PC ≥1, web-* = 0), activas ───────────────────────
-- Incluye free/monthly/pro que solo usaron PC. No incluye dual ni revoked.
UPDATE licenses
SET
  modality = 'desktop',
  modality_source = 'inferred_safe',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND modality IS NULL
  AND IFNULL(modality_source, '') NOT IN ('admin', 'signup', 'manual_review')
  AND id IN (
    SELECT license_id
    FROM activations
    GROUP BY license_id
    HAVING SUM(CASE WHEN machine_id LIKE 'web-%' THEN 1 ELSE 0 END) = 0
       AND SUM(CASE WHEN machine_id NOT LIKE 'web-%' THEN 1 ELSE 0 END) > 0
  );

-- ── 3) Dual (PC + Web) → modality NULL, marcada para revisión manual ─────
-- Protección: solo filas aún sin clasificación humana ni marca previa.
-- No pisa admin / signup / manual_review / inferred_safe ya asignados.
-- No asigna desktop ni web. Dry-run: 1 licencia (pro monthly).
UPDATE licenses
SET
  modality = NULL,
  modality_source = 'manual_review',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND modality IS NULL
  AND modality_source IS NULL
  AND id IN (
    SELECT license_id
    FROM activations
    GROUP BY license_id
    HAVING SUM(CASE WHEN machine_id LIKE 'web-%' THEN 1 ELSE 0 END) > 0
       AND SUM(CASE WHEN machine_id NOT LIKE 'web-%' THEN 1 ELSE 0 END) > 0
  );

-- ── Revoked: deliberadamente sin UPDATE (modality y source quedan NULL) ─
-- ── Solo Web / sin actividad: dry-run = 0; si aparecen después, quedan NULL ─

-- Rollback selectivo (NO ejecutar en el apply; ver RUNBOOK):
--   UPDATE licenses
--   SET
--     modality = (SELECT modality FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id),
--     modality_source = (SELECT modality_source FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id),
--     modality_set_at = (SELECT modality_set_at FROM _walqo_modality_v30_snapshot s WHERE s.license_id = licenses.id)
--   WHERE id IN (SELECT license_id FROM _walqo_modality_v30_snapshot)
--     AND IFNULL(modality_source, '') IN ('inferred_safe', 'manual_review');
-- Eso restaura solo filas aún “de la migración”; deja intactas admin/signup posteriores.
