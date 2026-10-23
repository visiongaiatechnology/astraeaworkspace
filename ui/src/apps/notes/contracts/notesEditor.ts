import { WorkspaceDocument, NoteNotebook } from '../../../shared/contracts/workspace';

export interface NotesEditorProps {
  document: WorkspaceDocument;
  onUpdateDocument: (doc: WorkspaceDocument) => void;
  onUpdateWorkspaceDocument?: (doc: WorkspaceDocument) => void;
  onCreateDerivedDocument?: (doc: WorkspaceDocument) => void;
  onSelectSelectionType: (type: 'text' | 'cell' | 'shape' | 'chart') => void;
  workspaceDocuments?: readonly WorkspaceDocument[];
  onOpenWorkspaceDocument?: (documentId: string) => void;
  onOpenExternalUrl?: (url: string) => void | Promise<void>;
}

export type NotesPageCollection = 'pages' | 'recent' | 'trash';

export interface PageFlatItem {
  id: string;
  title: string;
  notebookId: string;
  notebookTitle: string;
  sectionId: string;
  sectionTitle: string;
  parentPageId?: string | null;
  trashed?: boolean;
}

export const DEFAULT_NOTEBOOKS: NoteNotebook[] = [
  {
    id: 'nb-engineering',
    title: 'Sovereign Engineering',
    sections: [
      {
        id: 'sec-arch',
        title: 'Core Architecture',
        pages: [
          {
            id: 'page-kernel',
            title: 'Local-First Sovereign Kernel',
            content: `# Local-First Sovereign Kernel

Astraea Workspace follows a **local-first sovereignty target**. Native documents are designed to remain usable without a mandatory vendor cloud, while network features require explicit configuration.

## Architectural Tenets
- **Local-first operation**: Core editing and storage workflows must work offline.
- **Single crypto boundary**: Cryptography belongs to the Workspace container and KeyVault core, not to Notes UI code.
- **Workspace Fabric**: Linked objects can reference content across documents. See [[RFC-004: Workspace Fabric Sync]].

### Verification Checklist
- [x] Notes data persists inside the canonical Workspace document.
- [x] Knowledge graph renders locally without an external graph service.
- [ ] Validate every platform KeyVault backend on its native operating system.
- [ ] Complete native collaboration transport integration.

Refer to [[Argon2id Key Vault]] for the cryptography design notes.`,
            tags: ['architecture', 'kernel', 'sovereign'],
            backlinks: ['page-vault', 'page-fabric'],
            last_modified: Date.now() - 3600000,
          },
          {
            id: 'page-vault',
            title: 'Argon2id Key Vault',
            content: `# Argon2id Key Vault

The Workspace security architecture keeps document-key handling outside the Notes renderer. The exact KDF and platform-backed key storage parameters are defined by the audited container/KeyVault implementation rather than duplicated in UI text.

## Design Rule
- Notes never derives or stores document encryption keys itself.
- Platform KeyVault capabilities must be reported from the real native backend.
- Security badges must reflect measured state, not static marketing text.

Linked back to [[Local-First Sovereign Kernel]].`,
            tags: ['security', 'crypto', 'vault'],
            backlinks: ['page-kernel'],
            last_modified: Date.now() - 7200000,
          },
        ],
      },
      {
        id: 'sec-rfcs',
        title: 'RFCs & Protocols',
        pages: [
          {
            id: 'page-fabric',
            title: 'RFC-004: Workspace Fabric Sync',
            content: `# RFC-004: Workspace Fabric Sync

This specification outlines the local pub/sub interconnect allowing charts, tables, and text spans to synchronize across separate documents in real-time.

## Design
When a cell in \`Revenue-2026\` updates, the change propagates via the Fabric graph to [[Local-First Sovereign Kernel]].`,
            tags: ['fabric', 'rfc', 'sync'],
            backlinks: ['page-kernel'],
            last_modified: Date.now() - 14400000,
          },
        ],
      },
    ],
  },
  {
    id: 'nb-executive',
    title: 'Executive & Strategy',
    sections: [
      {
        id: 'sec-strategy',
        title: '2026-2027 Roadmap',
        pages: [
          {
            id: 'page-positioning',
            title: 'Zero-Cloud Enterprise Strategy',
            content: `# Zero-Cloud Enterprise Strategy

Positioning for organizations and individuals that need offline-capable productivity, local storage control and optional self-hosted collaboration.

## Target Verticals
1. Aerospace & Defense
2. Legal & Forensic Audits
3. High-Net-Worth Family Offices`,
            tags: ['strategy', 'executive', 'roadmap'],
            backlinks: [],
            last_modified: Date.now() - 86400000,
          },
        ],
      },
    ],
  },
];
