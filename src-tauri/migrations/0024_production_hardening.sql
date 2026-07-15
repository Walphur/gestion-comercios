-- Production Hardening: cursor de catch-up separado del reloj Lamport,
-- cola de pendientes (Deferred/Conflict), sync UPDATE/VOID/RESTORE ventas.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('lan_sync_catchup_lamport', '0'),
  ('lan_sync_catchup_event_id', '');

-- Bootstrapping: arrancar catch-up desde el lamport de reloj actual (no re-bajar).
UPDATE settings
SET value = COALESCE(
  (SELECT value FROM settings WHERE key = 'lan_sync_lamport'),
  '0'
)
WHERE key = 'lan_sync_catchup_lamport'
  AND (value IS NULL OR value = '' OR value = '0');

-- Eventos Deferred/Conflict: permanecen hasta apply/discard; el cursor no los salta.
CREATE TABLE IF NOT EXISTS lan_sync_pending_apply (
    event_id        TEXT PRIMARY KEY,
    entity_type     TEXT NOT NULL,
    entity_sync_id  TEXT NOT NULL,
    op              TEXT NOT NULL,
    payload         TEXT,
    lamport         INTEGER NOT NULL,
    origin_device   TEXT NOT NULL,
    created_at      TEXT NOT NULL,
    reason          TEXT NOT NULL DEFAULT 'deferred'
        CHECK (reason IN ('deferred', 'conflict')),
    updated_at      TEXT DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_lan_pending_apply_order
    ON lan_sync_pending_apply(lamport, event_id);

DROP TRIGGER IF EXISTS trg_lan_sales_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_sales_au
AFTER UPDATE ON sales
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
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
