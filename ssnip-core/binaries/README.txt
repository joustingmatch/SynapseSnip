FFmpeg sidecar binaries.

Tauri's `bundle.externalBin` (see tauri.conf.json) expects one ffmpeg
binary per build target, named with the Rust target triple:

  ffmpeg-x86_64-pc-windows-msvc.exe   (Windows 64-bit)
  ffmpeg-aarch64-pc-windows-msvc.exe  (Windows ARM64)
  ffmpeg-x86_64-apple-darwin          (macOS Intel)
  ffmpeg-aarch64-apple-darwin         (macOS Apple Silicon)
  ffmpeg-x86_64-unknown-linux-gnu     (Linux 64-bit)

For Windows, grab the FFmpeg essentials build:
  https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
Extract `bin/ffmpeg.exe` and rename it to match your target triple.

Find your triple with `rustc -vV | grep host`.

During `cargo tauri dev` and `cargo tauri build` the matching binary
is copied next to the app executable automatically.
