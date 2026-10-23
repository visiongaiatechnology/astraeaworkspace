// @vitest-environment happy-dom
// STATUS: PLATIN — release blocker #1: "Nativ speichern" reports success only after a real file write.
//
// Before Beta 0.1 the save action packed the container, clicked a synthetic download link and toasted
// success — no file had to exist. These tests prove: the desktop write path is awaited and confirmed,
// a cancelled/refused write is an error, the browser fallback is explicitly labelled as a download, and
// the container artifact is validated (extension + magic) before any dialog sees it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyVaultStatus, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceDocument as Doc } from '../../../shared/contracts/workspace';

vi.mock('../../../platform/containers/container', () => ({
  packContainer: vi.fn(),
  unpackContainer: vi.fn(),
}));

import { packContainer } from '../../../platform/containers/container';
import { executeSaveVwc } from '../../../platform/operations/appContainerOps';

type WriteFileMock = (bytes: Uint8Array, suggestedName: string, extension: string) => Promise<string | null>;

const VWC_BYTES = Uint8Array.of(0x56, 0x57, 0x43, 0x31, 1, 2, 3, 4);

const activeDoc = {
  id: 'doc-save-as',
  title: 'Quartalsplan: 2026',
  kind: 'Writer',
  created_at: 1,
  modified_at: 2,
  version: 1,
  theme_id: 'astraea-dark',
  root_object_ids: [],
  objects: {},
} as unknown as WorkspaceDocument;

const vaultStatus: KeyVaultStatus = {
  isLocked: false,
  hasPin: false,
  platform: 'test',
  privacyMode: false,
  coreConnected: true,
  hardwareBacked: true,
};

const noPrivacy: KeyVaultStatus = { ...vaultStatus, privacyMode: false };

function baseOptions(overrides: Partial<Parameters<typeof executeSaveVwc>[0]> = {}): Parameters<typeof executeSaveVwc>[0] {
  return {
    activeDoc,
    vaultStatus: noPrivacy,
    activeDocumentPin: null,
    activeDocumentPassword: null,
    onSuccess: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

describe('executeSaveVwc — native "Speichern unter…"', () => {
  beforeEach(() => {
    vi.mocked(packContainer).mockResolvedValue(new Uint8Array(VWC_BYTES));
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('awaits the desktop write and reports success only with the confirmed file name', async () => {
    const writeFile = vi.fn<WriteFileMock>(async () => 'Quartalsplan_ 2026.vdoc');
    const options = baseOptions({ writeFile });

    await executeSaveVwc(options);

    expect(writeFile).toHaveBeenCalledOnce();
    const [bytes, suggestedName, extension] = writeFile.mock.calls[0]!;
    expect(Array.from(bytes as Uint8Array)).toEqual(Array.from(VWC_BYTES));
    expect(suggestedName).toBe('Quartalsplan_ 2026.vdoc');
    expect(extension).toBe('vdoc');
    expect(options.onSuccess).toHaveBeenCalledWith('Quartalsplan_ 2026.vdoc', 'file');
    expect(options.onError).not.toHaveBeenCalled();
  });

  it('uses the privacy hash instead of the document title when privacy mode is on', async () => {
    const writeFile = vi.fn<WriteFileMock>(async () => '6f84d81a7e2b.vdoc');
    await executeSaveVwc(baseOptions({ writeFile, vaultStatus: { ...noPrivacy, privacyMode: true } }));
    const [, suggestedName] = writeFile.mock.calls[0]!;
    expect(suggestedName).toBe('6f84d81a7e2b.vdoc');
  });

  it('reports the browser download path as `download`, never as a confirmed file', async () => {
    const writeFile = vi.fn<WriteFileMock>(async () => null);
    const click = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() });
    const options = baseOptions({ writeFile });

    await executeSaveVwc(options);

    expect(click).toHaveBeenCalledOnce();
    expect(options.onSuccess).toHaveBeenCalledWith('Quartalsplan_ 2026.vdoc', 'download');
  });

  it('a failed desktop write is an error — no success is reported', async () => {
    const failure = new Error('Die Datei konnte nicht geschrieben werden: Atomar-Export abgelehnt');
    const options = baseOptions({ writeFile: (async () => { throw failure; }) as WriteFileMock });

    await executeSaveVwc(options);

    expect(options.onError).toHaveBeenCalledWith(failure);
    expect(options.onSuccess).not.toHaveBeenCalled();
  });

  it('a failed container pack is an error before any save dialog opens', async () => {
    vi.mocked(packContainer).mockRejectedValueOnce(new Error('PQC_PROFILE_NOT_OPERATIONAL'));
    const writeFile = vi.fn<WriteFileMock>(async () => 'x.vdoc');
    const options = baseOptions({ writeFile });

    await executeSaveVwc(options);

    expect(writeFile).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledOnce();
    expect(options.onSuccess).not.toHaveBeenCalled();
  });

  it('refuses to hand bytes without the workspace container magic to the dialog', async () => {
    vi.mocked(packContainer).mockResolvedValueOnce(Uint8Array.of(0x4d, 0x5a, 1, 2, 3, 4, 5, 6));
    const writeFile = vi.fn<WriteFileMock>(async () => 'evil.vdoc');
    const options = baseOptions({ writeFile });

    await executeSaveVwc(options);

    expect(writeFile).not.toHaveBeenCalled();
    expect(options.onError).toHaveBeenCalledOnce();
  });

  it('sanitizes path separators out of the suggested container name', async () => {
    const writeFile = vi.fn<WriteFileMock>(async () => 'safe.vdoc');
    const documentWithPath = { ...(activeDoc as Doc), title: '..\\evil:/name' } as Doc;
    await executeSaveVwc(baseOptions({ writeFile, activeDoc: documentWithPath }));
    const [, suggestedName] = writeFile.mock.calls[0]!;
    expect(suggestedName).toBe('.._evil__name.vdoc');
    expect(suggestedName).not.toContain('/');
    expect(suggestedName).not.toContain('\\');
  });
});
