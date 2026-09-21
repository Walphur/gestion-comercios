-- Variantes TN (talle/color) vinculadas a product_variants locales.
ALTER TABLE product_variants ADD COLUMN tn_variant_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_product_variants_tn
  ON product_variants(tn_variant_id)
  WHERE tn_variant_id IS NOT NULL;
