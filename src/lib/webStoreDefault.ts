/**
 * Valor de products.show_on_menu para un producto nuevo: en gastronomía sale en la carta;
 * en el resto de los rubros la tienda web es por elección (el comercio lo prende).
 * Igual que web_store_default_sql en src-tauri/src/import_products.rs.
 */
export const SHOW_ON_MENU_DEFAULT_SQL = `(CASE WHEN COALESCE((SELECT value FROM settings WHERE key = 'rubro'), 'general') = 'gastronomia' THEN 1 ELSE 0 END)`;
