-- Fotos extra del producto (hasta 3 además de la principal, que sigue en products.image_path).
-- Archivos en app_data/product_images. No se sincroniza entre computadoras, igual que image_path.

CREATE TABLE IF NOT EXISTS product_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL,
    file_name   TEXT NOT NULL,
    position    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_product_photos_product ON product_photos(product_id, position);
