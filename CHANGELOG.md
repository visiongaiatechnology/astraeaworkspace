# Changelog

## Alpha 0.1 — 2026-10

This repository is the first public Open Core Alpha source snapshot. It includes the Rust workspace,
React/Tauri desktop shell, local document formats, test suites, security policy and Windows packaging
tooling.

### Included in this snapshot

- Local-first desktop shell and workspace document model.
- Writer, Grid, Present, Notes, Tasks, Whiteboard, PDF Studio, Draw, Publish, Insight, Connect,
  Automate and Vault modules at their Alpha maturity level.
- Authenticated encrypted container support, Vault handling and local recovery paths as described in
  SECURITY.md.
- Start Center, app overview, onboarding and app guides.
- Updated Whiteboard and Publish toolbars, live Grid-to-Writer references and honest availability
  labels for incomplete modules.
- Windows installer sources under `release/inno/` (unsigned).

### Known limitations

- Alpha maturity: incomplete features, rough edges and possible errors.
- No cloud sync, real-time collaboration or AI assistant in Open Core.
- Unsigned installers and binaries until signing is configured.
- Some modules remain preview-only or deliberately limited.
- Product whitepapers under `docs/product/` describe direction and may be ahead of implementation.
