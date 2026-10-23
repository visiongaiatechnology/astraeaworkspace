> [!IMPORTANT]
> **Early Alpha 0.1 — not the planned Beta 0.1 release.**
>
> This repository publishes an **early Alpha 0.1 of Astraea Workspace**. The multilingual product documentation is under `docs/product/`. We have not reached the
> quality target we planned for **Beta 0.1**. The project is developed by **one independent
> developer**, and there is currently **no money available to accelerate development**. You are
> welcome to support the project: a donation helps fund development, and **issue reports help us
> find bugs we do not know yet**.
>
> **App maturity in this build**
>
> | Tier | Apps | What it means |
> | --- | --- | --- |
> | Early Beta (relative maturity) | Writer, Grid, Present, Notes, Tasks | Core workflows with tested core paths. Still early, incomplete in places and may contain bugs. |
> | Alpha | Whiteboard, Draw, PDF Studio, Publish, Insight, Connect, Automate, Vault, Admin & Policy | Preview, limited or gated apps. Features can be missing or change, and bugs are expected. Admin & Policy is read-only and gated; Vault is security-gate reviewed but still Alpha. |
> | Not included | Planner, Projects, Forms, Database, Spaces, GaiaCom | Premium-only; not part of Open Core. |
>
> **All apps in this build can contain errors. Do not use this early Alpha as the only copy of
> important data.** The overall release is **Early Alpha 0.1**, even where an app is listed as
> relative Early Beta.
>
> ### Support
>
> Independent development is funded by people who want this stack to exist. If you want to support the work:
>
> | Method | Address |
> | --- | --- |
> | PayPal | [paypal.me/dergoldenelotus](https://paypal.me/dergoldenelotus) |
> | Bitcoin | `bc1q3ue5gq822tddmkdrek79adlkm36fatat3lz0dm` |
> | ETH / USDT (ERC-20) | `0xD37DEfb09e07bD775EaaE9ccDaFE3a5b2348Fe85` |
>
> Bug reports and issues are just as valuable: please use the repository issue tracker so we can
> reproduce and fix problems.

<p align="center">
  <img src="docs/product/astraeaworkspace1.png" alt="Astraea Workspace" width="640"/>
</p>

<p align="center">
  <img alt="Status: Early Alpha 0.1" src="https://img.shields.io/badge/Status-Early%20Alpha%200.1-FFB300?style=for-the-badge"/>
  <img alt="Edition: Open Core" src="https://img.shields.io/badge/Edition-Open%20Core-00C853?style=for-the-badge"/>
  <img alt="License: AGPLv3" src="https://img.shields.io/badge/License-AGPLv3-00B0FF?style=for-the-badge"/>
  <img alt="Platform: Windows" src="https://img.shields.io/badge/Platform-Windows-24C8D8?style=for-the-badge"/>
</p>

# Astraea Workspace Open Core — Alpha 0.1

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
deliberately limited in this Alpha; see the app maturity table at the top of this file and in the
[multilingual product documentation](docs/product/README.md).

The technical architecture, trust boundaries and current security model are documented in
[ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md). Product whitepapers and the
supplied multilingual product documentation are under [docs/product](docs/product/README.md).

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

## Project documents

- [Architecture](ARCHITECTURE.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Product documentation and whitepapers](docs/product/README.md)
- [License](LICENSE) — GNU Affero General Public License v3.0 (`AGPL-3.0-only`)

## Known Alpha limitations

- The project is under active construction; some applications and workflows are incomplete.
- Installers and binaries are unsigned until release signing is configured.
- No cloud synchronization, real-time multi-user collaboration or AI assistant is included in the
  Open Core Alpha source tree.
- Security claims are limited to what [SECURITY.md](SECURITY.md) actually describes; there is no
  formal third-party certification.
- Product whitepapers and translations describe the product direction and may be ahead of the
  current implementation. The source, architecture and security documents in this repository are
  authoritative for the Alpha status.

## License

Astraea Workspace Open Core is licensed under the GNU Affero General Public License v3.0 only.
See [LICENSE](LICENSE), [NOTICE](NOTICE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
