-- Origen de la venta (caja / PC) para listados, reportes y sync LAN.
-- Importante: apagar CDC antes del UPDATE masivo. Si no, trg_lan_sales_au
-- encola un evento por cada venta histórica y la app queda colgada en "Cargando…".
INSERT INTO settings (key, value) VALUES ('lan_sync_applying', '1')
ON CONFLICT(key) DO UPDATE SET value = '1';

ALTER TABLE sales ADD COLUMN device_code TEXT;
ALTER TABLE sales ADD COLUMN device_name TEXT;

-- Ventas existentes: código desde doc_number (CJ01-V-00000042 → CJ01).
UPDATE sales
SET device_code = substr(doc_number, 1, instr(doc_number || '-V-', '-V-') - 1)
WHERE doc_number IS NOT NULL
  AND doc_number LIKE '%-V-%'
  AND (device_code IS NULL OR trim(device_code) = '');

UPDATE settings SET value = '0' WHERE key = 'lan_sync_applying';
