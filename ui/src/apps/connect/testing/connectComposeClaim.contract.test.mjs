// STATUS: PLATIN — BATCH-60 source contract: the false Connect claims are gone from the compose path.
// Comments are stripped, so documentation may not be mistaken for code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

/** Remove comments without touching string literals ("https://…" must survive). */
const strip = (source) => {
  let out = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === '\\') { out += next ?? ''; i += 1; continue; }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; out += ch; continue; }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    out += ch;
  }
  return out;
};

const viewer = strip(read('../components/ConnectMailViewer.tsx'));
const list = strip(read('../components/ConnectMailList.tsx'));
const bridge = strip(read('../application/connectUiBridge.ts'));
const delivery = strip(read('../domain/connectDeliveryState.ts'));
const composePath = [viewer, bridge, delivery].join('\n');

describe('Connect compose source contract', () => {
  it('no longer declares an outgoing message as sent in the folder union', () => {
    // The folder union has no outbox member, so the storage folder stays 'sent' — but never alone:
    // the persisted entry must carry an explicit pending delivery state next to it.
    expect(viewer).not.toMatch(/folder:\s*'sent'\s*as\s*const/);
    expect(viewer).not.toMatch(/folder:\s*'sent',?\s*\n\s*isUnread/);
    const queuedShape = delivery.slice(delivery.indexOf('queuedShape: {'));
    expect(queuedShape).toContain("delivery: 'queued'");
  });

  it('no longer asserts encryption without a crypto operation', () => {
    expect(composePath).not.toMatch(/isEncrypted:\s*true/);
    expect(composePath).not.toContain('AES-256-GCM');
    // The only permitted sources of the claim are real measurements.
    expect(viewer).toContain('isEncrypted: resolution.encryptedForReal');
  });

  it('persists an explicit pending delivery state instead of smuggling an outbox folder', () => {
    expect(viewer).toContain('resolveConnectDeliveryState({');
    expect(viewer).toContain('transportConnected: false');
    expect(viewer).toContain('encrypted: false');
    expect(delivery).toContain("delivery: 'queued'");
    // BATCH-CONNECT-1 added the fourth honest state for prepared-but-uncarried mail.
    expect(delivery).toContain("'queued' | 'held' | 'sent' | 'failed'");
  });

  it('does not present the scheduled release time as a send time', () => {
    expect(viewer).not.toContain('timestamp: queued.releaseAt');
    expect(viewer).toContain('timestamp: Date.now()');
  });

  it('renders a concrete text notice and a queue label for the queued message', () => {
    expect(viewer).toContain('data-connect-delivery-notice="queued"');
    expect(viewer).toContain('copy.queuedNotice');
    expect(list).toContain('data-connect-delivery-state="queued"');
    expect(list).toContain('copy.queuedMessage');
    // The list follows the queued message into the queue view, so it is never left under "sent".
    expect(viewer).toContain('selectedFolder: CONNECT_QUEUE_FOLDER');
    const sidebar = strip(read('../components/ConnectSidebar.tsx'));
    expect(sidebar).toContain('data-connect-queue-view="true"');
    // BATCH-CONNECT-7: the badge counts every pending delivery (queued, held, failed), not only
    // `delivery === 'queued'`, so a held or permanently failed message is visible in the queue view.
    expect(sidebar).toContain('countPendingMessages(messages)');
    expect(sidebar).toContain('data-connect-pending-count');
  });

  it('invents no transport: no network or SMTP call is added to the compose path', () => {
    expect(composePath).not.toMatch(/\bfetch\s*\(/);
    expect(composePath).not.toMatch(/WebSocket|XMLHttpRequest/);
    expect(composePath).not.toMatch(/smtp|imap/i);
    expect(composePath).not.toContain('crypto.');
  });

  it('proves where cryptography really does run, so isEncrypted: false is a measurement', () => {
    const encryptedStore = strip(read('../state/connectEncryptedStore.ts'));
    // The workspace-store cipher exists and really encrypts…
    expect(encryptedStore).toContain('crypto.subtle.encrypt');
    expect(encryptedStore).toContain('crypto.subtle.decrypt');
    // …and the compose path never reaches it.
    expect(composePath).not.toContain('connectEncryptedStore');
    expect(composePath).not.toContain('packVConnect');
  });
});
