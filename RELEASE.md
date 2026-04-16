# Release Process

Use this checklist whenever you want a new private release build.

## 1) Update Versions Together

Bump the same version in all three files:

- `package.json`
- `ssnip-core/tauri.conf.json`
- `ssnip-core/Cargo.toml`

## 2) Verify

- `npm test`
- `npm run build`
- `npm run tauri:build:signed`

If you see `A public key has been found, but no private key`, set:

- `$env:TAURI_SIGNING_PRIVATE_KEY_PATH="$env:USERPROFILE\.tauri\synapsesnip.key"`
- `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-password"` (only if your key has one)

## 3) Commit

Commit with a clear message, for example:

`chore(release): bump version to v0.1.1`

## 4) Launch Check

After installing the new build, open the app once and confirm:

- update banner appears in main UI
- capture and save path still work
- hotkeys still register
