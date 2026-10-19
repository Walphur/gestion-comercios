-- Tienda web: pago online con Mercado Pago (Checkout Pro) con el token del comercio cifrado.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v15.sql

CREATE TABLE IF NOT EXISTS menu_portal_mp_credentials (
  license_id TEXT PRIMARY KEY NOT NULL,
  token_enc TEXT NOT NULL,
  mp_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  status_detail TEXT,
  webhook_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

ALTER TABLE menu_portal_orders ADD COLUMN payment_method TEXT;
ALTER TABLE menu_portal_orders ADD COLUMN payment_status TEXT;
ALTER TABLE menu_portal_orders ADD COLUMN mp_preference_id TEXT;
ALTER TABLE menu_portal_orders ADD COLUMN mp_init_point TEXT;
ALTER TABLE menu_portal_orders ADD COLUMN mp_payment_id TEXT;
ALTER TABLE menu_portal_orders ADD COLUMN paid_amount REAL;
ALTER TABLE menu_portal_orders ADD COLUMN paid_at TEXT;
