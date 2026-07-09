-- Registro local de avisos enviados (WhatsApp automático u otros canales).
CREATE TABLE IF NOT EXISTS appointment_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  sent_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  external_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_appt_notif_appointment ON appointment_notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appt_notif_kind ON appointment_notifications(appointment_id, kind);
