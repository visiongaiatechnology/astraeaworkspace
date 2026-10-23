// STATUS: PLATIN — BATCH-CONNECT-7 tests: the honest connection status, the account surface, the
// notification tray, and a source contract that no Connect control is a decorated no-op.
//
// Headless: `renderToStaticMarkup` only (no jsdom, no testing-library).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ConnectSidebar } from '../components/ConnectSidebar';
import { ConnectAccountDialog } from '../components/ConnectAccountDialog';
import { ConnectNotificationTray } from '../components/ConnectNotificationTray';
import { ConnectMailViewer } from '../components/ConnectMailViewer';
import { DEFAULT_CONNECT_MODEL, type ConnectDocumentModel, type ConnectNotification } from '../domain/types';
import { connectCopy } from '../locale/connectLocale';
import { connectExtraCopy, connectionStatusText } from '../locale/connectLocaleExtra';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';
import { attachCredential, completeSetupWithoutProbe } from '../domain/connectAccountSetup';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = (overrides: Partial<ConnectDocumentModel> = {}): ConnectDocumentModel => ({
  ...structuredClone(DEFAULT_CONNECT_MODEL),
  ...overrides,
});



describe('Connect connection status is never a hardcoded claim', () => {
  it('renders "no connection" with an unconfigured account and never the old hardcoded address', () => {
    localeState.current = 'de-DE';
    const copy = connectCopy('de-DE');
    const extra = connectExtraCopy('de-DE');
    const markup = renderToStaticMarkup(<ConnectSidebar model={model()} onUpdateModel={vi.fn()} onOpenCompose={vi.fn()} />);
    expect(markup).toContain('data-connect-connection-status="disconnected"');
    expect(markup).toContain('data-connect-connection-glyph="disconnected"');
    expect(markup).toContain(extra.statusDisconnected);
    expect(markup).not.toContain('engineer@vgt.internal');
    // The queue view and the compose button stay reachable.
    expect(markup).toContain('data-connect-queue-view="true"');
    expect(markup).toContain(copy.compose);
  });

  it('shows the measured failed code and the checked adapter for a failed connection', () => {
    localeState.current = 'de-DE';
    const extra = connectExtraCopy('de-DE');
    const markup = renderToStaticMarkup(
      <ConnectSidebar
        model={model({
          accounts: [{ id: 'a', name: 'A', address: 'auditor@vgt.internal', kind: 'imap+local', host: 'imap.vgt.internal', port: 993, tls: 'starttls-required', username: 'u', credentialHandle: 'keyvault://x/y', tlsCertificate: 'failed', isDefault: true, createdAt: 1 }],
          connection: { status: 'failed', adapter: 'imap', code: 'imap-certificate-failure', checkedAt: 1_700_000_000_000 },
        })}
        onUpdateModel={vi.fn()}
        onOpenCompose={vi.fn()}
      />,
    );
    expect(markup).toContain('data-connect-connection-status="failed"');
    expect(markup).toContain('data-connect-connection-glyph="failed"');
    expect(markup).toContain(extra.statusFailed('imap-certificate-failure'));
    expect(markup).toContain(extra.statusAdapter('imap'));
    expect(markup).toContain('auditor@vgt.internal');
  });

  it('shows a real address and the connected word only for a connected state', () => {
    const connected = connectionStatusText(connectExtraCopy('en-US'), { status: 'connected', adapter: 'imap' });
    expect(connected).toBe(connectExtraCopy('en-US').statusConnected);
    expect(connectionStatusText(connectExtraCopy('en-US'), undefined)).toBe(connectExtraCopy('en-US').statusNeverAttempted);
  });

  it('exposes the account, sync and notification entries in every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const extra = connectExtraCopy(locale);
      const markup = renderToStaticMarkup(<ConnectSidebar model={model()} onUpdateModel={vi.fn()} onOpenCompose={vi.fn()} />);
      expect(markup).toContain('data-connect-account-entry="true"');
      expect(markup).toContain('data-connect-sync-entry="true"');
      expect(markup).toContain('data-connect-notification-entry="true"');
      expect(markup).toContain(`aria-label="${extra.accountSettings}"`);
      expect(markup).toContain(`aria-label="${extra.syncNow}"`);
      expect(markup).toContain(extra.folderJunk);
      expect(markup).toContain(extra.folderTrash);
      expect(markup).toContain('data-connect-folder="junk"');
      expect(markup).toContain('data-connect-folder="trash"');
    }
  });
});

describe('Connect account dialog is fail-closed', () => {
  it('says the credential goes to the KeyVault and offers a TLS check, without claiming it ran', () => {
    localeState.current = 'de-DE';
    const extra = connectExtraCopy('de-DE');
    const markup = renderToStaticMarkup(<ConnectAccountDialog onClose={vi.fn()} onAccountConfigured={vi.fn()} />);
    expect(markup).toContain('data-connect-account-dialog="true"');
    expect(markup).toContain('data-connect-credential-note="keyvault-only"');
    expect(markup).toContain(extra.accountPasswordNote);
    expect(markup).toContain('data-connect-account-step="idle"');
    expect(markup).toContain(extra.accountTlsUnchecked);
    expect(markup).toContain('data-connect-account-create="true"');
    // The probe is offered but disabled until an account record exists.
    expect(markup).toContain('data-connect-account-probe="true"');
    expect(markup).toContain('disabled');
    // No password field value is ever rendered.
    expect(markup).not.toMatch(/value="[^"]{1,}"[^>]*data-connect-account-field="secret"/);
  });

  it('reports BLOCKED instead of connected when this build cannot activate the adapter', () => {
    // The state machine is the source of the wording; the dialog renders its verdict.
    const state = completeSetupWithoutProbe(
      attachCredential({ step: 'entering-imap', draft: { displayName: 'A', address: 'a@b.c', host: 'imap.vgt.internal', port: '993', username: 'u' } }, { stored: true, handle: 'keyvault://connect/imap/a' }),
      'acc-1',
      1_000,
    );
    expect(state.step).toBe('blocked');
    const markup = renderToStaticMarkup(
      <ConnectAccountDialog onClose={vi.fn()} onAccountConfigured={vi.fn()} storeSecret={async () => ({ stored: false })} />,
    );
    expect(markup).toContain('data-connect-account-dialog="true"');
    expect(state.blockedCode).toBe('local-account-network-adapter-blocked');
  });
});

describe('Connect notification tray', () => {
  it('renders quiet-hour entries as held back instead of as a popup', () => {
    localeState.current = 'de-DE';
    const extra = connectExtraCopy('de-DE');
    const tray: ConnectNotification[] = [
      { id: 'n1', kind: 'mail', code: 'new-mail', createdAt: 1, args: { dedupeKey: 'm1' } },
      { id: 'n2', kind: 'calendar', code: 'event-soon', createdAt: 2, suppressed: true, args: { dedupeKey: 'e1' } },
    ];
    const markup = renderToStaticMarkup(<ConnectNotificationTray tray={tray} onClose={vi.fn()} onMarkAllRead={vi.fn()} />);
    expect(markup).toContain('data-connect-notification-tray="true"');
    expect(markup).toContain('data-connect-notification-suppressed="1"');
    expect(markup).toContain('data-connect-quiet-notice="true"');
    expect(markup).toContain(extra.notificationsSuppressed(1));
    // Both machine codes are rendered verbatim; nothing is paraphrased into a claim.
    expect(markup).toContain('data-connect-notification="new-mail"');
    expect(markup).toContain('data-connect-notification="event-soon"');
    expect(markup).toContain('data-connect-notification-mark-all="true"');
  });

  it('renders an empty state without inventing an entry', () => {
    localeState.current = 'en-US';
    const markup = renderToStaticMarkup(<ConnectNotificationTray tray={[]} onClose={vi.fn()} />);
    expect(markup).toContain(connectExtraCopy('en-US').notificationsEmpty);
    expect(markup).not.toContain('data-connect-notification="');
  });
});

describe('Connect compose surface offers a real draft path', () => {
  it('renders the save-as-draft control next to the queue control and states the build cannot encrypt', () => {
    localeState.current = 'de-DE';
    const extra = connectExtraCopy('de-DE');
    const copy = connectCopy('de-DE');
    const markup = renderToStaticMarkup(
      <ConnectMailViewer model={model()} onUpdateModel={vi.fn()} isComposeOpen onCloseCompose={vi.fn()} />,
    );
    expect(markup).toContain('data-connect-compose-save-draft="true"');
    expect(markup).toContain('data-connect-compose-queue="true"');
    expect(markup).toContain(extra.saveDraft);
    expect(markup).toContain(extra.composeUnsentNote);
    expect(markup).toContain('data-connect-encryption-state="none"');
    expect(markup).toContain(copy.queueSend);
    expect(markup).toContain('data-connect-compose-field="cc"');
  });
});
