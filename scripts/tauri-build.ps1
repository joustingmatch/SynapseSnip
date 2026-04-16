param(
  [string]$KeyPath = $env:TAURI_SIGNING_PRIVATE_KEY_PATH,
  [string]$KeyPassword = $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD
)

# If the private key is not already in env, load it from a file.
if (-not $env:TAURI_SIGNING_PRIVATE_KEY) {
  if (-not $KeyPath) {
    $defaultPath = Join-Path $env:USERPROFILE ".tauri\synapsesnip.key"
    if (Test-Path -LiteralPath $defaultPath) {
      $KeyPath = $defaultPath
    }
  }

  if (-not $KeyPath -or -not (Test-Path -LiteralPath $KeyPath)) {
    Write-Error "Missing signing key. Set TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH to your private key file."
    exit 1
  }

  $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $KeyPath -Raw
}

if ($KeyPassword) {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KeyPassword
}

npm run tauri build