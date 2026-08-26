-- Origen de la venta (caja / PC) para listados, reportes y sync LAN.
ALTER TABLE sales ADD COLUMN device_code TEXT;
ALTER TABLE sales ADD COLUMN device_name TEXT;

-- Ventas existentes: código desde doc_number (CJ01-V-00000042 → CJ01).
UPDATE sales
SET device_code = substr(doc_number, 1, instr(doc_number || '-V-', '-V-') - 1)
WHERE doc_number IS NOT NULL
  AND doc_number LIKE '%-V-%'
  AND (device_code IS NULL OR trim(device_code) = '');
