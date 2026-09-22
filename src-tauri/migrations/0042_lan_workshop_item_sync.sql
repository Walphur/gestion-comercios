-- LAN taller: sync_id en ítems de remito + AU triggers que faltaban columnas.

ALTER TABLE delivery_note_items ADD COLUMN sync_id TEXT;
UPDATE delivery_note_items
SET sync_id = lower(hex(randomblob(16)))
WHERE sync_id IS NULL OR sync_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_note_items_sync_id
  ON delivery_note_items(sync_id);

-- subject_notes no estaba en AU → cambios de notas del trabajo no salían por LAN
DROP TRIGGER IF EXISTS trg_lan_service_orders_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_service_orders_au
AFTER UPDATE OF title, subject_notes, status, subtotal, discount_pct, total, notes,
  stock_applied, customer_id, vehicle_id, appointment_id, quote_id, odometer_km
  ON service_orders
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'service_order',
    COALESCE(NEW.sync_id, 'pending-so-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

-- odometer_km / vínculos no estaban en AU de peritaje
DROP TRIGGER IF EXISTS trg_lan_vehicle_inspections_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_vehicle_inspections_au
AFTER UPDATE OF odometer_km, fuel_level, exterior_condition, interior_condition, belongings,
  customer_reported, notes, received_by, service_order_id, vehicle_id, customer_id
  ON vehicle_inspections
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'vehicle_inspection',
    COALESCE(NEW.sync_id, 'pending-vi-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
