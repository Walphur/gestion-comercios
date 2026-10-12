ALTER TABLE products ADD COLUMN duration_min INTEGER;

CREATE TABLE IF NOT EXISTS service_resources (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  resource_id INTEGER NOT NULL REFERENCES workshop_resources(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_service_resources_resource ON service_resources(resource_id);
