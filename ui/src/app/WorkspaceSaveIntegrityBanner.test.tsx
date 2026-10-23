// STATUS: PLATIN — release blocker #1: a failed file save must be visible and actionable.
//
// The banner is the user-visible consequence of the honest status: it appears only for a failed
// authoritative save, names the failed stage, says that the changes are kept, and offers retry plus
// the portable "Speichern unter…" path. A successful or warning state renders nothing.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceLocale } from '../shell/localization/workspaceLocaleTypes';
import { WORKSPACE_LOCALES } from '../shell/localization/workspaceLocaleTypes';
import { WorkspaceSaveIntegrityBanner } from './WorkspaceSaveIntegrityBanner';
import { workspaceSaveProofCopy } from '../shell/persistence/workspaceSaveProof';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

function render(overrides: Partial<Parameters<typeof WorkspaceSaveIntegrityBanner>[0]> = {}): string {
  return renderToStaticMarkup(
    <WorkspaceSaveIntegrityBanner
      saveStatus="error"
      saveFailure={{ code: 'unknown', detail: 'file-write-failed', at: 1_700_000_000_000 }}
      busy={false}
      fileStoreAvailable
      onRetry={() => undefined}
      onSaveAs={() => undefined}
      {...overrides}
    />,
  );
}

describe('WorkspaceSaveIntegrityBanner', () => {
  it('is absent while saving works or only warns', () => {
    expect(render({ saveStatus: 'saved', saveFailure: null })).toBe('');
    expect(render({ saveStatus: 'saved-with-warning', saveFailure: null })).toBe('');
    expect(render({ saveStatus: 'saving', saveFailure: null })).toBe('');
    expect(render({ saveStatus: 'unsaved', saveFailure: null })).toBe('');
  });

  it('shows the precise stage, the dirty-state reassurance and both recovery actions', () => {
    const markup = render();
    const copy = workspaceSaveProofCopy('de-DE');
    expect(markup).toContain('data-save-integrity-banner="true"');
    expect(markup).toContain(copy.failureTitle);
    expect(markup).toContain(copy.failure['file-write-failed']);
    expect(markup).toContain(copy.failureHint);
    expect(markup).toContain(copy.retry);
    expect(markup).toContain(copy.saveAs);
    expect(markup).toContain('data-save-action="retry"');
    expect(markup).toContain('data-save-action="save-as"');
  });

  it('falls back to the classified reason when no stage is known', () => {
    const markup = render({ saveFailure: { code: 'native-unavailable', at: 1 } });
    expect(markup).toContain('data-save-integrity-reason="native-unavailable"');
  });

  it('disables the actions while a retry/save-as is running', () => {
    const markup = render({ busy: true });
    expect(markup).toContain('disabled=""');
  });

  it('offers the folder of confirmed files only when the native store exists', () => {
    const withStore = render({ fileStoreAvailable: true, onRevealWorkspaceFiles: () => undefined });
    expect(withStore).toContain('data-save-action="reveal"');
    const withoutStore = render({ fileStoreAvailable: false, onRevealWorkspaceFiles: () => undefined });
    expect(withoutStore).not.toContain('data-save-action="reveal"');
  });

  it.each(WORKSPACE_LOCALES)('explains a failed file write in %s', (locale) => {
    localeState.current = locale;
    const copy = workspaceSaveProofCopy(locale);
    const markup = render({ saveFailure: { code: 'unknown', detail: 'file-verification-failed', at: 1 } });
    expect(markup).toContain(copy.failureTitle);
    expect(markup).toContain(copy.failure['file-verification-failed']);
    expect(markup).toContain(copy.retry);
    expect(markup).toContain(copy.saveAs);
  });
});
