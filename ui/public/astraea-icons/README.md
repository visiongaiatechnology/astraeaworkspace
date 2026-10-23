# Astraea Workspace application icons

The official Workspace mark is the byte-exact locally bundled image supplied for Astraea Workspace at `branding/astraea-workspace-official.png`. Square PNG derivatives in `png/<size>/astraea-workspace.png` preserve the mark on transparent square canvases for app icons, favicons, and touch icons. The legacy `svg/astraea-workspace.svg` path references that same local official image so older integrations retain the current brand identity. Tauri's Windows, macOS, and Linux icon assets are generated from these local variants with `scripts/generate-desktop-brand-icons.py`.

Product-module icons remain separate functional marks in `svg/` and their PNG derivatives. They are not replaced with the Workspace logo.
