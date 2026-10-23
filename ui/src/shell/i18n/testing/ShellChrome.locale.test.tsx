// STATUS: PLATIN — shared shell chrome, enum labels, dialogs, and interpolated user values render in all supported locales.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { shellChromeCopy } from '../shellChromeLocale';
import { shellNetworkStaticValues, shellSecurityCopy } from '../shellSecurityLocale';
import { DirtyCloseDialog } from '../../workspace/DirtyCloseDialog';
import { ShellStatusBar } from '../../status/ShellStatusBar';
import { NetGateModal } from '../../security/NetGateModal';
import { SecurityProfileModal } from '../../security/SecurityProfileModal';
import { TopSecretProgressModal } from '../../security/top-secret/TopSecretProgressModal';

const localeState = vi.hoisted(() => ({ current: 'en-US' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const document = { id: 'shell-chrome-locale', kind: 'Writer', title: 'Quarterly plan' } as unknown as WorkspaceDocument;

describe('shared shell chrome locale catalog', () => {
  it.each(WORKSPACE_LOCALES)('renders dirty-close copy and user title in %s', (locale) => {
    localeState.current = locale;
    const copy = shellChromeCopy(locale);
    const markup = renderToStaticMarkup(<DirtyCloseDialog document={document} onResolve={vi.fn()} />);
    expect(markup).toContain(copy.dirtyClose.title);
    expect(markup).toContain(copy.dirtyClose.description(document.title));
    expect(markup).toContain(copy.dirtyClose.cancel);
    expect(markup).toContain(copy.dirtyClose.discard);
    expect(markup).toContain(copy.dirtyClose.save);
  });

  it.each(WORKSPACE_LOCALES)('renders status labels and localized state enums in %s', (locale) => {
    localeState.current = locale;
    const copy = shellChromeCopy(locale).status;
    const markup = renderToStaticMarkup(<ShellStatusBar document={document} save="saved-with-warning" scalePercent={100} topSecretProviderReady={false} />);
    expect(markup).toContain(`aria-label="${copy.document}"`);
    expect(markup).toContain(copy.saveState['saved-with-warning']);
    expect(markup).toContain(copy.syncState['local-only']);
    expect(markup).toContain(copy.profile.STANDARD);
    // WR-006/WR-034: a Writer document owns its page zoom, so the shell slider is replaced
    // by a localised pointer to it. Every other app still gets the workspace scale slider.
    expect(markup).toContain(copy.writerPageZoom);
    expect(markup).not.toContain('type="range"');
    const gridMarkup = renderToStaticMarkup(<ShellStatusBar document={{ ...document, kind: 'Grid' } as unknown as WorkspaceDocument} save="saved-with-warning" scalePercent={100} topSecretProviderReady={false} />);
    expect(gridMarkup).toContain(copy.zoomOut);
    expect(markup).not.toContain('saved-with-warning');
    expect(markup).not.toContain('local-only');
  });

  it.each(WORKSPACE_LOCALES)('maps shell enum codes to localized labels in %s', (locale) => {
    const copy = shellChromeCopy(locale);
    expect(copy.status.capability.FullUserApproved).toBeTruthy();
    expect(copy.workspace.performanceReason['estimated-memory-budget-exceeded']).toBeTruthy();
    expect(copy.workspace.performanceReason['workspace-object-budget-exceeded']).not.toContain('workspace-object-budget-exceeded');
    expect(copy.header.searchInDocument('Quarterly plan')).toContain('Quarterly plan');
  });

  it.each(WORKSPACE_LOCALES)('renders security dialogs and typed status labels in %s', (locale) => {
    localeState.current = locale;
    const copy = shellSecurityCopy(locale);
    const netgateMarkup = renderToStaticMarkup(<NetGateModal isOpen onClose={vi.fn()} capability="None" onChangeCapability={vi.fn()} auditLogs={[]} activeDocumentId="doc-1" onTriggerTestConnection={vi.fn()} />);
    expect(netgateMarkup).toContain(copy.netgate.title);
    expect(netgateMarkup).toContain(copy.netgate.empty);
    expect(netgateMarkup).toContain(shellNetworkStaticValues(locale).outbound);
    expect(netgateMarkup).toContain(shellNetworkStaticValues(locale).metadata);
    const allowedLog = { id: 1, timestamp: 0, component: 'test', target_host: 'example.test', target_port: 443, protocol: 'https', purpose: 'test', verdict: 'Allowed' as const };
    const allowedMarkup = renderToStaticMarkup(<NetGateModal isOpen onClose={vi.fn()} capability="None" onChangeCapability={vi.fn()} auditLogs={[allowedLog]} activeDocumentId="doc-1" onTriggerTestConnection={vi.fn()} />);
    expect(allowedMarkup).toContain(copy.netgate.networkVerdict.Allowed);

    const vaultStatus = { isLocked: true, hasPin: false, platform: 'test', privacyMode: true, coreConnected: false, topSecretUnlocked: false };
    const topSecretStatus = { connected: false, providerReady: false, identityReady: false, topSecretUnlocked: false, outerSuite: 'suite', infinitySuite: 'suite', infinityCommit: 'commit', assurance: 'unavailable' };
    const profileMarkup = renderToStaticMarkup(<SecurityProfileModal isOpen document={document} vaultStatus={vaultStatus} topSecretStatus={topSecretStatus} onClose={vi.fn()} onApply={vi.fn()} onInitializeIdentity={vi.fn()} />);
    expect(profileMarkup).toContain(copy.profile.title);
    expect(profileMarkup).toContain(copy.profile.profileDetail.STANDARD);
    expect(profileMarkup).toContain(copy.profile.reason('Profile change requires complete authenticated reseal.'));

    const progressMarkup = renderToStaticMarkup(<TopSecretProgressModal event={{ operation_id: 'op-1', phase: 'OPEN_INFINITY_LAYERS', bytes_completed: 12, chunks_completed: 1, cancellable: false }} onCancel={vi.fn()} />);
    expect(progressMarkup).toContain(copy.progress.phase.OPEN_INFINITY_LAYERS);
    expect(progressMarkup).toContain(copy.progress.sealedUnverified);
    expect(progressMarkup).toContain(copy.progress.noCancel);
  });
});
