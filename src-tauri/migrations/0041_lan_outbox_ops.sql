-- El trigger de sales UPDATE escribe op 'update'/'void'/'restore', pero el CHECK
-- original solo permitía upsert/delete → fallaba markOrderReady (pedido listo).
PRAGMA foreign_keys=OFF;

CREATE TABLE lan_sync_outbox_v2 (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL UNIQUE,
    entity_type     TEXT NOT NULL,
    entity_sync_id  TEXT NOT NULL,
    op              TEXT NOT NULL CHECK (op IN (
      'upsert', 'delete', 'update', 'void', 'restore', 'bootstrap_upsert'
    )),
    payload         TEXT,
    lamport         INTEGER NOT NULL DEFAULT 0,
    origin_device   TEXT NOT NULL,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    status          TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sending', 'acked', 'failed')),
    last_error      TEXT,
    acked_at        TEXT,
    entity_local_id INTEGER,
    attempt_count   INTEGER NOT NULL DEFAULT 0,
    sending_at      TEXT,
    next_retry_at   TEXT
);

INSERT INTO lan_sync_outbox_v2 (
  id, event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device,
  created_at, status, last_error, acked_at, entity_local_id, attempt_count,
  sending_at, next_retry_at
)
SELECT
  id, event_id, entity_type, entity_sync_id, op, payload, lamport, origin_device,
  created_at, status, last_error, acked_at, entity_local_id,
  COALESCE(attempt_count, 0), sending_at, next_retry_at
FROM lan_sync_outbox;

DROP TABLE lan_sync_outbox;
ALTER TABLE lan_sync_outbox_v2 RENAME TO lan_sync_outbox;

CREATE INDEX IF NOT EXISTS idx_lan_outbox_status ON lan_sync_outbox(status, id);

PRAGMA foreign_keys=ON;
