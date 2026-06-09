fn main() {
    println!("cargo::rustc-check-cfg=cfg(mp_oauth_embedded)");

    let creds_path = std::path::Path::new("credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.json");
    println!("cargo:rerun-if-changed=credentials/mp_oauth.example.json");

    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let embedded = out_dir.join("mp_oauth_embedded.json");

    if creds_path.exists() {
        if let Ok(json) = std::fs::read_to_string(creds_path) {
            let _ = std::fs::write(&embedded, json);
            println!("cargo:rustc-cfg=mp_oauth_embedded");
        }
    } else if std::fs::remove_file(&embedded).is_ok() {
        // Sin credenciales en este build.
    }

    tauri_build::build();
}
