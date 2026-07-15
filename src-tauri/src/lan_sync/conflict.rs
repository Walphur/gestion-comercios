//! Resolución de conflictos LWW para entidades de ficha (NO stock, NO balances).
//!
//! Criterio (offline-first, sin depender solo del reloj de pared):
//! 1. lamport más alto gana
//! 2. si empatan: `origin_device` lexicográficamente mayor
//! 3. si empatan: `updated_at` lexicográfico (desempate débil)

use serde_json::Value;

pub trait ConflictPolicy {
    fn should_accept_remote(
        &self,
        remote_lamport: i64,
        remote_device: &str,
        remote_updated_at: Option<&str>,
        local_lamport: i64,
        local_device: Option<&str>,
        local_updated_at: Option<&str>,
    ) -> bool;
}

pub struct LamportDeviceWins;

impl ConflictPolicy for LamportDeviceWins {
    fn should_accept_remote(
        &self,
        remote_lamport: i64,
        remote_device: &str,
        remote_updated_at: Option<&str>,
        local_lamport: i64,
        local_device: Option<&str>,
        local_updated_at: Option<&str>,
    ) -> bool {
        use std::cmp::Ordering;
        match remote_lamport.cmp(&local_lamport) {
            Ordering::Greater => true,
            Ordering::Less => false,
            Ordering::Equal => {
                let local_dev = local_device.unwrap_or("");
                match remote_device.cmp(local_dev) {
                    Ordering::Greater => true,
                    Ordering::Less => false,
                    Ordering::Equal => match (remote_updated_at, local_updated_at) {
                        (Some(r), Some(l)) => r >= l,
                        (Some(_), None) => true,
                        (None, Some(_)) => false,
                        (None, None) => true,
                    },
                }
            }
        }
    }
}

/// Compat alias usado en tests antiguos.
pub type LastWriteWins = LamportDeviceWins;

pub fn payload_updated_at(payload: &Value) -> Option<&str> {
    payload
        .get("updated_at")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lamport_primary() {
        let p = LamportDeviceWins;
        assert!(p.should_accept_remote(10, "a", Some("2020-01-01"), 5, Some("z"), Some("2099-01-01")));
        assert!(!p.should_accept_remote(4, "z", Some("2099-01-01"), 5, Some("a"), Some("2020-01-01")));
    }

    #[test]
    fn device_tiebreak() {
        let p = LamportDeviceWins;
        let ts = "2026-07-14 12:00:00";
        assert!(p.should_accept_remote(5, "caja2", Some(ts), 5, Some("caja1"), Some(ts)));
        assert!(!p.should_accept_remote(5, "caja1", Some(ts), 5, Some("caja2"), Some(ts)));
    }

    #[test]
    fn updated_at_last_resort() {
        let p = LamportDeviceWins;
        assert!(p.should_accept_remote(
            5,
            "same",
            Some("2026-07-14 12:00:00"),
            5,
            Some("same"),
            Some("2026-07-14 11:00:00")
        ));
    }
}
