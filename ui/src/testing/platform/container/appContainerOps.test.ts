import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { executeOpenFile } from '../../../platform/operations/appContainerOps';
import { unpackContainer } from '../../../platform/containers/container';
import { VWC_MAX_CONTAINER_BYTES, VwcBoundedError } from '../../../platform/containers/vwcStorage';

vi.mock('../../../platform/containers/container', () => ({
  packContainer: vi.fn(),
  unpackContainer: vi.fn(),
}));

const openedDocument: WorkspaceDocument = {
  id: 'doc-boundary',
  title: 'Boundary fixture',
  kind: 'Writer',
  created_at: 1,
  modified_at: 1,
  version: 7,
  theme_id: 'astraea-dark',
  root_object_ids: [],
  objects: {},
};

function makeFile(size: number, payload = Uint8Array.of(0x56, 0x57, 0x43, 0x31)): File {
  const bytes = payload.slice();
  return {
    name: 'boundary.vwc',
    size,
    arrayBuffer: vi.fn(async () => bytes.buffer as ArrayBuffer),
  } as unknown as File;
}

describe('executeOpenFile container size preflight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(unpackContainer).mockResolvedValue(openedDocument);
  });

  it('rejects an empty file before allocating its contents', async () => {
    const file = makeFile(0);

    await expect(executeOpenFile(file, () => null, () => null)).rejects.toMatchObject({
      name: 'VwcBoundedError',
      code: 'truncated',
    });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(unpackContainer).not.toHaveBeenCalled();
  });

  it('accepts a small valid container and dispatches it to the unpacker', async () => {
    const file = makeFile(4);

    await expect(executeOpenFile(file, () => null, () => null)).resolves.toMatchObject({
      document: openedDocument,
      pinUsed: null,
      passwordUsed: null,
    });
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(unpackContainer).toHaveBeenCalledOnce();
  });

  it('accepts the canonical VWC byte ceiling before reading the file body', async () => {
    const file = makeFile(VWC_MAX_CONTAINER_BYTES);

    await expect(executeOpenFile(file, () => null, () => null)).resolves.toMatchObject({
      document: openedDocument,
    });
    expect(file.arrayBuffer).toHaveBeenCalledOnce();
    expect(unpackContainer).toHaveBeenCalledOnce();
  });

  it('rejects one byte above the canonical VWC ceiling before allocation', async () => {
    const file = makeFile(VWC_MAX_CONTAINER_BYTES + 1);
    const opening = executeOpenFile(file, () => null, () => null);
    const error = await opening.catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(VwcBoundedError);
    expect(error).toMatchObject({ code: 'container-too-large' });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(unpackContainer).not.toHaveBeenCalled();
  });
});
