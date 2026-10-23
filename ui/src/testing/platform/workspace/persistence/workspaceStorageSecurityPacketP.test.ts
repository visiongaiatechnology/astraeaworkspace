import { describe, expect, it } from 'vitest';
import { loadEmergencySnapshot, saveEmergencySnapshot } from '../../../../platform/workspace/persistence/workspaceStorage';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    values,
  };
}

describe('workspace storage security packet P', () => {
  it('never writes document payloads into the synchronous emergency marker', () => {
    const storage = makeStorage();
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });
    const doc = {
      id: 'doc-secret',
      title: 'TOP-SECRET-CONTENT',
      version: 1,
      kind: 'Writer',
    } as WorkspaceDocument;

    saveEmergencySnapshot({ [doc.id]: doc });
    const raw = [...storage.values.values()][0] ?? '';
    expect(raw.includes('doc-secret')).toBe(true);
    expect(raw.includes('TOP-SECRET-CONTENT')).toBe(false);
    expect(raw.includes('documents')).toBe(false);
  });

  it('refuses and deletes legacy plaintext emergency snapshots', () => {
    const storage = makeStorage();
    storage.setItem('vgt_emergency_snapshot_v1', JSON.stringify({
      timestamp: 1,
      documents: { x: { id: 'x', title: 'legacy-secret' } },
    }));
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage },
    });

    expect(loadEmergencySnapshot()).toBeNull();
    expect(storage.getItem('vgt_emergency_snapshot_v1')).toBeNull();
  });
});
