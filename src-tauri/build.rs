fn main() {
    let license_api_url = std::env::var("LICENSE_API_URL")
        .unwrap_or_else(|_| "https://gestion-comercios-license.walphur.workers.dev".to_string());
    println!("cargo:rustc-env=LICENSE_API_URL={license_api_url}");
    println!("cargo:rerun-if-env-changed=LICENSE_API_URL");

    tauri_build::build();
}
