-- Cuenta: contraseña, comercio y rubro al registrarse.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v8.sql

ALTER TABLE accounts ADD COLUMN password_hash TEXT;
ALTER TABLE accounts ADD COLUMN business_name TEXT;
ALTER TABLE accounts ADD COLUMN rubro TEXT;
