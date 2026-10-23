// STATUS: DIAMANT VGT SUPREME — the recovery container is really encrypted
//
// Paket 42 acceptance: "Fehlerhaftes Speichern simulieren; native Recovery bleibt **verschlüsselt**
// und **nutzbar**."
//
// Two halves, and both have to be measured rather than asserted:
//   "verschlüsselt" — the packed container must not contain the document in readable form, and a
//                     wrong credential must fail instead of returning something;
//   "nutzbar"       — with the right credential the document comes back unchanged.
//
// W-226 was the "nutzbar" half: the recovery snapshot was written **only after** a successful
// primary save, so a failed save left the newest work in no durable store (the emergency marker
// holds ids only and is discarded on read). See writerAutosaveFailurePath.contract.test.mjs.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../../shared/contracts/workspace';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../../../platform/containers/container';
// **Und der Importpfad war beim ersten Versuch falsch** ✗✓✓: *`workspaceObjectModelDocumentPersistence`
// **importiert** die zwei Konstanten nur (`:4`) — *ein importierter Name ist **nicht** re-exportiert*, und
// genau das sagte `TS2459`. **Mein Test lief trotzdem 10/10 gruen** ✗✓✓ — *weil der Testlaeufer
// nachsichtiger ist als `tsc`.* *Die Lehre aus Runde 373, an mir selbst: „0 rot" ist nicht „der Baum typprueft".*
// **Sie liegen in `platform/security/securityProfiles.ts`** — *derselben Datei, in der `W-462` steht.* ✓✓
import { INFINITY_PINNED_COMMIT, INFINITY_SUITE } from '../../../../../platform/security/securityProfiles';

const SECRET_TEXT = 'GEHEIMER-ABSATZ-INHALT-4711';
const SECRET_TITLE = 'Vertrauliches Dokument 0815';

function document(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  const textId = 'text-1';
  return {
    schema_version: 1,
    id: 'doc-secret',
    title: SECRET_TITLE,
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [textId],
    objects: {
      [textId]: {
        type: 'TextBlock',
        data: {
          id: textId,
          paragraphs: [{
            id: 'p1',
            style: { style_name: 'normal', alignment: 'left', line_height: 1.25, space_before: 0, space_after: 4 },
            spans: [{ text: SECRET_TEXT }],
          }],
        },
      },
    },
    writerData: { pageSetup: { paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white', showPageNumbers: true, headerText: '', footerText: '' }, tables: [] },
    ...overrides,
  } as unknown as WorkspaceDocument;
}

/** Looks for a piece of text in the raw bytes, in the encodings a leak would show up in. */
function containsText(bytes: Uint8Array, needle: string): boolean {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const utf16 = new TextDecoder('utf-16le', { fatal: false }).decode(bytes);
  return utf8.includes(needle) || latin1.includes(needle) || utf16.includes(needle);
}

const textOf = (doc: WorkspaceDocument): string => {
  const block = Object.values(doc.objects).find((object) => object.type === 'TextBlock');
  if (block?.type !== 'TextBlock') throw new Error('no text block');
  return block.data.paragraphs.map((paragraph) => paragraph.spans.map((span) => span.text).join('')).join('\n');
};

describe('a password-protected container keeps the document secret', () => {
  it('does not contain the paragraph text or the title in readable form', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'korrekt-pferd-batterie' });
    expect(container.byteLength).toBeGreaterThan(0);
    expect(containsText(container, SECRET_TEXT)).toBe(false);
    expect(containsText(container, SECRET_TITLE)).toBe(false);
  });

  it('gives the document back with the right password', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'korrekt-pferd-batterie' });
    const restored = await unpackLocalEncryptedContainer(container, { password: 'korrekt-pferd-batterie' });
    expect(restored.id).toBe('doc-secret');
    expect(restored.title).toBe(SECRET_TITLE);
    expect(textOf(restored)).toBe(SECRET_TEXT);
  });

  it('refuses a wrong password instead of returning something', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'korrekt-pferd-batterie' });
    await expect(unpackLocalEncryptedContainer(container, { password: 'falsch-pferd-batterie' })).rejects.toThrow();
  });

  it('refuses without any credential', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'korrekt-pferd-batterie' });
    await expect(unpackLocalEncryptedContainer(container, {})).rejects.toThrow();
  });

  it('never leaks the text through a second container of the same document', async () => {
    // Same input twice: a fixed IV would make the two containers identical, which would leak
    // equality of documents. Fresh randomness must make them differ.
    const first = await packLocalEncryptedContainer(document(), { password: 'passwort-1234' });
    const second = await packLocalEncryptedContainer(document(), { password: 'passwort-1234' });
    expect(Array.from(first)).not.toEqual(Array.from(second));
    expect(containsText(first, SECRET_TEXT)).toBe(false);
    expect(containsText(second, SECRET_TEXT)).toBe(false);
  });
});

describe('a damaged container is refused', () => {
  it('rejects a flipped byte in the middle', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'passwort-1234' });
    const tampered = Uint8Array.from(container);
    const at = Math.floor(tampered.length / 2);
    tampered[at] = (tampered[at]! ^ 0xff) & 0xff;
    await expect(unpackLocalEncryptedContainer(tampered, { password: 'passwort-1234' })).rejects.toThrow();
  });

  it('rejects a truncated container', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: 'passwort-1234' });
    await expect(unpackLocalEncryptedContainer(container.slice(0, 16), { password: 'passwort-1234' })).rejects.toThrow();
  });

  it('rejects an empty container', async () => {
    await expect(unpackLocalEncryptedContainer(new Uint8Array(0), { password: 'passwort-1234' })).rejects.toThrow();
  });
});

describe('a stricter profile never degrades to a weaker protection', () => {
  it('refuses TOP_SECRET without the native provider instead of falling back', async () => {
    // **Nachgezogen am 2026-09-28 (W-457).** Vorher stand hier `{ profile: 'VGT_TOP_SECRET' }` **ohne**
    // Provenienz. Seit `W-457` fuellt die Persistenzschicht eine **fehlende** Provenienz nicht mehr auf,
    // sondern **weist sie benannt ab** (`SEC_TS_PROVENANCE_ABSENT`) — *und `packLocalEncryptedContainer`
    // ruft `migrateWorkspaceDocument` **vor** seinem Provider-Waechter.*
    //
    // *Also erreichte der Test seinen eigenen Pruefgegenstand nicht mehr: er wurde **frueher** und aus
    // einem **anderen** Grund abgewiesen.* **Die Reparatur gehoert hierher, nicht in den Waechter** ✗✓✓:
    // *eine Attrappe, die eine Herkunft **behauptet**, muss sie auch **tragen*** — sonst misst sie nicht
    // mehr den Provider-Pfad, sondern den Provenienz-Pfad.
    const secret = document({
      securityPolicy: {
        profile: 'VGT_TOP_SECRET',
        infinity_suite: INFINITY_SUITE,
        infinity_commit: INFINITY_PINNED_COMMIT,
      },
    } as Partial<WorkspaceDocument>);
    await expect(packLocalEncryptedContainer(secret, { password: 'passwort-1234' })).rejects.toThrow(/TS_PROVIDER_UNAVAILABLE/u);
  });

  it('refuses the PQC profile while it is not operational', async () => {
    const pqc = document({ securityPolicy: { profile: 'PQC' } } as Partial<WorkspaceDocument>);
    await expect(packLocalEncryptedContainer(pqc, { password: 'passwort-1234' })).rejects.toThrow(/PQC_PROFILE_NOT_OPERATIONAL/u);
  });
});

describe('the credential policy is enforced before anything is written', () => {
  // Found while writing this file: a one-character password was refused outright. That is the
  // right behaviour — a weak credential must not produce a container that only looks protected.
  it('refuses a password shorter than eight characters', async () => {
    await expect(packLocalEncryptedContainer(document(), { password: 'p' })).rejects.toThrow(/8-128/u);
  });

  it('refuses a password longer than 128 characters', async () => {
    await expect(packLocalEncryptedContainer(document(), { password: 'x'.repeat(129) })).rejects.toThrow(/8-128/u);
  });

  it('accepts the shortest allowed password and gives the document back', async () => {
    const container = await packLocalEncryptedContainer(document(), { password: '12345678' });
    const restored = await unpackLocalEncryptedContainer(container, { password: '12345678' });
    expect(textOf(restored)).toBe(SECRET_TEXT);
  });
});
