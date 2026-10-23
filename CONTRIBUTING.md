# Contributing

Astraea Workspace Open Core is an Alpha project. Contributions are welcome through focused bug
reports and small, reviewable pull requests; large speculative rewrites are unlikely to be merged
during Alpha hardening.

## Before opening a pull request

- Read [SECURITY.md](SECURITY.md) and never include credentials, private keys, personal data or
  unpatched exploit details in an issue, pull request, test fixture or commit message.
- Keep changes scoped. Do not mix unrelated refactors, formatting sweeps or generated build outputs.
- Describe the affected component and the user-visible behaviour, including limitations.
- Use the AGPL-3.0-only license terms for contributions.

## Local verification

Run the checks that are available for the area you changed:

```powershell
npm ci --prefix ui
npm --prefix ui run verify
cargo test --workspace --all-targets
cargo deny check
```

If a check cannot run on your machine, say so explicitly in the pull request. Not running a check is
not a pass.

## Security reports

Do not open a public issue for a suspected vulnerability. Use the private reporting channel described
in [SECURITY.md](SECURITY.md) and allow maintainers time to assess the report.
