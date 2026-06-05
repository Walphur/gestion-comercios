-- Sincronización taller ↔ mostrador (archivos JSON en carpeta compartida, ej. Google Drive)

ALTER TABLE customers ADD COLUMN sync_id TEXT;
ALTER TABLE vehicles ADD COLUMN sync_id TEXT;
ALTER TABLE appointments ADD COLUMN sync_id TEXT;
ALTER TABLE quotes ADD COLUMN sync_id TEXT;
ALTER TABLE service_orders ADD COLUMN sync_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_sync_id ON customers(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_sync_id ON vehicles(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_sync_id ON appointments(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_sync_id ON quotes(sync_id) WHERE sync_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_orders_sync_id ON service_orders(sync_id) WHERE sync_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sync_export_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE(entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS sync_import_log (
    file_name   TEXT PRIMARY KEY,
    entity_type TEXT,
    sync_id     TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
