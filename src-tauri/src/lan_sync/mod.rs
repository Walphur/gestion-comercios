//! WalTech Sync LAN — sincronización hub-and-spoke entre PCs en la red local.
//!
//! Cada PC tiene su propio SQLite; se sincronizan eventos CDC (no el archivo).
//! Stock absoluto de productos NUNCA se aplica vía LWW: solo `stock_movements`
//! con qty firmada (mismo convenio que `src/db/stock.ts`).
//! Balance de clientes: solo `customer_balance_movements` (nunca LWW de balance).

pub mod applier;
pub mod client;
pub mod commands;
pub mod conflict;
pub mod conflicts;
pub mod discovery;
pub mod engine;
pub mod errors;
pub mod models;
pub mod net_guard;
pub mod numbering;
pub mod outbox;
pub mod protocol;
pub mod server;
pub mod state;

#[cfg(test)]
mod tests_sync;
#[cfg(test)]
mod audit_chaos;

pub use commands::*;
#[allow(unused_imports)]
pub use models::{LanRole, LanStatus, LanUiStatus};
#[allow(unused_imports)]
pub use protocol::SyncEvent;
