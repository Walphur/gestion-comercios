-- Turnos / agenda (módulo Pro)
CREATE TABLE IF NOT EXISTS appointments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id   INTEGER REFERENCES customers(id),
    title         TEXT NOT NULL,
    resource_name TEXT,
    subject_notes TEXT,
    status        TEXT NOT NULL DEFAULT 'scheduled',
    starts_at     TEXT NOT NULL,
    ends_at       TEXT NOT NULL,
    notes         TEXT,
    user_id       INTEGER REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_starts ON appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
