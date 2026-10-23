// @vitest-environment happy-dom
// STATUS: PLATIN — GR-006 (Dateivertrag): a saved .vgrid passes the shipping open boundary
//
// Directives say: reuse the canonical container file path if it works without data loss, a
// contract break or a new privileged IPC. This witness proves exactly that contract, from the
// shipped code, without adding anything:
//
//   save side   : `extensionForDocumentKind('Grid')` → `.vgrid` + container envelope bytes
//   open side   : `assertWorkspaceContainerMagic(fileName, bytes)` (the boundary the real
//                 "open file" handler runs) → `unpackBrowserDeviceEnvelopeContainer`
//
// What it does NOT prove (and does not claim): that the WebView2 download actually lands a file
// on disk, and that the native Rust container packer produces the same bytes. Both are native
// probe items (`audit/GRID_NATIVE_PROBE_M1.md`, P-06/P-08).
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  packBrowserDeviceEnvelopeContainer,
  unpackBrowserDeviceEnvelopeContainer,
} from '../browserContainerCrypto';
import {
  assertWorkspaceContainerMagic,
  WORKSPACE_CONTAINER_EXTENSIONS,
  WORKSPACE_FILE_PICKER_ACCEPT,
} from '../workspaceContainerBoundary';
import { extensionForDocumentKind, WORKSPACE_DOCUMENT_EXTENSIONS } from '../vwcStorage';
import { addSheetToDocument } from '../../../apps/grid/workbook/gridWorkbookOperations';

const BASE: WorkspaceDocument = {
  id: 'grid-file-contract',
  title: 'Umsatz 2026',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function workbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    cells: {
      A1: { value: 'Posten' },
      B2: { value: 15 },
      C1: { value: 25, formula: '=SUM(B2:B3)', dataType: 'formula' },
    },
  }).updatedDocument;
}

async function deviceKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  ) as Promise<CryptoKey>;
}

function cellsOf(document: WorkspaceDocument): Record<string, unknown> {
  for (const object of Object.values(document.objects ?? {})) {
    const candidate = object as { type?: string; data?: { cells?: Record<string, unknown> } };
    if (candidate.type === 'Table' && candidate.data?.cells) return candidate.data.cells;
  }
  return {};
}

describe('GR-006 — the .vgrid file contract between save and open', () => {
  it('names a Grid file .vgrid and offers that extension in the file picker', () => {
    expect(extensionForDocumentKind('Grid')).toBe('vgrid');
    expect(WORKSPACE_DOCUMENT_EXTENSIONS).toContain('vgrid');
    expect(WORKSPACE_CONTAINER_EXTENSIONS).toContain('vgrid');
    expect(WORKSPACE_FILE_PICKER_ACCEPT.split(',')).toContain('.vgrid');
  });

  it('a saved Grid container passes the open boundary and reopens unchanged', async () => {
    const key = await deviceKey();
    const original = workbook();
    const fileName = `${original.title}.${extensionForDocumentKind('Grid')}`;
    expect(fileName).toBe('Umsatz 2026.vgrid');

    const bytes = await packBrowserDeviceEnvelopeContainer(original, key);
    // The exact boundary the open-file handler runs before anything is unpacked.
    expect(() => assertWorkspaceContainerMagic(fileName, bytes)).not.toThrow();

    const restored = await unpackBrowserDeviceEnvelopeContainer(bytes, key);
    expect(restored.kind).toBe('Grid');
    expect(cellsOf(restored)).toEqual(cellsOf(original));
    expect((cellsOf(restored).C1 as { formula?: string }).formula).toBe('=SUM(B2:B3)');
  });

  it('rejects a foreign extension and a magic mismatch before unpacking', async () => {
    const bytes = await packBrowserDeviceEnvelopeContainer(workbook(), await deviceKey());
    expect(() => assertWorkspaceContainerMagic('Umsatz.txt', bytes)).toThrow(/extension/u);
    expect(() => assertWorkspaceContainerMagic('Umsatz.vgrid', undefined as unknown as Uint8Array))
      .toThrow(/size boundary/u);
    const random = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(() => assertWorkspaceContainerMagic('Umsatz.vgrid', random)).toThrow(/magic mismatch/u);
  });
});
