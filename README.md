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
- Run tests: `npm test`

## Settings Storage

App settings are loaded/saved through the Rust settings layer in `ssnip-core/src/settings.rs` and consumed in the UI store (`ssnip-ui/store/appStore.ts`).

## Notes

- Sidecar binaries are not tracked except `ssnip-core/binaries/README.txt`.
- Build artifacts (`dist/`, `target/`) and local tooling config are gitignored.