// STATUS: PLATIN — Cross-App-Picker: die Autorität filtert, nicht die Suche (V-023).
//
// Der Befund: es gab keinen Weg für eine andere Anwendung, ein Vault-Asset gezielt auszuwählen. Der einzige
// Auswahlweg war die Vault-eigene Liste.
//
// Die wichtigste Zusicherung dieser Datei ist die **Reihenfolge**: der Picker urteilt **zuerst** und filtert
// **danach**. Ein Picker, der zuerst sucht und dann ablehnt, würde Existenz, Namen und Klassifikation von
// Assets preisgeben, auf die kein Recht besteht. Genau das wird hier in beide Richtungen geprüft: was
// verboten ist, taucht **auch bei passendem Suchbegriff** nicht auf.
import { describe, expect, it } from 'vitest';
import type { DocumentKind, VaultClassification, VaultFile, VaultShareGrant } from '../../../../shared/contracts/workspace';
import {
  listVaultPickerCandidates,
  MAX_VAULT_PICKER_RESULTS,
  resolveVaultPickerSelection,
  vaultPickerReachability,
} from '../../../../shared/vault/picker/vaultPickerEngine';

const NOW = 1_700_000_000_000;

const file = (id: string, classification: VaultClassification, overrides: Partial<VaultFile> = {}): VaultFile => ({
  id, name: `${id}.txt`, kind: 'Writer', sizeBytes: 100, encryptedHash: 'a'.repeat(64),
  lastModified: 1, status: 'available', sourceType: 'attachment', mimeType: 'text/plain',
  classification, folderId: null, ...overrides,
});

const grant = (fileId: string, overrides: Partial<VaultShareGrant> = {}): VaultShareGrant => ({
  id: `grant-${fileId}`, fileId, delivery: 'space', permissions: ['view'], createdAt: NOW - 1000,
  status: 'active', copyControl: 'controlled_future_access', recipientFingerprint: 'b'.repeat(64), ...overrides,
});

const ALL: VaultFile[] = [
  file('pub', 'Public', { name: 'öffentlich.txt' }),
  file('int', 'Internal', { name: 'intern.txt' }),
  file('con', 'Confidential', { name: 'vertraulich.txt' }),
  file('res', 'Restricted', { name: 'streng.txt' }),
  file('bad', 'Public', { name: 'boese.txt', status: 'quarantined' }),
];

describe('Die Autorität filtert, bevor irgendetwas sichtbar wird', () => {
  it('für Writer sind Public und Internal sichtbar, Confidential/Restricted nicht', () => {
    const listing = listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open' });
    expect(listing.candidates.map((candidate) => candidate.fileId)).toEqual(['int', 'pub']);
    // Und die Zurückhaltung wird **gezählt**: zwei Klassifikationssperren plus die Quarantäne.
    expect(listing.withheldCount).toBe(3);
  });

  it('für Publish ist Internal **nicht** sichtbar — „intern" heißt nicht „versendbar"', () => {
    const listing = listVaultPickerCandidates(ALL, { app: 'Publish', action: 'open' });
    expect(listing.candidates.map((candidate) => candidate.fileId)).toEqual(['pub']);
    expect(listing.withheldCount).toBe(4);
  });

  it('ein gültiger Grant macht ein vertrauliches Asset für genau diese Anwendung sichtbar', () => {
    const listing = listVaultPickerCandidates(ALL, { app: 'Publish', action: 'open', grants: [grant('con')] });
    const candidate = listing.candidates.find((item) => item.fileId === 'con')!;
    expect(candidate).toMatchObject({ granted: true, grantId: 'grant-con' });
    expect(listing.candidates.map((item) => item.fileId).sort()).toEqual(['con', 'pub']);
  });

  it('ein abgelaufener oder widerrufener Grant macht nichts sichtbar', () => {
    expect(listVaultPickerCandidates(ALL, { app: 'Publish', action: 'open', grants: [grant('con', { expiresAt: NOW - 1 })], now: NOW }).candidates)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ fileId: 'con' })]));
    expect(listVaultPickerCandidates(ALL, { app: 'Publish', action: 'open', grants: [grant('con', { status: 'revoked' })], now: NOW }).candidates)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ fileId: 'con' })]));
  });

  it('ein ungesundes Asset ist nie sichtbar, auch nicht mit Grant', () => {
    const listing = listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', grants: [grant('bad', { permissions: ['edit'] })] });
    expect(listing.candidates.map((item) => item.fileId)).toEqual(['int', 'pub']);
  });

  it('**die Suche kann ein Verbot nicht sichtbar machen** — auch bei exakt passendem Begriff', () => {
    // Der Name ist bekannt; wenn die Suche vor dem Urteil liefe, würde „vertraulich" den Eintrag zeigen.
    const listing = listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', query: 'vertraulich' });
    expect(listing.candidates).toEqual([]);
    // Und auch ein Suchbegriff, der auf ein ungesundes Public-Asset passt, zeigt es nicht.
    expect(listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', query: 'boese' }).candidates).toEqual([]);
  });

  it('die Suche wirkt innerhalb des erlaubten Teils', () => {
    const listing = listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', query: 'intern' });
    expect(listing.candidates.map((item) => item.fileId)).toEqual(['int']);
  });

  it('der Suchbegriff wird begrenzt und ohne Treffer ist die Liste leer', () => {
    expect(listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', query: 'x'.repeat(9999) }).candidates).toEqual([]);
    expect(listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open', query: 'gibtesnicht' }).candidates).toEqual([]);
  });
});

describe('Aktionen: `view` reicht zum Öffnen, mehr wird verlangt wo es hingehört', () => {
  it('für `export` braucht ein vertrauliches Asset die passende Berechtigung', () => {
    const viewOnly = listVaultPickerCandidates(ALL, { app: 'Publish', action: 'export', grants: [grant('con', { permissions: ['view'] })] });
    expect(viewOnly.candidates.map((item) => item.fileId)).toEqual(['pub']);
    const editable = listVaultPickerCandidates(ALL, { app: 'Publish', action: 'export', grants: [grant('con', { permissions: ['edit'] })] });
    expect(editable.candidates.map((item) => item.fileId).sort()).toEqual(['con', 'pub']);
  });

  it('Public und Internal sind von der Aktionsstufe nicht betroffen', () => {
    for (const action of ['open', 'preview', 'download', 'export'] as const) {
      expect(listVaultPickerCandidates(ALL, { app: 'Writer', action }).candidates.map((item) => item.fileId), action).toEqual(['int', 'pub']);
    }
  });
});

describe('Reihenfolge und Grenzen der Liste', () => {
  it('die Liste ist stabil nach Name sortiert, unabhängig von der Eingabereihenfolge', () => {
    const scrambled = [...ALL].reverse();
    const a = listVaultPickerCandidates(ALL, { app: 'Writer', action: 'open' }).candidates.map((item) => item.fileId);
    const b = listVaultPickerCandidates(scrambled, { app: 'Writer', action: 'open' }).candidates.map((item) => item.fileId);
    expect(b).toEqual(a);
  });

  it('oberhalb der Ergebnisgrenze wird gekürzt **und** das gemeldet', () => {
    const many = Array.from({ length: MAX_VAULT_PICKER_RESULTS + 20 }, (_, index) => file(`f${String(index).padStart(4, '0')}`, 'Public'));
    const listing = listVaultPickerCandidates(many, { app: 'Writer', action: 'open' });
    expect(listing.candidates).toHaveLength(MAX_VAULT_PICKER_RESULTS);
    // Der Kern: das Kürzen wird **benannt** statt verschwiegen — dieselbe Regel wie bei V-041.
    expect(listing.truncated).toBe(true);
  });

  it('genau an der Grenze wird nicht gekürzt gemeldet', () => {
    const exact = Array.from({ length: MAX_VAULT_PICKER_RESULTS }, (_, index) => file(`f${String(index).padStart(4, '0')}`, 'Public'));
    expect(listVaultPickerCandidates(exact, { app: 'Writer', action: 'open' }).truncated).toBe(false);
  });

  it('eine unbrauchbare Anfrage wird abgelehnt, nicht still beantwortet', () => {
    expect(() => listVaultPickerCandidates(ALL, { app: undefined as never, action: 'open' })).toThrow('vault_picker_request_invalid');
    expect(() => listVaultPickerCandidates(ALL, null as never)).toThrow('vault_picker_request_invalid');
  });
});

describe('Die getroffene Auswahl wird erneut beurteilt', () => {
  it('zwischen Anzeige und Auswahl widerrufener Grant → Auswahl scheitert', () => {
    // Der Nutzer **sah** das Asset (Grant war gültig), dann wurde der Grant widerrufen.
    const revoked = [grant('con', { status: 'revoked' })];
    const resolved = resolveVaultPickerSelection(ALL, { app: 'Publish', action: 'open', grants: revoked }, 'con');
    expect(resolved).toEqual({ ok: false, reason: 'policy_deny_grant_revoked' });
  });

  it('zwischen Anzeige und Auswahl abgelaufener Grant → Auswahl scheitert', () => {
    const resolved = resolveVaultPickerSelection(ALL, { app: 'Publish', action: 'open', grants: [grant('con', { expiresAt: NOW - 1 })], now: NOW }, 'con');
    expect(resolved).toEqual({ ok: false, reason: 'policy_deny_grant_expired' });
  });

  it('eine ID, die nie in der Liste stand, wird abgelehnt — der Picker vertraut seiner Liste nicht', () => {
    expect(resolveVaultPickerSelection(ALL, { app: 'Writer', action: 'open' }, 'con'))
      .toEqual({ ok: false, reason: 'policy_deny_no_grant' });
    expect(resolveVaultPickerSelection(ALL, { app: 'Writer', action: 'open' }, 'gibt-es-nicht'))
      .toEqual({ ok: false, reason: 'vault_picker_selection_missing' });
    expect(resolveVaultPickerSelection(ALL, { app: 'Writer', action: 'open' }, ''))
      .toEqual({ ok: false, reason: 'vault_picker_selection_invalid' });
  });

  it('eine erlaubte Auswahl liefert den Kandidaten mit Grant-Kennzeichen', () => {
    const resolved = resolveVaultPickerSelection(ALL, { app: 'Publish', action: 'open', grants: [grant('con')] }, 'con');
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.candidate).toMatchObject({ fileId: 'con', granted: true, grantId: 'grant-con', classification: 'Confidential' });
  });
});

describe('Erreichbarkeit: die Zahl ist ehrlich, ohne Namen zu verraten', () => {
  it('Writer sieht mehr als Publish — und beide erfahren, wie viel zurückgehalten wird', () => {
    expect(vaultPickerReachability(ALL, { app: 'Writer', action: 'open' })).toEqual({ visible: 2, withheld: 3 });
    expect(vaultPickerReachability(ALL, { app: 'Publish', action: 'open' })).toEqual({ visible: 1, withheld: 4 });
  });

  it('die Erreichbarkeit entspricht genau der Liste', () => {
    for (const app of ['Writer', 'Publish', 'GaiaCom'] as DocumentKind[]) {
      const listing = listVaultPickerCandidates(ALL, { app, action: 'open' });
      const reach = vaultPickerReachability(ALL, { app, action: 'open' });
      expect(reach.visible, app).toBe(listing.candidates.length);
      expect(reach.withheld, app).toBe(listing.withheldCount);
    }
  });
});
