-- Los productos en recuperados (active = 0) no deben conservar códigos en
-- product_barcodes: bloqueaban el UNIQUE y el escaneo podía cobrar el viejo.
DELETE FROM product_barcodes
 WHERE product_id IN (SELECT id FROM products WHERE active = 0);
