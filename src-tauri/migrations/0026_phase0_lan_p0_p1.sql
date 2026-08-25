-- Phase 0 P0/P1: sale_items.sync_id estable + sales UPDATE solo con LAN enabled

-- Backfill ítems sin identidad de sync (instalaciones previas)
UPDATE sale_items
SET sync_id = lower(hex(randomblob(16)))
WHERE sync_id IS NULL OR sync_id = '';

-- Void/update/restore de ventas: no encolar si Sync LAN está apagado
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
    CASE
      WHEN IFNULL(NEW.voided, 0) = 1 AND IFNULL(OLD.voided, 0) = 0 THEN 'void'
      WHEN IFNULL(NEW.voided, 0) = 0 AND IFNULL(OLD.voided, 0) = 1 THEN 'restore'
      ELSE 'update'
    END,
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
