-- Comisión de cada profesional y quién atendió cada venta (peluquería / barbería / estética).
ALTER TABLE workshop_resources ADD COLUMN commission_service_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE workshop_resources ADD COLUMN commission_product_pct REAL NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN resource_id INTEGER REFERENCES workshop_resources(id);
ALTER TABLE sales ADD COLUMN appointment_id INTEGER REFERENCES appointments(id);
CREATE INDEX IF NOT EXISTS idx_sales_resource ON sales(resource_id);
CREATE INDEX IF NOT EXISTS idx_sales_appointment ON sales(appointment_id);
