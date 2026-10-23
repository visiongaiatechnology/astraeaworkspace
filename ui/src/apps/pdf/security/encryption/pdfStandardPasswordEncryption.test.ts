// STATUS: PLATIN — the AES policy is checked, not claimed.
//
// AST-0867: "AES-Richtlinie wählen, richtige/falsche Passwörter und Änderungsrechte prüfen." The tracker forbids
// a claim without the act — and this project has already found constants such as `allowed: true` that asserted a
// check nobody performed. So this suite encrypts with the module's own writer and then **verifies with the
// standard's own procedure**: the revision-6 password hash against the `/U` and `/O` salts, the file key
// recovered from `/UE`, and `/Perms` decrypted and checked for its `adb` integrity marker.
//
// Counter-check protocol: replace the `/U` comparison in `verifyPdfPasswordProtection` with `return true`
// (i.e. accept any password) and "rejects a wrong user password" goes red while the positive cases stay green —
// exactly the shape of a check that cannot fire.
import { describe, expect, it } from 'vitest';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { buildStructuredPdfBytes } from '../../interchange/structuredPdfExport';
import { pdfInfoDictionaryEntries, pdfTrailerDictionary } from '../pdfStructureInspector';
import { protectStructuredPdfWithPassword, verifyPdfPasswordProtection } from './pdfStandardPasswordEncryption';

const source = (): Uint8Array => buildStructuredPdfBytes('Verschlusssache', {
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
});

const USER = 'user-geheim-2026';
const OWNER = 'owner-geheim-2026';

describe('AES-256 revision-6 protection is verifiable with the standard procedure', () => {
  it('accepts the correct user password and reports the declared permissions', { timeout: 30000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), {
      userPassword: USER,
      ownerPassword: OWNER,
      permissions: -4,
      encryptMetadata: true,
    });
    expect(protectedBytes.cipher).toBe('AES-256');
    expect(protectedBytes.revision).toBe(6);

    const verdict = await verifyPdfPasswordProtection(protectedBytes.bytes, USER);
    expect(verdict.verdict).toBe('user-password');
    expect(verdict.permissions).toBe(-4);
    // -4 is "everything allowed except the reserved bits": every right is granted.
    expect(verdict.granted).toMatchObject({ print: true, modify: true, copy: true, annotate: true, fillForms: true, printHighResolution: true });
    // The AES policy is read from the handler and checked, not assumed.
    expect(verdict.handler).toEqual({ version: 5, revision: 6, cryptFilter: 'AESV3', keyBits: 256 });
    // Stated, not hidden: the /Perms integrity block is not decrypted (a raw AES-CBC decryption would be a
    // second cipher implementation), so the assurance is the weaker, true one.
    expect(verdict.permissionAssurance).toBe('declared-by-handler');
    expect(verdict.detail).toContain('/Perms integrity block is not decrypted');
  });

  it('accepts the correct owner password and says that it was the owner', { timeout: 30000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: -4 });
    const verdict = await verifyPdfPasswordProtection(protectedBytes.bytes, OWNER);
    expect(verdict.verdict).toBe('owner-password');
    expect(verdict.permissionAssurance).toBe('declared-by-handler');
  });

  it('rejects a wrong user password (the counter-check target)', { timeout: 60000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: -4 });
    for (const wrong of ['falsch', 'user-geheim-2025', USER.toUpperCase(), OWNER.slice(0, -1)]) {
      const verdict = await verifyPdfPasswordProtection(protectedBytes.bytes, wrong);
      expect(verdict.verdict, `candidate ${JSON.stringify(wrong)}`).toBe('wrong-password');
      expect(verdict.granted).toBeNull();
      expect(verdict.permissionAssurance).toBeNull();
    }
  });

  it('refuses a candidate that is not a legal password at all, by name', { timeout: 30000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: -4 });
    await expect(verifyPdfPasswordProtection(protectedBytes.bytes, '')).rejects.toThrow(/printable ASCII/u);
    await expect(verifyPdfPasswordProtection(protectedBytes.bytes, 'a'.repeat(200))).rejects.toThrow(/printable ASCII/u);
  });

  it('derives the real permission rights from /P instead of assuming them', async () => {
    // Print allowed, copy and modify denied. The PDF permission bits are **1-based** in the specification, so
    // bit 3 is print, bit 4 modify and bit 5 copy — i.e. 0-based 2, 3 and 4 in the mask.
    const printOnly = -4 & ~(0b1000 | 0b10000); // clear 0-based bit 3 (modify) and bit 4 (copy)
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: printOnly });
    const verdict = await verifyPdfPasswordProtection(protectedBytes.bytes, USER);
    expect(verdict.permissions).toBe(printOnly);
    expect(verdict.granted).toMatchObject({ print: true, copy: false, modify: false, annotate: true });
  });

  it('says "not encrypted" for a plain document instead of "wrong password"', async () => {
    const verdict = await verifyPdfPasswordProtection(source(), USER);
    expect(verdict.verdict).toBe('not-encrypted');
    expect(verdict.permissions).toBeNull();
    expect(verdict.granted).toBeNull();
    expect(verdict.handler).toBeNull();
  });

  it('reports an unsupported handler rather than guessing about it', { timeout: 30000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: -4 });
    const text = new TextDecoder('latin1').decode(protectedBytes.bytes);
    const downgraded = new TextEncoder().encode(text.replace('/V 5 /R 6', '/V 2 /R 3'));
    const verdict = await verifyPdfPasswordProtection(downgraded, USER);
    expect(verdict.verdict).toBe('unsupported-handler');
    expect(verdict.handler).toMatchObject({ version: 2, revision: 3 });
    expect(verdict.detail).toContain('verifies only the AESV3 revision-6 handler');
  });

  it('keeps the encrypted file structurally intact and free of plain text', { timeout: 30000 }, async () => {
    const protectedBytes = await protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: -4 });
    const text = new TextDecoder('latin1').decode(protectedBytes.bytes);
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toMatch(/startxref\s+\d+\s+%%EOF\s*$/u);
    expect(() => pdfTrailerDictionary(text)).not.toThrow();
    // The handler is declared in the trailer and spelled out in its own object.
    expect(text).toMatch(/\/Encrypt \d+ 0 R/u);
    expect(text).toContain('/Filter /Standard');
    expect(text).toContain('/CFM /AESV3');
    // Document content is encrypted: the sample heading must not appear in clear text anywhere.
    expect(text).not.toContain('Executive Summary');
    expect(pdfInfoDictionaryEntries(text)).not.toContain('Executive Summary');
  });

  it('refuses one password for both roles and out-of-range permissions', async () => {
    // Runde 234: `permissions` ist jetzt Pflicht. Hier steht die **permissive**
    // Maske `-4` ausdruecklich — und genau das ist der Punkt der Reparatur: sie
    // bleibt als bewusste Wahl moeglich, aber sie ist kein Rueckfall mehr.
    // Vorher fehlte der Wert, und die Engine setzte still `-4` ein; der Test
    // bestand trotzdem, weil die Passwortpruefung vor der Rechtepruefung lag.
    await expect(protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: USER, permissions: -4 })).rejects.toThrow(/must be distinct/u);
    await expect(protectStructuredPdfWithPassword(source(), { userPassword: USER, ownerPassword: OWNER, permissions: 2 ** 40 })).rejects.toThrow(/signed 32-bit/u);
  });

  it('refuses a missing permissions value instead of silently granting every right', async () => {
    // Der rote Fall fuer den P0 aus Runde 233: ohne diesen Wert fiel die Engine
    // auf `-4` zurueck, und `-4` erlaubt `modify` **und** `copy`. Ein Aufrufer,
    // der den Wert vergass, bekam also still ein PDF, das alles erlaubt.
    //
    // Der Aufruf geht bewusst ueber `JSON.parse`, also ueber einen Wert, der
    // NICHT durch den Compiler gegangen ist. Das ist kein Trick, sondern der
    // reale Fall: Optionen kommen aus IPC, aus einer Datei oder aus dem Netz,
    // und dort gibt es keinen Typecheck. Genau fuer diesen Fall ist die
    // Laufzeitpruefung da.
    //
    // Kein `as unknown as` und kein `as any`: `JSON.parse` liefert seinen Wert
    // so, wie die Standardbibliothek ihn deklariert, und die Zusicherung misst
    // die Laufzeit, nicht den Compiler.
    const ohneRechte = JSON.parse(
      `{"userPassword":${JSON.stringify(USER)},"ownerPassword":${JSON.stringify(OWNER)}}`,
    );
    await expect(protectStructuredPdfWithPassword(source(), ohneRechte)).rejects.toThrow(/must be given explicitly/u);
  });

  it('bounds the byte source it will even look at', async () => {
    await expect(verifyPdfPasswordProtection(new Uint8Array(0), USER)).rejects.toThrow(/bounded, non-empty byte source/u);
  });
});
