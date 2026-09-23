-- Cadetes como usuarios: teléfono + flag para asignar deliveries y WhatsApp.
ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN is_cadete INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN delivery_rider_phone TEXT;
