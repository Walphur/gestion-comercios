import { APPLE_TOUCH_ICON } from "./icon";
import { PHONE_PAGE } from "./phone";

export interface Env {
  DB: D1Database;
}

type PushVariant = {
  sync_id?: string;
  label?: string;
  attributes_json?: string;
  sku?: string;
  price?: number | null;
  stock?: number;
  content_changed?: boolean;
  content_rev?: number;
};

type PushProduct = {
  sync_id?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  price?: number;
  cost?: number;
  unit?: string;
  active?: number;
  has_variants?: number;
  stock?: number;
  content_changed?: boolean;
  content_rev?: number;
  variants?: PushVariant[];
};

type ProductRow = {
  sync_id: string;
  name: string;
  sku: string;
  barcode: string;
  price: number;
  cost: number;
  unit: string;
  active: number;
  has_variants: number;
  desktop_stock: number;
  content_rev: number;
  content_origin: string;
  created_on_phone: number;
  desktop_seen: number;
};

type VariantRow = ProductRow & {
  product_sync_id: string;
  label: string;
  attributes_json: string;
};

let schemaReady = false;

function nowIso() {
  return new Date().toISOString();
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function err(error: string, status = 400) {
  return json({ ok: false, error }, status);
}

function tokenOf(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function num(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function text(value: unknown, max = 180) {
  return String(value ?? "").trim().slice(0, max);
}

function pairCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

function sameStock(a: number, b: number) {
  return Math.abs(a - b) < 0.0001;
}

async function ensureSchema(env: Env) {
  if (schemaReady) return;
  const sql = [
    `CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, api_token TEXT NOT NULL UNIQUE, business_name TEXT NOT NULL DEFAULT '',
      pair_code TEXT, pair_expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS phone_sessions (
      token TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS products (
      tenant_id TEXT NOT NULL, sync_id TEXT NOT NULL, name TEXT NOT NULL,
      sku TEXT NOT NULL DEFAULT '', barcode TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT 'unidad',
      active INTEGER NOT NULL DEFAULT 1, has_variants INTEGER NOT NULL DEFAULT 0,
      desktop_stock REAL NOT NULL DEFAULT 0, content_rev INTEGER NOT NULL DEFAULT 0,
      content_origin TEXT NOT NULL DEFAULT 'desktop', created_on_phone INTEGER NOT NULL DEFAULT 0,
      desktop_seen INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
      PRIMARY KEY (tenant_id, sync_id))`,
    `CREATE TABLE IF NOT EXISTS variants (
      tenant_id TEXT NOT NULL, sync_id TEXT NOT NULL, product_sync_id TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '', attributes_json TEXT NOT NULL DEFAULT '{}',
      sku TEXT NOT NULL DEFAULT '', price REAL, desktop_stock REAL NOT NULL DEFAULT 0,
      content_rev INTEGER NOT NULL DEFAULT 0, content_origin TEXT NOT NULL DEFAULT 'desktop',
      created_on_phone INTEGER NOT NULL DEFAULT 0, desktop_seen INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL, PRIMARY KEY (tenant_id, sync_id))`,
    `CREATE INDEX IF NOT EXISTS idx_variants_product ON variants (tenant_id, product_sync_id)`,
    `CREATE TABLE IF NOT EXISTS stock_ops (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sync_id TEXT NOT NULL,
      variant_sync_id TEXT NOT NULL DEFAULT '', delta REAL NOT NULL,
      acked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_stock_ops_open ON stock_ops (tenant_id, acked)`,
    `CREATE TABLE IF NOT EXISTS reports (
      tenant_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, tenant_id TEXT NOT NULL, sync_id TEXT NOT NULL,
      variant_sync_id TEXT NOT NULL DEFAULT '', field TEXT NOT NULL, kept TEXT NOT NULL,
      discarded TEXT NOT NULL, created_at TEXT NOT NULL)`,
  ];
  for (const statement of sql) await env.DB.prepare(statement).run();
  schemaReady = true;
}

async function tenantByToken(env: Env, token: string) {
  if (!token) return null;
  return env.DB.prepare("SELECT id, business_name FROM tenants WHERE api_token = ?1")
    .bind(token)
    .first<{ id: string; business_name: string }>();
}

async function tenantByPhone(env: Env, token: string) {
  if (!token) return null;
  return env.DB.prepare(
    `SELECT t.id, t.business_name FROM phone_sessions s
     JOIN tenants t ON t.id = s.tenant_id WHERE s.token = ?1`,
  )
    .bind(token)
    .first<{ id: string; business_name: string }>();
}

async function openDeltas(env: Env, tenantId: string) {
  const rows = await env.DB.prepare(
    `SELECT sync_id, variant_sync_id, delta FROM stock_ops
     WHERE tenant_id = ?1 AND acked = 0`,
  )
    .bind(tenantId)
    .all<{ sync_id: string; variant_sync_id: string; delta: number }>();
  const map = new Map<string, number>();
  for (const row of rows.results ?? []) {
    const key = row.sync_id + "|" + (row.variant_sync_id || "");
    map.set(key, (map.get(key) ?? 0) + Number(row.delta));
  }
  return map;
}

async function handlePair(request: Request, env: Env) {
  const body = (await request.json().catch(() => ({}))) as {
    business_name?: string;
    api_token?: string;
  };
  const business = text(body.business_name, 80) || "Mi comercio";
  const code = pairCode();
  const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
  const existing = body.api_token ? await tenantByToken(env, body.api_token.trim()) : null;
  if (existing) {
    await env.DB.prepare(
      `UPDATE tenants SET business_name = ?1, pair_code = ?2, pair_expires_at = ?3, updated_at = ?4 WHERE id = ?5`,
    )
      .bind(business, code, expires, nowIso(), existing.id)
      .run();
    return json({
      ok: true,
      api_token: body.api_token!.trim(),
      pair_code: code,
      pair_expires_at: expires,
    });
  }
  const id = crypto.randomUUID();
  const apiToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const ts = nowIso();
  await env.DB.prepare(
    `INSERT INTO tenants (id, api_token, business_name, pair_code, pair_expires_at, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
  )
    .bind(id, apiToken, business, code, expires, ts)
    .run();
  return json({ ok: true, api_token: apiToken, pair_code: code, pair_expires_at: expires });
}

async function handleClaim(request: Request, env: Env) {
  const body = (await request.json().catch(() => ({}))) as { code?: string };
  const code = text(body.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 6) return err("El código tiene que tener 6 caracteres.");
  const tenant = await env.DB.prepare(
    `SELECT id, business_name, pair_expires_at FROM tenants WHERE pair_code = ?1`,
  )
    .bind(code)
    .first<{ id: string; business_name: string; pair_expires_at: string }>();
  if (!tenant || !tenant.pair_expires_at || tenant.pair_expires_at < nowIso()) {
    return err("Ese código no sirve o ya venció. Generá otro en la compu.", 404);
  }
  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  await env.DB.prepare(
    "INSERT INTO phone_sessions (token, tenant_id, created_at) VALUES (?1, ?2, ?3)",
  )
    .bind(token, tenant.id, nowIso())
    .run();
  return json({ ok: true, token, business_name: tenant.business_name });
}

async function catalogForPhone(env: Env, tenantId: string) {
  const products = await env.DB.prepare(
    `SELECT sync_id, name, sku, barcode, price, cost, unit, active, has_variants, desktop_stock
     FROM products WHERE tenant_id = ?1 AND active = 1 ORDER BY name COLLATE NOCASE`,
  )
    .bind(tenantId)
    .all<ProductRow>();
  const variants = await env.DB.prepare(
    `SELECT sync_id, product_sync_id, label, sku, price, desktop_stock
     FROM variants WHERE tenant_id = ?1`,
  )
    .bind(tenantId)
    .all<VariantRow>();
  const deltas = await openDeltas(env, tenantId);
  const byProduct = new Map<string, VariantRow[]>();
  for (const variant of variants.results ?? []) {
    const list = byProduct.get(variant.product_sync_id) ?? [];
    list.push(variant);
    byProduct.set(variant.product_sync_id, list);
  }
  const conflicts = await env.DB.prepare(
    `SELECT sync_id, field, kept, discarded, created_at FROM conflicts
     WHERE tenant_id = ?1 ORDER BY id DESC LIMIT 8`,
  )
    .bind(tenantId)
    .all();
  return {
    products: (products.results ?? []).map((product) => {
      const own = byProduct.get(product.sync_id) ?? [];
      const variantViews = own.map((variant) => ({
        sync_id: variant.sync_id,
        label: variant.label,
        sku: variant.sku,
        price: variant.price,
        stock: Number(variant.desktop_stock) + (deltas.get(product.sync_id + "|" + variant.sync_id) ?? 0),
      }));
      const parentDelta = deltas.get(product.sync_id + "|") ?? 0;
      const stock = product.has_variants
        ? variantViews.reduce((sum, variant) => sum + Number(variant.stock), 0)
        : Number(product.desktop_stock) + parentDelta;
      return {
        sync_id: product.sync_id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        price: product.price,
        cost: product.cost,
        has_variants: product.has_variants,
        stock,
        variants: variantViews,
      };
    }),
    conflicts: conflicts.results ?? [],
  };
}

async function addStockOp(env: Env, tenantId: string, syncId: string, variantSyncId: string, delta: number) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0001) return;
  await env.DB.prepare(
    `INSERT INTO stock_ops (id, tenant_id, sync_id, variant_sync_id, delta, acked, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6)`,
  )
    .bind(crypto.randomUUID(), tenantId, syncId, variantSyncId, delta, nowIso())
    .run();
}

async function noteConflict(
  env: Env,
  tenantId: string,
  syncId: string,
  variantSyncId: string,
  field: string,
  kept: string,
  discarded: string,
) {
  if (kept === discarded) return;
  await env.DB.prepare(
    `INSERT INTO conflicts (tenant_id, sync_id, variant_sync_id, field, kept, discarded, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  )
    .bind(tenantId, syncId, variantSyncId, field, kept, discarded, nowIso())
    .run();
}

async function applyDesktopProduct(env: Env, tenantId: string, product: PushProduct) {
  const syncId = text(product.sync_id, 64);
  if (!syncId) return null;
  const ts = nowIso();
  const current = await env.DB.prepare(
    `SELECT name, price, sku, barcode, cost, unit, active, desktop_stock, content_rev, has_variants
     FROM products WHERE tenant_id = ?1 AND sync_id = ?2`,
  )
    .bind(tenantId, syncId)
    .first<ProductRow>();
  const name = text(product.name, 180) || current?.name || "Producto";
  const price = num(product.price, current?.price ?? 0);
  const sku = text(product.sku, 80);
  const barcode = text(product.barcode, 80);
  const cost = num(product.cost, current?.cost ?? 0);
  const unit = text(product.unit, 40) || "unidad";
  const active = product.active === 0 ? 0 : 1;
  const hasVariants = product.has_variants ? 1 : current?.has_variants ? 1 : 0;
  let rev = current?.content_rev ?? 0;
  const conflicts: { sync_id: string; variant_sync_id: string; field: string; kept: string; discarded: string }[] = [];
  if (!current) {
    rev = 1;
    await env.DB.prepare(
      `INSERT INTO products (
        tenant_id, sync_id, name, sku, barcode, price, cost, unit, active, has_variants,
        desktop_stock, content_rev, content_origin, created_on_phone, desktop_seen, updated_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,'desktop',0,1,?12)`,
    )
      .bind(tenantId, syncId, name, sku, barcode, price, cost, unit, active, hasVariants, num(product.stock), ts)
      .run();
  } else if (product.content_changed && rev <= num(product.content_rev, 0)) {
    rev += 1;
    await env.DB.prepare(
      `UPDATE products SET name=?1, sku=?2, barcode=?3, price=?4, cost=?5, unit=?6, active=?7,
       has_variants=?8, content_rev=?9, content_origin='desktop', updated_at=?10
       WHERE tenant_id=?11 AND sync_id=?12`,
    )
      .bind(name, sku, barcode, price, cost, unit, active, hasVariants, rev, ts, tenantId, syncId)
      .run();
  } else if (product.content_changed && rev > num(product.content_rev, 0) && num(product.content_rev, 0) > 0) {
    if (current.name !== name) {
      conflicts.push({ sync_id: syncId, variant_sync_id: "", field: "nombre", kept: current.name, discarded: name });
    }
    if (!sameStock(Number(current.price), price)) {
      conflicts.push({
        sync_id: syncId,
        variant_sync_id: "",
        field: "precio",
        kept: String(current.price),
        discarded: String(price),
      });
    }
  }
  if (current && !hasVariants && Number.isFinite(Number(product.stock)) && !sameStock(Number(product.stock), Number(current.desktop_stock))) {
    await env.DB.prepare(
      "UPDATE products SET desktop_stock=?1 WHERE tenant_id=?2 AND sync_id=?3",
    )
      .bind(num(product.stock), tenantId, syncId)
      .run();
  }
  const accepted: { sync_id: string; variant_sync_id: string; content_rev: number }[] = [
    { sync_id: syncId, variant_sync_id: "", content_rev: rev },
  ];
  for (const variant of product.variants ?? []) {
    const variantId = text(variant.sync_id, 64);
    if (!variantId) continue;
    const row = await env.DB.prepare(
      `SELECT label, price, desktop_stock, content_rev, attributes_json FROM variants
       WHERE tenant_id=?1 AND sync_id=?2`,
    )
      .bind(tenantId, variantId)
      .first<VariantRow>();
    const label = text(variant.label, 120) || row?.label || "Modelo";
    const attributes = text(variant.attributes_json, 500) || row?.attributes_json || "{}";
    const variantSku = text(variant.sku, 80);
    const variantPrice = variant.price == null || variant.price === undefined ? null : num(variant.price);
    let variantRev = row?.content_rev ?? 0;
    if (!row) {
      variantRev = 1;
      await env.DB.prepare(
        `INSERT INTO variants (
          tenant_id, sync_id, product_sync_id, label, attributes_json, sku, price, desktop_stock,
          content_rev, content_origin, created_on_phone, desktop_seen, updated_at
        ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,1,'desktop',0,1,?9)`,
      )
        .bind(tenantId, variantId, syncId, label, attributes, variantSku, variantPrice, num(variant.stock), ts)
        .run();
      await env.DB.prepare(
        "UPDATE products SET has_variants=1 WHERE tenant_id=?1 AND sync_id=?2",
      )
        .bind(tenantId, syncId)
        .run();
    } else if (variant.content_changed && variantRev <= num(variant.content_rev, 0)) {
      variantRev += 1;
      await env.DB.prepare(
        `UPDATE variants SET label=?1, attributes_json=?2, sku=?3, price=?4, content_rev=?5,
         content_origin='desktop', updated_at=?6 WHERE tenant_id=?7 AND sync_id=?8`,
      )
        .bind(label, attributes, variantSku, variantPrice, variantRev, ts, tenantId, variantId)
        .run();
    } else if (variant.content_changed && variantRev > num(variant.content_rev, 0) && num(variant.content_rev, 0) > 0) {
      if (!sameStock(Number(row.price ?? 0), Number(variantPrice ?? 0))) {
        conflicts.push({
          sync_id: syncId,
          variant_sync_id: variantId,
          field: "precio del modelo",
          kept: String(row.price ?? ""),
          discarded: String(variantPrice ?? ""),
        });
      }
    }
    if (row && Number.isFinite(Number(variant.stock)) && !sameStock(Number(variant.stock), Number(row.desktop_stock))) {
      await env.DB.prepare("UPDATE variants SET desktop_stock=?1 WHERE tenant_id=?2 AND sync_id=?3")
        .bind(num(variant.stock), tenantId, variantId)
        .run();
    }
    accepted.push({ sync_id: syncId, variant_sync_id: variantId, content_rev: variantRev });
  }
  for (const conflict of conflicts) {
    await noteConflict(env, tenantId, conflict.sync_id, conflict.variant_sync_id, conflict.field, conflict.kept, conflict.discarded);
  }
  return { accepted, conflicts };
}

async function phoneChanges(env: Env, tenantId: string) {
  const products = await env.DB.prepare(
    `SELECT * FROM products WHERE tenant_id=?1
     AND (content_origin='phone' OR (created_on_phone=1 AND desktop_seen=0))`,
  )
    .bind(tenantId)
    .all<ProductRow>();
  const variants = await env.DB.prepare(
    `SELECT * FROM variants WHERE tenant_id=?1
     AND (content_origin='phone' OR (created_on_phone=1 AND desktop_seen=0))`,
  )
    .bind(tenantId)
    .all<VariantRow>();
  const parents = new Map<string, Record<string, unknown>>();
  for (const product of products.results ?? []) {
    parents.set(product.sync_id, {
      sync_id: product.sync_id,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      price: product.price,
      cost: product.cost,
      unit: product.unit,
      active: product.active,
      has_variants: product.has_variants,
      content_rev: product.content_rev,
      create: product.created_on_phone === 1 && product.desktop_seen === 0,
      initial_stock: product.desktop_stock,
      variants: [] as Record<string, unknown>[],
    });
  }
  for (const variant of variants.results ?? []) {
    if (!parents.has(variant.product_sync_id)) {
      const parent = await env.DB.prepare("SELECT * FROM products WHERE tenant_id=?1 AND sync_id=?2")
        .bind(tenantId, variant.product_sync_id)
        .first<ProductRow>();
      if (!parent) continue;
      parents.set(parent.sync_id, {
        sync_id: parent.sync_id,
        name: parent.name,
        sku: parent.sku,
        barcode: parent.barcode,
        price: parent.price,
        cost: parent.cost,
        unit: parent.unit,
        active: parent.active,
        has_variants: 1,
        content_rev: parent.content_rev,
        create: false,
        initial_stock: parent.desktop_stock,
        variants: [],
      });
    }
    const bucket = parents.get(variant.product_sync_id)!;
    (bucket.variants as Record<string, unknown>[]).push({
      sync_id: variant.sync_id,
      label: variant.label,
      attributes_json: variant.attributes_json,
      sku: variant.sku,
      price: variant.price,
      content_rev: variant.content_rev,
      create: variant.created_on_phone === 1 && variant.desktop_seen === 0,
      initial_stock: variant.desktop_stock,
    });
  }
  const ops = await env.DB.prepare(
    `SELECT id, sync_id, variant_sync_id, delta FROM stock_ops
     WHERE tenant_id=?1 AND acked=0 ORDER BY created_at LIMIT 200`,
  )
    .bind(tenantId)
    .all();
  const phones = await env.DB.prepare("SELECT COUNT(*) AS n FROM phone_sessions WHERE tenant_id=?1")
    .bind(tenantId)
    .first<{ n: number }>();
  return {
    apply: [...parents.values()],
    stock_ops: ops.results ?? [],
    phones: phones?.n ?? 0,
  };
}

async function handleDesktopSync(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as { products?: PushProduct[] };
  const accepted: { sync_id: string; variant_sync_id: string; content_rev: number }[] = [];
  const conflicts: { sync_id: string; variant_sync_id: string; field: string; kept: string; discarded: string; created_at: string }[] = [];
  for (const product of (body.products ?? []).slice(0, 15)) {
    const result = await applyDesktopProduct(env, tenantId, product);
    if (!result) continue;
    accepted.push(...result.accepted);
    for (const conflict of result.conflicts) {
      conflicts.push({ ...conflict, created_at: nowIso() });
    }
  }
  const changes = await phoneChanges(env, tenantId);
  return json({ ok: true, accepted, conflicts, ...changes });
}

async function handleAck(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as {
    op_ids?: string[];
    seen?: { sync_id?: string; variant_sync_id?: string; content_rev?: number }[];
  };
  for (const opId of body.op_ids ?? []) {
    const op = await env.DB.prepare(
      `SELECT sync_id, variant_sync_id, delta FROM stock_ops
       WHERE id=?1 AND tenant_id=?2 AND acked=0`,
    )
      .bind(opId, tenantId)
      .first<{ sync_id: string; variant_sync_id: string; delta: number }>();
    if (!op) continue;
    await env.DB.prepare("UPDATE stock_ops SET acked=1 WHERE id=?1").bind(opId).run();
    if (op.variant_sync_id) {
      await env.DB.prepare(
        "UPDATE variants SET desktop_stock = desktop_stock + ?1 WHERE tenant_id=?2 AND sync_id=?3",
      )
        .bind(op.delta, tenantId, op.variant_sync_id)
        .run();
    } else {
      await env.DB.prepare(
        "UPDATE products SET desktop_stock = desktop_stock + ?1 WHERE tenant_id=?2 AND sync_id=?3",
      )
        .bind(op.delta, tenantId, op.sync_id)
        .run();
    }
  }
  for (const seen of body.seen ?? []) {
    const syncId = text(seen.sync_id, 64);
    const rev = num(seen.content_rev, -1);
    if (!syncId || rev < 0) continue;
    if (seen.variant_sync_id) {
      await env.DB.prepare(
        `UPDATE variants SET desktop_seen=1, content_origin='desktop'
         WHERE tenant_id=?1 AND sync_id=?2 AND content_rev=?3`,
      )
        .bind(tenantId, text(seen.variant_sync_id, 64), rev)
        .run();
    } else {
      await env.DB.prepare(
        `UPDATE products SET desktop_seen=1, content_origin='desktop'
         WHERE tenant_id=?1 AND sync_id=?2 AND content_rev=?3`,
      )
        .bind(tenantId, syncId, rev)
        .run();
    }
  }
  return json({ ok: true });
}

async function handlePhoneProduct(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as {
    sync_id?: string;
    name?: string;
    price?: number;
    cost?: number;
    stock?: number;
    sku?: string;
    barcode?: string;
  };
  const name = text(body.name, 180);
  const price = num(body.price);
  const ts = nowIso();
  const syncId = text(body.sync_id, 64);
  if (!syncId) {
    if (!name) return err("Poné el nombre del producto.");
    const id = crypto.randomUUID().replace(/-/g, "");
    const stock = num(body.stock);
    await env.DB.prepare(
      `INSERT INTO products (
        tenant_id, sync_id, name, sku, barcode, price, cost, unit, active, has_variants,
        desktop_stock, content_rev, content_origin, created_on_phone, desktop_seen, updated_at
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,'unidad',1,0,?8,1,'phone',1,0,?9)`,
    )
      .bind(tenantId, id, name, text(body.sku, 80), text(body.barcode, 80), price, num(body.cost), stock, ts)
      .run();
    return json({ ok: true, sync_id: id });
  }
  const current = await env.DB.prepare(
    "SELECT name, price, cost FROM products WHERE tenant_id=?1 AND sync_id=?2",
  )
    .bind(tenantId, syncId)
    .first<{ name: string; price: number; cost: number }>();
  if (!current) return err("Ese producto no está en el catálogo.", 404);
  const nextName = name || current.name;
  const nextCost = body.cost == null ? Number(current.cost) : num(body.cost);
  await env.DB.prepare(
    `UPDATE products SET name=?1, price=?2, cost=?3, content_rev=content_rev+1, content_origin='phone', updated_at=?4
     WHERE tenant_id=?5 AND sync_id=?6`,
  )
    .bind(nextName, price, nextCost, ts, tenantId, syncId)
    .run();
  return json({ ok: true, sync_id: syncId });
}

async function handlePhoneStock(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as {
    sync_id?: string;
    variant_sync_id?: string;
    delta?: number;
  };
  const syncId = text(body.sync_id, 64);
  const variantId = text(body.variant_sync_id, 64);
  const delta = num(body.delta);
  if (!syncId) return err("Falta el producto.");
  if (Math.abs(delta) > 100000) return err("La cantidad es demasiado grande.");
  if (variantId) {
    const variant = await env.DB.prepare(
      "SELECT sync_id FROM variants WHERE tenant_id=?1 AND sync_id=?2 AND product_sync_id=?3",
    )
      .bind(tenantId, variantId, syncId)
      .first();
    if (!variant) return err("Ese modelo no está.", 404);
    await addStockOp(env, tenantId, syncId, variantId, delta);
  } else {
    const product = await env.DB.prepare(
      "SELECT has_variants FROM products WHERE tenant_id=?1 AND sync_id=?2",
    )
      .bind(tenantId, syncId)
      .first<{ has_variants: number }>();
    if (!product) return err("Ese producto no está.", 404);
    if (product.has_variants) return err("Este producto se ajusta por modelo.");
    await addStockOp(env, tenantId, syncId, "", delta);
  }
  return json({ ok: true });
}

async function handlePhoneVariant(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as {
    product_sync_id?: string;
    sync_id?: string;
    label?: string;
    price?: number;
    stock?: number;
  };
  const productId = text(body.product_sync_id, 64);
  const product = await env.DB.prepare(
    "SELECT sync_id FROM products WHERE tenant_id=?1 AND sync_id=?2",
  )
    .bind(tenantId, productId)
    .first();
  if (!product) return err("Ese producto no está.", 404);
  const ts = nowIso();
  const existing = text(body.sync_id, 64);
  if (existing) {
    await env.DB.prepare(
      `UPDATE variants SET price=?1, content_rev=content_rev+1, content_origin='phone', updated_at=?2
       WHERE tenant_id=?3 AND sync_id=?4`,
    )
      .bind(num(body.price), ts, tenantId, existing)
      .run();
    return json({ ok: true, sync_id: existing });
  }
  const label = text(body.label, 120);
  if (!label) return err("Poné el nombre del modelo.");
  const id = crypto.randomUUID().replace(/-/g, "");
  const stock = num(body.stock);
  await env.DB.prepare(
    `INSERT INTO variants (
      tenant_id, sync_id, product_sync_id, label, attributes_json, sku, price, desktop_stock,
      content_rev, content_origin, created_on_phone, desktop_seen, updated_at
    ) VALUES (?1,?2,?3,?4,?5,'',?6,?7,1,'phone',1,0,?8)`,
  )
    .bind(tenantId, id, productId, label, JSON.stringify({ modelo: label }), body.price == null ? null : num(body.price), stock, ts)
    .run();
  await env.DB.prepare("UPDATE products SET has_variants=1, updated_at=?1 WHERE tenant_id=?2 AND sync_id=?3")
    .bind(ts, tenantId, productId)
    .run();
  return json({ ok: true, sync_id: id });
}

async function handleDesktopReports(request: Request, env: Env, tenantId: string) {
  const body = (await request.json().catch(() => ({}))) as { report?: unknown };
  const report = body.report;
  if (!report || typeof report !== "object") return err("Falta el reporte.");
  const payload = JSON.stringify(report);
  if (payload.length > 120_000) return err("El reporte es demasiado grande.");
  await env.DB.prepare(
    `INSERT INTO reports (tenant_id, payload, updated_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(tenant_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  )
    .bind(tenantId, payload, nowIso())
    .run();
  return json({ ok: true });
}

async function handlePhoneReports(env: Env, tenantId: string) {
  const row = await env.DB.prepare("SELECT payload, updated_at FROM reports WHERE tenant_id = ?1")
    .bind(tenantId)
    .first<{ payload: string; updated_at: string }>();
  if (!row) return json({ ok: true, report: null });
  try {
    return json({ ok: true, report: JSON.parse(row.payload), updated_at: row.updated_at });
  } catch {
    return json({ ok: true, report: null });
  }
}

function appleIconResponse() {
  const binary = atob(APPLE_TOUCH_ICON);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Response(bytes, {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}

function mobileConfig(origin: string) {
  const page = origin.replace(/\/$/, "") + "/";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key><true/>
      <key>Icon</key><data>${APPLE_TOUCH_ICON}</data>
      <key>IsRemovable</key><true/>
      <key>Label</key><string>WalQo</string>
      <key>PayloadDescription</key><string>Catálogo y reportes del comercio</string>
      <key>PayloadDisplayName</key><string>WalQo</string>
      <key>PayloadIdentifier</key><string>dev.walphur.walqo.webclip</string>
      <key>PayloadType</key><string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key><string>8C4E3B2A-1F0D-4A6E-9B7C-2D5E8F1A0B3C</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>Precomposed</key><true/>
      <key>URL</key><string>${page}</string>
    </dict>
  </array>
  <key>PayloadDisplayName</key><string>WalQo</string>
  <key>PayloadIdentifier</key><string>dev.walphur.walqo</string>
  <key>PayloadRemovalDisallowed</key><false/>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>7B3D2A1C-0E9F-4B5D-8A6C-1C4D7E0F9A2B</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict>
</plist>`;
  return new Response(xml, {
    headers: {
      "content-type": "application/x-apple-aspen-config",
      "content-disposition": 'attachment; filename="WalQo.mobileconfig"',
      "cache-control": "no-store",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        },
      });
    }
    if (url.pathname === "/manifest.webmanifest") {
      return new Response(
        JSON.stringify({
          name: "WalQo",
          short_name: "WalQo",
          start_url: "/",
          display: "standalone",
          background_color: "#eef2f6",
          theme_color: "#0f2744",
          icons: [
            { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
            { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
          ],
        }),
        { headers: { "content-type": "application/manifest+json; charset=utf-8" } },
      );
    }
    if (url.pathname === "/apple-touch-icon.png" || url.pathname === "/icon-180.png") {
      return appleIconResponse();
    }
    if (url.pathname === "/instalar") return mobileConfig(url.origin);
    if (url.pathname === "/icon.svg") {
      return new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#000"/><defs><linearGradient id="qTail" x1="168" y1="156" x2="208" y2="214" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#7EB0FF"/><stop offset="100%" stop-color="#B794FF"/></linearGradient></defs><path d="M196 176A78 78 0 1 0 128 204" fill="none" stroke="#4B8BFF" stroke-width="42" stroke-linecap="round"/><rect x="164" y="148" width="32" height="80" rx="16" transform="rotate(-42 180 188)" fill="url(#qTail)"/></svg>`,
        { headers: { "content-type": "image/svg+xml" } },
      );
    }
    if (url.pathname === "/sw.js") {
      return new Response(
        "self.addEventListener('fetch',function(){});",
        { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } },
      );
    }
    if (url.pathname === "/" || url.pathname === "/app") {
      return new Response(PHONE_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    try {
      await ensureSchema(env);
      if (url.pathname === "/v1/pair" && request.method === "POST") return handlePair(request, env);
      if (url.pathname === "/v1/claim" && request.method === "POST") return handleClaim(request, env);
      if (url.pathname === "/health") return json({ ok: true });

      const token = tokenOf(request);
      if (url.pathname.startsWith("/v1/desktop/")) {
        const tenant = await tenantByToken(env, token);
        if (!tenant) return err("La compu no está vinculada.", 401);
        if (url.pathname === "/v1/desktop/sync" && request.method === "POST") {
          return handleDesktopSync(request, env, tenant.id);
        }
        if (url.pathname === "/v1/desktop/ack" && request.method === "POST") {
          return handleAck(request, env, tenant.id);
        }
        if (url.pathname === "/v1/desktop/reports" && request.method === "POST") {
          return handleDesktopReports(request, env, tenant.id);
        }
        if (url.pathname === "/v1/desktop/revoke" && request.method === "POST") {
          await env.DB.prepare("DELETE FROM phone_sessions WHERE tenant_id=?1").bind(tenant.id).run();
          await env.DB.prepare(
            "UPDATE tenants SET pair_code=NULL, pair_expires_at=NULL, updated_at=?1 WHERE id=?2",
          )
            .bind(nowIso(), tenant.id)
            .run();
          return json({ ok: true });
        }
      }
      if (url.pathname.startsWith("/v1/")) {
        const tenant = await tenantByPhone(env, token);
        if (!tenant) return err("Entrá de nuevo con el código de la compu.", 401);
        if (url.pathname === "/v1/reports" && request.method === "GET") {
          return handlePhoneReports(env, tenant.id);
        }
        if (url.pathname === "/v1/catalog" && request.method === "GET") {
          const catalog = await catalogForPhone(env, tenant.id);
          return json({ ok: true, business_name: tenant.business_name, ...catalog });
        }
        if (url.pathname === "/v1/phone/product" && request.method === "POST") {
          return handlePhoneProduct(request, env, tenant.id);
        }
        if (url.pathname === "/v1/phone/stock" && request.method === "POST") {
          return handlePhoneStock(request, env, tenant.id);
        }
        if (url.pathname === "/v1/phone/variant" && request.method === "POST") {
          return handlePhoneVariant(request, env, tenant.id);
        }
      }
      return err("No encontrado", 404);
    } catch (error) {
      return err(error instanceof Error ? error.message : "Error del servidor", 500);
    }
  },
};
