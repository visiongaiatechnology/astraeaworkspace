// STATUS: PLATIN — Undo/Redo: kanonisch, begrenzt, ohne Serialisierung.
//
// `vaultUndoEngine.ts` trägt die Zusage „Undo bleibt kanonisch und begrenzt": es klont den Tresor **ohne**
// ihn zu serialisieren (Anhänge sind unveränderliche Strings), begrenzt Tiefe, Knotenzahl und Schrittzahl.
// Diese Grenzen sind sicherheitsrelevant, weil ein unbegrenzter Verlauf bei einem Tresor mit großen
// Anhängen den Speicher sprengen kann. Bis hierher hatte das **keinen** Test.
import { describe, expect, it } from 'vitest';
import type { StoredVaultData } from '../../../../shared/contracts/vaultSpaces';
import {
  createVaultUndoHistory,
  recordVaultUndoPoint,
  redoVaultData,
  snapshotVaultData,
  undoVaultData,
  VAULT_UNDO_MAX_DEPTH,
  VAULT_UNDO_MAX_NODES,
  VAULT_UNDO_MAX_STEPS,
} from '../../../../shared/vault/history/vaultUndoEngine';

function vaultData(overrides: Partial<StoredVaultData> = {}): StoredVaultData {
  return { files: [], folders: [], spaces: [], trash: [], ...overrides };
}

describe('Undo-Verlauf: kanonisch, begrenzt, ohne Serialisierung', () => {
  it('ein Schnappschuss ist eine echte Kopie und teilt keine Objekte mit dem Original', () => {
    const original = vaultData({ files: [{ id: 'a', name: 'a.txt', sizeBytes: 1, kind: 'Writer', encryptedHash: '', lastModified: 1 }] });
    const snapshot = snapshotVaultData(original);
    expect(snapshot).toEqual(original);
    // Mutieren des Originals darf den Schnappschuss nicht verändern.
    original.files[0]!.name = 'geändert.txt';
    expect(snapshot.files[0]!.name).toBe('a.txt');
  });

  it('große Anhang-Nutzlasten werden als Zeichenkette geteilt, nicht dupliziert', () => {
    // Der Kommentar im Modul sagt genau das; hier wird es gemessen: die Zeichenkette ist identisch
    // (dieselbe Referenz in V8), aber die Objekt-Hülle ist neu.
    const payload = `data:text/plain;base64,${'A'.repeat(4096)}`;
    const original = vaultData({ files: [{ id: 'a', name: 'a.txt', sizeBytes: 4096, kind: 'Writer', encryptedHash: '', lastModified: 1, payloadDataUrl: payload }] });
    const snapshot = snapshotVaultData(original);
    expect(snapshot.files[0]!.payloadDataUrl).toBe(payload);
    expect(snapshot.files[0]).not.toBe(original.files[0]);
    expect(snapshot.files).not.toBe(original.files);
  });

  it('Uint8Array-Felder werden kopiert, nicht geteilt', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const original = vaultData({ files: [{ id: 'a', name: 'a', sizeBytes: 3, kind: 'Writer', encryptedHash: '', lastModified: 1, chunkIntegrity: bytes as never }] });
    const snapshot = snapshotVaultData(original);
    expect((snapshot.files[0]!.chunkIntegrity as unknown as Uint8Array)).toEqual(bytes);
    expect((snapshot.files[0]!.chunkIntegrity as unknown as Uint8Array)).not.toBe(bytes);
  });

  it('die Tiefe ist begrenzt — ein zu tiefer Baum wird abgelehnt, nicht gestapelt', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let index = 0; index < VAULT_UNDO_MAX_DEPTH + 5; index += 1) {
      deep.nested = {};
      deep = deep.nested as Record<string, unknown>;
    }
    expect(() => snapshotVaultData({ ...vaultData(), shares: [root] } as never)).toThrow('vault_undo_depth_limit');
  });

  it('die Knotenzahl ist begrenzt — ein sehr breiter Baum wird abgelehnt', () => {
    const wide = Array.from({ length: VAULT_UNDO_MAX_NODES + 10 }, (_, index) => ({ id: `x${index}` }));
    expect(() => snapshotVaultData({ ...vaultData(), shares: wide } as never)).toThrow('vault_undo_node_limit');
  });

  it('ein Nicht-Plain-Objekt wird abgelehnt, statt stillschweigend zerlegt zu werden', () => {
    class Fremd { wert = 1; }
    expect(() => snapshotVaultData({ ...vaultData(), shares: [new Fremd()] } as never)).toThrow('vault_undo_non_plain_object');
  });

  it('der Verlauf ist auf die Schrittzahl begrenzt und die ältesten fallen heraus', () => {
    let history = createVaultUndoHistory();
    for (let index = 0; index < VAULT_UNDO_MAX_STEPS + 5; index += 1) {
      history = recordVaultUndoPoint(history, vaultData({ shares: [{ marker: index }] as never }));
    }
    expect(history.past).toHaveLength(VAULT_UNDO_MAX_STEPS);
    // Der älteste verbliebene Eintrag ist nicht der allererste.
    expect((history.past[0]!.shares as Array<{ marker: number }>)[0]!.marker).toBe(5);
  });

  it('Undo und Redo stellen den Zustand wieder her und sind umkehrbar', () => {
    const first = vaultData({ shares: [{ marker: 1 }] as never });
    const second = vaultData({ shares: [{ marker: 2 }] as never });
    let history = recordVaultUndoPoint(createVaultUndoHistory(), first);
    let step = undoVaultData(history, second);
    expect((step.data.shares as Array<{ marker: number }>)[0]!.marker).toBe(1);
    history = step.history;
    step = redoVaultData(history, step.data);
    expect((step.data.shares as Array<{ marker: number }>)[0]!.marker).toBe(2);
    // Nach dem Redo ist die Zukunft leer.
    expect(step.history.future).toEqual([]);
  });

  it('ein neuer Eintrag verwirft die Zukunft — kein widersprüchlicher Verlauf', () => {
    const a = vaultData({ shares: [{ marker: 'a' }] as never });
    const b = vaultData({ shares: [{ marker: 'b' }] as never });
    const c = vaultData({ shares: [{ marker: 'c' }] as never });
    const history = recordVaultUndoPoint(createVaultUndoHistory(), a);
    const undone = undoVaultData(history, b);
    const afterNew = recordVaultUndoPoint(undone.history, c);
    expect(afterNew.future).toEqual([]);
  });

  it('Undo ohne Verlauf und Redo ohne Zukunft werfen benannt', () => {
    expect(() => undoVaultData(createVaultUndoHistory(), vaultData())).toThrow('vault_undo_empty');
    expect(() => redoVaultData(createVaultUndoHistory(), vaultData())).toThrow('vault_redo_empty');
  });

  it('der zurückgegebene Zustand ist wiederum eine Kopie, nicht der Verlaufseintrag selbst', () => {
    const first = vaultData({ shares: [{ marker: 1 }] as never });
    const history = recordVaultUndoPoint(createVaultUndoHistory(), first);
    const step = undoVaultData(history, vaultData());
    // Den zurückgegebenen Zustand mutieren: der Verlauf darf sich nicht ändern.
    (step.data.shares as Array<{ marker: number }>)[0]!.marker = 99;
    const again = undoVaultData(history, vaultData());
    expect((again.data.shares as Array<{ marker: number }>)[0]!.marker).toBe(1);
  });
});
