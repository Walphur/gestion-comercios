fn write_mp_oauth_artifacts(json: &str, embedded: &std::path::Path, bundle: &std::path::Path) {
    let _ = std::fs::write(embedded, json);
    let _ = std::fs::write(bundle, json);
    println!("cargo:rustc-cfg=mp_oauth_embedded");
    println!("cargo:warning=MP OAuth: credenciales embebidas en este build.");
}

fn write_tn_oauth_artifacts(json: &str, embedded: &std::path::Path, bundle: &std::path::Path) {
    let _ = std::fs::write(embedded, json);
    let _ = std::fs::write(bundle, json);
    println!("cargo:rustc-cfg=tn_oauth_embedded");
    println!("cargo:warning=TN OAuth: credenciales embebidas en este build.");
}

fn mp_creds_from_env() -> Option<String> {
    let id = std::env::var("MP_CLIENT_ID").ok()?;
    let secret = std::env::var("MP_CLIENT_SECRET").ok()?;
    if id.trim().is_empty() || secret.trim().is_empty() {
        return None;
    }
    let redirect = std::env::var("MP_REDIRECT_URI").unwrap_or_else(|_| {
        "https://walphur.github.io/gestion-comercios/oauth/callback.html".to_string()
    });
    Some(format!(
        r#"{{"client_id":"{}","client_secret":"{}","redirect_uri":"{}"}}"#,
        id.trim().replace('\\', "\\\\").replace('"', "\\\""),
        secret.trim().replace('\\', "\\\\").replace('"', "\\\""),
        redirect.trim().replace('\\', "\\\\").replace('"', "\\\""),
    ))
}

fn tn_creds_from_env() -> Option<String> {
    let id = std::env::var("TN_CLIENT_ID").ok()?;
    let secret = std::env::var("TN_CLIENT_SECRET").ok()?;
    if id.trim().is_empty() || secret.trim().is_empty() {
        return None;
    }
    let redirect = std::env::var("TN_REDIRECT_URI").unwrap_or_else(|_| {
        "https://walphur.github.io/gestion-comercios/oauth/tn-callback.html".to_string()
    });
    Some(format!(
        r#"{{"client_id":"{}","client_secret":"{}","redirect_uri":"{}"}}"#,
        id.trim().replace('\\', "\\\\").replace('"', "\\\""),
        secret.trim().replace('\\', "\\\\").replace('"', "\\\""),
        redirect.trim().replace('\\', "\\\\").replace('"', "\\\""),
    ))
}

fn is_valid_oauth_json(json: &str) -> bool {
    !json.contains("TU_APP_ID")
        && !json.contains("TU_CLIENT_SECRET")
        && json.contains("client_id")
        && json.contains("client_secret")
}

fn embed_oauth_file(
    label: &str,
    creds_path: &std::path::Path,
    example_hint: &str,
    env_json: Option<String>,
    embedded: &std::path::Path,
    bundle_path: &std::path::Path,
    write: fn(&str, &std::path::Path, &std::path::Path),
) {
    let mut ok = false;
    if let Some(json) = env_json {
        write(&json, embedded, bundle_path);
        ok = true;
    } else if creds_path.exists() {
        if let Ok(mut json) = std::fs::read_to_string(creds_path) {
            if json.starts_with('\u{feff}') {
                json = json.trim_start_matches('\u{feff}').to_string();
            }
            if is_valid_oauth_json(&json) {
                write(&json, embedded, bundle_path);
                ok = true;
            } else {
                let _ = std::fs::write(bundle_path, "{}\n");
                println!(
                    "cargo:warning={label}: {example_hint} tiene placeholders; el botón Conectar no aparecerá."
                );
            }
        }
    }
    if !ok {
        let _ = std::fs::remove_file(embedded);
        let _ = std::fs::write(bundle_path, "{}\n");
        println!(
            "cargo:warning={label}: sin credenciales; el instalador no tendrá OAuth automático."
        );
    }
}

fn main() {
    println!("cargo::rustc-check-cfg=cfg(mp_oauth_embedded)");
    println!("cargo::rustc-check-cfg=cfg(tn_oauth_embedded)");

    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));

    // Mercado Pago
    println!("cargo:rerun-if-changed=credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.example.json");
    println!("cargo:rerun-if-env-changed=MP_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=MP_CLIENT_SECRET");
    embed_oauth_file(
        "MP OAuth",
        std::path::Path::new("credentials/mp_oauth.json"),
        "mp_oauth.json",
        mp_creds_from_env(),
        &out_dir.join("mp_oauth_embedded.json"),
        std::path::Path::new("credentials/mp_oauth.bundle.json"),
        write_mp_oauth_artifacts,
    );

    // Tienda Nube
    println!("cargo:rerun-if-changed=credentials/tn_oauth.json");
    println!("cargo:rerun-if-changed=credentials/tn_oauth.example.json");
    println!("cargo:rerun-if-env-changed=TN_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=TN_CLIENT_SECRET");
    embed_oauth_file(
        "TN OAuth",
        std::path::Path::new("credentials/tn_oauth.json"),
        "tn_oauth.json",
        tn_creds_from_env(),
        &out_dir.join("tn_oauth_embedded.json"),
        std::path::Path::new("credentials/tn_oauth.bundle.json"),
        write_tn_oauth_artifacts,
    );

    let license_api_url = std::env::var("LICENSE_API_URL")
        .unwrap_or_else(|_| "https://gestion-comercios-license.walphur.workers.dev".to_string());
    println!("cargo:rustc-env=LICENSE_API_URL={license_api_url}");
    println!("cargo:rerun-if-env-changed=LICENSE_API_URL");

    tauri_build::build();
}
