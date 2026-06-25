-- FTS5 autónomo: sin content= ni triggers SQL.
-- El índice se sincroniza desde Rust (DbManager) para evitar corrupción en import/delete masivos.
DROP TRIGGER IF EXISTS products_fts_ai;
DROP TRIGGER IF EXISTS products_fts_ad;
DROP TRIGGER IF EXISTS products_fts_au;
DROP TABLE IF EXISTS products_fts;

CREATE VIRTUAL TABLE products_fts USING fts5(
    name,
    barcode,
    sku,
    tokenize='unicode61 remove_diacritics 2'
);

INSERT INTO products_fts(rowid, name, barcode, sku)
SELECT id, name, COALESCE(barcode, ''), COALESCE(sku, '')
FROM products WHERE active = 1;
