-- Profesionales del taller / estética (mecánicos, peluqueros, etc.)
CREATE TABLE IF NOT EXISTS workshop_resources (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    notes       TEXT,
    active      INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_workshop_resources_active ON workshop_resources(active);
CREATE INDEX IF NOT EXISTS idx_workshop_resources_name ON workshop_resources(name);

ALTER TABLE appointments ADD COLUMN resource_id INTEGER REFERENCES workshop_resources(id);
