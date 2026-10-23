// @vitest-environment happy-dom
// STATUS: PLATIN — GR-006 (Datenteil): a Grid workbook survives the container roundtrip
//
// GR-006 asks for "Zelländerung transaktional speichern, schließen und wieder öffnen". The
// file *delivery* on the native side is a separate, open decision (blob anchor vs. native save
// dialog). This witness covers the half that can be proven without it: the canonical container
// envelope that `packLocalEncryptedContainer`/`unpackContainer` use must return the document
// **unchanged** — cells, formula, formatting, sheet identity. A silent loss here is data loss
// regardless of how the file later reaches the disk.
//
// The envelope functions are called with an **injected** device key: the production path loads
// that key from IndexedDB, which a headless DOM does not provide. Nothing else is replaced —
// same serializer, same AES-GCM envelope, same decoder.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  packBrowserDeviceEnvelopeContainer,
  unpackBrowserDeviceEnvelopeContainer,
} from '../../../../platform/containers/browserContainerCrypto';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

const BASE: WorkspaceDocument = {
  id: 'grid-container-roundtrip',
  title: 'Container-Roundtrip',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

/** A workbook with everything a user can type: text, number, formula, format, sheet name. */
function workbook(): WorkspaceDocument {
  const created = addSheetToDocument(BASE, [], 'Umsatz 2026', {
    rows: 40,
    cells: {
      A1: { value: 'Posten' },
      B1: { value: 'Betrag' },
      A2: { value: 'Einnahmen' },
      B2: { value: 15 },
      A3: { value: 'Ausgaben' },
      B3: { value: 10 },
      C1: { value: 25, formula: '=SUM(B2:B3)', dataType: 'formula' },
      D1: { value: 'fett', bold: true, background: '#112233' },
    },
  }).updatedDocument;
  return { ...created, title: 'Container-Roundtrip' };
}

async function deviceKey(): Promise<CryptoKey> {
  return globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  ) as Promise<CryptoKey>;
}

function gridOf(document: WorkspaceDocument): { sheets: unknown; cells: Record<string, unknown> } | null {
  for (const object of Object.values(document.objects ?? {})) {
    const candidate = object as { type?: string; data?: { cells?: Record<string, unknown> } };
    if (candidate.type === 'Table' && candidate.data?.cells) {
      return { sheets: document.gridData?.sheets, cells: candidate.data.cells };
    }
  }
  return null;
}

describe('GR-006 — container roundtrip preserves the workbook', () => {
  it('returns the same cells, formula, formatting and sheet after pack → unpack', async () => {
    const key = await deviceKey();
    const original = workbook();
    const bytes = await packBrowserDeviceEnvelopeContainer(original, key);
    expect(bytes.byteLength, 'der Container enthält echte Bytes').toBeGreaterThan(64);

    const restored = await unpackBrowserDeviceEnvelopeContainer(bytes, key);
    expect(restored.kind).toBe('Grid');
    expect(restored.title).toBe('Container-Roundtrip');

    const before = gridOf(original);
    const after = gridOf(restored);
    expect(before, 'die Ausgangsmappe hat ein Table-Objekt').not.toBeNull();
    expect(after, 'die wieder geöffnete Mappe hat ein Table-Objekt').not.toBeNull();
    expect(after!.cells, 'Zellwerte und Formeln bleiben identisch').toEqual(before!.cells);
    // The formula is data, not decoration: the raw formula must survive as a string.
    expect((after!.cells.C1 as { formula?: string }).formula).toBe('=SUM(B2:B3)');
    expect((after!.cells.D1 as { bold?: boolean }).bold).toBe(true);
    expect((after!.cells.D1 as { background?: string }).background).toBe('#112233');

    // Sheet identity is part of the workbook, not of the UI.
    const beforeSheets = before!.sheets as Array<{ id: string; name: string }>;
    const afterSheets = after!.sheets as Array<{ id: string; name: string }>;
    expect(afterSheets.map((sheet) => ({ id: sheet.id, name: sheet.name })))
      .toEqual(beforeSheets.map((sheet) => ({ id: sheet.id, name: sheet.name })));
    expect(afterSheets[0]!.name).toBe('Umsatz 2026');
  });

  it('is stable across a second pack/unpack generation', async () => {
    const key = await deviceKey();
    const first = await unpackBrowserDeviceEnvelopeContainer(
      await packBrowserDeviceEnvelopeContainer(workbook(), key),
      key,
    );
    const second = await unpackBrowserDeviceEnvelopeContainer(
      await packBrowserDeviceEnvelopeContainer(first, key),
      key,
    );
    expect(gridOf(second)!.cells).toEqual(gridOf(workbook())!.cells);
  });

  it('fails closed on a truncated container instead of returning an empty workbook', async () => {
    const key = await deviceKey();
    const bytes = await packBrowserDeviceEnvelopeContainer(workbook(), key);
    const truncated = bytes.slice(0, Math.max(8, Math.floor(bytes.byteLength / 2)));
    await expect(unpackBrowserDeviceEnvelopeContainer(truncated, key)).rejects.toBeTruthy();
  });

  it('refuses to decode with the wrong key', async () => {
    const bytes = await packBrowserDeviceEnvelopeContainer(workbook(), await deviceKey());
    await expect(unpackBrowserDeviceEnvelopeContainer(bytes, await deviceKey())).rejects.toBeTruthy();
  });
});
