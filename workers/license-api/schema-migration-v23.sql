-- Tope de productos y catálogo de 200 mil por licencia (sobre todo para la Permanente).
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v23.sql

-- max_products: NULL = el del plan (Permanente 1.000), -1 = sin tope, N > 0 = hasta N productos.
ALTER TABLE licenses ADD COLUMN max_products INTEGER;
-- catalog_super: 1 = la Permanente puede cargar el catálogo de ~200.000 productos.
ALTER TABLE licenses ADD COLUMN catalog_super INTEGER NOT NULL DEFAULT 0;
