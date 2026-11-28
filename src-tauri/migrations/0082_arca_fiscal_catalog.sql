-- Condición IVA del cliente (códigos CondicionIVAReceptor ARCA / RG 5615).
-- NULL = consumidor final / sin dato.
ALTER TABLE customers ADD COLUMN iva_condition INTEGER;

-- Emisor: ri | monotributo | exento (settings key arca_emisor_iva).
-- Si no hay valor, se infiere de arca_cbte_tipo (11→monotributo, 6/1→ri).
INSERT OR IGNORE INTO settings (key, value)
SELECT 'arca_emisor_iva',
  CASE
    WHEN COALESCE((SELECT value FROM settings WHERE key = 'arca_cbte_tipo'), '11') IN ('1', '6') THEN 'ri'
    ELSE 'monotributo'
  END;

-- Ajustes NC/ND: varios comprobantes por venta y vínculo al original.
ALTER TABLE fiscal_documents ADD COLUMN parent_sale_id INTEGER REFERENCES sales(id);
ALTER TABLE fiscal_documents ADD COLUMN adjustment_kind TEXT;

-- La ficha fiscal también viaja entre cajas.
DROP TRIGGER IF EXISTS trg_lan_customers_au;
CREATE TRIGGER IF NOT EXISTS trg_lan_customers_au
AFTER UPDATE OF name, phone, document, email, address, organization, iva_condition, credit_limit, notes, active ON customers
WHEN COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_enabled'), '0') = '1'
  AND COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_applying'), '0') != '1'
BEGIN
  INSERT INTO lan_sync_outbox (event_id, entity_type, entity_sync_id, entity_local_id, op, origin_device, lamport)
  VALUES (
    lower(hex(randomblob(16))), 'customer',
    COALESCE(NEW.sync_id, 'pending-cust-' || NEW.id), NEW.id, 'upsert',
    COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_device_id'), 'local'),
    CAST(COALESCE((SELECT value FROM settings WHERE key = 'lan_sync_lamport'), '0') AS INTEGER) + 1
  );
  UPDATE settings SET value = CAST(CAST(COALESCE(value, '0') AS INTEGER) + 1 AS TEXT)
  WHERE key = 'lan_sync_lamport';
END;
