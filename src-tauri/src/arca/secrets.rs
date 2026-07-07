//! Cifrado en reposo de certificado y clave privada (AES-256-GCM).

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};
use base64::Engine as _;
use sha2::{Digest, Sha256};

fn machine_key() -> [u8; 32] {
    let machine_id = crate::license::get_machine_id();
    let digest = Sha256::digest(format!("arca-secure-v1:{machine_id}").as_bytes());
    let mut key = [0u8; 32];
    key.copy_from_slice(&digest);
    key
}

/// Cifra un texto (PEM) y devuelve `base64(nonce(12) || ciphertext)`.
pub fn encrypt_secret(plain: &str) -> Result<String, String> {
    let key_bytes = machine_key();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes).map_err(|e| format!("RNG no disponible: {e}"))?;
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plain.as_bytes())
        .map_err(|_| "No se pudo cifrar el material sensible.".to_string())?;

    let mut blob = Vec::with_capacity(12 + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(blob))
}

/// Descifra un valor previamente producido por [`encrypt_secret`].
pub fn decrypt_secret(stored: &str) -> Result<String, String> {
    let blob = base64::engine::general_purpose::STANDARD
        .decode(stored.trim())
        .map_err(|e| format!("Dato cifrado inválido: {e}"))?;
    if blob.len() <= 12 {
        return Err("Dato cifrado incompleto.".to_string());
    }
    let (nonce_bytes, ciphertext) = blob.split_at(12);

    let key_bytes = machine_key();
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));

    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| {
            "No se pudo descifrar el certificado/clave (¿la base se copió de otra PC?).".to_string()
        })?;
    String::from_utf8(plaintext).map_err(|e| format!("Contenido descifrado inválido: {e}"))
}
