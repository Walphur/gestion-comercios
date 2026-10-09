-- Catálogo en el celular: identidad de modelos y cursores locales.
ALTER TABLE product_variants ADD COLUMN sync_id TEXT;
UPDATE product_variants SET sync_id = lower(hex(randomblob(16))) WHERE sync_id IS NULL OR trim(sync_id) = '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_variants_sync_id ON product_variants(sync_id) WHERE sync_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS catalog_mobile_state (
    sync_id          TEXT NOT NULL,
    variant_sync_id  TEXT NOT NULL DEFAULT '',
    content_rev      INTEGER NOT NULL DEFAULT 0,
    content_hash     TEXT NOT NULL DEFAULT '',
    pushed_stock     REAL,
    PRIMARY KEY (sync_id, variant_sync_id)
);

CREATE TABLE IF NOT EXISTS catalog_mobile_applied (
    op_id            TEXT PRIMARY KEY,
    sync_id          TEXT NOT NULL,
    variant_sync_id  TEXT NOT NULL DEFAULT '',
    delta            REAL NOT NULL,
    acked            INTEGER NOT NULL DEFAULT 0,
    applied_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS catalog_mobile_conflicts (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_id          TEXT NOT NULL,
    variant_sync_id  TEXT NOT NULL DEFAULT '',
    field            TEXT NOT NULL,
    kept             TEXT NOT NULL,
    discarded        TEXT NOT NULL,
    created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
