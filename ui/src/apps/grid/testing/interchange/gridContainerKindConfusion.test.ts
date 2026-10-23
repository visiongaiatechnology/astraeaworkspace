// @vitest-environment happy-dom
// STATUS: PLATIN — GR-001/GR-002: Cross-Kind-Container (Present als .vgrid und umgekehrt)
//
// `.vgrid` und `.vpresent` teilen denselben Container-Umschlag (`VWC1`/`VGT*`). Diese Datei
// prüft die reale Öffnungsgrenze (`assertWorkspaceContainerMagic` + `executeOpenFile`) mit
// einem Present-Dokument als `.vgrid` und einem Grid-Dokument als `.vpresent`.
//
// Befund des ersten Laufs (2026-10-18, vor dem Fix): (a) und (b) wurden vom echten
// `executeOpenFile` **still akzeptiert** — kein Datenverlust beim Öffnen (die Shell routet nach
// `document.kind`), aber ein Endungs-/Kind-Mismatch, dem jeder konsumentenseitige Endungs-Glaube
// zum Opfer fallen könnte. **Behoben in derselben Runde:** `executeOpenFile` prüft nach dem
// Entpacken `filenameMatchesDocumentKind` (generische `.vwc`-Container bleiben kind-agnostisch).
// Die Fälle (a)/(b) pinnen jetzt die Ablehnung; die Magic-Grenze selbst bleibt endungsfamilien-
// basiert und akzeptiert die Datei weiterhin — das ist bewusst, der Kind-Check gehört an die
// Öffnungsgrenze, nicht an die reine Magic-Prüfung.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  packBrowserDeviceEnvelopeContainer,
  unpackBrowserDeviceEnvelopeContainer,
} from '../../../../platform/containers/browserContainerCrypto';
import {
  assertWorkspaceContainerMagic,
} from '../../../../platform/containers/workspaceContainerBoundary';
import {
  extensionForDocumentKind,
  filenameMatchesDocumentKind,
} from '../../../../platform/containers/vwcStorage';
import { executeOpenFile } from '../../../../platform/containers/containerFileOps';
import { createNewDocument } from '../../../../app/bootstrap/seedDocDefaultsOpenCore';
import { addSheetToDocument } from '../../workbook/gridWorkbookOperations';

// Nur die Schlüssel-Injektion der Browser-Envelope wird ersetzt; Datei-, Größen-, Magic- und
// Entpack-Pfad bleiben die echten Funktionen. Das ist derselbe Seam wie in
// `gridContainerRoundtrip.test.ts` (dort mit injiziertem Device-Key).
const testState = vi.hoisted(() => ({ deviceKey: null as CryptoKey | null }));

vi.mock('../../../../platform/containers/container', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../platform/containers/container')>();
  const browser = await import('../../../../platform/containers/browserContainerCrypto');
  return {
    ...actual,
    unpackContainer: async (bytes: Uint8Array): Promise<WorkspaceDocument> => {
      if (!testState.deviceKey) throw new Error('TEST_DEVICE_KEY_MISSING');
      return browser.unpackBrowserDeviceEnvelopeContainer(bytes, testState.deviceKey);
    },
  };
});

const BASE: WorkspaceDocument = {
  id: 'grid-kind-confusion',
  title: 'Kind Confusion',
  kind: 'Grid',
  created_at: 0,
  modified_at: 0,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
};

function gridWorkbook(): WorkspaceDocument {
  return addSheetToDocument(BASE, [], 'Sheet 1', {
    rows: 30,
    cols: 12,
    cells: {
      A1: { value: 'Posten' },
      B2: { value: 15 },
      C1: { value: 25, formula: '=SUM(B2:B3)', dataType: 'formula' },
    },
  }).updatedDocument;
}

function presentDocument(): WorkspaceDocument {
  const created = createNewDocument('Present' as never) as WorkspaceDocument;
  return { ...created, title: 'Praesentation Cross-Kind' };
}

function asFile(bytes: Uint8Array, name: string): File {
  return new File([bytes as unknown as BlobPart], name, { type: 'application/octet-stream' });
}

function gridCellsOf(document: WorkspaceDocument): Record<string, unknown> {
  for (const object of Object.values(document.objects ?? {})) {
    const candidate = object as { type?: string; data?: { cells?: Record<string, unknown> } };
    if (candidate.type === 'Table' && candidate.data?.cells) return candidate.data.cells;
  }
  return {};
}

beforeAll(async () => {
  testState.deviceKey = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  ) as CryptoKey;
});

describe('Container-Kind-Verwechslung zwischen .vgrid und .vpresent', () => {
  it('(a) Present-Inhalt als .vgrid: wird an der Öffnungsgrenze abgelehnt', async () => {
    const present = presentDocument();
    const bytes = await packBrowserDeviceEnvelopeContainer(present, testState.deviceKey!);
    const name = `Praesentation.${extensionForDocumentKind('Present')}`;
    // Die Datei heißt bewusst .vgrid, der Inhalt ist Present.
    const disguisedName = 'Praesentation.vgrid';
    expect(filenameMatchesDocumentKind(disguisedName, present.kind)).toBe(false);

    // Die reine Magic-Grenze bleibt endungsfamilien-basiert (bewusst): sie akzeptiert .vgrid.
    expect(() => assertWorkspaceContainerMagic(disguisedName, bytes), 'nur Magic/Endung, kein Kind-Check').not.toThrow();

    // Der Kind-Abgleich sitzt an der Öffnungsgrenze, nach dem Entpacken.
    await expect(executeOpenFile(asFile(bytes, disguisedName), () => null, () => null))
      .rejects.toThrow(/does not match the document kind/u);
    expect(name).toBe('Praesentation.vpresent');
  });

  it('(b) Grid-Inhalt als .vpresent: wird an der Öffnungsgrenze abgelehnt', async () => {
    const grid = gridWorkbook();
    const bytes = await packBrowserDeviceEnvelopeContainer(grid, testState.deviceKey!);
    const disguisedName = 'Umsatz.vpresent';

    expect(() => assertWorkspaceContainerMagic(disguisedName, bytes)).not.toThrow();
    await expect(executeOpenFile(asFile(bytes, disguisedName), () => null, () => null))
      .rejects.toThrow(/does not match the document kind/u);
  });

  it('(c) Gegenprobe: Grid-Inhalt als .vgrid öffnet unverändert', async () => {
    const grid = gridWorkbook();
    const bytes = await packBrowserDeviceEnvelopeContainer(grid, testState.deviceKey!);
    const fileName = `Umsatz.${extensionForDocumentKind('Grid')}`;
    expect(fileName).toBe('Umsatz.vgrid');

    expect(() => assertWorkspaceContainerMagic(fileName, bytes)).not.toThrow();
    const opened = await executeOpenFile(asFile(bytes, fileName), () => null, () => null);
    expect(opened.document.kind).toBe('Grid');
    expect(gridCellsOf(opened.document)).toEqual(gridCellsOf(grid));
  });

  it('(d) Der generische .vwc-Container bleibt kind-agnostisch (Backup/portabel)', async () => {
    // Bewusste Ausnahme: eine .vwc-Sicherung darf jeden Dokumenttyp enthalten, sonst wären
    // bestehende Backups nach dieser Härtung nicht mehr zu öffnen.
    const grid = gridWorkbook();
    const bytes = await packBrowserDeviceEnvelopeContainer(grid, testState.deviceKey!);
    expect(() => assertWorkspaceContainerMagic('Backup.vwc', bytes)).not.toThrow();
    const opened = await executeOpenFile(asFile(bytes, 'Backup.vwc'), () => null, () => null);
    expect(opened.document.kind).toBe('Grid');
    expect(gridCellsOf(opened.document)).toEqual(gridCellsOf(grid));
  });
});

// Der direkte Gegencheck des Envelope-Decoders (ohne executeOpenFile) macht sichtbar, dass
// auch die reine Browser-Envelope keinerlei Kind-Erwartung kennt: derselbe VGT5-Umschlag
// liefert unabhängig vom Dateinamen das Dokument mit seinem gespeicherten kind zurück.
describe('Envelope-Dekoder ist kind-blind', () => {
  it('liefert das Present-Dokument aus einem VGT5-Umschlag unverändert zurück', async () => {
    const present = presentDocument();
    const bytes = await packBrowserDeviceEnvelopeContainer(present, testState.deviceKey!);
    const restored = await unpackBrowserDeviceEnvelopeContainer(bytes, testState.deviceKey!);
    expect(restored.kind).toBe('Present');
    expect(restored.gridData).toBeUndefined();
  });
});
