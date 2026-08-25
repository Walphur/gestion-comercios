//! Diseño de numeración Sync LAN — ver módulo Rust `lan_sync::numbering`.
//!
//! Elección: **secuencia por dispositivo** (`{CODE}-{T}-{NNNNNNNN}`).
//!
//! No usar `sales.id` / AUTOINCREMENT local como número impreso.
//! Preparado para Ventas (V), Facturas (F), Presupuestos (P), Remitos (R), Órdenes (O).
//!
//! ## Alcance Sync LAN (Phase 0)
//!
//! - **Soportado:** productos (ficha + stock vía `stock_movements`), clientes,
//!   saldos vía `customer_balance_movements`, ventas (`sync_id` + `sale_items.sync_id`),
//!   categorías, proveedores.
//! - **No soportado:** stock de `product_variants`. Multi-caja con variantes no
//!   sincroniza el stock de variante entre PCs; preferir productos sin variante
//!   o aceptar stock de variante solo local.
