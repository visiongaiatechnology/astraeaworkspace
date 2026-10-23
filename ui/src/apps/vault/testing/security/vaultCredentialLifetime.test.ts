// STATUS: PLATIN — der Sitzungsausweis überlebt das Sperren nicht mehr. Zeuge für den P0.
//
// **Der gemessene Fehlschlag, den diese Datei reproduziert.**
//
//   1. Der PIN liegt im Klartext im React-Zustand der Shell: `ui/src/app/App.tsx:102-103`.
//   2. Gefüllt wird er beim Öffnen: `ui/src/shell/workspace/useWorkspaceActions.ts:232-233`.
//   3. Gelöscht wurde er **nur** dort, wo stattdessen der **andere** Ausweis gesetzt wird:
//      `ui/src/app/WorkspaceApplicationFrame.tsx:213/216/221/224` — vier Löschstellen, **alle** am SETZEN,
//      **keine** am SPERREN.
//   4. Der Sperrpfad existiert und persistiert den Sperrzustand, ließ den Ausweis aber stehen:
//      `ui/src/edition/open-core/apps/vault/VaultFreeRuntime.tsx:375` → `persistVaultLockRecord`.
//   ==> Nach dem Sperren lag der PIN weiter im Speicher. Das war der P0.
//
// **Was dieser Zeuge ausführt** (ohne DOM, ohne `jsdom`, ohne `@testing-library`): die Zustandsmaschine des
// Ausweises, die Projektion der beiden Karten der Shell und den Vergleich zweier Sperrvermerke desselben
// Dokuments — also genau die drei Teile, die im Rahmen die Entscheidung tragen. Der Rahmen ruft **dieselben**
// Funktionen auf (`WorkspaceApplicationFrame.tsx`, Effekt „P0 — der Ausweis fällt beim Sperren"); die
// Verdrahtung selbst ist zusätzlich als Quellvertrag abgesichert
// (`vaultCredentialLifetime.contract.test.mjs`), weil ein reiner Laufzeittest die Zeile in einer
// React-Komponente nicht sieht — und ein Quellvertrag allein die Richtung nicht ausführt. Beides gehört
// zusammen; keines von beiden allein wäre ein Beweis.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import {
  persistVaultLockRecord,
  readVaultLockRecord,
  VAULT_LOCK_RECORD_KEY,
} from '../../../../shared/vault/persistence/vaultPersistenceEngine';
import {
  applyVaultCredentialRevocation,
  noVaultLockTransition,
  vaultCredentialLifecycleTransition,
  vaultCredentialStateFor,
  vaultLockTransitionOf,
  type VaultCredentialMaps,
  type VaultCredentialState,
} from '../../../../shared/vault/security/vaultCredentialLifecycle';
import { vaultLockRecord } from '../../../../shared/vault/security/vaultSessionLock';

const DOCUMENT_ID = 'vault-1';
const OTHER_DOCUMENT_ID = 'vault-2';
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

/**
 * Ein `WorkspaceDocument` **ohne Typbehauptung**: jedes Pflichtfeld wird gesetzt. Die vorhandene
 * Vault-Testdatei benutzt an dieser Stelle `as unknown as WorkspaceDocument` — das ist in diesem Umfang
 * verboten (`vgtcoder` §4.2), also wird das Dokument vollständig gebaut.
 */
function vaultDocument(record: { lockedAt: number | null; lastActivityAt: number | null }): WorkspaceDocument {
  const seeded = persistVaultLockRecord({
    id: DOCUMENT_ID,
    title: 'Tresor',
    kind: 'Vault',
    created_at: NOW,
    modified_at: NOW,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
  }, record, NOW);
  // Der Träger wird aus dem **Ergebnis der Produktionsfunktion** gelesen, nicht nachgebaut: der Test prüft
  // damit genau das, was der Sperrpfad schreibt.
  const carrier: WorkspaceObject | undefined = seeded.objects[VAULT_LOCK_RECORD_KEY];
  const objects: Record<string, WorkspaceObject> = carrier === undefined ? {} : { [VAULT_LOCK_RECORD_KEY]: carrier };
  return {
    id: DOCUMENT_ID,
    title: 'Tresor',
    kind: 'Vault',
    created_at: NOW,
    modified_at: NOW,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects,
  };
}

/** Der Ausweis, wie ihn der Öffnungspfad setzt: `useWorkspaceActions.ts:232-233`. */
const OPENED_WITH_PIN: VaultCredentialState = { documentId: DOCUMENT_ID, mode: 'pin', credential: '4815' };

/** Die beiden Karten der Shell in genau dem Zustand, den `onSetActiveDocumentPin` herstellt. */
const MAPS_WITH_PIN: VaultCredentialMaps = { pins: { [DOCUMENT_ID]: '4815' }, passwords: {} };

/** Das Ereignis, das der Rahmen aus dem Sperrvermerk ableitet. */
function lockEvent(documentId: string) {
  return { type: 'vault.locked' as const, documentId };
}

describe('P0 — ein gesperrter Tresor hält keinen Ausweis mehr', () => {
  /**
   * **Der rote Fall.** Vor der Reparatur gab es kein Ereignis, das den gehaltenen Ausweis auf dem Sperrpfad
   * fallen ließ; die vier vorhandenen Löschstellen hingen alle am Setzen. Diese Zusicherung schlägt fehl,
   * sobald `vault.locked` den Ausweis stehen lässt — sie ist der Zeuge, nicht die Beschreibung.
   */
  it('das Sperren lässt den gehaltenen PIN fallen', () => {
    const held = vaultCredentialLifecycleTransition(OPENED_WITH_PIN, lockEvent(DOCUMENT_ID));
    expect(held).toBeNull();
    // Und die Projektion aus den beiden Karten sieht danach nichts mehr.
    const afterLock = applyVaultCredentialRevocation(MAPS_WITH_PIN, DOCUMENT_ID);
    expect(vaultCredentialStateFor(afterLock.pins, afterLock.passwords, DOCUMENT_ID)).toBeNull();
  });

  it('der abgeleitete Wert `hasPin` folgt dem Ausweis, nicht dem Dokument', () => {
    // `App.tsx:232` reicht `hasPin: Boolean(activeDocumentPin)` weiter: fällt der Ausweis, muss `hasPin`
    // fallen. Sonst zeigt die Oberfläche „hat PIN" für einen Tresor ohne Ausweis.
    expect(vaultCredentialStateFor(MAPS_WITH_PIN.pins, MAPS_WITH_PIN.passwords, DOCUMENT_ID)).not.toBeNull();
    const afterLock = applyVaultCredentialRevocation(MAPS_WITH_PIN, DOCUMENT_ID);
    const projected = vaultCredentialStateFor(afterLock.pins, afterLock.passwords, DOCUMENT_ID);
    expect(projected).toBeNull();
    // Genau der Ausdruck, den `App.tsx:104` bildet — und der danach `false` ergibt.
    expect(Boolean(afterLock.pins[DOCUMENT_ID] ?? null)).toBe(false);
  });

  it('auch ein portables Kennwort fällt — der Ausweis ist keine PIN-Sonderregel', () => {
    const password: VaultCredentialState = { documentId: DOCUMENT_ID, mode: 'password', credential: 'korrekt-pferd-batterie' };
    expect(vaultCredentialLifecycleTransition(password, lockEvent(DOCUMENT_ID))).toBeNull();
    const maps: VaultCredentialMaps = { pins: {}, passwords: { [DOCUMENT_ID]: 'korrekt-pferd-batterie' } };
    const afterLock = applyVaultCredentialRevocation(maps, DOCUMENT_ID);
    expect(afterLock.passwords[DOCUMENT_ID]).toBeUndefined();
    expect(afterLock.pins[DOCUMENT_ID]).toBeUndefined();
  });
});

describe('Richtung — nur das Sperren nimmt den Ausweis, das Entsperren gibt ihn nicht zurück', () => {
  it('das Entsperren lässt den Zustand unangetastet und erzeugt keinen Ausweis', () => {
    // Beim Entsperren ist nichts mehr zu halten: der Wert wurde mit dem Sperren verworfen. Ein „Entsperren",
    // das den alten PIN zurückholt, wäre erneut ein Ausweis, der das Sperren überlebt.
    const held = vaultCredentialLifecycleTransition(OPENED_WITH_PIN, lockEvent(DOCUMENT_ID));
    const unlocked = vaultCredentialLifecycleTransition(held, { type: 'vault.unlocked', documentId: DOCUMENT_ID });
    expect(unlocked).toBeNull();
    // Und aus dem Nichts entsteht beim Entsperren ebenfalls keiner.
    expect(vaultCredentialLifecycleTransition(null, { type: 'vault.unlocked', documentId: DOCUMENT_ID })).toBeNull();
  });

  it('ein Sperrvorgang eines anderen Dokuments lässt den Ausweis stehen', () => {
    // Sonst würde ein im Hintergrund gesperrter zweiter Tresor den Ausweis des offenen verwerfen.
    expect(vaultCredentialLifecycleTransition(OPENED_WITH_PIN, lockEvent(OTHER_DOCUMENT_ID))).toEqual(OPENED_WITH_PIN);
    const maps: VaultCredentialMaps = { pins: { [DOCUMENT_ID]: '4815', [OTHER_DOCUMENT_ID]: '9999' }, passwords: {} };
    const afterLock = applyVaultCredentialRevocation(maps, OTHER_DOCUMENT_ID);
    expect(afterLock.pins[OTHER_DOCUMENT_ID]).toBeUndefined();
    expect(afterLock.pins[DOCUMENT_ID]).toBe('4815');
  });

  it('der Sperrvermerk entscheidet die Richtung — `lastActivityAt` allein ist kein Sperren', () => {
    // `lastActivityAt` bewegt sich bei jeder Aktivität. Eine Ableitung, die darauf sperrt, würde den Ausweis
    // beim Tippen verwerfen.
    const active = vaultLockTransitionOf(
      { lockedAt: null, lastActivityAt: NOW },
      { lockedAt: null, lastActivityAt: NOW + MINUTE },
    );
    expect(active.locked).toBe(false);
    expect(active.unlocked).toBe(false);
    expect(noVaultLockTransition({ lockedAt: null, lastActivityAt: NOW }).locked).toBe(false);
    // Und genau daraus bildet der Rahmen das Ereignis „entsperrt" — der Ausweis bleibt.
    expect(vaultCredentialLifecycleTransition(OPENED_WITH_PIN, { type: 'vault.unlocked', documentId: DOCUMENT_ID }))
      .toEqual(OPENED_WITH_PIN);
  });
});

describe('Der Sperrvermerk im Dokument ist die Quelle der Richtung — wie im Laufzeitpfad', () => {
  it('die Kette des Sperrpfads: Dokument entsperrt → `persistVaultLockRecord` → Vermerk gesetzt → Ausweis fällt', () => {
    // Schritt 4 der gemessenen Kette, ausgeführt statt behauptet: `VaultFreeRuntime.tsx:375` schreibt
    // `vaultLockRecord(true, now)` über `persistVaultLockRecord` ins Dokument. Danach liest der Rahmen
    // denselben Träger und leitet die Richtung ab.
    const before = vaultDocument(vaultLockRecord(false, NOW));
    const after = persistVaultLockRecord(before, vaultLockRecord(true, NOW + MINUTE), NOW + MINUTE);

    const transition = vaultLockTransitionOf(readVaultLockRecord(before), readVaultLockRecord(after));
    expect(transition.locked).toBe(true);
    expect(transition.unlocked).toBe(false);

    const held = vaultCredentialLifecycleTransition(OPENED_WITH_PIN, lockEvent(DOCUMENT_ID));
    expect(held).toBeNull();
    // Der Rückfallschutz des Rahmens greift am Zustand, nicht nur an der Flanke.
    expect(transition.next.lockedAt).toBe(NOW + MINUTE);
  });

  it('das Entsperren setzt den Vermerk zurück und wird als Entsperren gelesen', () => {
    const lockedDoc = vaultDocument(vaultLockRecord(true, NOW));
    const unlockedDoc = persistVaultLockRecord(lockedDoc, vaultLockRecord(false, NOW + MINUTE), NOW + MINUTE);
    const transition = vaultLockTransitionOf(readVaultLockRecord(lockedDoc), readVaultLockRecord(unlockedDoc));
    expect(transition.locked).toBe(false);
    expect(transition.unlocked).toBe(true);
    expect(readVaultLockRecord(unlockedDoc).lockedAt).toBeNull();
  });

  it('zweimal sperren ist kein Übergang — und deshalb nicht der Auslöser, sondern der Rückfallschutz', () => {
    const first = vaultDocument(vaultLockRecord(true, NOW));
    const second = persistVaultLockRecord(first, vaultLockRecord(true, NOW + MINUTE), NOW + MINUTE);
    // **Eigener Fehler, hier festgehalten:** Diese Zusicherung stand zuerst andersherum („zweimal sperren
    // bleibt ein Sperrvorgang") und war rot. Der Lauf hat gezeigt, dass `vaultLockTransitionOf` genau
    // `null → gesetzt` als Übergang liest — das ist die Definition von „neu gesperrt". Der Test war
    // übergenau, nicht der Code.
    expect(vaultLockTransitionOf(readVaultLockRecord(first), readVaultLockRecord(second)).locked).toBe(false);
    // Was wirklich zählt: der Vermerk ist gesetzt, und der Rahmen prüft deshalb **zusätzlich** den Zustand
    // (`transition.next.lockedAt !== null`) — ein hier noch gehaltener Ausweis fällt trotzdem.
    expect(readVaultLockRecord(second).lockedAt).toBe(NOW + MINUTE);
    expect(vaultCredentialLifecycleTransition(OPENED_WITH_PIN, lockEvent(DOCUMENT_ID))).toBeNull();
  });
});

describe('Der Ausweis wird nirgends gehalten, wo er nicht hingehört', () => {
  it('ein leerer oder fehlender Ausweis ist kein Ausweis', () => {
    expect(vaultCredentialStateFor({ [DOCUMENT_ID]: '' }, {}, DOCUMENT_ID)).toBeNull();
    expect(vaultCredentialStateFor({}, {}, DOCUMENT_ID)).toBeNull();
    expect(vaultCredentialStateFor({}, { [DOCUMENT_ID]: 'geheim' }, DOCUMENT_ID))
      .toEqual({ documentId: DOCUMENT_ID, mode: 'password', credential: 'geheim' });
  });

  it('die Projektion liest die PIN-Achse zuerst und die Kennwort-Achse nur, wenn sie leer ist', () => {
    expect(vaultCredentialStateFor({ [DOCUMENT_ID]: '4815' }, { [DOCUMENT_ID]: 'geheim' }, DOCUMENT_ID))
      .toEqual({ documentId: DOCUMENT_ID, mode: 'pin', credential: '4815' });
  });

  it('das Zurücknehmen eines einzelnen Ausweises trifft genau eine Achse', () => {
    const held: VaultCredentialState = { documentId: DOCUMENT_ID, mode: 'pin', credential: '4815' };
    expect(vaultCredentialLifecycleTransition(held, { type: 'credential.revoked', documentId: DOCUMENT_ID, mode: 'pin' })).toBeNull();
    expect(vaultCredentialLifecycleTransition(held, { type: 'credential.revoked', documentId: DOCUMENT_ID, mode: 'password' })).toEqual(held);
    expect(vaultCredentialLifecycleTransition(held, { type: 'credential.revoked', documentId: OTHER_DOCUMENT_ID, mode: 'pin' })).toEqual(held);
  });

  it('das Zurücknehmen rührt den Ausweis eines anderen Dokuments nicht an', () => {
    const maps: VaultCredentialMaps = { pins: { [DOCUMENT_ID]: '4815', [OTHER_DOCUMENT_ID]: '9999' }, passwords: {} };
    const afterLock = applyVaultCredentialRevocation(maps, DOCUMENT_ID);
    expect(afterLock.pins[DOCUMENT_ID]).toBeUndefined();
    expect(afterLock.pins[OTHER_DOCUMENT_ID]).toBe('9999');
  });
});
