fn main() {
    // Expose the build target triple so recorder.rs can resolve the ffmpeg
    // sidecar by its suffixed filename during `cargo tauri dev`.
    let triple = std::env::var("TARGET").unwrap_or_else(|_| "unknown".into());
    println!("cargo:rustc-env=HOST_TRIPLE_FALLBACK={triple}");
    tauri_build::build()
}
