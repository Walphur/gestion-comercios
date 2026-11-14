-- Seguridad: límites de intentos (códigos, login, panel) y registro de acciones del panel.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v28.sql

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

CREATE TABLE IF NOT EXISTS admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip TEXT,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_at ON admin_audit(at);
