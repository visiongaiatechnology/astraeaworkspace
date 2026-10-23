// STATUS: PLATIN — release blocker #1: the status bar states what was saved (file vs browser cache).
//
// "Gespeichert" alone was the exact lie the beta had to remove. These render tests prove that a
// confirmed file proof produces "Gespeichert · Datei" with the file name/SHA-256 tooltip, that the
// browser cache is named as such, that warnings carry their reason, and that a visible action exists
// to open the folder of confirmed files.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { ShellStatusBar } from '../ShellStatusBar';
import { workspaceSaveProofCopy } from '../../persistence/workspaceSaveProof';
import { shellChromeCopy } from '../../i18n/shellChromeLocale';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = { id: 'status-proof-doc', kind: 'Writer', title: 'Quarterly plan' } as unknown as WorkspaceDocument;

const FILE_PROOF = {
  kind: 'file' as const,
  fileName: `doc-${'a'.repeat(32)}.vwc`,
  sizeBytes: 2_048,
  sha256: 'b'.repeat(64),
  modifiedAtMs: 1_700_000_000_000,
  rootPath: 'C:\\Users\\Test\\AppData\\Roaming\\Astraea\\workspace-store',
};

function render(overrides: Partial<Parameters<typeof ShellStatusBar>[0]> = {}): string {
  return renderToStaticMarkup(
    <ShellStatusBar document={document} save="saved" scalePercent={100} topSecretProviderReady={false} {...overrides} />,
  );
}

describe('ShellStatusBar save proof', () => {
  it('shows "Gespeichert · Datei" for a confirmed native file and explains it via tooltip', () => {
    const markup = render({ saveProof: FILE_PROOF });
    const copy = workspaceSaveProofCopy('de-DE');
    expect(markup).toContain(copy.fileSuffix);
    expect(markup).toContain(`data-save-proof="file"`);
    expect(markup).toContain(FILE_PROOF.fileName);
    expect(markup).toContain('SHA-256 bbbbbbbbbbbbbbbb');
    expect(markup).toContain('workspace-store');
  });

  it('names the browser cache instead of claiming a file', () => {
    const markup = render({ saveProof: { kind: 'browser-cache', savedAt: 1_700_000_000_000 } });
    const copy = workspaceSaveProofCopy('de-DE');
    expect(markup).toContain(copy.browserSuffix);
    expect(markup).toContain('data-save-proof="browser-cache"');
    expect(markup).not.toContain('data-save-proof="file"');
  });

  it('explains a saved-with-warning state with its actual reason', () => {
    const markup = render({ save: 'saved-with-warning', saveProof: FILE_PROOF, saveWarning: 'cache-stale' });
    expect(markup).toContain(workspaceSaveProofCopy('de-DE').warning['cache-stale']);
    expect(markup).toContain('data-save-warning="cache-stale"');
  });

  it('shows the precise file failure stage next to the classified reason', () => {
    const markup = render({
      save: 'error',
      saveFailure: { code: 'unknown', detail: 'file-verification-failed' },
    });
    expect(markup).toContain(shellChromeCopy('de-DE').saveFailure.unknown);
    expect(markup).toContain(workspaceSaveProofCopy('de-DE').failure['file-verification-failed']);
    expect(markup).toContain('data-save-failure-detail="file-verification-failed"');
  });

  it('offers opening the folder of confirmed files only when the native store exists', () => {
    const withStore = render({ saveProof: FILE_PROOF, workspaceFileStoreAvailable: true, onRevealWorkspaceFiles: () => undefined });
    expect(withStore).toContain(workspaceSaveProofCopy('de-DE').revealFolder);
    const withoutStore = render({ saveProof: FILE_PROOF, workspaceFileStoreAvailable: false, onRevealWorkspaceFiles: () => undefined });
    expect(withoutStore).not.toContain(workspaceSaveProofCopy('de-DE').revealFolder);
  });

  it.each(WORKSPACE_LOCALES)('names the confirmed file in %s without raw codes', (locale) => {
    localeState.current = locale;
    const copy = workspaceSaveProofCopy(locale);
    const markup = render({ save: 'saved-with-warning', saveProof: FILE_PROOF, saveWarning: 'recovery-unavailable' });
    expect(markup).toContain(copy.fileSuffix);
    expect(markup).toContain(copy.warning['recovery-unavailable']);
    expect(markup).not.toContain('data-save-proof="browser-cache"');
  });
});
