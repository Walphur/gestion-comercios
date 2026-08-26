-- Columnas LWW para entidades taller (apply CDC las escribe).
-- Sin esto, turnos/vehículos fallan en el peer y OT/remitos quedan diferidos.

ALTER TABLE workshop_resources ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workshop_resources ADD COLUMN sync_origin TEXT;

ALTER TABLE vehicles ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicles ADD COLUMN sync_origin TEXT;

ALTER TABLE appointments ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE appointments ADD COLUMN sync_origin TEXT;

ALTER TABLE quotes ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN sync_origin TEXT;

ALTER TABLE service_orders ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE service_orders ADD COLUMN sync_origin TEXT;

ALTER TABLE delivery_notes ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE delivery_notes ADD COLUMN sync_origin TEXT;

ALTER TABLE vehicle_inspections ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vehicle_inspections ADD COLUMN sync_origin TEXT;

ALTER TABLE brands ADD COLUMN sync_lamport INTEGER NOT NULL DEFAULT 0;
ALTER TABLE brands ADD COLUMN sync_origin TEXT;
