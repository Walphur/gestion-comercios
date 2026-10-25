-- Mercado Libre: token del vendedor, órdenes con licencia emitida y preguntas respondidas.
-- npx wrangler d1 execute gestion-licenses --remote --file=./schema-migration-v22.sql

-- Un solo renglón (id = 'main'). Tokens cifrados con MP_TOKEN_KEY (AES-GCM).
CREATE TABLE IF NOT EXISTS ml_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  access_enc TEXT NOT NULL,
  refresh_enc TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Una fila por orden: la clave primaria hace que nunca se emitan dos licencias para la misma venta.
-- status: processing | licensed (falta el mensaje) | done | review (para Juan).
CREATE TABLE IF NOT EXISTS ml_orders (
  order_id TEXT PRIMARY KEY NOT NULL,
  pack_id TEXT,
  item_id TEXT,
  slug TEXT,
  plan TEXT,
  buyer_id TEXT,
  buyer_nick TEXT,
  status TEXT NOT NULL,
  detail TEXT,
  license_id TEXT,
  license_key TEXT,
  message_status TEXT,
  test INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ml_orders_buyer ON ml_orders(buyer_id);

-- status: answered | pending (para Juan) | failed.
CREATE TABLE IF NOT EXISTS ml_questions (
  question_id TEXT PRIMARY KEY NOT NULL,
  item_id TEXT,
  text TEXT,
  status TEXT NOT NULL,
  topics TEXT,
  answer TEXT,
  detail TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ml_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT,
  resource TEXT,
  result TEXT,
  created_at TEXT NOT NULL
);
