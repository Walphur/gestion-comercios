use thiserror::Error;

#[derive(Debug, Error)]
pub enum LanSyncError {
    #[error("base de datos: {0}")]
    Database(String),

    #[error("IO: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP: {0}")]
    Http(String),

    #[error("autenticación: {0}")]
    Auth(String),

    #[error("red: {0}")]
    Network(String),

    #[error("configuración: {0}")]
    Config(String),

    #[error("protocolo: {0}")]
    Protocol(String),

    #[error("estado inválido: {0}")]
    InvalidState(String),

    /// Dependencia aún no presente (ej. movimiento antes que producto). Reintentar.
    #[error("dependencia pendiente: {0}")]
    Dependency(String),

    /// Conflicto de integridad (UNIQUE/FK). Debe ir a cola de conflictos.
    #[error("conflicto: {0}")]
    Conflict(String),

    #[error("{0}")]
    Other(String),
}

impl From<String> for LanSyncError {
    fn from(value: String) -> Self {
        LanSyncError::Other(value)
    }
}

impl From<&str> for LanSyncError {
    fn from(value: &str) -> Self {
        LanSyncError::Other(value.to_string())
    }
}

impl LanSyncError {
    pub fn db(e: impl ToString) -> Self {
        let s = e.to_string();
        if is_constraint_msg(&s) {
            return LanSyncError::Conflict(s);
        }
        LanSyncError::Database(s)
    }

    pub fn is_dependency(&self) -> bool {
        matches!(self, LanSyncError::Dependency(_))
    }

    pub fn is_conflict(&self) -> bool {
        matches!(self, LanSyncError::Conflict(_))
    }
}

fn is_constraint_msg(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    lower.contains("unique")
        || lower.contains("constraint")
        || lower.contains("foreign key")
}

pub type LanResult<T> = Result<T, LanSyncError>;
