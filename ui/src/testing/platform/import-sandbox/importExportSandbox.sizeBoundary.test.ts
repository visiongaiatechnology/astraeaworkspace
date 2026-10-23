import { describe, expect, it, vi } from 'vitest';
import { inspectForeignFile, preflightIsolatedImageDecode } from '../../../platform/import-sandbox/importExportSandbox';
import { IMPORT_WORKER_MAX_INPUT_BYTES } from '../../../platform/import-sandbox/importExportSandboxWorkerRequest';

function fileLike(size: number, arrayBuffer: () => Promise<ArrayBuffer>): File {
  return {
    name: 'oversized.docx',
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size,
    arrayBuffer,
  } as unknown as File;
}

describe('foreign file intake size boundary', () => {
  it('rejects an oversized Office file before allocating its contents', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = fileLike(IMPORT_WORKER_MAX_INPUT_BYTES + 1, arrayBuffer);

    await expect(inspectForeignFile(file)).rejects.toThrow('Foreign file exceeds intake size limit');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects an oversized isolated image before allocating its contents', async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const file = fileLike(IMPORT_WORKER_MAX_INPUT_BYTES + 1, arrayBuffer);

    await expect(preflightIsolatedImageDecode(file)).rejects.toThrow('Foreign file exceeds intake size limit');
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it('rejects supplied bytes when their measured length differs from File.size', async () => {
    const file = new File([new Uint8Array([0x7b, 0x7d])], 'sample.json', { type: 'application/json' });

    await expect(inspectForeignFile(file, new Uint8Array([0x7b])))
      .rejects.toThrow('Foreign file measured byte length does not match file size');
  });

  it('rejects bytes whose actual read length differs from File.size', async () => {
    const file = fileLike(2, async () => new Uint8Array([0x7b]).buffer);

    await expect(inspectForeignFile(file)).rejects.toThrow('Foreign file measured byte length does not match file size');
  });
});
