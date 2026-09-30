<p align="center">
  <img src="./astraeaworkspace1.png" alt="Astraea Workspace" width="680"/>
</p>

<p align="center">
  <b>English</b> ·
  <a href="./README.de.md">Deutsch</a> ·
  <a href="./README.it.md">Italiano</a> ·
  <a href="./README.es.md">Español</a> ·
  <a href="./README.fr.md">Français</a> ·
  <a href="./README.ru.md">Русский</a>
</p>

<p align="center">
  <strong>A sovereign, local-first productivity workspace built for data ownership.</strong><br>
  <em>Local-first · Zero product telemetry by design · Authenticated encrypted containers · Post-quantum-capable security · Open Core</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Public%20Beta%20Pre--Release-FFB300?style=for-the-badge" alt="Public Beta Pre-Release"/>
  <img src="https://img.shields.io/badge/Core%20Milestone-3334%2F3334-00C853?style=for-the-badge&logo=checkmarx&logoColor=white" alt="Core milestone 3334/3334"/>
  <img src="https://img.shields.io/badge/Core-Rust%202021-DEA584?style=for-the-badge&logo=rust&logoColor=white" alt="Rust Core"/>
  <img src="https://img.shields.io/badge/Shell-Tauri%20v2-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2"/>
  <img src="https://img.shields.io/badge/UI-React%2019%20%7C%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React and TypeScript"/>
  <img src="https://img.shields.io/badge/License-AGPLv3-00B0FF?style=for-the-badge" alt="AGPLv3"/>
</p>

---

> [!IMPORTANT]
> ## Public release status
>
> **Astraea Workspace is in final pre-release hardening.**
>
> The core implementation milestone is complete. The current release pass is focused on edition separation, end-to-end workflow verification, the Workspace Explorer, design consistency, accessibility, localization, security evidence, packaging, and final regression testing.
>
> Official release bundles will be published only after the release gates pass. Until then, a checklist milestone must not be confused with a shipped, verified public release.

---

## What is Astraea Workspace?

Astraea Workspace is a desktop productivity suite designed around a simple principle:

**Your work should remain usable, understandable, and under your control even when no cloud service is available.**

It combines office editing, knowledge work, creative tools, automation, local search, encrypted storage, and cross-application workspace objects inside one desktop environment.

Core workflows are **local-first**. Networked features are explicit capabilities rather than a requirement for opening or editing your documents.

Astraea is not intended to be a reskinned collection of unrelated editors. Its applications share a common **Workspace Object Model (WOM)** so that compatible objects can be referenced, embedded, searched, automated, and reused across the suite.

### Product principles

- **Local-first by default** — core documents and workspace state remain local unless the user deliberately enables a networked capability.
- **Zero product analytics / telemetry by design** — no behavioural analytics pipeline is required for normal workspace operation.
- **Offline and air-gap capable** — core editing workflows are designed to operate without a cloud account or persistent Internet connection.
- **Open Core, free forever** — Astraea Open Core is licensed under GNU AGPLv3 and remains the permanently free foundation of the product.
- **Explicit Premium boundary** — Premium adds organization, structured team data, planning, spaces, and encrypted collaboration. It does not exist to make the free edition intentionally incomplete.
- **Cross-application objects** — Writer, Grid, Whiteboard, Publish, Insight, Automate and other applications can share compatible workspace objects instead of forcing everything through copy-and-paste.
- **Security described by concrete controls** — cryptographic primitives, key handling, network policy and release evidence are documented directly instead of relying on undefined marketing labels.

---

# Editions

## Astraea Open Core — Free forever

Astraea Open Core is the personal productivity foundation of the platform.

It is **free and open source under GNU AGPLv3**.

The applications listed as included in Open Core are intended to remain part of the free edition. Future Premium development may add new organizational capabilities, but the purpose of Open Core is to remain a real product rather than a time-limited demo.

## Astraea Premium — Organization, data and collaboration

Astraea Premium is the commercial superset.

It contains everything in Open Core and adds the six applications focused on project execution, structured business data, team spaces and encrypted multi-device collaboration.

> **Open Core is the sovereign personal office. Premium connects the organization around it.**

### Edition matrix

| Application | Open Core | Premium | Format | Primary role |
|---|:---:|:---:|:---:|---|
| **Astraea Writer** | ✅ | ✅ | `.vdoc` | Word processing, structured documents, tables, references and export |
| **Astraea Grid** | ✅ | ✅ | `.vgrid` | Multi-sheet spreadsheets, formulas, analysis and charts |
| **Astraea Present** | ✅ | ✅ | `.vpresent` | Slide presentations, scenes, media and presentation workflows |
| **Astraea Notes** | ✅ | ✅ | `.vnote` | Notes, personal knowledge management and linked knowledge |
| **Astraea PDF Studio** | ✅ | ✅ | `.vpdf` | PDF viewing, annotation, signatures and redaction workflows |
| **Astraea Tasks** | ✅ | ✅ | `.vtask` | Personal tasks, recurrence, priorities and workspace links |
| **Astraea Whiteboard** | ✅ | ✅ | `.vboard` | Infinite canvas, diagrams, mind maps and live workspace objects |
| **Astraea Vault** | ✅ | ✅ | `.vvault` | Encrypted credentials, protected files and sensitive workspace data |
| **Astraea Draw** | ✅ | ✅ | `.vdraw` | Vector drawing, layered artwork and SVG-oriented workflows |
| **Astraea Publish** | ✅ | ✅ | `.vpub` | Desktop publishing for structured page layouts and print-oriented output |
| **Astraea Insight** | ✅ | ✅ | `.vinsight` | Local dashboards, metrics and analytical views |
| **Astraea Connect** | ✅ | ✅ | `.vconnect` | Guarded external integrations and connector boundaries |
| **Astraea Automate** | ✅ | ✅ | `.vauto` | Deterministic local workflow automation |
| **Astraea Admin & Policy** | ✅* | ✅ | `.vpolicy` | Local policy, administration and security-relevant configuration |
| **Astraea Projects** | 🔒 | ✅ | `.vproj` | Projects, phases, dependencies, Gantt and risk planning |
| **Astraea Planner** | 🔒 | ✅ | `.vplan` | Kanban, workload, calendar and collaborative planning |
| **Astraea Database** | 🔒 | ✅ | `.vdb` | Typed relational no-code data models and workspace data views |
| **Astraea Forms** | 🔒 | ✅ | `.vform` | Form and survey design, conditional flows and structured responses |
| **Astraea Spaces** | 🔒 | ✅ | `.vspace` | Team spaces, roles, policy context and organization boundaries |
| **Astraea GaiaCom** | 🔒 | ✅ | `.vgcom` | Encrypted communication, mesh synchronization and collaboration transport |

\* Open Core includes the administration and policy surfaces that apply to Open Core itself. Premium-only operational policy features remain in Premium.

### Shared core surfaces

The following are Workspace platform features rather than separately monetized document applications:

- **Workspace Explorer / Library** — discover, organize, preview and reuse existing workspace documents.
- **Search** — local cross-application search.
- **Settings** — real persisted workspace and application preferences.
- **Guides** — interactive first-run and per-application guidance.
- **Recovery / diagnostics** — local recovery and troubleshooting surfaces.
- **Command palette and shell navigation** — shared workspace control plane.

---

# Workspace Explorer

Astraea Workspace includes a central **Workspace Explorer** so users do not need to know which application currently has a document open before they can reuse it.

The Explorer is designed to make saved work discoverable across the suite:

```text
All files
Recent
Open
Favorites
Collections
Search
Preview
Open source
Insert from Workspace
Drag & Drop
```

The important distinction is semantic.

A `.vgrid` dragged into Writer is not treated as an arbitrary file blob. Astraea can offer the operations that make sense for that source and target, such as:

```text
Live range
Frozen snapshot
Copy as Writer table
Open source
```

The same model is intended to support compatible objects across Writer, Grid, Present, Whiteboard, Publish, Insight, Automate and other workspace applications.

---

# Local-first does not mean isolated

Astraea is designed to work locally first, but local-first is not the same thing as "never communicate".

Open Core can remain fully useful without a cloud account.

Premium can add encrypted synchronization, spaces and GaiaCom collaboration when the user or organization explicitly enables them.

Network-capable functionality remains bounded by policy and does not change the ownership model of local documents.

---

# Security architecture

Astraea Workspace follows a **zero-trust local-computing** design.

The project documents concrete security mechanisms rather than using undefined claims such as "military-grade security".

## VWC encrypted containers

Native workspace documents are stored through the Astraea container architecture.

Relevant controls include:

- authenticated encryption using modern AEAD constructions such as **AES-256-GCM** and **ChaCha20-Poly1305** where applicable;
- **Argon2id** for passphrase-based key derivation where a passphrase is part of the key path;
- integrity and authentication checks around container data;
- bounded parsing and validation at file trust boundaries;
- explicit versioning and migration paths.

Exact algorithms and profiles are implementation details and are documented in the architecture and release evidence rather than reduced to a marketing badge.

## VGT Infinity cryptographic core

Astraea Workspace integrates the **VGT Infinity Cryptographic Core** as a first-party security subsystem.

In the current repository architecture, Infinity lives under:

```text
vendor/infinity
```

and provides the advanced cryptographic building blocks used by Astraea security profiles, including:

- hybrid classical / post-quantum key-establishment profiles;
- standardized **ML-KEM** support in applicable profiles;
- **ML-DSA** and additional signature primitives used by supported signing profiles;
- authenticated symmetric encryption constructions;
- higher-security composite profiles that can combine multiple independent primitives;
- explicit key separation, integrity verification and secret-memory handling implemented by the Infinity subsystem;
- cryptographic provider isolation where a primitive is supplied through a bounded sidecar/provider boundary.

The repository's current Infinity integration also contains specialized post-quantum and composite profiles beyond the minimum ML-KEM / ML-DSA baseline. Exact enabled algorithms, provider versions and profile composition are treated as **release-evidence facts**, not marketing constants: the final SBOM, lockfiles, architecture document and release manifest are authoritative for a specific build.

This distinction matters. Astraea does not claim that stacking algorithms creates magical or mathematically unbreakable security. Infinity is used as an additional first-party cryptographic layer whose profiles are selected and verified explicitly.

## Post-quantum support

Through the Infinity integration and Astraea's native security stack, the workspace supports post-quantum-capable cryptographic components, including standardized **ML-KEM** and **ML-DSA** families in applicable profiles.

Post-quantum cryptography reduces specific long-term cryptographic risks; it is **not** described as a guarantee against every future attack.

## NetGate

Network access is designed around explicit policy rather than unrestricted default egress.

Where NetGate policy applies, outbound access is allowlisted and can be denied before normal application-level network use. Connectors and collaboration transports must cross defined policy boundaries.

## OS-backed key protection

Astraea integrates with operating-system key-protection facilities where available:

- **Windows:** DPAPI / Windows credential facilities
- **macOS:** Keychain services, with hardware-backed protection where supported by the device and configuration
- **Linux:** Secret Service / libsecret-compatible key stores where available

Hardware-backed protection is capability-dependent and is not assumed on every machine.

## Security evidence

Official releases are intended to ship with verifiable release artifacts such as:

- dependency and license inventory;
- SPDX SBOM;
- release hashes;
- signed release manifest;
- provenance / build evidence where generated by the release pipeline.

The exact artifact set published with a release is the authoritative source for that release.

---

# Architecture

Astraea combines a Rust core with a Tauri desktop shell and a React / TypeScript interface.

```text
┌─────────────────────────────────────────────────────────────┐
│                    Astraea Desktop Shell                    │
│                         Tauri v2                            │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              React / TypeScript UI                   │  │
│  │                                                       │  │
│  │  Workspace Shell · Explorer · Editors · Settings     │  │
│  │  Guides · Search · Cross-App Object Surfaces         │  │
│  └─────────────────────────┬─────────────────────────────┘  │
│                            │ typed IPC                      │
│  ┌─────────────────────────▼─────────────────────────────┐  │
│  │                    Rust Core                          │  │
│  │                                                       │  │
│  │  WOM · VWC · Search · Policy · Interop · Recovery    │  │
│  │  Crypto · Automation · NetGate · Native Integration  │  │
│  └─────────────────────────┬─────────────────────────────┘  │
└────────────────────────────┼────────────────────────────────┘
                             │
                Native OS / local storage /
                OS key stores / explicit connectors
```

### Why Tauri?

Tauri uses the operating system's WebView instead of bundling a separate browser runtime with every application. This helps reduce distribution overhead while retaining a Rust-native application core.

See the official Tauri architecture documentation:
https://tauri.app/concept/architecture/

### First-party core strategy

Astraea intentionally keeps critical workspace behaviour under first-party control:

- Workspace Object Model
- workspace editors
- document and reference semantics
- local search integration
- policy engine
- automation runtime
- interoperability orchestration
- encrypted workspace containers
- **VGT Infinity Cryptographic Core** integration for advanced cryptographic profiles

Third-party libraries are still used where they are the appropriate engineering choice, especially for audited cryptographic primitives, platform integration and bounded rendering components.

The exact dependency graph belongs in the generated SBOM, not in marketing prose.

---

# Performance and resource footprint

Astraea is intentionally designed to avoid unnecessary runtime duplication.

Tauri's use of the system WebView means Astraea does not bundle an independent Chromium runtime in the same way a conventional Electron application does. That architectural choice can reduce package and process overhead, although actual memory use still depends on the operating system, open documents, WebView implementation, previews, indexes and active applications.

## Current Astraea pre-release observation

On the current pre-release Windows reference build, internal testing has observed approximately:

**~100–150 MB RAM at idle with no working document open**

This is an **internal pre-release measurement**, not a universal guarantee. Final release measurements should be published with the tested OS, build, WebView version, document state and measurement method.

## Why we do not publish fake competitor RAM numbers

Runtime RAM comparisons between office suites are easy to make misleading.

Microsoft Word with a blank document, a browser with Google Docs, LibreOffice with Java-enabled Base, and a multi-process desktop editor are not equivalent workloads.

For that reason, the figures below are **official vendor system requirements**, not measured idle-memory benchmarks:

| Product | Official memory requirement / reference | Offline desktop work | Source |
|---|---:|:---:|---|
| **Astraea Workspace** | Internal pre-release observation: ~100–150 MB idle; 4 GB system RAM currently recommended for comfortable use | ✅ | VGT pre-release measurement |
| **Microsoft 365 Apps** | 4 GB RAM on current Windows / macOS requirements | ✅ Desktop apps | [Microsoft](https://support.microsoft.com/en-us/office/system-requirements/system-requirements-for-microsoft-365-for-home-use) |
| **LibreOffice** | 256 MB RAM minimum, 512 MB recommended on Windows/Linux | ✅ | [LibreOffice](https://www.libreoffice.org/system-requirements/) |
| **ONLYOFFICE Desktop Editors** | 2 GB RAM or more | ✅ | [ONLYOFFICE](https://helpcenter.onlyoffice.com/desktop/installation/desktop-sys-reqs-windows.aspx) |
| **Google Docs / Sheets / Slides** | Browser-dependent; no directly comparable standalone desktop RAM figure | ⚠️ Offline mode available after setup | [Google](https://support.google.com/docs/answer/6388102?hl=en-GB) |

> **Important:** minimum system RAM and measured application working set are different metrics. The table is included for context, not to pretend they are interchangeable.

A reproducible Astraea benchmark should report at least:

```text
Cold launch
Idle after stabilization
Writer document
Grid workload
PDF workload
Search indexing state
Peak working set
Private working set
CPU at idle
Test OS / WebView / build hash
```

---

# A fair comparison with other productivity suites

Astraea does not need inaccurate claims about other products to explain its position.

Microsoft 365 desktop applications can save files locally or to OneDrive / SharePoint. Google Docs, Sheets and Slides support an offline mode after it is enabled. LibreOffice and ONLYOFFICE Desktop Editors can work with local files offline.

The difference Astraea is pursuing is therefore not simply "other suites require the cloud".

It is the **combination** of local-first ownership, a shared workspace object model, explicit network policy, integrated encrypted containers, a free Open Core edition, and a common shell spanning office, knowledge, security and automation tools.

| Characteristic | Astraea Workspace | Microsoft 365 | Google Workspace | LibreOffice | ONLYOFFICE Desktop |
|---|---|---|---|---|---|
| **Primary model** | Local-first desktop workspace | Desktop + cloud services | Cloud-first web suite | Local desktop suite | Local desktop suite + optional cloud |
| **Local file workflows** | ✅ First-class | ✅ Supported | ⚠️ Offline mode for supported editors | ✅ | ✅ |
| **Cloud account required for core local editing** | No | Depends on product/license | Account-based service | No | No |
| **Open-source desktop foundation** | ✅ Open Core, AGPLv3 | No | No | ✅ MPLv2 | ✅ AGPLv3 |
| **Shared cross-app Astraea object model** | ✅ WOM | Different architecture | Different architecture | Different architecture | Different architecture |
| **Encrypted Astraea workspace containers** | ✅ | Different architecture | Different architecture | Different architecture | Different architecture |
| **Zero product analytics by Astraea design** | ✅ | Vendor-specific | Vendor-specific | Project-specific | Vendor-specific |
| **Commercial team/data expansion** | ✅ Premium | ✅ | ✅ | Ecosystem / third party | ✅ |

Official references used for the comparison:

- Microsoft local/cloud save behaviour: https://support.microsoft.com/en-us/office/collab-files/save-your-files
- Google offline editing: https://support.google.com/docs/answer/6388102?hl=en-GB
- LibreOffice system requirements: https://www.libreoffice.org/system-requirements/
- ONLYOFFICE offline desktop operation: https://helpcenter.onlyoffice.com/desktop/getting-started.aspx

---

# The 20 integrated applications

## Office & publishing

### Astraea Writer — `.vdoc`
Professional document editing, typography, styles, tables, references, structured content and document interchange.

### Astraea Grid — `.vgrid`
Multi-sheet spreadsheets, formulas, analysis, charts and tabular data workflows.

### Astraea Present — `.vpresent`
Vector-oriented presentations, slide composition, media and presenter workflows.

### Astraea Publish — `.vpub`
Desktop publishing for brochures, publications, page-layout documents and print-oriented composition.

## Knowledge, ideation & creative work

### Astraea Notes — `.vnote`
Personal knowledge management, linked notes, Markdown-oriented workflows and knowledge relationships.

### Astraea Whiteboard — `.vboard`
Infinite canvas, diagrams, mind maps, visual planning and live workspace objects.

### Astraea Draw — `.vdraw`
Vector drawing, layers, Bézier workflows and SVG-oriented assets.

### Astraea PDF Studio — `.vpdf`
PDF viewing and editing workflows including annotation, signatures and controlled redaction.

## Tasks, planning & execution

### Astraea Tasks — `.vtask`
Personal task management, recurrence, priorities, subtasks and deep links to workspace objects.

### Astraea Planner — `.vplan` — Premium
Kanban, workload, scheduling and team planning.

### Astraea Projects — `.vproj` — Premium
Project phases, milestones, dependencies, Gantt views and project risk planning.

## Data, forms & insight

### Astraea Forms — `.vform` — Premium
Forms, surveys, conditional flows and structured response collection.

### Astraea Database — `.vdb` — Premium
Typed relational data models, structured records and workspace-linked views.

### Astraea Insight — `.vinsight`
Local analytical views, metrics, dashboards and derived workspace insight.

## Security, automation & connectivity

### Astraea Vault — `.vvault`
Encrypted credentials, protected files and sensitive workspace content.

### Astraea Spaces — `.vspace` — Premium
Team and organization spaces with role and policy context.

### Astraea Connect — `.vconnect`
Guarded external connectors and explicit integration boundaries.

### Astraea Automate — `.vauto`
Deterministic local workflow automation.

### Astraea Admin & Policy — `.vpolicy`
Security-relevant administration, policy state and configuration appropriate to the installed edition.

### Astraea GaiaCom — `.vgcom` — Premium
Encrypted communication and synchronization capabilities for collaborative Astraea environments.

---

# Pricing and licensing

## Open Core

| Edition | Price | License | Availability |
|---|---:|---|---|
| **Astraea Open Core** | **€0** | **GNU AGPLv3** | Free forever |

Open Core does not expire and does not require a subscription.

## Planned Premium licensing

Astraea Premium is planned as a **perpetual commercial license**, not a mandatory recurring subscription.

| Edition | Planned availability | Planned one-time price | Planned major-version upgrade |
|---|---:|---:|---:|
| **Premium Beta Early-Bird** | Nov 2026 – Feb 2027 | **€39.99** | **~€45.99** |
| **Premium Regular** | From Mar 2027 | **€69.00** | **~€45.99** |
| **Non-Profit & Education** | Eligible organizations | **€36.99** | **€9.99** |

> [!NOTE]
> Premium has not launched yet. Commercial terms shown before launch are the current plan and should be treated as pre-release pricing until checkout and licensing are publicly available.

---

# Installation

## Public binaries

Official installers and release bundles will appear under **GitHub Releases** after the public-release gates pass.

Target platforms:

```text
Windows
macOS
Linux
```

Release availability can differ by platform if a platform-specific gate has not yet passed.

## Build from source

### Prerequisites

- Node.js 20 LTS or 22 LTS
- Rust / Cargo
- Tauri CLI v2
- platform-specific Tauri build prerequisites

### UI

```bash
cd ui
npm ci
npm run typecheck
npm run build
```

### Desktop shell

```bash
cd crates/vgt-desktop
cargo tauri dev
```

Production packaging:

```bash
cargo tauri build
```

> Build commands and toolchain versions must follow the repository lockfiles and current release documentation if they differ from the examples above.

---

# System requirements

Current pre-release target:

- **RAM:** 4 GB minimum system memory, 8 GB recommended for larger multi-document workflows
- **Storage:** final installed-size figure will be published from the release bundle
- **Display:** modern desktop display; accessibility scaling is supported by the Workspace UI
- **Internet:** not required for core local editing; required only for explicitly networked functions, updates or external connectors that the user enables

Final platform versions will be published with the release artifacts rather than guessed in advance.

---

# Release readiness

The original core implementation masterplan reached:

```text
3334 / 3334
```

That number represents completion of the core implementation checklist.

It does **not** by itself claim that a public release is finished.

The public beta has a separate release-readiness pass covering:

```text
Dual-edition source separation
Open Core / Premium capability boundaries
Workspace Explorer / Library
Cross-application insert and drag/drop workflows
Design-system overhaul
Theme verification
Interactive guides
Settings wiring
Localization
Accessibility
Security evidence
End-to-end roundtrips
Import / export regression
Recovery behaviour
Performance
Packaging
SBOM / hashes / provenance
Release-visible defect gates
```

The repository status should move from **Pre-Release** to **Beta** only when those gates are evidenced by the actual release tree.

---

# Documentation

Existing product and technical documentation includes:

| Document | Language | Type |
|---|:---:|---|
| [What is Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_EN.pdf) | English | Product / concept |
| [Premium Security & Sovereignty](./02_Astraea_Workspace_Premium_Security_Sovereignty_EN.pdf) | English | Technical whitepaper |
| [Was ist Astraea Workspace?](./01_Astraea_Workspace_Was_es_ist_DE.pdf) | Deutsch | Produkt / Konzept |
| [Premium Sicherheit & Souveränität](./02_Astraea_Workspace_Premium_Sicherheit_Souveraenitaet_DE.pdf) | Deutsch | Technical whitepaper |
| [Produktivität & Datenfluss](./03_Astraea_Workspace_Premium_Produktivitaet_Datenfluss_DE.pdf) | Deutsch | Product architecture |
| [Che cos'è Astraea Workspace?](./01_Astraea_Workspace_Che_Cose_IT.pdf) | Italiano | Product / concept |
| [Sicurezza Premium & Sovranità](./02_Astraea_Workspace_Premium_Sicurezza_Sovranita_IT.pdf) | Italiano | Technical whitepaper |
| [¿Qué es Astraea Workspace?](./01_Astraea_Workspace_Que_Es_ES.pdf) | Español | Product / concept |
| [Seguridad Premium & Soberanía](./02_Astraea_Workspace_Premium_Seguridad_Soberania_ES.pdf) | Español | Technical whitepaper |
| [Qu'est-ce qu'Astraea Workspace ?](./01_Astraea_Workspace_Ce_Que_Cest_FR.pdf) | Français | Product / concept |
| [Sécurité Premium & Souveraineté](./02_Astraea_Workspace_Premium_Securite_Souverainete_FR.pdf) | Français | Technical whitepaper |
| [Что такое Astraea Workspace?](./01_Astraea_Workspace_What_It_Is_RU.pdf) | Русский | Product / concept |
| [Премиальная безопасность и суверенитет](./02_Astraea_Workspace_Premium_Security_Sovereignty_RU.pdf) | Русский | Technical whitepaper |

---

# Supply-chain transparency

Astraea's release process is designed to make the shipped build inspectable rather than asking users to trust a marketing paragraph.

Official release evidence should include, where generated by the final release pipeline:

```text
dependency / license inventory
SPDX SBOM
SHA-256 release hashes
signed release manifest
build provenance
```

The generated release artifacts are authoritative for dependency versions.

This README intentionally avoids maintaining a second giant hand-written dependency table that can drift away from `Cargo.lock`, `package-lock.json`, `go.sum` and the generated SBOM.

---

# License

**Astraea Workspace Open Core is licensed under GNU Affero General Public License v3.0 (AGPL-3.0).**

See:

- [`LICENSE`](./LICENSE)
- [`NOTICE`](./NOTICE), where present
- dependency-specific notices and the release SBOM

Astraea Premium is distributed separately under its commercial license.

---

# Vision

Software should be able to help people create, plan, analyze and collaborate without requiring them to surrender ownership of their working environment.

Astraea Workspace is built around that premise:

**local when local is enough, explicit when networking is required, open where the Open Core promise applies, and interoperable across the workspace instead of fragmented into isolated tools.**

<p align="center">
  <strong>Astraea Workspace</strong><br>
  <em>Your Mind. Your Work. Your Sovereignty.</em><br><br>
  <sub>© 2026 VisionGaiaTechnology · Open Core licensed under AGPL-3.0</sub>
</p>
