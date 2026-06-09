fn write_oauth_artifacts(json: &str, embedded: &std::path::Path, bundle: &std::path::Path) {
    let _ = std::fs::write(embedded, json);
    let _ = std::fs::write(bundle, json);
    println!("cargo:rustc-cfg=mp_oauth_embedded");
    println!("cargo:warning=MP OAuth: credenciales embebidas en este build.");
}

fn creds_from_env() -> Option<String> {
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

fn main() {
    println!("cargo::rustc-check-cfg=cfg(mp_oauth_embedded)");

    let creds_path = std::path::Path::new("credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.example.json");
    println!("cargo:rerun-if-env-changed=MP_CLIENT_ID");
    println!("cargo:rerun-if-env-changed=MP_CLIENT_SECRET");

    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let embedded = out_dir.join("mp_oauth_embedded.json");
    let bundle_path = std::path::Path::new("credentials/mp_oauth.bundle.json");

    let mut embedded_ok = false;

    if let Some(json) = creds_from_env() {
        write_oauth_artifacts(&json, &embedded, bundle_path);
        embedded_ok = true;
    } else if creds_path.exists() {
        if let Ok(mut json) = std::fs::read_to_string(creds_path) {
            if json.starts_with('\u{feff}') {
                json = json.trim_start_matches('\u{feff}').to_string();
            }
            let valid = !json.contains("TU_APP_ID")
                && !json.contains("TU_CLIENT_SECRET")
                && json.contains("client_id")
                && json.contains("client_secret");
            if valid {
                write_oauth_artifacts(&json, &embedded, bundle_path);
                embedded_ok = true;
            } else {
                let _ = std::fs::write(bundle_path, "{}\n");
                println!("cargo:warning=MP OAuth: mp_oauth.json tiene placeholders; el botón Conectar no aparecerá.");
            }
        }
    }

    if !embedded_ok {
        let _ = std::fs::remove_file(&embedded);
        let _ = std::fs::write(bundle_path, "{}\n");
        println!("cargo:warning=MP OAuth: sin credenciales; el instalador no tendrá botón Conectar MP.");
    }

    tauri_build::build();
}
