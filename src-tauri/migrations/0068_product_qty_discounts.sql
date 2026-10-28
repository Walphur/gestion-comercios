-- Descuento por cantidad: escalones en JSON, ej. [{"min_qty":2,"pct":15}].
-- La caja aplica solo el escalón más alto alcanzado; el cajero lo puede cambiar.

ALTER TABLE products ADD COLUMN qty_discounts TEXT;
