// STATUS: PLATIN — Source + behaviour contract: a failed save still reaches the encrypted recovery store
//
// Paket 42 acceptance: "Fehlerhaftes Speichern simulieren; native Recovery bleibt verschlüsselt und
// **nutzbar**."
//
// W-226, found by reading the order of operations: the primary save, the version snapshot and the
// native recovery snapshot ran in that order inside one `try`. When the primary save threw, the two
// snapshot calls never ran — so the newest work reached **no** durable store at all. The emergency
// marker holds document ids only (and `loadEmergencySnapshot` deliberately discards it), so closing
// or crashing after a failed save lost everything since the last successful save, although an
// encrypted recovery store existed that could have held it.
//
// Release 0.1 structure: the ordering moved into
// `ui/src/shell/persistence/workspaceAutosaveFlush.ts` (platform-free, testable without React) and the
// hook only delegates to it and publishes its outcome. This contract therefore checks the invariant
// **behaviourally** against the orchestrator (not only by string match) and additionally verifies the
// hook still gates dirty persistence on `outcome.persistedDocumentIds` and reports failures as
// failures. The encryption itself is verified in writerRecoveryEncryption.test.ts.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runWorkspaceAutosaveFlush } from '../../../../../shell/persistence/workspaceAutosaveFlush';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (relative) => readFileSync(path.resolve(here, relative), 'utf8');

const autosave = read('../../../../../shell/persistence/useWorkspaceAutosave.ts');
const flushSource = read('../../../../../shell/persistence/workspaceAutosaveFlush.ts');
const documents = read('../../../../../platform/workspace/persistence/workspaceStorageDocuments.ts');
const recoveryStore = read('../../../../../platform/workspace/persistence/workspaceStorageRecovery.ts');
const emergency = read('../../../../../platform/workspace/persistence/workspaceStorageEmergency.ts');

/** The smallest document the orchestrator accepts; it never inspects writer content. */
const fakeDocument = (id) => ({
  id,
  title: 'Autosave-Contract',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 1,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  writerData: { pageSetup: {}, tables: [] },
});

const flushBlock = () => autosave.slice(
  autosave.indexOf('const flushPendingSaves'),
  autosave.indexOf('const markDocumentDirty'),
);

describe('the autosave failure path — failure is remembered, snapshots still run', () => {
  it('remembers a failed primary save instead of aborting before the snapshots', async () => {
    const calls = [];
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-1': fakeDocument('doc-1') },
      documentIds: ['doc-1'],
      persistFile: async () => { calls.push('file'); throw new Error('disk full'); },
      persistCache: async () => { calls.push('cache'); },
      persistVersionSnapshot: async () => { calls.push('version'); },
      persistRecoverySnapshot: async () => { calls.push('recovery'); return 'written'; },
    });

    // The whole point of W-226: the primary failure did not skip the durable snapshots.
    expect(calls).toEqual(['file', 'cache', 'version', 'recovery']);
    expect(result.failure).not.toBeNull();
    expect(result.failedDocumentIds).toEqual(['doc-1']);
    expect(result.persistedDocumentIds).toEqual([]);
    expect(result.fileReceipts).toEqual({});
  });

  it('keeps a failure a failure even when cache and snapshots succeed', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-1': fakeDocument('doc-1') },
      documentIds: ['doc-1'],
      persistFile: async () => { throw new Error('file write failed'); },
      persistCache: async () => undefined,
      persistVersionSnapshot: async () => undefined,
      persistRecoverySnapshot: async () => 'written',
    });

    expect(result.cacheConfirmed).toBe(true);
    expect(result.warning).toBeNull();
    // Success of a *secondary* layer must never upgrade a failed primary save.
    expect(result.failure).not.toBeNull();
    expect(result.persistedDocumentIds).toEqual([]);
  });

  it('does not count a document as persisted when its primary save failed', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-1': fakeDocument('doc-1') },
      documentIds: ['doc-1'],
      persistFile: async () => { throw new Error('disk full'); },
      persistCache: async () => undefined,
      persistVersionSnapshot: async () => undefined,
      persistRecoverySnapshot: async () => 'written',
    });

    expect(result.persistedDocumentIds).toEqual([]);
    expect(result.failedDocumentIds).toEqual(['doc-1']);
  });

  it('in the browser build the confirmed cache may persist — and stays explicitly cache-only', async () => {
    const result = await runWorkspaceAutosaveFlush({
      documents: { 'doc-1': fakeDocument('doc-1') },
      documentIds: ['doc-1'],
      persistFile: null,
      persistCache: async () => undefined,
    });

    expect(result.failure).toBeNull();
    expect(result.persistedDocumentIds).toEqual(['doc-1']);
    expect(result.fileReceipts).toEqual({});
    // The hook marks this as `browser-cache` exactly because no file receipt exists.
    expect(flushSource).toContain('if (!dependencies.persistFile && cacheConfirmed) {');
  });
});

describe('the hook delegates the decision and keeps dirty documents on failure', () => {
  it('delegates one flush to the durable-layer orchestrator instead of deciding locally', () => {
    expect(autosave).toContain("from './workspaceAutosaveFlush'");
    expect(autosave).toContain('runWorkspaceAutosaveFlush');
    expect(flushBlock()).toContain('runWorkspaceAutosaveFlush({');
  });

  it('clears dirty state only for documents the authoritative layer confirmed', () => {
    const block = flushBlock();
    const persistedLoop = block.indexOf('for (const id of outcome.persistedDocumentIds) {');
    const deletion = block.indexOf('dirtyDocIdsRef.current.delete(id);');
    expect(persistedLoop).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(persistedLoop);
    // A mutation that arrived during the flush keeps the document dirty even if this revision saved.
    expect(block).toContain('mutationRevisionRef.current.get(id)');
  });

  it('keeps a failure a failure: status error, no success toast, no dirty clearing', () => {
    const block = flushBlock();
    const failureBranch = block.indexOf('if (outcome.failure) {');
    expect(failureBranch).toBeGreaterThan(-1);
    const successStatus = block.indexOf("setSaveStatus(outcome.warning ? 'saved-with-warning' : 'saved');");
    expect(successStatus).toBeGreaterThan(failureBranch);
    const failureSlice = block.slice(failureBranch, successStatus);
    expect(failureSlice).toContain("setSaveStatus('error');");
    expect(failureSlice).not.toContain('onSaveToast');
  });

  it('only adds to persistedDocumentIds when the outcome lists confirmed documents', () => {
    const block = flushBlock();
    const guard = block.indexOf('if (outcome.persistedDocumentIds.length > 0) {');
    const setter = block.indexOf('setPersistedDocumentIds((previous) => {');
    expect(guard).toBeGreaterThan(-1);
    expect(setter).toBeGreaterThan(guard);
  });
});

describe('the stores themselves stay encrypted and atomic', () => {
  it('packs a container for the primary store before opening a transaction', () => {
    // No plaintext may sit inside an open IndexedDB transaction.
    expect(documents).toContain('const container = await packLocalEncryptedContainer(doc,');
    expect(documents).toContain('// Encrypt before opening the transaction.');
    expect(documents).toContain("format: 'vgt-encrypted-container-v2'");
  });

  it('writes a whole batch in one transaction, so a failure cannot half-write it', () => {
    expect(documents).toContain("db.transaction([DOCS_STORE, META_STORE, JOURNAL_STORE], 'readwrite')");
    expect(documents).toContain('tx.oncomplete = () => resolve();');
    expect(documents).toContain("tx.onerror = () => reject(tx.error || new Error('Batch transaction error'));");
  });

  it('encrypts recovery snapshots with the same container format', () => {
    expect(recoveryStore).toContain('const container = await packLocalEncryptedContainer(doc,');
    expect(recoveryStore).toContain("format: 'vgt-encrypted-container-v2'");
  });

  it('keeps the emergency marker free of content, and discards legacy plaintext', () => {
    // The marker is why "the snapshots run on failure" matters: it can never carry the work.
    const marker = emergency.slice(emergency.indexOf('export function saveEmergencySnapshot'), emergency.indexOf('export function loadEmergencySnapshot'));
    expect(marker).toContain('documentIds:');
    expect(marker).not.toContain('JSON.stringify(docs)');
    expect(emergency).toContain('Version-1 plaintext emergency snapshots are deliberately');
    expect(emergency).toContain('return null;');
  });
});
