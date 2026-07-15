use serde_json::Value;

/// Política de resolución de conflictos entre payload remoto y fila local.
pub trait ConflictPolicy {
    /// `true` = aceptar el remoto (sobrescribir local).
    fn should_accept_remote(
        &self,
        remote_updated_at: Option<&str>,
        remote_lamport: i64,
        local_updated_at: Option<&str>,
        local_lamport: i64,
    ) -> bool;
}

/// Last-Write-Wins por `updated_at` (string lexicográfico ISO-like) + desempate lamport.
///
/// **Importante:** el stock de `products` NUNCA usa LWW. Los movimientos de stock
/// se aplican de forma aditiva en el applier; el payload de producto puede incluir
/// `stock` solo informativo y el applier lo ignora.
pub struct LastWriteWins;

impl ConflictPolicy for LastWriteWins {
    fn should_accept_remote(
        &self,
        remote_updated_at: Option<&str>,
        remote_lamport: i64,
        local_updated_at: Option<&str>,
        local_lamport: i64,
    ) -> bool {
        match (remote_updated_at, local_updated_at) {
            (Some(r), Some(l)) => match r.cmp(l) {
                std::cmp::Ordering::Greater => true,
                std::cmp::Ordering::Less => false,
                std::cmp::Ordering::Equal => remote_lamport >= local_lamport,
            },
            (Some(_), None) => true,
            (None, Some(_)) => false,
            (None, None) => remote_lamport >= local_lamport,
        }
    }
}

/// Extrae `updated_at` de un payload JSON si existe.
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
    fn lww_prefers_newer_updated_at() {
        let p = LastWriteWins;
        assert!(p.should_accept_remote(Some("2026-07-14 12:00:00"), 1, Some("2026-07-14 11:00:00"), 99));
        assert!(!p.should_accept_remote(Some("2026-07-14 10:00:00"), 99, Some("2026-07-14 11:00:00"), 1));
    }

    #[test]
    fn lww_lamport_tiebreak() {
        let p = LastWriteWins;
        let ts = "2026-07-14 12:00:00";
        assert!(p.should_accept_remote(Some(ts), 10, Some(ts), 5));
        assert!(!p.should_accept_remote(Some(ts), 4, Some(ts), 5));
        assert!(p.should_accept_remote(Some(ts), 5, Some(ts), 5));
    }
}
