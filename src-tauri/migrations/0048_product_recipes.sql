-- Recetas, producción y tipificación gastronómica.
-- Compatibilidad: kits existentes siguen con is_kit; track_stock=0 sin receta = no-op (como hoy).

ALTER TABLE products ADD COLUMN product_kind TEXT NOT NULL DEFAULT 'standard'
    CHECK (product_kind IN ('standard', 'ingredient', 'prepared', 'kit'));

ALTER TABLE products ADD COLUMN prepare_mode TEXT
    CHECK (prepare_mode IS NULL OR prepare_mode IN ('batch', 'on_demand'));

-- Horario opcional del menú del día (JSON: {"days":[1,2,3],"from":"11:00","to":"15:00"}).
ALTER TABLE products ADD COLUMN menu_schedule TEXT;

UPDATE products SET product_kind = 'kit' WHERE COALESCE(is_kit, 0) = 1;

-- Platos ya marcados "sin inventario" → elaborados al momento (sin receta aún = mismo no-op).
UPDATE products
SET product_kind = 'prepared', prepare_mode = 'on_demand'
WHERE COALESCE(is_kit, 0) = 0 AND COALESCE(track_stock, 1) = 0;

CREATE TABLE IF NOT EXISTS product_recipes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    yield_qty   REAL NOT NULL DEFAULT 1 CHECK (yield_qty > 0),
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id              INTEGER NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
    ingredient_product_id  INTEGER NOT NULL REFERENCES products(id),
    qty                    REAL NOT NULL CHECK (qty > 0),
    UNIQUE (recipe_id, ingredient_product_id)
);

CREATE INDEX IF NOT EXISTS idx_recipe_items_ingredient ON recipe_items(ingredient_product_id);

CREATE TABLE IF NOT EXISTS production_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty         REAL NOT NULL CHECK (qty > 0),
    user_id     INTEGER,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    sync_id     TEXT
);

CREATE INDEX IF NOT EXISTS idx_production_runs_product ON production_runs(product_id);
CREATE INDEX IF NOT EXISTS idx_production_runs_created ON production_runs(created_at);
