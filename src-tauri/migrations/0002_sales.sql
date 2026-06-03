-- Encabezado de venta
CREATE TABLE IF NOT EXISTS sales (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    subtotal       REAL NOT NULL,
    discount_pct   REAL NOT NULL DEFAULT 0,
    total          REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    paid           REAL,
    change_due     REAL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Detalle de cada venta
CREATE TABLE IF NOT EXISTS sale_items (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id      INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id   INTEGER,
    variant_id   INTEGER,
    name         TEXT NOT NULL,
    qty          REAL NOT NULL,
    unit_price   REAL NOT NULL,
    discount_pct REAL NOT NULL DEFAULT 0,
    line_total   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
