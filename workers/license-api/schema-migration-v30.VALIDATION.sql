-- Consultas de validación POST-v30 (solo SELECT). No escriben.
-- Ejecutar después de aplicar schema-migration-v30.sql en prod (cuando se autorice).

-- ── Columnas e índices ──────────────────────────────────────────────────
SELECT 'has_modality_col' AS check_name,
  CASE WHEN COUNT(*) = 3 THEN 'ok' ELSE 'fail' END AS result
FROM pragma_table_info('licenses')
WHERE name IN ('modality', 'modality_source', 'modality_set_at');

SELECT 'has_v30_snapshot' AS check_name,
  CASE WHEN COUNT(*) = 1 THEN 'ok' ELSE 'fail' END AS result
FROM sqlite_master
WHERE type = 'table' AND name = '_walqo_modality_v30_snapshot';

SELECT 'has_modality_indexes' AS check_name,
  CASE WHEN COUNT(*) >= 2 THEN 'ok' ELSE 'fail' END AS result
FROM sqlite_master
WHERE type = 'index'
  AND name IN ('idx_licenses_modality', 'idx_licenses_modality_review');

-- ── Conteos por estado ──────────────────────────────────────────────────
SELECT modality, modality_source, COUNT(*) AS n
FROM licenses
GROUP BY modality, modality_source
ORDER BY n DESC;

-- Esperado dry-run (primera aplicación):
--   desktop + inferred_safe = 8
--   NULL + manual_review = 1
--   revoked: modality NULL y modality_source NULL = 2

SELECT 'desktop_inferred' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 0 AND modality = 'desktop' AND modality_source = 'inferred_safe';

SELECT 'manual_review_null_modality' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 0 AND modality IS NULL AND modality_source = 'manual_review';

SELECT 'revoked_untouched' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 1 AND modality IS NULL AND modality_source IS NULL AND modality_set_at IS NULL;

SELECT 'web_assigned' AS bucket, COUNT(*) AS n
FROM licenses
WHERE modality = 'web';

-- Dual / bandeja (anonimizado)
SELECT substr(license_key, 1, 4) || '…' || substr(license_key, -4) AS key_mask,
       plan, billing_type, modality, modality_source
FROM licenses
WHERE modality_source = 'manual_review';

-- ── Modalidades inválidas (debe ser 0) ──────────────────────────────────
SELECT 'invalid_modality_values' AS check_name, COUNT(*) AS n
FROM licenses
WHERE modality IS NOT NULL
  AND modality NOT IN ('desktop', 'web');

SELECT 'invalid_modality_source_values' AS check_name, COUNT(*) AS n
FROM licenses
WHERE modality_source IS NOT NULL
  AND modality_source NOT IN ('signup', 'admin', 'inferred_safe', 'manual_review');

-- modality fijada sin source (inconsistente)
SELECT 'modality_without_source' AS check_name, COUNT(*) AS n
FROM licenses
WHERE modality IS NOT NULL AND modality_source IS NULL;

-- ── Permanente vs regla de negocio ──────────────────────────────────────
-- Permanente paga activa debe ser desktop (o NULL solo si quedó pendiente; esperado 0 NULL).
SELECT 'permanent_not_desktop' AS check_name, COUNT(*) AS n
FROM licenses
WHERE revoked = 0
  AND billing_type = 'perpetual'
  AND plan != 'free'
  AND IFNULL(modality, '') != 'desktop';

-- Free perpetual NO debe confundirse con Permanente (puede ser desktop si solo PC).
SELECT 'free_perpetual_count' AS check_name, COUNT(*) AS n
FROM licenses
WHERE revoked = 0 AND billing_type = 'perpetual' AND plan = 'free';

-- ── Revoked no deben haber sido modificados por v30 ─────────────────────
SELECT 'revoked_modified' AS check_name, COUNT(*) AS n
FROM licenses
WHERE revoked = 1
  AND (
    modality IS NOT NULL
    OR modality_source IS NOT NULL
    OR modality_set_at IS NOT NULL
  );
-- Esperado: 0

-- Snapshot vs universo
SELECT 'snapshot_row_count' AS check_name, COUNT(*) AS n FROM _walqo_modality_v30_snapshot;
SELECT 'licenses_row_count' AS check_name, COUNT(*) AS n FROM licenses;
-- Esperado: iguales en la primera apply

-- Activations intactas (v30 no las escribe; solo referencia de conteo)
SELECT COUNT(*) AS activations_total FROM activations;
