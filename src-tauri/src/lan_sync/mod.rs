//! WalTech Sync LAN — sincronización hub-and-spoke entre PCs en la red local.
//!
//! Cada PC tiene su propio SQLite; se sincronizan eventos CDC (no el archivo).
//! Stock absoluto de productos NUNCA se aplica vía LWW: solo `stock_movements`
//! con qty firmada (mismo convenio que `src/db/stock.ts`).

pub mod applier;
pub mod commands;
pub mod conflict;
pub mod discovery;
pub mod engine;
pub mod errors;
pub mod models;
pub mod net_guard;
pub mod outbox;
pub mod protocol;
pub mod client;
pub mod server;
pub mod state;

#[cfg(test)]
mod tests_sync;
#[cfg(test)]
mod audit_chaos;

pub use commands::*;
// Re-exports for consumers outside this module.
#[allow(unused_imports)]
pub use models::{LanRole, LanStatus, LanUiStatus};
#[allow(unused_imports)]
pub use protocol::SyncEvent;
