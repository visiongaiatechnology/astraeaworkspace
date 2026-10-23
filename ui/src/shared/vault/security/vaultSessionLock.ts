// STATUS: PLATIN — Sperren muss entschlüsseltes Material zurücknehmen, nicht nur ausblenden.
//
// Diese Datei existiert wegen eines konkreten, gemessenen Befunds am Produktionspfad, nicht wegen einer
// Vermutung. `VaultFreeRuntime` führt den Sitzungszustand in `runtimeLocked`. Beim Sperren ändert sich
// **nur** dieses eine Flag:
//
//   `onRuntimeLockedChange(true)`  (VaultKeyPolicyPanel: Lock now / Auto-Lock-Timer)
//     → `setRuntimeLocked(true)`   (VaultFreeRuntime)
//     → Panels mit `{!runtimeLocked && …}` verschwinden
//
// Was **nicht** verschwand, weil es in Kindkomponenten liegt, die niemand zurücksetzt:
//   • `VaultFilesTab.previewFile` → `VaultQuickPreviewModal` blieb gemountet und rendert weiter
//     `preview.dataUrl` in ein `<img src>` (VaultQuickPreviewModal.tsx) — das entschlüsselte Bild blieb
//     sichtbar, obwohl der Tresor als gesperrt galt.
//   • `VaultFilesTab.selectedFileForInspection` → Attestationsdialog blieb offen.
//   • `VaultFilesTab.filteredFiles` blieb im DOM: Dateinamen, Tags, Owner, Digests.
//
// Ein Schloss, das nur die Panels ausblendet, während daneben ein entschlüsseltes Bild stehen bleibt, ist
// eine Erfolgsmeldung ohne die zugehörige Operation — genau das Muster, das dieser Plan verbietet.
//
// **Reichweite, offengelegt:** Die Prüffunktion wird von `shared/vault/files/VaultFilesTab.tsx` in
// Produktionscode aufgerufen (nicht nur von Tests). Der reine Sichtbarkeitsvergleich ist zusätzlich über
// `vaultSessionViewOf` testbar, ohne dass die Komponente dafür einen Browser braucht.

/**
 * Alles, was nach dem Sperren nicht mehr sichtbar sein darf. Jeder Eintrag ist ein Stück **entschlüsselter**
 * Inhalt, das ohne diese Prüfung weiterleben würde. Metadaten stehen bewusst mit in der Liste: Dateiname,
 * Tag und Owner eines Tresors sind selbst Geheimnis, wenn der Tresor sie nicht mehr herausgeben soll
 * (Akzeptanzhandlung zu AST-1176: „Vorschau und Suche sofort entziehen").
 */
export const VAULT_SESSION_MATERIALS = Object.freeze([
  'preview',
  'attestation',
  'fileList',
  'searchPanel',
  'searchResults',
  'backupPanel',
  'versionHistory',
  'trashRecovery',
  'advancedModal',
  'inlineThumbnails',
  'undoHistory',
] as const);

export type VaultSessionMaterial = typeof VAULT_SESSION_MATERIALS[number];

export type VaultSessionView = Readonly<Record<VaultSessionMaterial, boolean>>;

/** Nichts sichtbar — der einzige Zustand, der nach dem Sperren zulässig ist. */
export const VAULT_SESSION_LOCKED_VIEW: VaultSessionView = Object.freeze(
  Object.fromEntries(VAULT_SESSION_MATERIALS.map((material) => [material, false])) as Record<VaultSessionMaterial, boolean>,
);

/** Baut eine Sicht aus den tatsächlich gesetzten Materialien; alles Ungenannte gilt als unsichtbar. */
export function vaultSessionViewOf(visible: Partial<Record<VaultSessionMaterial, boolean>>): VaultSessionView {
  return Object.freeze(Object.fromEntries(
    VAULT_SESSION_MATERIALS.map((material) => [material, visible[material] === true]),
  ) as Record<VaultSessionMaterial, boolean>);
}

export interface VaultLockRevocation {
  /** Der Zustand, der **angestrebt** wird: alles unsichtbar. */
  target: VaultSessionView;
  /** Die Materialien, die im übergebenen Zustand noch sichtbar sind — die konkrete Undichtigkeit. */
  stillVisible: VaultSessionMaterial[];
  /** `true` genau dann, wenn nichts mehr sichtbar ist. */
  revoked: boolean;
}

/**
 * Vergleicht den tatsächlichen Sichtbarkeitszustand mit der Sperrzusage und **benennt** jede Position, die
 * noch sichtbar ist. Der Unterschied zwischen „gesperrt" und „gesperrt aussehend" ist damit eine messbare
 * Liste, keine Behauptung.
 */
export function vaultLockRevocation(view: VaultSessionView): VaultLockRevocation {
  const stillVisible = VAULT_SESSION_MATERIALS.filter((material) => view[material] === true);
  return { target: VAULT_SESSION_LOCKED_VIEW, stillVisible: [...stillVisible], revoked: stillVisible.length === 0 };
}

/**
 * Die eine Zeile, die zwischen „gesperrt aussehend" und „gesperrt" unterscheidet, als prüfbarer Ausdruck.
 * `VaultFilesTab` ruft sie in seinem Sperrzweig **und** vor dem Aufräumen auf: eine künftige Änderung, die
 * einen Dialog offen lässt, wird damit zur Ausnahme statt zu einem stillen Leck.
 */
export function assertVaultSessionRevoked(view: VaultSessionView): void {
  const revocation = vaultLockRevocation(view);
  if (!revocation.revoked) {
    throw new Error(`vault_session_not_revoked:${revocation.stillVisible.join(',')}`);
  }
}

/** Bequemer Einzelaufruf: prüft ein einzelnes Material gegen die Sperrzusage. */
export function assertVaultSessionMaterialHidden(material: VaultSessionMaterial, visible: boolean): void {
  if (visible) throw new Error(`vault_session_not_revoked:${material}`);
}

// ---------------------------------------------------------------------------------------------------
// **V-010 — der Sperrzustand wird persistiert.**
//
// **Der Befund:** `runtimeLocked` lebte nur im Speicher von `VaultFreeRuntime`. Ein Neuladen, ein
// Absturz oder ein Wechsel des Dokuments setzte den Tresor auf **entsperrt** zurück — obwohl der Nutzer ihn
// ausdrücklich gesperrt hatte. Der „Lock now"-Knopf war damit eine Erfolgsmeldung ohne dauerhafte Wirkung:
// er galt bis zum nächsten Laden.
//
// **Kein zweiter Speicher:** Der Zustand gehört in das zentrale Dokument (`vaultData`), wie alles andere im
// Vault. `persistVaultData` kann ihn aber nicht schreiben — es wirft bei gesperrtem Tresor
// (`vault_runtime_locked`), und genau das Sperren wäre der Schreibvorgang. Der Sperrzustand geht deshalb
// über `onUpdateDocument` in die **vorhandene** Dokumenthülle, so wie es die Undo-Historie bereits tut.
//
// **Die Entscheidung ist rein und prüfbar:** `deriveVaultLockState` braucht keine Uhr und keinen Browser,
// nur Zeitstempel. Das ist der Teil, der sich ohne DOM messen lässt; die Verdrahtung im Laufzeitpfad ist
// Quellvertrag.
// ---------------------------------------------------------------------------------------------------

/** Ein Zeitstempel, der als „gesetzt" zählt: endlich und positiv. */
function isUsableTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export interface VaultLockState {
  locked: boolean;
  /**
   * Warum gesperrt wird. `explicit` = der Nutzer hat gesperrt (dauerhaft, bis er entsperrt).
   * `auto_lock` = die Untätigkeitsfrist ist abgelaufen. `never_locked` = es gibt keinen Sperrvermerk.
   */
  reason: 'explicit' | 'auto_lock' | 'never_locked';
  /** Die Untätigkeit in Millisekunden, wenn sie bekannt ist. */
  idleMs?: number;
}

/**
 * Leitet den Sperrzustand beim Laden aus dem persistierten Dokument ab.
 *
 * **Fail-closed bei unbrauchbaren Werten:** Ein unsinniger `lockedAt`- oder `autoLockMinutes`-Wert führt zu
 * **gesperrt**, nicht zu entsperrt. Ein Tresor, der wegen eines kaputten Zeitstempels offen stehen bleibt,
 * wäre der schlimmere Fehler — dieselbe Regel wie in `vaultShouldAutoLock`.
 */
export function deriveVaultLockState(input: {
  /** Zeitstempel des ausdrücklichen Sperrens, wie persistiert. `null`/`undefined` = kein Sperrvermerk. */
  lockedAt?: number | null;
  /** Letzte bekannte Aktivität, wie persistiert. */
  lastActivityAt?: number | null;
  /** Untätigkeitsfrist in Minuten; `0` bedeutet „keine automatische Sperre". */
  autoLockMinutes?: number | null;
  now: number;
}): VaultLockState {
  const now = isUsableTimestamp(input?.now) ? input.now : Number.NaN;
  if (!Number.isFinite(now)) {
    // Ohne brauchbare Uhr wird gesperrt: „ich weiß nicht, wie spät es ist" ist kein Freibrief.
    return { locked: true, reason: 'explicit' };
  }

  // 1. Ein ausdrücklicher Sperrvermerk gewinnt immer — er wird nur durch Entsperren zurückgenommen.
  if (input.lockedAt !== null && input.lockedAt !== undefined) {
    // Ein gesetzter, aber unbrauchbarer Wert wird als Sperre gewertet (fail-closed).
    if (!isUsableTimestamp(input.lockedAt)) return { locked: true, reason: 'explicit' };
    return { locked: true, reason: 'explicit' };
  }

  // 2. Auto-Lock: nur wenn eine Frist gesetzt ist.
  const minutes = input.autoLockMinutes;
  if (minutes === null || minutes === undefined || minutes === 0) return { locked: false, reason: 'never_locked' };
  if (!isUsableTimestamp(minutes) || minutes < 0) return { locked: true, reason: 'auto_lock' };

  const window = minutes * 60_000;
  const last = isUsableTimestamp(input.lastActivityAt) ? input.lastActivityAt : Number.NaN;
  if (!Number.isFinite(last)) {
    // Keine bekannte Aktivität heißt: unbekannte Untätigkeit. Bei gesetzter Frist wird gesperrt.
    return { locked: true, reason: 'auto_lock' };
  }
  // Eine Uhr, die rückwärts läuft (`last` in der Zukunft), ist kein Beweis für Aktivität.
  if (last > now) return { locked: true, reason: 'auto_lock' };
  const idleMs = now - last;
  return idleMs >= window
    ? { locked: true, reason: 'auto_lock', idleMs }
    : { locked: false, reason: 'never_locked', idleMs };
}

/**
 * Der Vermerk, der beim Sperren ins Dokument geschrieben wird. `lockedAt` ist ein **Zeitstempel**, kein
 * Boolesches: damit ist „gesperrt" reproduzierbar und der Moment des Sperrens im Dokument nachvollziehbar.
 */
export function vaultLockRecord(locked: boolean, now: number): { lockedAt: number | null; lastActivityAt: number } {
  const stamp = isUsableTimestamp(now) ? now : Date.now();
  return { lockedAt: locked ? stamp : null, lastActivityAt: stamp };
}
