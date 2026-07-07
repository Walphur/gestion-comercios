-- Campos extendidos para comprobantes electrónicos ARCA (WSFEv1)
ALTER TABLE fiscal_documents ADD COLUMN cbte_tipo INTEGER;
ALTER TABLE fiscal_documents ADD COLUMN cbte_nro INTEGER;
ALTER TABLE fiscal_documents ADD COLUMN resultado TEXT;
ALTER TABLE fiscal_documents ADD COLUMN observaciones TEXT;
ALTER TABLE fiscal_documents ADD COLUMN errores TEXT;
ALTER TABLE fiscal_documents ADD COLUMN eventos TEXT;
ALTER TABLE fiscal_documents ADD COLUMN simulated INTEGER NOT NULL DEFAULT 0;
