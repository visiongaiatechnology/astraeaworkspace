// @vitest-environment happy-dom
// STATUS: PLATIN — native round 41: the save dialog must receive the concrete export name and
// file type. Before this, the dialog opened without a name and without a filter, so the desktop
// wrote an extension-less file that no application could associate ("no file type").
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewDocument } from '../../../app/bootstrap/seedDocDefaultsOpenCore';
import { downloadOfficeDocument } from '../index';

// The export-name contract is about the *dialog request*; the sandbox artifact validation runs
// in a real Worker and is covered by its own suite, so it is stubbed here.
vi.mock('../../import-sandbox/importExportSandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../import-sandbox/importExportSandbox')>();
  return { ...actual, assertExportArtifact: vi.fn(async () => undefined) };
});

const TOKEN = '11111111-2222-4333-8444-555555555555';

function desktop(invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>): void {
  (window as unknown as { __TAURI__?: unknown }).__TAURI__ = { core: { invoke } };
}

afterEach(() => {
  delete (window as unknown as { __TAURI__?: unknown }).__TAURI__;
});

describe('native Office export request', () => {
  it.each([
    ['Writer' as const, 'docx'],
    ['Grid' as const, 'xlsx'],
    ['Present' as const, 'pptx'],
  ])('%s export suggests a %s file name and whitelists exactly that type', async (kind, extension) => {
    const saveRequests: Array<{ suggestedName?: string; extensions?: string[] }> = [];
    desktop(async (command, args) => {
      if (command === 'vgt_shell_save_dialog') {
        const request = (args?.request ?? {}) as { suggestedName?: string; extensions?: string[] };
        saveRequests.push(request);
        const fileName = request.suggestedName && request.suggestedName.endsWith(`.${extension}`)
          ? request.suggestedName
          : `document.${extension}`;
        return { token: TOKEN, file_name: fileName };
      }
      return { contract: 'VGT-IMPORT-SANDBOX-3', status: 'committed' };
    });

    const created = createNewDocument(kind as never);
    const writtenName = await downloadOfficeDocument(created as never);

    expect(writtenName.endsWith(`.${extension}`), 'die geschriebene Datei trägt den Dateityp').toBe(true);
    expect(saveRequests, 'der Speicherdialog erhält Name und Dateityp').toHaveLength(1);
    expect(saveRequests[0]!.suggestedName).toMatch(new RegExp(`\\.${extension}$`, 'u'));
    expect(saveRequests[0]!.extensions).toEqual([extension]);
  });
});
