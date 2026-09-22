-- markOrderReady / void / restore de ventas escribian op update/void/restore,
-- pero lan_sync_outbox solo admite upsert/delete (CHECK).
-- Recrear la tabla rompe triggers que insertan en outbox (pantalla blanca al migrar).
-- Solucion: el trigger de UPDATE en sales encola siempre upsert.
-- apply_sale usa el payload (voided, ready, etc) y no depende del op.

DROP TRIGGER IF EXISTS trg_lan_sales_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_sales_au
AFTER UPDATE ON sales
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
  AND NEW.sync_id IS NOT NULL AND NEW.sync_id != ''
BEGIN
  INSERT INTO lan_sync_outbox (
    event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport
  )
  SELECT
    lower(hex(randomblob(16))),
    'sale',
    NEW.sync_id,
    NEW.id,
    'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    COALESCE(
      (SELECT CAST(value AS INTEGER) + 1 FROM settings WHERE key = 'lan_sync_lamport'),
      1
    );
  UPDATE settings
  SET value = CAST(
    COALESCE(
      (SELECT CAST(value AS INTEGER) + 1 FROM settings WHERE key = 'lan_sync_lamport'),
      1
    ) AS TEXT
  )
  WHERE key = 'lan_sync_lamport';
END;
