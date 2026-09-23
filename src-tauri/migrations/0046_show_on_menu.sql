-- Visibilidad en carta web pública (gastronomía: ocultar insumos / no-carta).
ALTER TABLE products ADD COLUMN show_on_menu INTEGER NOT NULL DEFAULT 1;
