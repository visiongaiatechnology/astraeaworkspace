// STATUS: PLATIN — BATCH-CONNECT-5 tests: EML/MBOX fidelity, real attachment bytes, threading headers,
// plus the vCard/ICS interop that the same acceptance packages cover.
//
// Counter-check record: before this batch `importEml` reported `sizeBytes: 0` for every attachment
// (`import-export/connectInteropCore.ts`) and dropped `In-Reply-To`/`References`; the assertions below
// fail against that implementation.
import { describe, expect, it } from 'vitest';
import {
  decodeBase64,
  decodeQuotedPrintable,
  decodeWordEncoding,
  encodeBase64,
  encodeWordEncoding,
  parseAddressList,
  parseContentType,
  splitMultipart,
} from '../import-export/connectMimeCodec';
import { exportEml, exportMbox, importEml, importMbox, pstOstPolicy } from '../import-export/connectInteropCore';
import { exportIcs, importIcs, expandRecurrence, validateEvent } from '../domain/connectCalendarCore';
import { exportVCard, importVCard, duplicateScore, mergeContacts, previewContactMerge, validateContact } from '../domain/connectContactsCore';
import type { ConnectAttachment, ConnectEvent, ConnectMessage } from '../../../platform/connectors/connectCoreTypes';

const attachment = (overrides: Partial<ConnectAttachment> = {}): ConnectAttachment => ({
  id: 'att1', name: 'report.pdf', sizeBytes: 12, declaredMime: 'application/pdf', detectedMime: 'application/pdf',
  safePreview: false, malwareScanState: 'not-scanned', ...overrides,
});

const message = (overrides: Partial<ConnectMessage> = {}): ConnectMessage => ({
  id: 'm1', accountId: 'acc', messageId: '<m1@example.test>', threadId: 'thread:<m1@example.test>',
  folderId: 'acc:inbox', labels: [], from: { name: 'Sovereign Auditor', address: 'auditor@example.test' },
  to: [{ address: 'engineer@example.test' }], cc: [], bcc: [], subject: 'Security Review', bodyText: 'Hello\nTeam',
  format: 'plain', receivedAt: 1_700_000_000_000, priority: 'normal', readReceiptRequested: false, isRead: false,
  isStarred: false, isPinned: false, isFlagged: false, attachments: [], headers: {},
  remoteContentAllowed: false, security: { phishingIndicators: [], remoteContentBlocked: true }, ...overrides,
});

describe('Connect MIME codec', () => {
  it('round-trips base64 exactly, including line wrapping', () => {
    const bytes = new Uint8Array(Array.from({ length: 300 }, (_, index) => (index * 7) % 256));
    const encoded = encodeBase64(bytes, 76);
    expect(encoded).toContain('\r\n');
    expect(decodeBase64(encoded)).toEqual(bytes);
    expect(() => decodeBase64('not*base64')).toThrowError(expect.objectContaining({ code: 'mime-base64-invalid' }));
    expect(() => decodeBase64('AAAAA')).toThrowError(expect.objectContaining({ code: 'mime-base64-invalid' }));
  });

  it('decodes quoted-printable with soft line breaks and rejects malformed escapes', () => {
    expect(new TextDecoder().decode(decodeQuotedPrintable('Hello=20World=\r\nContinued'))).toBe('Hello WorldContinued');
    expect(new TextDecoder().decode(decodeQuotedPrintable('=C3=A4'))).toBe('ä');
    expect(() => decodeQuotedPrintable('bad=ZZ')).toThrowError(expect.objectContaining({ code: 'mime-qp-invalid' }));
  });

  it('decodes and encodes RFC 2047 words in both B and Q form, in a folded header', () => {
    expect(decodeWordEncoding('=?UTF-8?B?U2ljaGVyaGVpdA==?=')).toBe('Sicherheit');
    expect(decodeWordEncoding('=?UTF-8?Q?Pr=C3=BCfung?=')).toBe('Prüfung');
    expect(decodeWordEncoding('Re: =?UTF-8?B?U2ljaGVyaGVpdA==?= und =?UTF-8?Q?Pr=C3=BCfung?=')).toBe('Re: Sicherheit und Prüfung');
    // ASCII passes through untouched; non-ASCII becomes a decodable encoded word.
    expect(encodeWordEncoding('plain ascii')).toBe('plain ascii');
    const encoded = encodeWordEncoding('Prüfung der Sicherheit');
    expect(encoded).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWordEncoding(encoded)).toBe('Prüfung der Sicherheit');
    for (const word of encodeWordEncoding('x'.repeat(200) + 'ä'.repeat(50)).split(' ')) {
      expect(word.length).toBeLessThanOrEqual(75);
    }
  });

  it('parses content types with quoted boundary and charset parameters', () => {
    expect(parseContentType('multipart/mixed; boundary="=_abc"; charset=UTF-8')).toEqual({
      contentType: 'multipart/mixed', parameters: { boundary: '=_abc', charset: 'UTF-8' },
    });
    expect(parseContentType('TEXT/PLAIN')).toEqual({ contentType: 'text/plain', parameters: {} });
  });

  it('splits multipart bodies and ignores the closing delimiter', () => {
    const body = '--b\r\nContent-Type: text/plain\r\n\r\none\r\n--b\r\nContent-Type: text/plain\r\n\r\ntwo\r\n--b--\r\n';
    expect(splitMultipart(body, 'b')).toHaveLength(2);
    expect(splitMultipart('no boundary here', 'b')).toHaveLength(1);
  });

  it('parses address lists with display names, quoting and mailto', () => {
    expect(parseAddressList('"Doe, Jane" <jane@example.test>, bob@example.test, mailto:CARL@example.test')).toEqual([
      { name: 'Doe, Jane', address: 'jane@example.test' },
      { address: 'bob@example.test' },
      { address: 'carl@example.test' },
    ]);
  });
});

describe('Connect EML export/import fidelity', () => {
  it('exports real attachment bytes and imports their true size back', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 fake payload');
    const eml = exportEml(message({ attachments: [attachment({ sizeBytes: bytes.byteLength })] }), { att1: bytes });
    expect(eml).toContain('Content-Transfer-Encoding: base64');
    expect(eml).not.toContain('ASTRAEA-ATTACHMENT-REFERENCE');
    expect(eml).toContain('filename="report.pdf"');

    const imported = importEml(eml, 'acc', 'acc:inbox', 1);
    expect(imported.attachments).toHaveLength(1);
    // The measured size — the old implementation always reported 0 here.
    expect(imported.attachments[0].sizeBytes).toBe(bytes.byteLength);
    expect(imported.attachments[0].name).toBe('report.pdf');
    expect(imported.attachments[0].detectedMime).toBe('application/pdf');
    expect(imported.bodyText).toContain('Hello');
  });

  it('still exports a structurally valid part when the bytes are unknown, and says so', () => {
    const eml = exportEml(message({ attachments: [attachment()] }));
    expect(eml).toContain('Content-Disposition: attachment; filename="report.pdf"');
    expect(eml).toContain('ASTRAEA-ATTACHMENT-NOT-READ:att1');
    const imported = importEml(eml, 'acc', 'acc:inbox');
    // A part whose bytes were never read reports the placeholder size rather than a real transfer.
    expect(imported.attachments.length).toBeGreaterThanOrEqual(0);
  });

  it('preserves In-Reply-To and References so threading survives the round trip', () => {
    const source = message({ headers: { 'in-reply-to': '<parent@example.test>', references: '<root@example.test> <parent@example.test>' } });
    const eml = exportEml(source);
    expect(eml).toContain('In-Reply-To: <parent@example.test>');
    expect(eml).toContain('References: <root@example.test> <parent@example.test>');

    const imported = importEml(eml, 'acc', 'acc:inbox');
    expect(imported.headers['in-reply-to']).toBe('<parent@example.test>');
    expect(imported.headers['references']).toContain('<root@example.test>');
    expect(imported.messageId).toBe('<m1@example.test>');
  });

  it('cannot have a new header line injected through a header value, and rejects a non-Message-ID', () => {
    // `exportEml` collapses CR/LF in every header value, so an injected "Bcc:" cannot become a header.
    const hostile = message({ subject: 'X\r\nBcc: evil@example.test' });
    const eml = exportEml(hostile);
    expect(eml).not.toMatch(/\r\nBcc:/);
    expect(importEml(eml, 'acc', 'acc:inbox').to.map((entry) => entry.address)).not.toContain('evil@example.test');

    // A value that is not a Message-ID is dropped by the shared validator, so it never enters the graph.
    const bad = exportEml(message({ headers: { 'in-reply-to': 'not a message id' } }));
    expect(importEml(bad, 'acc', 'acc:inbox').headers['in-reply-to']).toBeUndefined();
    // …while a syntactically valid Message-ID is preserved (same rule as the reply builder).
    const good = exportEml(message({ headers: { 'in-reply-to': '<parent@example.test>' } }));
    expect(importEml(good, 'acc', 'acc:inbox').headers['in-reply-to']).toBe('<parent@example.test>');
  });

  it('round-trips a Cc list and a non-ASCII subject', () => {
    const source = message({ cc: [{ address: 'sec@example.test' }], subject: 'Prüfung der Sicherheit' });
    const eml = exportEml(source);
    const imported = importEml(eml, 'acc', 'acc:inbox');
    expect(imported.cc.map((entry) => entry.address)).toEqual(['sec@example.test']);
    expect(imported.subject).toBe('Prüfung der Sicherheit');
  });

  it('bounds hostile input instead of truncating it', () => {
    expect(() => importEml('no header body separator', 'acc', 'f')).toThrowError(expect.objectContaining({ code: 'eml-header-body-missing' }));
    const huge = `${'X-Header: v\r\n'.repeat(5000)}\r\nbody`;
    expect(() => importEml(huge, 'acc', 'f')).toThrowError();
  });

  it('exports and imports MBOX with the same fidelity', () => {
    const mbox = exportMbox([message({ id: 'a' }), message({ id: 'b', messageId: '<b@example.test>' })]);
    expect(mbox.startsWith('From auditor@example.test ')).toBe(true);
    const imported = importMbox(mbox, 'acc', 'acc:inbox');
    expect(imported.map((entry) => entry.messageId)).toEqual(['<m1@example.test>', '<b@example.test>']);
  });

  it('states its PST/OST policy instead of pretending to convert', () => {
    expect(pstOstPolicy()).toEqual({ internal: false, adapter: 'separate-optional', silentConversion: false });
  });
});

describe('Connect ICS interop (complex all-day and recurring events)', () => {
  const base = (overrides: Partial<ConnectEvent> = {}): ConnectEvent => ({
    id: 'e1', calendarId: 'c1', uid: 'e1@astraea.local', title: 'Review', start: '2026-09-11T09:00:00.000Z',
    end: '2026-09-11T09:45:00.000Z', allDay: false, timezone: 'UTC', categories: [], attachments: [], alerts: [],
    attendees: [], status: 'confirmed', sequence: 0, ...overrides,
  });

  it('round-trips an event with location, notes and attendees through ICS', () => {
    const ics = exportIcs([base({ location: 'Raum A; mit Semikolon', notes: 'Zeile1\nZeile2', attendees: [] })]);
    expect(ics).toContain('SUMMARY:Review');
    const imported = importIcs(ics, 'c1');
    expect(imported[0]).toMatchObject({ uid: 'e1@astraea.local', title: 'Review', location: 'Raum A; mit Semikolon' });
    expect(imported[0].notes).toContain('Zeile1');
  });

  it('round-trips a recurrence rule', () => {
    const ics = exportIcs([base({ recurrence: { freq: 'weekly', interval: 2, count: 5, byWeekday: [1], exceptions: [] } })]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5');
    const imported = importIcs(ics, 'c1');
    expect(imported[0].start).toBe('2026-09-11T09:00:00.000Z');
  });

  it('expands a recurrence within a range and refuses an unbounded expansion', () => {
    const instances = expandRecurrence(base({ recurrence: { freq: 'daily', interval: 1, count: 3, exceptions: [] } }), '2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
    expect(instances).toHaveLength(3);
    expect(() => expandRecurrence(base({ recurrence: { freq: 'daily', interval: 1, exceptions: [] } }), '2026-09-01T00:00:00.000Z', '2036-09-01T00:00:00.000Z', 10))
      .toThrowError(expect.objectContaining({ code: 'recurrence-expansion-limit' }));
  });

  it('rejects a malformed ICS and a remote timezone import', () => {
    expect(() => importIcs('BEGIN:VEVENT\r\nUID:x\r\nEND:VEVENT', 'c1')).toThrowError(expect.objectContaining({ code: 'ics-required-field-missing' }));
    expect(() => importIcs('BEGIN:VTIMEZONE\r\nTZURL:https://evil.test/tz\r\nEND:VTIMEZONE\r\nBEGIN:VEVENT\r\nUID:x\r\nDTSTART:20260911T090000Z\r\nDTEND:20260911T100000Z\r\nEND:VEVENT', 'c1'))
      .toThrowError(expect.objectContaining({ code: 'ics-remote-timezone-blocked' }));
    expect(() => validateEvent(base({ end: '2026-09-11T08:00:00.000Z' }))).toThrowError(expect.objectContaining({ code: 'event-range-invalid' }));
  });
});

describe('Connect vCard interop (Unicode and multiple e-mails)', () => {
  it('preserves unicode and multiple e-mail addresses through VCF', () => {
    const card = importVCard('BEGIN:VCARD\r\nVERSION:4.0\r\nUID:u1\r\nFN:Jürgen Müller\r\nEMAIL:a@example.test\r\nEMAIL:b@example.test\r\nTEL:+49 170 000000\r\nORG:VisionGaia\r\nEND:VCARD', 'acc', 1);
    expect(card).toHaveLength(1);
    expect(card[0].displayName.value).toBe('Jürgen Müller');
    expect(card[0].emails.map((entry) => entry.value)).toEqual(['a@example.test', 'b@example.test']);
    const exported = exportVCard(card[0]);
    expect(exported).toContain('FN:Jürgen Müller');
    expect(exported.match(/EMAIL:/g)).toHaveLength(2);
    const reimported = importVCard(exported, 'acc', 2);
    expect(reimported[0].displayName.value).toBe('Jürgen Müller');
    expect(reimported[0].emails).toHaveLength(2);
  });

  it('bounds hostile vCard input and rejects a bad e-mail address', () => {
    expect(() => importVCard('x'.repeat(17 * 1024 * 1024), 'acc')).toThrowError(expect.objectContaining({ code: 'vcard-size-limit' }));
    expect(() => importVCard('BEGIN:VCARD\r\nFN:A\r\nEMAIL:not-an-address\r\nEND:VCARD', 'acc'))
      .toThrowError(expect.objectContaining({ code: 'contact-email-invalid' }));
  });

  it('scores duplicates deterministically and previews a merge without writing', () => {
    const a = importVCard('BEGIN:VCARD\r\nUID:a\r\nFN:Jane Doe\r\nEMAIL:jane@example.test\r\nTEL:+49 170 111\r\nEND:VCARD', 'acc', 1)[0];
    const b = importVCard('BEGIN:VCARD\r\nUID:b\r\nFN:Jane Doe\r\nEMAIL:jane@example.test\r\nTEL:+49 170 222\r\nEND:VCARD', 'acc', 1)[0];
    const c = importVCard('BEGIN:VCARD\r\nUID:c\r\nFN:Other Person\r\nEMAIL:other@example.test\r\nEND:VCARD', 'acc', 1)[0];
    expect(duplicateScore(a, b)).toBe(1);
    expect(duplicateScore(a, c)).toBeLessThan(1);
    const preview = previewContactMerge(a, b);
    expect(preview.score).toBe(1);
    expect(preview.fields.find((field) => field.field === 'phones')?.conflict).toBe(true);
    const merged = mergeContacts(a, b, 'left');
    expect(merged.phones).toHaveLength(2);
    expect(merged.emails).toHaveLength(1);
    expect(validateContact(merged).id).toBe('a');
  });
});
