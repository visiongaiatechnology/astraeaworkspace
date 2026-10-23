// STATUS: PLATIN — Freigabeverwaltung: Empfänger, Ablauf, Widerruf (V-014).
//
// Der Befund: es gab keine Empfängerliste, keinen Ablauf und keinen Widerruf — `expiresAt`, `revokedAt`,
// `recipientFingerprint` und `VaultShareAuditEntry` standen im Vertrag, aber **keine Funktion schrieb sie**.
// Dieser Test prüft, dass die Kontrolle existiert **und** dass sie sich nicht mehr verspricht, als sie
// halten kann: eine exportierte Kopie ist nicht widerrufbar und wird genau so benannt.
import { describe, expect, it } from 'vitest';
import type { VaultShareGrant } from '../../../../shared/contracts/workspace';
import {
  activeVaultShares,
  appendVaultShareAudit,
  createVaultShare,
  extendVaultShare,
  MAX_VAULT_SHARE_AUDIT,
  MAX_VAULT_SHARE_TTL_MS,
  MAX_VAULT_SHARES,
  MIN_VAULT_SHARE_TTL_MS,
  revokeVaultShare,
  vaultShareState,
  vaultShareSummary,
  vaultSharesForFile,
} from '../../../../shared/vault/security/vaultShareEngine';

const NOW = 1_700_000_000_000;
const FINGERPRINT = 'a'.repeat(64);
const HOUR = 3_600_000;

const request = (overrides: Record<string, unknown> = {}) => ({
  fileId: 'vf-1', delivery: 'encrypted_export' as const, permissions: ['view'] as const,
  recipientFingerprint: FINGERPRINT, ttlMs: 24 * HOUR, now: NOW, ...overrides,
});

describe('Freigabe erzeugen: ohne Empfänger und ohne Ablauf gibt es keine Freigabe', () => {
  it('eine gültige Anfrage erzeugt Grant und Audit-Eintrag', () => {
    const { grant, audit } = createVaultShare(request());
    expect(grant).toMatchObject({
      fileId: 'vf-1', delivery: 'encrypted_export', permissions: ['view'],
      recipientFingerprint: FINGERPRINT, expiresAt: NOW + 24 * HOUR,
    });
    expect(grant.id).toMatch(/^vault-share-/u);
    expect(audit).toMatchObject({ shareId: grant.id, fileId: 'vf-1', action: 'created' });
    expect(audit.detail).toContain('expires in 24 h');
  });

  it('der Fingerabdruck wird auf Kleinschreibung normalisiert', () => {
    expect(createVaultShare(request({ recipientFingerprint: 'A'.repeat(64) })).grant.recipientFingerprint).toBe('a'.repeat(64));
  });

  it('ein fehlender oder unbrauchbarer Empfänger-Fingerabdruck wird abgelehnt', () => {
    expect(() => createVaultShare(request({ recipientFingerprint: '' }))).toThrow('vault_share_recipient_fingerprint_invalid');
    expect(() => createVaultShare(request({ recipientFingerprint: 'abc' }))).toThrow('vault_share_recipient_fingerprint_invalid');
    expect(() => createVaultShare(request({ recipientFingerprint: 'z'.repeat(64) }))).toThrow('vault_share_recipient_fingerprint_invalid');
    expect(() => createVaultShare(request({ recipientFingerprint: undefined }))).toThrow('vault_share_recipient_fingerprint_invalid');
  });

  it('eine Freigabe ohne Ablauf wird abgelehnt — es gibt keine unbegrenzte Freigabe', () => {
    expect(() => createVaultShare(request({ ttlMs: 0 }))).toThrow('vault_share_ttl_invalid');
    expect(() => createVaultShare(request({ ttlMs: -1 }))).toThrow('vault_share_ttl_invalid');
    expect(() => createVaultShare(request({ ttlMs: Number.NaN }))).toThrow('vault_share_ttl_invalid');
    expect(() => createVaultShare(request({ ttlMs: MAX_VAULT_SHARE_TTL_MS + 1 }))).toThrow('vault_share_ttl_invalid');
    // Und es gibt eine Untergrenze, damit ein Ablauf nicht faktisch sofort eintritt.
    expect(() => createVaultShare(request({ ttlMs: MIN_VAULT_SHARE_TTL_MS - 1 }))).toThrow('vault_share_ttl_invalid');
  });

  it('eine unbekannte Berechtigung oder Zustellart wird abgelehnt', () => {
    expect(() => createVaultShare(request({ permissions: ['admin'] }))).toThrow('vault_share_permission_invalid');
    expect(() => createVaultShare(request({ permissions: [] }))).toThrow('vault_share_permissions_required');
    expect(() => createVaultShare(request({ delivery: 'email' }))).toThrow('vault_share_delivery_invalid');
  });

  it('ein unbrauchbarer Empfängerschlüssel wird abgelehnt, ein gültiger übernommen', () => {
    expect(() => createVaultShare(request({ recipientKey: 'nicht-hex' }))).toThrow('vault_share_recipient_key_invalid');
    expect(createVaultShare(request({ recipientKey: `x25519:${'b'.repeat(64)}` })).grant.recipientKey).toBe(`x25519:${'b'.repeat(64)}`);
    // Ohne Schlüssel ist die Freigabe trotzdem gültig (Fingerabdruck genügt).
    expect(createVaultShare(request()).grant.recipientKey).toBeUndefined();
  });

  it('ohne Datei-ID oder bei zu vielen Freigaben wird abgelehnt', () => {
    expect(() => createVaultShare(request({ fileId: '  ' }))).toThrow('vault_share_file_required');
    const many = Array.from({ length: MAX_VAULT_SHARES }, (_, index) => ({ id: `g${index}` } as VaultShareGrant));
    expect(() => createVaultShare(request(), many)).toThrow('vault_share_limit_reached');
  });
});

describe('Ehrlichkeit: eine exportierte Kopie ist nicht widerrufbar, und das steht auch da', () => {
  it('ein verschlüsselter Export wird als exportierte Kopie ausgewiesen', () => {
    const { grant, audit } = createVaultShare(request({ delivery: 'encrypted_export' }));
    expect(grant.copyControl).toBe('exported_copy_unrevocable');
    expect(grant.status).toBe('exported_copy');
    expect(audit.detail).toContain('cannot be revoked');
  });

  it('eine kontrollierte Zustellung behauptet keine exportierte Kopie', () => {
    const { grant } = createVaultShare(request({ delivery: 'space' }));
    expect(grant.copyControl).toBe('controlled_future_access');
    expect(grant.status).toBe('active');
  });

  it('der Widerruf einer exportierten Kopie sagt ausdrücklich, dass er KEIN Rückruf ist', () => {
    const { grant } = createVaultShare(request({ delivery: 'encrypted_export' }));
    const { grants, audit } = revokeVaultShare([grant], grant.id, NOW + HOUR);
    // Künftiger Zugriff ist beendet …
    expect(grants[0]).toMatchObject({ status: 'revoked', revokedAt: NOW + HOUR });
    // … aber der Audit-Eintrag benennt die Grenze mit dem passenden Aktionsnamen.
    expect(audit.action).toBe('revoke_not_applicable');
    expect(audit.detail).toContain('cannot be recalled');
    expect(audit.detail).toContain('This is not a recall');
  });

  it('der Widerruf einer kontrollierten Freigabe wird als echter Widerruf gemeldet', () => {
    const { grant } = createVaultShare(request({ delivery: 'hosted_live' }));
    const { audit } = revokeVaultShare([grant], grant.id, NOW + HOUR);
    expect(audit.action).toBe('revoked');
    expect(audit.detail).toBe('Share revoked; future access is denied.');
  });

  it('die Zusammenfassung sagt, ob ein Widerruf überhaupt etwas bewirkt', () => {
    const exported = createVaultShare(request({ delivery: 'encrypted_export' })).grant;
    const controlled = createVaultShare(request({ delivery: 'space' })).grant;
    expect(vaultShareSummary(exported, NOW)).toMatchObject({ copyRemains: true, revocable: false, state: 'active' });
    expect(vaultShareSummary(controlled, NOW)).toMatchObject({ copyRemains: false, revocable: true });
  });
});

describe('Widerruf und Verlängerung', () => {
  it('ein unbekannter oder bereits widerrufener Grant wird abgelehnt', () => {
    const { grant } = createVaultShare(request({ delivery: 'space' }));
    expect(() => revokeVaultShare([grant], 'gibt-es-nicht')).toThrow('vault_share_not_found');
    const revoked = revokeVaultShare([grant], grant.id, NOW).grants;
    expect(() => revokeVaultShare(revoked, grant.id, NOW)).toThrow('vault_share_already_revoked');
  });

  it('eine Verlängerung verschiebt den Ablauf und wird auditiert', () => {
    const { grant } = createVaultShare(request({ delivery: 'space', ttlMs: 24 * HOUR }));
    const { grants, audit } = extendVaultShare([grant], grant.id, 48 * HOUR, NOW + HOUR);
    expect(grants[0]!.expiresAt).toBe(NOW + 24 * HOUR + 48 * HOUR);
    expect(audit.detail).toContain('extended until');
  });

  it('eine abgelaufene Freigabe wird ab „jetzt" verlängert, nicht ab dem alten Ablauf', () => {
    const { grant } = createVaultShare(request({ delivery: 'space', ttlMs: HOUR }));
    const later = NOW + 10 * HOUR;
    const { grants } = extendVaultShare([grant], grant.id, HOUR, later);
    expect(grants[0]!.expiresAt).toBe(later + HOUR);
  });

  it('die Verlängerung wird auf die Höchstdauer gedeckelt', () => {
    const { grant } = createVaultShare(request({ delivery: 'space' }));
    const { grants } = extendVaultShare([grant], grant.id, MAX_VAULT_SHARE_TTL_MS, NOW);
    expect(grants[0]!.expiresAt).toBe(NOW + MAX_VAULT_SHARE_TTL_MS);
  });

  it('eine widerrufene Freigabe lässt sich nicht verlängern', () => {
    const { grant } = createVaultShare(request({ delivery: 'space' }));
    const revoked = revokeVaultShare([grant], grant.id, NOW).grants;
    expect(() => extendVaultShare(revoked, grant.id, HOUR, NOW)).toThrow('vault_share_already_revoked');
    expect(() => extendVaultShare([grant], grant.id, 0, NOW)).toThrow('vault_share_ttl_invalid');
  });
});

describe('Zustand und Auswahl: abgelaufen ist nicht widerrufen', () => {
  it('die drei Zustände sind unterscheidbar', () => {
    const { grant } = createVaultShare(request({ delivery: 'space', ttlMs: HOUR }));
    expect(vaultShareState(grant, NOW)).toBe('active');
    expect(vaultShareState(grant, NOW + 2 * HOUR)).toBe('expired');
    expect(vaultShareState(revokeVaultShare([grant], grant.id, NOW).grants[0]!, NOW)).toBe('revoked');
    // Exklusive Grenze: genau bei `expiresAt` gilt sie als abgelaufen.
    expect(vaultShareState(grant, NOW + HOUR)).toBe('expired');
  });

  it('nur wirksame Freigaben werden als aktiv geliefert', () => {
    const active = createVaultShare(request({ delivery: 'space', ttlMs: 10 * HOUR })).grant;
    const expired = createVaultShare(request({ delivery: 'space', ttlMs: HOUR, fileId: 'vf-2' })).grant;
    const result = activeVaultShares([active, expired], NOW + 2 * HOUR);
    expect(result.map((grant) => grant.fileId)).toEqual(['vf-1']);
  });

  it('Freigaben je Datei werden gefiltert und neueste zuerst geliefert', () => {
    const older = createVaultShare(request({ now: NOW, delivery: 'space' })).grant;
    const newer = createVaultShare(request({ now: NOW + HOUR, delivery: 'space' })).grant;
    const other = createVaultShare(request({ now: NOW + 2 * HOUR, fileId: 'vf-9', delivery: 'space' })).grant;
    expect(vaultSharesForFile([older, newer, other], 'vf-1').map((grant) => grant.id)).toEqual([newer.id, older.id]);
  });

  it('der Audit-Verlauf ist begrenzt und dodelt denselben Eintrag nicht', () => {
    const { audit } = createVaultShare(request({ delivery: 'space' }));
    let list = appendVaultShareAudit(undefined, audit);
    expect(list).toHaveLength(1);
    list = appendVaultShareAudit(list, audit);
    expect(list).toHaveLength(1);
    for (let index = 0; index < MAX_VAULT_SHARE_AUDIT + 5; index += 1) {
      list = appendVaultShareAudit(list, { ...audit, id: `a-${index}` });
    }
    expect(list).toHaveLength(MAX_VAULT_SHARE_AUDIT);
  });

  it('die Zusammenfassung zeigt keinen vollständigen Fingerabdruck', () => {
    const { grant } = createVaultShare(request({ delivery: 'space' }));
    const summary = vaultShareSummary(grant, NOW);
    expect(summary.recipient).toBe(`${FINGERPRINT.slice(0, 12)}…`);
    expect(summary.recipient).not.toBe(FINGERPRINT);
    expect(summary.permissions).toBe('view');
  });
});
