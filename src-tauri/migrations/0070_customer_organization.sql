-- Organismo o empresa del cliente (ej. «Municipalidad de X») para agrupar el detalle de fiado.
ALTER TABLE customers ADD COLUMN organization TEXT;

-- La ficha también viaja entre cajas cuando cambia el domicilio o el organismo.
DROP TRIGGER IF EXISTS trg_lan_customers_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_customers_au
AFTER UPDATE OF name, phone, document, email, address, organization, credit_limit, notes, active ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'customer',
    COALESCE(NEW.sync_id, 'pending-cust-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
