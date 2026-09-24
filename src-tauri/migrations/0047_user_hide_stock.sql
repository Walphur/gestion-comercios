-- Cajero (u otro usuario) puede no ver stock del negocio.
ALTER TABLE users ADD COLUMN hide_stock INTEGER NOT NULL DEFAULT 0;
