# SynapseSnip

Personal screenshot and screen recording tool built with Tauri v2 (Rust core + React/Vite UI).

## Requirements

- Node.js 18+
- Rust toolchain (`rustup`)
- Tauri prerequisites for Windows

## Project Structure

- `ssnip-ui/` React UI code
- `ssnip-core/` Tauri/Rust app core
- `ssnip-docs/` design/project notes

## Commands

- Install deps: `npm install`
- Run web dev server: `npm run dev`
- Run desktop app in dev: `npm run tauri dev`
- Build frontend: `npm run build`
- Build desktop app: `npm run tauri build`
- Build desktop app with updater signing: `npm run tauri:build:signed`
- Run tests: `npm test`

## Updater Signing (Local)

If updater signing is enabled in `ssnip-core/tauri.conf.json`, local release builds require a private key.

1. Set the key file path once in your PowerShell profile or current shell:
   `$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\synapsesnip.key"`
2. If your key is password-protected, also set:
   `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"`
3. Build with:
   `npm run tauri:build:signed`

## Settings Storage

App settings are loaded/saved through the Rust settings layer in `ssnip-core/src/settings.rs` and consumed in the UI store (`ssnip-ui/store/appStore.ts`).

## Notes

- Sidecar binaries are not tracked except `ssnip-core/binaries/README.txt`.
- Build artifacts (`dist/`, `target/`) and local tooling config are gitignored.
