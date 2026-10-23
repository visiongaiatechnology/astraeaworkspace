# Third-party notices

Astraea Workspace Open Core is licensed under `AGPL-3.0-only` (see [LICENSE](LICENSE)). Third-party
components remain under their own licenses. This file summarises the components that are visibly
bundled or declared in this source tree; it is not a substitute for the full license texts shipped by
the respective projects.

## Rust dependencies

The Rust workspace resolves its dependencies through [Cargo.lock](Cargo.lock). The declared license
policy is checked with `cargo deny check` using [deny.toml](deny.toml). Dependency license texts are
provided by the individual crates in the Cargo registry when building; review and retain them for a
binary distribution.

## Frontend dependencies

The UI dependency graph is pinned in [ui/package-lock.json](ui/package-lock.json). It includes React,
the Tauri JavaScript API, Lucide icons, and build/test tooling. Their license terms are those of the
respective upstream packages (for example MIT/ISC/Apache-2.0); retain the license notices required by
the exact dependency versions in a binary distribution.

## PDF.js

`ui/public/vendor/pdfjs/` contains a vendored Mozilla PDF.js worker and display module. The upstream
version is recorded in [ui/public/vendor/pdfjs/README.md](ui/public/vendor/pdfjs/README.md); the
upstream license notice is embedded in the worker file, and the upstream project is Apache-2.0. Keep
the notice intact when redistributing the bundled worker.

## Branding and documentation assets

Astraea branding, application icons, screenshots and product documents are part of the
VisionGaiaTechnology Astraea Workspace product. The multilingual product PDFs and README translations
under `docs/product/` were supplied as project documentation by the project owner. Do not assume that
third-party trademarks, fonts or external links mentioned in those documents grant additional rights.

## Fonts and external services

This source tree does not require a runtime CDN for fonts, scripts or styles. The application uses
locally installed/system typography. External links in documentation are references, not runtime
dependencies.
