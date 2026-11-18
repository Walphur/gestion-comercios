-- Posición opcional de cada mesa en el plano del salón (0..1).
-- Si queda NULL, Mesas sigue mostrando la grilla por número.

ALTER TABLE dining_tables ADD COLUMN pos_x REAL;
ALTER TABLE dining_tables ADD COLUMN pos_y REAL;
