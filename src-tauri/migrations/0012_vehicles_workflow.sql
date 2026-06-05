-- Vehículos del cliente (taller) y vínculos entre turno / presupuesto / OT
CREATE TABLE IF NOT EXISTS vehicles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER REFERENCES customers(id),
    plate        TEXT NOT NULL,
    brand        TEXT,
    model        TEXT,
    year         INTEGER,
    odometer_km  INTEGER,
    notes        TEXT,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(plate);

ALTER TABLE appointments ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);
ALTER TABLE quotes ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);
ALTER TABLE quotes ADD COLUMN appointment_id INTEGER REFERENCES appointments(id);
ALTER TABLE service_orders ADD COLUMN vehicle_id INTEGER REFERENCES vehicles(id);
ALTER TABLE service_orders ADD COLUMN appointment_id INTEGER REFERENCES appointments(id);
ALTER TABLE service_orders ADD COLUMN odometer_km INTEGER;

CREATE INDEX IF NOT EXISTS idx_quotes_appointment ON quotes(appointment_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_quote ON service_orders(quote_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_appointment ON service_orders(appointment_id);
CREATE INDEX IF NOT EXISTS idx_service_orders_vehicle ON service_orders(vehicle_id);
