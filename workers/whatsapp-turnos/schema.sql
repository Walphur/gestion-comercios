CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  api_token TEXT NOT NULL UNIQUE,
  phone_number_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  business_name TEXT NOT NULL,
  reminder_hours INTEGER NOT NULL DEFAULT 24,
  webhook_verify_token TEXT NOT NULL,
  template_name TEXT NOT NULL DEFAULT 'gc_recordatorio_turno',
  template_lang TEXT NOT NULL DEFAULT 'es_AR',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS synced_appointments (
  tenant_id TEXT NOT NULL,
  appointment_id INTEGER NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL,
  resource_name TEXT,
  vehicle_plate TEXT,
  reminder_sent_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, appointment_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_synced_appt_starts ON synced_appointments(starts_at);
CREATE INDEX IF NOT EXISTS idx_synced_appt_reminder ON synced_appointments(reminder_sent_at, status);

CREATE TABLE IF NOT EXISTS pending_confirmations (
  tenant_id TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  appointment_id INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, customer_phone, appointment_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_replies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  customer_phone TEXT,
  customer_name TEXT,
  created_at TEXT NOT NULL,
  synced_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_replies_tenant ON pending_replies(tenant_id, synced_at);
