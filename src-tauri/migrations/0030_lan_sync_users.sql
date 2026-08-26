-- Sync LAN: usuarios/empleados (mismo PIN y rol en todas las cajas).

ALTER TABLE users ADD COLUMN sync_id TEXT;
ALTER TABLE users ADD COLUMN updated_at TEXT;
ALTER TABLE users ADD COLUMN sync_lamport INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN sync_origin TEXT;

UPDATE users SET updated_at = COALESCE(created_at, datetime('now','localtime'))
 WHERE updated_at IS NULL OR updated_at = '';

-- Seeds estables entre instalaciones limpias (evita duplicar admin/cajero).
UPDATE users SET sync_id = 'seed-user-admin'
 WHERE lower(username) = 'admin' AND (sync_id IS NULL OR sync_id = '');
UPDATE users SET sync_id = 'seed-user-cajero'
 WHERE lower(username) = 'cajero' AND (sync_id IS NULL OR sync_id = '');
UPDATE users SET sync_id = lower(hex(randomblob(16)))
 WHERE sync_id IS NULL OR sync_id = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sync_id ON users(sync_id);

CREATE TRIGGER IF NOT EXISTS trg_lan_users_ai
AFTER INSERT ON users
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'user',
    COALESCE(NEW.sync_id, 'pending-user-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;

CREATE TRIGGER IF NOT EXISTS trg_lan_users_au
AFTER UPDATE OF username, display_name, role, pin, active ON users
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'user',
    COALESCE(NEW.sync_id, 'pending-user-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
