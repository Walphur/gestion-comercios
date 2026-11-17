-- Modalidad operativa por licencia (desktop | web).
-- Basado en dry-run D1 2026-11-17 (solo SELECT): 7 solo PC + 1 Permanente → desktop;
-- 1 dual → modality NULL + modality_source=manual_review; 2 revoked → sin tocar.
--
-- Historial prod verificado (PRAGMA / tablas):
--   v28 aplicada (rate_limits, admin_audit)
--   v29 billing aplicada (billing_anchor_day, columnas license_payments, license_change_log)
--   modality / modality_source / modality_set_at AÚN NO existen → v30 libre
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
-- Valores esperados cuando está fijada: 'desktop' | 'web'. NULL = sin asignar / legacy / dual pendiente.
ALTER TABLE licenses ADD COLUMN modality_source TEXT;
-- signup | admin | inferred_safe | manual_review
ALTER TABLE licenses ADD COLUMN modality_set_at TEXT;

CREATE INDEX IF NOT EXISTS idx_licenses_modality
  ON licenses(modality)
  WHERE modality IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_licenses_modality_review
  ON licenses(modality_source)
  WHERE modality_source = 'manual_review';

-- ── 1) Permanente paga → desktop (siempre) ──────────────────────────────
UPDATE licenses
SET
  modality = 'desktop',
  modality_source = 'inferred_safe',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND billing_type = 'perpetual'
  AND plan != 'free'
  AND modality IS NULL;

-- ── 2) Solo Escritorio (PC ≥1, web-* = 0), activas ───────────────────────
-- Incluye free/monthly/pro que solo usaron PC. No incluye dual ni revoked.
UPDATE licenses
SET
  modality = 'desktop',
  modality_source = 'inferred_safe',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND modality IS NULL
  AND id IN (
    SELECT license_id
    FROM activations
    GROUP BY license_id
    HAVING SUM(CASE WHEN machine_id LIKE 'web-%' THEN 1 ELSE 0 END) = 0
       AND SUM(CASE WHEN machine_id NOT LIKE 'web-%' THEN 1 ELSE 0 END) > 0
  );

-- ── 3) Dual (PC + Web) → modality NULL, marcada para revisión manual ─────
-- No asigna desktop ni web. No borra datos. Dry-run: 1 licencia (pro monthly).
UPDATE licenses
SET
  modality = NULL,
  modality_source = 'manual_review',
  modality_set_at = datetime('now')
WHERE revoked = 0
  AND id IN (
    SELECT license_id
    FROM activations
    GROUP BY license_id
    HAVING SUM(CASE WHEN machine_id LIKE 'web-%' THEN 1 ELSE 0 END) > 0
       AND SUM(CASE WHEN machine_id NOT LIKE 'web-%' THEN 1 ELSE 0 END) > 0
  );

-- ── Revoked: deliberadamente sin UPDATE (modality y source quedan NULL) ─
-- ── Solo Web / sin actividad: dry-run = 0; si aparecen después, quedan NULL ─
