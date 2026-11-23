-- Cajero Plus: el CHECK original solo admitía admin|manager|cashier.
-- SQLite no permite ALTER del CHECK: recreamos la tabla.
-- Corre sin transacción en la PC (FK off); ver tauri-plugin-sql no_tx para v79.

PRAGMA foreign_keys = OFF;

CREATE TABLE users_role_plus (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'cashier'
        CHECK (role IN ('admin', 'manager', 'plus', 'cashier')),
    pin          TEXT NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    phone        TEXT,
    is_cadete    INTEGER NOT NULL DEFAULT 0,
    hide_stock   INTEGER NOT NULL DEFAULT 0,
    sync_id      TEXT,
    updated_at   TEXT,
    sync_lamport INTEGER DEFAULT 0,
    sync_origin  TEXT
);

INSERT INTO users_role_plus (
    id, username, display_name, role, pin, active, created_at,
    phone, is_cadete, hide_stock, sync_id, updated_at, sync_lamport, sync_origin
)
SELECT
    id, username, display_name, role, pin, active, created_at,
    phone, COALESCE(is_cadete, 0), COALESCE(hide_stock, 0),
    sync_id, updated_at, sync_lamport, sync_origin
FROM users;

DROP TABLE users;
ALTER TABLE users_role_plus RENAME TO users;

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

DELETE FROM sqlite_sequence WHERE name IN ('users', 'users_role_plus');
INSERT INTO sqlite_sequence (name, seq)
SELECT 'users', IFNULL(MAX(id), 0) FROM users;

PRAGMA foreign_keys = ON;
