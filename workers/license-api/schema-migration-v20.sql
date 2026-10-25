-- Vendedores: código que el comercio pone al registrarse y comisión de cada vendedor.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v20.sql

-- model: pct (porcentaje de lo que pagan sus locales) | sixth (cada 5 locales que pagan, el 6.º es suyo entero).
CREATE TABLE IF NOT EXISTS sellers (
  code TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  model TEXT NOT NULL DEFAULT 'pct',
  pct REAL NOT NULL DEFAULT 15,
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);

ALTER TABLE licenses ADD COLUMN seller_code TEXT;
ALTER TABLE accounts ADD COLUMN seller_code TEXT;

CREATE INDEX IF NOT EXISTS idx_licenses_seller ON licenses(seller_code);
