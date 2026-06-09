fn main() {
    println!("cargo::rustc-check-cfg=cfg(mp_oauth_embedded)");

    let creds_path = std::path::Path::new("credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.example.json");

    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let embedded = out_dir.join("mp_oauth_embedded.json");

    let bundle_path = std::path::Path::new("credentials/mp_oauth.bundle.json");

    if creds_path.exists() {
        if let Ok(json) = std::fs::read_to_string(creds_path) {
            let valid = !json.contains("TU_APP_ID")
                && !json.contains("TU_CLIENT_SECRET")
                && json.contains("client_id")
                && json.contains("client_secret");
            if valid {
                let _ = std::fs::write(&embedded, &json);
                let _ = std::fs::write(bundle_path, json);
                println!("cargo:rustc-cfg=mp_oauth_embedded");
                println!("cargo:warning=MP OAuth: credenciales embebidas en este build.");
            } else {
                let _ = std::fs::write(bundle_path, "{}\n");
                println!("cargo:warning=MP OAuth: mp_oauth.json tiene placeholders; el botón Conectar no aparecerá.");
            }
        }
    } else {
        let _ = std::fs::remove_file(&embedded);
        let _ = std::fs::write(bundle_path, "{}\n");
        println!("cargo:warning=MP OAuth: sin credentials/mp_oauth.json; compilá con credenciales para vincular MP.");
    }

    tauri_build::build();
}
