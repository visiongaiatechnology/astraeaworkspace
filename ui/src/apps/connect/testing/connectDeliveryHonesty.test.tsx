// STATUS: PLATIN — BATCH-60: Connect may claim "sent"/"encrypted" only when it really happened.
// Pure decisions + visible text. No jsdom, no testing-library: react-dom/server markup only.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { queueCompose } from '../application/connectUiBridge';
import { isQueuedDelivery, resolveConnectDeliveryState } from '../domain/connectDeliveryState';
import { CONNECT_QUEUE_FOLDER, countQueuedMessages, selectVisibleMessages } from '../domain/connectMailboxView';
import { DEFAULT_CONNECT_MODEL, type ConnectMessage } from '../domain/types';
import { ConnectMailList } from '../components/ConnectMailList';
import { ConnectMailViewer } from '../components/ConnectMailViewer';
import { ConnectSidebar } from '../components/ConnectSidebar';
import { connectCopy } from '../locale/connectLocale';
import { connectQueuedNotice, connectSentLabel } from '../components/connectDeliveryPresentation';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../../shell/localization/workspaceLocaleTypes';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../../shell/localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const model = structuredClone(DEFAULT_CONNECT_MODEL);

const queuedMessage: ConnectMessage = {
  id: 'msg-queued', sender: 'Me (Sovereign Node)', senderEmail: 'engineer@vgt.internal',
  recipients: ['peer@vgt.internal'], subject: 'Queued subject', snippet: 'queued body',
  body: 'queued body', timestamp: 1_700_000_000_000, folder: 'sent', delivery: 'queued',
  isUnread: false, isStarred: false, isEncrypted: false,
};

describe('Connect delivery state decision (pure)', () => {
  it('never reports sent or encrypted when nothing left the process', () => {
    const outcome = resolveConnectDeliveryState({ queued: true, encrypted: false, transportConnected: false });
    expect(outcome.delivery).toBe('queued');
    expect(outcome.physicallySent).toBe(false);
    expect(outcome.encryptedForReal).toBe(false);
    expect(outcome.queuedShape).toEqual({ folder: 'sent', delivery: 'queued', isEncrypted: false });
  });

  it('reports sent only with a connected transport', () => {
    const outcome = resolveConnectDeliveryState({ queued: true, transportConnected: true });
    expect(outcome.delivery).toBe('sent');
    expect(outcome.physicallySent).toBe(true);
    expect(outcome.queuedShape).toBeNull();
  });

  it('reports failed when the queue entry was not created', () => {
    const outcome = resolveConnectDeliveryState({ queued: false, transportConnected: true });
    expect(outcome.delivery).toBe('failed');
    expect(outcome.physicallySent).toBe(false);
    expect(outcome.queuedShape).toBeNull();
  });

  it('honours a real crypto operation and rejects a failed one', () => {
    expect(resolveConnectDeliveryState({ queued: true, encrypted: true }).encryptedForReal).toBe(true);
    expect(resolveConnectDeliveryState({ queued: true, encrypted: true, encryptionFailed: true }).encryptedForReal).toBe(false);
    expect(resolveConnectDeliveryState({ queued: true }).encryptedForReal).toBe(false);
  });

  it('treats only an explicit queued delivery as pending, leaving legacy messages alone', () => {
    expect(isQueuedDelivery({ delivery: 'queued' })).toBe(true);
    expect(isQueuedDelivery({ delivery: 'sent' })).toBe(false);
    expect(isQueuedDelivery({})).toBe(false);
  });
});

describe('Connect compose path produces a queued draft, not a sent encrypted mail', () => {
  it('queueCompose is synchronous — a crypto operation could not have run', () => {
    const queued = queueCompose('peer@vgt.internal', 'Subject', 'Body', 1_000);
    expect(queued.state).toBe('queued');
    expect(queued.createdAt).toBe(1_000);
    expect(queued.releaseAt).toBeGreaterThanOrEqual(11_000);
    expect(queued.releaseAt).not.toBe(queued.createdAt);
    expect(Object.keys(queued).sort()).toEqual(['createdAt', 'draft', 'id', 'releaseAt', 'state', 'undoUntil']);
    // The synchronous queue entry cannot hold a crypto result: WebCrypto is always promise-based.
    expect(queued).not.toHaveProperty('ciphertext');
  });
});

describe('Connect visible text for a queued message', () => {
  it('states queued, unsent and unencrypted as text for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      const copy = connectCopy(locale);
      const notice = connectQueuedNotice(copy, '12:34');
      expect(notice).toContain(copy.queuedNotice);
      expect(notice).toContain(copy.queuedReleaseAt('12:34'));
      expect(notice).not.toContain(copy.sent);
      expect(notice).toMatch(/nicht gesendet|not sent|не было отправлено|non è stato inviato|no se envió|送信されていません|并未发送/iu);
      expect(notice).toMatch(/nicht verschlüsselt|not encrypted|не зашифровано|non è cifrat|no está cifrado|暗号化もされていません|未加密/iu);
      expect(connectSentLabel(copy, 'queued')).toBe(copy.queuedMessage);
      expect(connectSentLabel(copy, 'queued')).not.toBe(copy.sent);
      expect(connectSentLabel(copy, undefined)).toBe(copy.sent);
    }
  });

  it('renders the compose form without claiming an AES/WebCrypto operation', () => {
    localeState.current = 'de-DE';
    const markup = renderToStaticMarkup(
      <ConnectMailViewer model={model} onUpdateModel={vi.fn()} isComposeOpen onCloseCompose={vi.fn()} />,
    );
    expect(markup).toContain('data-connect-encryption-state="none"');
    expect(markup).toContain(connectCopy('de-DE').composeEncryptionNote);
    expect(markup).not.toContain('AES-256-GCM');
    expect(markup).toContain(connectCopy('de-DE').queueSend);
    expect(markup).not.toContain(connectCopy('de-DE').sent + '<');
  });

  it('shows a queued message in the queue view as queue, not as sent', () => {
    for (const locale of WORKSPACE_LOCALES) {
      localeState.current = locale;
      const copy = connectCopy(locale);
      const queueModel = { ...model, selectedFolder: CONNECT_QUEUE_FOLDER, messages: [queuedMessage] };
      const markup = renderToStaticMarkup(<ConnectMailList model={queueModel} onUpdateModel={vi.fn()} />);
      expect(markup).toContain('data-connect-delivery-state="queued"');
      expect(markup).toContain(copy.queuedMessage);
      expect(markup).not.toContain('data-connect-delivery-state="sent"');
      // …and the same message is not offered under the "sent" folder at all.
      const sentMarkup = renderToStaticMarkup(<ConnectMailList model={{ ...queueModel, selectedFolder: 'sent' }} onUpdateModel={vi.fn()} />);
      expect(sentMarkup).not.toContain(queuedMessage.subject);
      expect(sentMarkup).toContain(copy.noMessages(copy.sent));
    }
  });

  it('shows the pending delivery state in the viewer instead of an encrypted badge', () => {
    localeState.current = 'de-DE';
    const copy = connectCopy('de-DE');
    const viewerModel = { ...model, selectedMessageId: queuedMessage.id, messages: [queuedMessage] };
    const markup = renderToStaticMarkup(
      <ConnectMailViewer model={viewerModel} onUpdateModel={vi.fn()} isComposeOpen={false} onCloseCompose={vi.fn()} />,
    );
    expect(markup).toContain('data-connect-delivery-state="queued"');
    expect(markup).toContain(copy.queuedMessage);
    expect(markup).not.toContain(copy.encryptedMessage);
  });

  it('offers a queue view that keeps the queued message out of the sent folder', () => {
    const withQueue = { ...model, messages: [queuedMessage, ...model.messages] };
    expect(selectVisibleMessages({ ...withQueue, selectedFolder: 'sent' }).map((m) => m.id)).not.toContain(queuedMessage.id);
    expect(selectVisibleMessages({ ...withQueue, selectedFolder: CONNECT_QUEUE_FOLDER }).map((m) => m.id)).toEqual([queuedMessage.id]);
    expect(selectVisibleMessages({ ...withQueue, selectedFolder: 'all' }).length).toBe(model.messages.length);
    expect(countQueuedMessages(withQueue.messages)).toBe(1);
    expect(countQueuedMessages(model.messages)).toBe(0);
  });

  it('exposes the queue view in the sidebar with its pending count as text', () => {
    const copy = connectCopy('de-DE');
    localeState.current = 'de-DE';
    const markup = renderToStaticMarkup(
      <ConnectSidebar model={{ ...model, messages: [queuedMessage, ...model.messages] }} onUpdateModel={vi.fn()} onOpenCompose={vi.fn()} />,
    );
    expect(markup).toContain('data-connect-queue-view="true"');
    expect(markup).toContain(copy.queuedMessage);
    expect(markup).toContain(`>${copy.queuedMessage}<`);
  });
});
