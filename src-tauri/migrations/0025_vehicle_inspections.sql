-- Peritajes de ingreso (estado del vehículo antes de entrar al taller).
CREATE TABLE IF NOT EXISTS vehicle_inspections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inspection_number TEXT NOT NULL UNIQUE,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  customer_id INTEGER REFERENCES customers(id),
  odometer_km INTEGER,
  fuel_level TEXT,
  exterior_condition TEXT,
  interior_condition TEXT,
  belongings TEXT,
  customer_reported TEXT,
  notes TEXT,
  received_by TEXT,
  service_order_id INTEGER REFERENCES service_orders(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle
  ON vehicle_inspections(vehicle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_customer
  ON vehicle_inspections(customer_id);
