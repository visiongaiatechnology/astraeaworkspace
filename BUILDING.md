# Building Astraea Workspace Open Core

This file keeps the source build and verification instructions for the Alpha 0.1 source snapshot.

Astraea Workspace is a local-first desktop productivity workspace for Windows. Documents and
workspace state are stored locally, optionally inside authenticated encrypted containers, and core
workflows do not require a cloud account. This repository contains the Open Core source tree.

**Status: Alpha 0.1 — preview / under construction.** This is not a production or security-audited
release. Installers are unsigned unless a separate signing process is supplied. Use backups for
important data and expect incomplete features.

## What is included

Open Core provides Writer, Grid, Present, Notes, Tasks, Whiteboard, PDF Studio, Draw, Publish,
Insight, Connect, Automate and Vault, plus the read-only, gated Admin & Policy view. Core modules and
incomplete modules are labelled honestly in the application. Some features are previews or
deliberately limited in this Alpha; see the app maturity table in the
[README](README.md).

The technical architecture, trust boundaries and current security model are documented in
[ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md). Product whitepapers and the
supplied multilingual product documentation are at the repository root (`README.<lang>.md` and the PDF files).

## Requirements

- Windows 10/11 x64 with WebView2
- Rust stable toolchain
- Node.js 22+ with npm
- Tauri CLI 2.x for desktop builds: `cargo install tauri-cli --version "^2" --locked`
- Optional: Inno Setup 6.7+ or 7.x for the Windows installer

## Build and verify

```powershell
npm ci --prefix ui
npm --prefix ui run verify
cargo test --workspace --all-targets
cargo tauri build --no-bundle
```

`npm --prefix ui run verify` runs the static security scan, UI tests, TypeScript checks and the
Open Core production build. The native executable is written by `cargo tauri build --no-bundle`.

Windows installer (optional, unsigned in this Alpha):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File release/inno/build-installer.ps1 -SkipBuild -Clean
```

See [release/inno/README.md](release/inno/README.md) for prerequisites and options. Build outputs,
local caches, credentials and internal working notes are intentionally not part of this repository.
