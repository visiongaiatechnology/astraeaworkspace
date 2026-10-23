# Windows installer (Inno Setup)

The Windows installer is built from [AstraeaWorkspace-Alpha.iss](AstraeaWorkspace-Alpha.iss) with
[Inno Setup](https://jrsoftware.org/isinfo.php) 6.7+ or 7.x. It is an Alpha packaging path and the
resulting installer is **unsigned** unless an external signing process is applied.

## Prerequisites

- Windows 10/11 x64
- Rust stable toolchain and the Tauri CLI 2.x
- Node.js 22+ and npm (for the UI build)
- Inno Setup 6.7+ or 7.x (`winget install JRSoftware.InnoSetup`)
- Optional: a WebView2 Evergreen runtime is expected on the target machine. The build script can
  document or bundle runtime bootstrappers only when explicitly requested.

## Build

```powershell
# Full build: UI + release EXE, then installer and portable ZIP
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-installer.ps1 -Clean

# Reuse an already built target\release\vgt-desktop.exe
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-installer.ps1 -SkipBuild -Clean

# Portable ZIP only (no Inno Setup required)
powershell -NoProfile -ExecutionPolicy Bypass -File .\build-installer.ps1 -SkipBuild -PortableOnly
```

Generated files are written under `build/` and `dist/` and are ignored by Git. The installer sources
include the DE/EN license and Alpha notice pages and an optional user data deletion decision during
uninstall.

## Status and limits

- The installer is not signed in this Alpha snapshot.
- Interactive wizard flows and real target-machine runtime installation must be tested on supported
  Windows hardware as part of release validation.
- Inno Setup 7 requires its own license for commercial distribution; Inno Setup 6.7.3 or a valid
  Inno Setup 7 license is required for a licensed commercial build.


