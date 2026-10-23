// STATUS: PLATIN — BATCH-CONNECT-7 source contract (`.mjs`, because `.ts`/`.tsx` test files have no
// Node types and therefore cannot read files).
//
// This is the executable counter-check for the "decorated no-op" defect: before BATCH-CONNECT-7 the
// reply and forward buttons in `ConnectMailViewer.tsx` carried no `onClick` at all, and the sidebar
// footer rendered a hardcoded green dot plus a fixed address.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

/** Remove comments without touching string literals. */
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
    if (ch === '/' && next === '*') { const end = source.indexOf('*/', i + 2); i = end === -1 ? source.length : end + 1; continue; }
    if (ch === '/' && next === '/') { const end = source.indexOf('\n', i); i = end === -1 ? source.length : end; continue; }
    out += ch;
  }
  return out;
};

const viewer = strip(read('../components/ConnectMailViewer.tsx'));
const sidebar = strip(read('../components/ConnectSidebar.tsx'));
const view = strip(read('../components/ConnectView.tsx'));
const calendar = strip(read('../components/ConnectCalendarView.tsx'));
const contacts = strip(read('../components/ConnectContactsView.tsx'));
const accountDialog = strip(read('../components/ConnectAccountDialog.tsx'));

/** Every `<button>` tag must be reachable: it carries onClick, disabled, or is a submit-like control. */
const buttonTags = (source) => source.split('<button').slice(1).map((chunk) => chunk.slice(0, chunk.indexOf('>')));

describe('Connect source contract: no control is a decorated no-op', () => {
  it('wires the reply, reply-all, forward and delete buttons to real handlers', () => {
    for (const action of ['reply', 'reply-all', 'forward', 'delete']) {
      expect(viewer).toContain(`data-connect-action="${action}"`);
    }
    expect(viewer).toContain("openSeededCompose('reply')");
    expect(viewer).toContain("openSeededCompose('reply-all')");
    expect(viewer).toContain("openSeededCompose('forward')");
    for (const tag of buttonTags(viewer)) {
      expect(tag.includes('onClick') || tag.includes('disabled')).toBe(true);
    }
  });

  it('no longer hardcodes a connected state or a mail address in the sidebar', () => {
    expect(sidebar).not.toMatch(/rounded-full\s+bg-emerald-400/);
    expect(sidebar).not.toContain('engineer@example.test');
    expect(sidebar).toContain('connectionStatusText(extra, connection)');
    expect(sidebar).toContain('data-connect-connection-glyph');
    // The account entry, the sync entry and the notification tray are reachable.
    expect(sidebar).toContain('data-connect-account-entry="true"');
    expect(sidebar).toContain('data-connect-sync-entry="true"');
    expect(sidebar).toContain('data-connect-notification-entry="true"');
    expect(sidebar).toContain('data-connect-folder-manager="true"');
    for (const tag of buttonTags(sidebar)) {
      // Sidebar folder buttons use onClick; nothing may be inert.
      expect(tag.includes('onClick') || tag.includes('type="button"') || tag.includes('onClick=')).toBe(true);
    }
  });

  it('routes sync through the pure core and never declares success inline', () => {
    expect(view).toContain('applySyncEnvelope(');
    expect(view).toContain('syncProgress(');
    expect(view).toContain("outcome: 'blocked'");
    expect(view).toContain('data-connect-sync-progress');
    expect(view).not.toMatch(/outcome:\s*'done',\s*running:\s*false\s*\}\)/);
    // The account dialog is reachable from the view.
    expect(view).toContain('<ConnectAccountDialog');
    expect(view).toContain('<ConnectNotificationTray');
  });

  it('never invents an account, a credential or a verified TLS verdict in the UI', () => {
    expect(accountDialog).not.toMatch(/credentialHandle\s*:\s*['"](?!keyvault:)/);
    expect(accountDialog).toContain('data-connect-credential-note="keyvault-only"');
    expect(accountDialog).toContain('isAccountReachable');
    // The dialog must not claim encryption or a signature.
    expect(accountDialog).not.toContain('AES-');
    expect(accountDialog).not.toContain('isEncrypted');
  });

  it('never stores a hardcoded calendar event or contact as if the user created it', () => {
    // Both views used to insert a fixed record with a fixed attendee/fingerprint. They must now go
    // through the platform validators and must not contain a literal GPG fingerprint claim.
    expect(calendar).toContain('legacyEventToCore');
    expect(contacts).toContain('legacyContactToCore');
    expect(contacts).not.toMatch(/gpgFingerprint:\s*'[0-9A-F ]{20,}'/);
  });
});
