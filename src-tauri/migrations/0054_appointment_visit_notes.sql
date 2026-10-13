-- Nota interna de la atención. No pisa notes ni subject_notes del turno.
CREATE TABLE IF NOT EXISTS appointment_visit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL UNIQUE REFERENCES appointments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_appointment_visit_notes_customer_lookup
  ON appointment_visit_notes(appointment_id);
