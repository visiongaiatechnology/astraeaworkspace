// @vitest-environment happy-dom
// STATUS: PLATIN — Release Beta 0.1: bounded parallel startup scan (performance, no silent loss).
import { describe, expect, it } from 'vitest';
import {
  MAX_WORKSPACE_FILE_SCAN,
  WORKSPACE_FILE_SCAN_CONCURRENCY,
  scanWorkspaceDocumentFiles,
  type WorkspaceFileStorePort,
} from '../workspaceFilePersistence';
import {
  createFakeWorkspaceFileStore,
  createTestContainerCodec,
  workspaceDocumentFixture,
} from './workspaceFileTestDoubles';

const DOCUMENT_COUNT = 10;

async function seedStore(): Promise<{ port: WorkspaceFileStorePort; codec: Awaited<ReturnType<typeof createTestContainerCodec>> }> {
  const store = createFakeWorkspaceFileStore();
  const codec = await createTestContainerCodec();
  for (let index = 0; index < DOCUMENT_COUNT; index += 1) {
    const document = workspaceDocumentFixture({
      id: `scan-doc-${index}`,
      title: `Scan ${index}`,
      modified_at: 1_700_000_000_000 + index,
    });
    await store.port.write(document.id, await codec.pack(document, {}));
  }
  return { port: store.port, codec };
}

describe('workspace startup scan concurrency (release performance)', () => {
  it('reads store files with bounded concurrency while returning every verified document', async () => {
    const { port, codec } = await seedStore();
    let inFlight = 0;
    let maxInFlight = 0;
    const instrumented: WorkspaceFileStorePort = {
      ...port,
      async list() {
        return port.list();
      },
      async read(fileName) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        // A native store read is an IPC round-trip; the artificial delay makes overlapping
        // reads observable without making the test slow.
        await new Promise((resolve) => setTimeout(resolve, 10));
        try {
          return await port.read(fileName);
        } finally {
          inFlight -= 1;
        }
      },
    };

    const scan = await scanWorkspaceDocumentFiles(instrumented, {}, codec);

    expect(scan.available).toBe(true);
    expect(scan.records).toHaveLength(DOCUMENT_COUNT);
    expect(maxInFlight).toBeGreaterThan(1);
    expect(maxInFlight).toBeLessThanOrEqual(WORKSPACE_FILE_SCAN_CONCURRENCY);
    expect(scan.lockedFileCount).toBe(0);
    expect(scan.failedFileCount).toBe(0);
    expect(scan.truncated).toBe(false);
  });

  it('keeps the newest record per document id and counts unusable files instead of dropping the scan', async () => {
    const { port, codec } = await seedStore();
    const failing: WorkspaceFileStorePort = {
      ...port,
      async read(fileName) {
        if (fileName.endsWith('0.vwc')) throw new Error('Workspace document could not be read');
        return port.read(fileName);
      },
    };
    const current = await port.list();
    const scan = await scanWorkspaceDocumentFiles(failing, {}, codec, current?.files.length ?? MAX_WORKSPACE_FILE_SCAN);
    expect(scan.available).toBe(true);
    expect(scan.records).toHaveLength(DOCUMENT_COUNT - 1);
    expect(scan.failedFileCount).toBe(1);
    expect(scan.records.every((record) => record.receipt.sha256.length === 64)).toBe(true);
  });

  it('bounded scan window stays at MAX_WORKSPACE_FILE_SCAN for a huge store listing', async () => {
    const files = Array.from({ length: MAX_WORKSPACE_FILE_SCAN + 10 }, (_, index) => ({
      fileName: `doc-${index.toString(16).padStart(32, '0')}.vwc`,
      sizeBytes: 1,
      modifiedAtMs: 1_700_000_000_000 + index,
    }));
    const port: WorkspaceFileStorePort = {
      list: async () => ({ rootPath: 'C:\\store', files }),
      read: async () => null,
      write: async () => null,
      remove: async () => false,
      reveal: async () => true,
    };
    const codec = await createTestContainerCodec();
    const scan = await scanWorkspaceDocumentFiles(port, {}, codec);
    expect(scan.truncated, 'überschüssige Dateien werden gemeldet, nicht still ignoriert').toBe(true);
    expect(scan.failedFileCount).toBe(MAX_WORKSPACE_FILE_SCAN);
  });
});
