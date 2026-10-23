// STATUS: PLATIN — der Sperrzustand überlebt das Laden (V-010).
//
// **Der Befund:** `runtimeLocked` lebte nur im Speicher von `VaultFreeRuntime`. Ein Neuladen, ein Absturz oder
// ein Dokumentwechsel setzte den Tresor auf **entsperrt** zurück, obwohl der Nutzer ihn ausdrücklich gesperrt
// hatte. Der „Lock now"-Knopf war damit eine Erfolgsmeldung ohne dauerhafte Wirkung: er galt bis zum nächsten
// Laden. Für einen Tresor ist das die falsche Richtung — ein Schloss, das von selbst aufgeht, ist kein Schloss.
//
// Geprüft wird die **reine** Entscheidung (`deriveVaultLockState`) und der **Träger** im zentralen Dokument
// (`readVaultLockRecord` / `persistVaultLockRecord`). Die Verdrahtung im Laufzeitpfad ist Quellvertrag
// (`vaultRuntimeLockWiring.contract.test.mjs`), weil sie ein DOM braucht.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { deriveVaultLockState, vaultLockRecord } from '../../../../shared/vault/security/vaultSessionLock';
import {
  persistVaultLockRecord,
  readVaultLockRecord,
  VAULT_LOCK_RECORD_KEY,
} from '../../../../shared/vault/persistence/vaultPersistenceEngine';

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

describe('Ein ausdrücklicher Sperrvermerk gewinnt gegen jede Frist', () => {
  it('gesperrt bleibt gesperrt — auch wenn die Auto-Lock-Frist längst abgelaufen ist', () => {
    expect(deriveVaultLockState({ lockedAt: NOW - 10 * MINUTE, lastActivityAt: NOW, autoLockMinutes: 0, now: NOW }))
      .toEqual({ locked: true, reason: 'explicit' });
    // Auch bei ausgeschalteter Auto-Lock-Sperre: der Nutzer hat gesperrt, nicht die Uhr.
    expect(deriveVaultLockState({ lockedAt: NOW, autoLockMinutes: 0, now: NOW + 10 * MINUTE }).locked).toBe(true);
  });

  it('ohne Sperrvermerk und ohne Frist startet der Tresor entsperrt', () => {
    expect(deriveVaultLockState({ lockedAt: null, autoLockMinutes: 0, now: NOW }))
      .toEqual({ locked: false, reason: 'never_locked' });
    expect(deriveVaultLockState({ autoLockMinutes: undefined, now: NOW }).locked).toBe(false);
  });

  it('das Entsperren nimmt den Vermerk zurück', () => {
    // `vaultLockRecord(false, …)` setzt `lockedAt` auf `null` — genau das ist „entsperrt".
    const record = vaultLockRecord(false, NOW);
    expect(record.lockedAt).toBeNull();
    expect(deriveVaultLockState({ lockedAt: record.lockedAt, autoLockMinutes: 0, now: NOW }).locked).toBe(false);
    // Und das Sperren setzt ihn.
    expect(vaultLockRecord(true, NOW).lockedAt).toBe(NOW);
  });
});

describe('Auto-Lock beim Laden: die Untätigkeit wird nachgerechnet, nicht neu gestartet', () => {
  it('eine abgelaufene Frist sperrt den Tresor beim Laden', () => {
    const state = deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW - 30 * MINUTE, autoLockMinutes: 15, now: NOW });
    expect(state).toEqual({ locked: true, reason: 'auto_lock', idleMs: 30 * MINUTE });
  });

  it('innerhalb der Frist bleibt er entsperrt', () => {
    const state = deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW - 5 * MINUTE, autoLockMinutes: 15, now: NOW });
    expect(state).toEqual({ locked: false, reason: 'never_locked', idleMs: 5 * MINUTE });
  });

  it('genau an der Grenze wird gesperrt', () => {
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW - 15 * MINUTE, autoLockMinutes: 15, now: NOW }).locked).toBe(true);
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW - 15 * MINUTE + 1, autoLockMinutes: 15, now: NOW }).locked).toBe(false);
  });
});

describe('Fail-closed: ein unbrauchbarer Wert öffnet den Tresor NICHT', () => {
  it('ohne brauchbare Uhr wird gesperrt', () => {
    expect(deriveVaultLockState({ lockedAt: null, autoLockMinutes: 0, now: Number.NaN }).locked).toBe(true);
    expect(deriveVaultLockState({ lockedAt: null, autoLockMinutes: 0, now: Number.POSITIVE_INFINITY }).locked).toBe(true);
  });

  it('ein unbrauchbarer Sperrvermerk gilt als Sperre, nicht als „nie gesperrt"', () => {
    // `readVaultLockRecord` bildet einen gesetzten, aber kaputten Wert auf `0` ab (nicht auf `null`).
    expect(deriveVaultLockState({ lockedAt: 0, autoLockMinutes: 0, now: NOW })).toEqual({ locked: true, reason: 'explicit' });
    expect(deriveVaultLockState({ lockedAt: Number.NaN, autoLockMinutes: 0, now: NOW }).locked).toBe(true);
    expect(deriveVaultLockState({ lockedAt: -1, autoLockMinutes: 0, now: NOW }).locked).toBe(true);
  });

  it('bei gesetzter Frist ohne bekannte Aktivität wird gesperrt', () => {
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: null, autoLockMinutes: 15, now: NOW }))
      .toEqual({ locked: true, reason: 'auto_lock' });
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: Number.NaN, autoLockMinutes: 15, now: NOW }).locked).toBe(true);
  });

  it('eine Uhr, die rückwärts läuft, ist kein Beweis für Aktivität', () => {
    // `lastActivityAt` in der Zukunft bedeutet: die Uhr ist unzuverlässig. Dann wird gesperrt.
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW + MINUTE, autoLockMinutes: 15, now: NOW }).locked).toBe(true);
  });

  it('eine unsinnige Frist sperrt', () => {
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW, autoLockMinutes: Number.NaN, now: NOW }).locked).toBe(true);
    expect(deriveVaultLockState({ lockedAt: null, lastActivityAt: NOW, autoLockMinutes: -5, now: NOW }).locked).toBe(true);
  });
});

describe('Der Träger im zentralen Dokument', () => {
  const doc = (objects: Record<string, unknown> = {}): WorkspaceDocument => ({
    id: 'd1', title: 'Tresor', kind: 'Vault', version: 3, modified_at: NOW, objects,
  } as unknown as WorkspaceDocument);

  it('ein Dokument ohne Vermerk liest sich als „nie gesperrt"', () => {
    expect(readVaultLockRecord(doc())).toEqual({ lockedAt: null, lastActivityAt: null });
    expect(readVaultLockRecord(null)).toEqual({ lockedAt: null, lastActivityAt: null });
    expect(readVaultLockRecord(undefined)).toEqual({ lockedAt: null, lastActivityAt: null });
  });

  it('schreiben und lesen sind umkehrbar', () => {
    const written = persistVaultLockRecord(doc(), vaultLockRecord(true, NOW), NOW);
    expect(readVaultLockRecord(written)).toEqual({ lockedAt: NOW, lastActivityAt: NOW });
    // Und das Entsperren ebenso.
    const unlocked = persistVaultLockRecord(written, vaultLockRecord(false, NOW + MINUTE), NOW + MINUTE);
    expect(readVaultLockRecord(unlocked).lockedAt).toBeNull();
  });

  it('der Träger benutzt den kanonischen Objektvertrag, keinen freien Schlüssel', () => {
    const written = persistVaultLockRecord(doc(), vaultLockRecord(true, NOW), NOW);
    const carrier = (written.objects as Record<string, { type?: string; data?: { namespace?: string; family?: string; payload?: unknown } }>)[VAULT_LOCK_RECORD_KEY];
    expect(carrier?.type).toBe('ExtensionObject');
    expect(carrier?.data?.namespace).toBe('astraea.vault');
    expect(carrier?.data?.family).toBe('session-lock');
    expect(carrier?.data?.payload).toEqual({ lockedAt: NOW, lastActivityAt: NOW });
  });

  it('ein **fremdes** Objekt unter demselben Schlüssel wird nicht als Sperrvermerk gedeutet', () => {
    // Sonst könnte ein beliebiges Objekt den Tresor entsperren — oder ihn als „gesperrt" markieren.
    const foreign = doc({ [VAULT_LOCK_RECORD_KEY]: { type: 'TextBlock', data: { text: 'hallo' } } });
    expect(readVaultLockRecord(foreign)).toEqual({ lockedAt: null, lastActivityAt: null });
    const wrongNamespace = doc({ [VAULT_LOCK_RECORD_KEY]: { type: 'ExtensionObject', data: { namespace: 'fremd', family: 'session-lock', payload: { lockedAt: NOW } } } });
    expect(readVaultLockRecord(wrongNamespace)).toEqual({ lockedAt: null, lastActivityAt: null });
  });

  it('ein gesetzter, aber kaputter Vermerk bleibt gesperrt statt „nie gesperrt"', () => {
    const broken = doc({ [VAULT_LOCK_RECORD_KEY]: { type: 'ExtensionObject', data: { namespace: 'astraea.vault', family: 'session-lock', payload: { lockedAt: 'gestern', lastActivityAt: 0 } } } });
    const record = readVaultLockRecord(broken);
    expect(record.lockedAt).toBe(0);
    expect(deriveVaultLockState({ ...record, autoLockMinutes: 0, now: NOW }).locked).toBe(true);
  });

  it('das Schreiben erhöht die Dokumentversion und lässt andere Objekte unangetastet', () => {
    const before = doc({ andere: { type: 'TextBlock', data: { text: 'bleibt' } } });
    const after = persistVaultLockRecord(before, vaultLockRecord(true, NOW), NOW);
    expect(after.version).toBe(before.version + 1);
    expect((after.objects as Record<string, unknown>).andere).toEqual({ type: 'TextBlock', data: { text: 'bleibt' } });
  });
});
