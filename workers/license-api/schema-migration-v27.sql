-- Fecha en que la licencia quedó con su vendedor (código al crear la cuenta o asignado desde el panel).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v27.sql

ALTER TABLE licenses ADD COLUMN seller_linked_at TEXT;

-- Las que ya tenían vendedor por el registro quedaron vinculadas al confirmar el email.
UPDATE licenses
SET seller_linked_at = (
  SELECT a.verified_at FROM accounts a
  WHERE a.license_id = licenses.id AND a.seller_code = licenses.seller_code
  LIMIT 1
)
WHERE seller_code IS NOT NULL AND seller_linked_at IS NULL;
