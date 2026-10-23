# VGT Workspace Security Policy

## Security model

VGT Workspace is designed around local-first processing, explicit trust boundaries, encrypted native containers and minimal network authority. This document describes what the current source actually implements; it is not a claim of formal certification or third-party audit.

### Document encryption

Native VWC documents are packed by the Rust core. The current container design uses:

- random 256-bit document encryption keys,
- AES-256-GCM authenticated encryption for document chunks,
- authenticated container metadata as AAD,
- Argon2id for PIN/password derivation,
- HKDF-SHA-256 for combined Device+PIN unlock material,
- explicit resource ceilings for container size, metadata, chunk count and chunk size.

A Device+PIN policy does not create a separate DeviceOnly slot; both device WMK and PIN-derived material are required.

### Workspace Master Key persistence

- **Windows:** DPAPI.
- **macOS:** native Keychain Services (`Security.framework`).
- **Linux:** freedesktop Secret Service through `secret-tool` when available.
- **No supported native provider:** fail closed. The core does not fall back to a hard-coded, machine-ID-derived or deterministic master secret.

DPAPI/Keychain/Secret Service availability does not by itself prove TPM/Secure-Enclave backing. The runtime therefore does not report hardware-backed storage unless it can be established separately.

The core performs best-effort in-process wiping of the WMK when locking/dropping the vault. This is not a guarantee that copies can never exist in compiler, OS, swap, crash-dump or hardware-managed memory.

### IPC boundary

The development IPC service:

- binds only to `127.0.0.1`,
- applies request/header/body ceilings and timeouts,
- validates browser `Origin` against the supported local UI origins,
- rejects disallowed browser origins before protected requests are processed.

The production desktop architecture should replace or further bind this development loopback boundary to a native process/session-specific IPC transport.

### NetGate

`vgt-netgate` applies explicit per-component/per-document capabilities covering exact destination, port, protocol, direction, data class, purpose and bounded rate/size/time ceilings. `SovereignConnector` performs capability preflight before DNS, revalidates every resolved IP, and opens the already-resolved TCP address only after policy approval.

NetGate is **not** an OS-global packet interception driver or OS-wide firewall. Code that bypasses the connector is outside that enforcement boundary; architectural review must prevent such bypasses in network-capable Workspace modules. The implementation is in `crates/vgt-netgate/` with integration and boundary tests in that crate.

### Vault integrity

Vault UI verification uses SHA-256 over actual stored attachment bytes or stable/canonical document data. VWC itself relies on AEAD authentication for encrypted-container integrity. BLAKE3 utilities also exist in the Rust crypto crate for content-addressing/test use, but the UI Vault verifier must not be described as BLAKE3 unless it actually uses that path.

### Workspace Fabric / Live Object Linking

Live references do not embed source object content. They carry bounded identity/version/type and permission provenance only. A semantic snapshot is embedded only by an explicit `FROZEN` transition. If source permission is lost, a normal LIVE reference resolves to `permission-lost` without rendering a cached payload.

Remote source resolution requires an explicit source-scoped transport capability. The dependency graph rejects cycles, batches/coalesces source changes, and keeps broken links inspectable for relinking. Export to foreign formats requires an explicit refresh/freeze policy; preservation of LIVE references is limited to the native Workspace container path.

### Imported content

Imported data is hostile input. Relevant parsers and import paths should enforce:

- maximum container/archive expansion,
- maximum file/object/image sizes,
- recursion/depth limits,
- path-jail checks,
- no automatic macro execution,
- isolated processing for formats that require complex parsers.

## Reporting a vulnerability

Use a private security reporting channel controlled by the repository owner. If this project is hosted on GitHub, enable and prefer **GitHub Security Advisories / private vulnerability reporting** for the repository. Do not publish exploit details in a public issue before maintainers have had a reasonable opportunity to assess the report.

A useful report includes:

1. affected component and version/commit,
2. reproduction steps or minimal PoC,
3. expected vs. actual security boundary,
4. impact analysis,
5. suggested remediation if known.

No response-time SLA, PGP key or email address is asserted here unless the project owner configures and publishes one.

## Release verification

Before a security-sensitive release, run at minimum:

```bash
cargo fmt --all -- --check
cargo test --workspace
cargo run -p vgt-cli -- security-audit
cd ui
npm ci
npm run typecheck
npm run build
```

Also run the application-level regression and export validation described in `docs/BUILD_AND_VERIFY.md` and `docs/FINAL_RELEASE_AUDIT.md`.

## Update and release integrity

Astraea update authenticity is anchored by a compile-time Ed25519 release public key and monotonic release sequence. Signed release manifests bind package SHA-256 values, target platform/architecture, release channel, SBOM and dependency-inventory digests, and any explicitly authorized rollback transition. Normal downgrades fail closed. Recovery downgrades require a signed authorization from the current compiled sequence to the target sequence.

Release artifacts are expected to include `SHA256SUMS.txt`, an SPDX SBOM, dependency/license inventory, build provenance, and a signed Astraea release manifest. Native platform code signing/notarization remains an additional requirement for public production distribution where the platform supports it. See `docs/UPDATE_RELEASE_INTEGRITY.md`.


### Diagnostics and recovery safe mode

Diagnostics are local by default and omit document bodies, titles, document IDs and secret material unless a user explicitly approves an eligible reproduction payload. Export preview is byte-exact: the serialized JSON shown for review is the same serialized payload accepted for local export. Debug logging is time-bounded and visible.

Recovery Safe Mode denies third-party plugins, automations and network egress, including GaiaCom node/mDNS exceptions. Workspace configuration validation and search-index repair operate on bounded local inputs. Plugin diagnosis inspects package integrity/compatibility without loading plugin code. See `docs/DIAGNOSTICS_UPDATE_RELEASE_ENGINE.md`.

## Search Index Engine

Workspace full-text search is derived state. `vgt-search` schema v3 stores ACL-partitioned postings and is persisted only as an authenticated encrypted index. Search history is off by default. Permission-filtered facets and local vectors cannot disclose locked or unauthorized documents. Corrupt indexes are rebuilt; they never become a prerequisite for opening authoritative WOM documents.

### Automation Runtime boundary
Automation has no ambient filesystem, network, clipboard or secret access. Actions receive explicit opaque capability handles plus a deadline/cancellation context. HTTP remains mediated by NetGate; secret material remains opaque/KeyVault-backed. Durable wait/approval checkpoints are authenticated-encrypted and resume is rejected when the activated flow version/digest or external-state assumption digest changes. Script/RPA execution is restricted to importless WASM or out-of-process workers, and every proposed Workspace mutation must be revalidated by the authoritative Workspace operation core before commit.

## Policy Engine boundary

Managed policy is declarative, versioned and deny-by-default for sensitive capabilities. Official native IPC paths repeat policy authorization at the action boundary; UI checks are UX-only. Policy expressions cannot execute arbitrary code. Signed offline bundles support air-gapped managed systems, and decision/change logs contain bounded metadata rather than document content or request secrets.

## Theme/template/asset boundary

Theme/template metadata never creates a second media parser or network loader. Remote assets do not auto-fetch and usable assets require Media Engine verification receipts. Third-party templates are inert data and active script/macro/shell/exec declarations are rejected. Native template instantiation remaps the WOM identity graph and removes instance-only state before the new document is admitted.
