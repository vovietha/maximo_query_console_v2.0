# Maximo SQL Query Console — Tauri edition

Maximo SQL Query Console is a Tauri 2 desktop application for querying Maximo.

## Stack

- Tauri 2 + Rust for the desktop shell and Maximo HTTP calls. The Maximo password is stored in Windows Credential Manager.
- Vite for local development and static packaging.
- Existing HTML/CSS/JavaScript UI, with CodeMirror and SheetJS bundled locally so the UI does not depend on a CDN at runtime.
- No local Express server or localhost port.

## Requirements

- Node.js 20 or newer and npm.
- Rust stable with the MSVC toolchain.
- Microsoft C++ Build Tools (Desktop development with C++).
- WebView2 Runtime on the target Windows PC. It is included with supported Windows versions; the installer uses the WebView2 bootstrapper when needed.

See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/) before building.

## Run in development

From this directory:

```powershell
npm install
npm run tauri dev
```

Open the app through this command (or the installed Tauri app). Opening `public/index.html` directly or visiting the Vite page in a normal browser does not provide Tauri's Rust bridge, credential storage, or Maximo commands.

The first run copies the UI libraries from `node_modules` into the local frontend assets.

## Build Windows installer

```powershell
npm run tauri build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`. For a signed installer that can participate in automatic updates, configure the updater key as described in **GitHub release and updates** below.

## Publish to GitHub and release

Create an empty **public** GitHub repository, then publish this source once:

```powershell
npm run publish -- https://github.com/OWNER/REPO.git
```

Before the first release, generate a Tauri updater key on your development PC:

```powershell
npm run tauri signer generate -- -w "$env:USERPROFILE\.tauri\maximo-query.key"
```

Keep the private key and passphrase safe. Copy the public key printed by the command into `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`. In the GitHub repository, add Actions secrets named `TAURI_SIGNING_PRIVATE_KEY` (the private key file contents) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (its passphrase). Never commit or send the private key to anyone.

After the repository URL and public key are set in `src-tauri/tauri.conf.json`, create a release with one command:

```powershell
npm run release -- patch
```

Use `minor`, `major`, or an exact version such as `2.1.0` when needed. The command synchronizes app versions, commits and tags the release, and pushes it. GitHub Actions then builds the Windows installer and updater files and publishes a GitHub Release. Users with an installed updater-enabled build are notified when a newer release is available and can install it from the prompt.

For a local Windows build, run `npm run build:app`. A signed updater build also needs the signing key and passphrase in `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in the current PowerShell session.

## Notes

- Configure the Maximo host, context, username, and password in the app's connection dialog. Host, context, and username remain in browser-local settings; the password is stored in Windows Credential Manager and read by Rust only when making a request.
- On startup, a password left by an older version in `localStorage` is migrated to Windows Credential Manager and removed from browser-local settings after a successful save.
- The SheetJS export library is loaded only when Excel export is requested, reducing initial frontend parsing and memory use.
- `Safe Mode` is checked in the Rust command as well as the UI.
- SQL pagination retains the existing Oracle `ROWNUM` behavior and 50-row pages.
- The updater accepts only signed releases. The first build that includes the Tauri updater must be installed manually; later builds can update through GitHub Releases.
- Do not enable remote navigation in this desktop window. The UI and its libraries are packaged with the app.
