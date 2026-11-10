-- Tienda web por elección fuera de gastronomía: cada comercio prende los productos que quiere mostrar.
-- Gastronomía sigue mostrando todo. No toca updated_at ni columnas que viajan por la sync LAN.
UPDATE products SET show_on_menu = 0
WHERE show_on_menu <> 0
  AND COALESCE((SELECT value FROM settings WHERE key = 'rubro'), 'general') <> 'gastronomia';
