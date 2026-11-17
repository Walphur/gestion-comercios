-- Consultas de validación POST-v30 (solo SELECT). No escriben.
-- Ejecutar después de aplicar schema-migration-v30.sql en prod (cuando se autorice).

-- Columnas presentes
SELECT 'has_modality_col' AS check_name,
  CASE WHEN COUNT(*) = 3 THEN 'ok' ELSE 'fail' END AS result
FROM pragma_table_info('licenses')
WHERE name IN ('modality', 'modality_source', 'modality_set_at');

-- Conteos por estado
SELECT modality, modality_source, COUNT(*) AS n
FROM licenses
GROUP BY modality, modality_source
ORDER BY n DESC;

-- Esperado dry-run (activas): desktop+inferred_safe = 8; NULL+manual_review = 1;
-- revoked: modality NULL y modality_source NULL = 2

SELECT 'desktop_inferred' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 0 AND modality = 'desktop' AND modality_source = 'inferred_safe';

SELECT 'manual_review_null_modality' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 0 AND modality IS NULL AND modality_source = 'manual_review';

SELECT 'revoked_untouched' AS bucket, COUNT(*) AS n
FROM licenses
WHERE revoked = 1 AND modality IS NULL AND modality_source IS NULL;

SELECT 'web_assigned' AS bucket, COUNT(*) AS n
FROM licenses
WHERE modality = 'web';

-- Dual sigue sin modality
SELECT substr(license_key, 1, 4) || '…' || substr(license_key, -4) AS key_mask,
       plan, billing_type, modality, modality_source
FROM licenses
WHERE modality_source = 'manual_review';

-- Ninguna permanente con modality distinta de desktop
SELECT COUNT(*) AS permanent_not_desktop
FROM licenses
WHERE revoked = 0
  AND billing_type = 'perpetual'
  AND plan != 'free'
  AND IFNULL(modality, '') != 'desktop';

-- Activations intactas (conteo; no se modifican en v30)
SELECT COUNT(*) AS activations_total FROM activations;
