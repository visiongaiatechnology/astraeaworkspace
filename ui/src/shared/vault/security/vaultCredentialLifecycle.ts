// STATUS: PLATIN — der Sitzungsausweis fällt beim Sperren, nicht erst beim Überschreiben.
//
// **Der gemessene P0, der diese Datei erzwingt.**
//
// Der PIN eines Tresors liegt als **Klartext** im React-Zustand der Shell (`App.tsx:102-103`) und wird beim
// Öffnen gefüllt (`useWorkspaceActions.ts:232-233`). Gelöscht wurde er **ausschließlich** dort, wo stattdessen
// der **andere** Ausweis gesetzt wird (`WorkspaceApplicationFrame.tsx:213/216/221/224`): vier Löschstellen, die
// **alle** am SETZEN hängen — **keine** am SPERREN. Der Sperrpfad existiert und persistiert den Sperrzustand
// (`VaultFreeRuntime.tsx:375` → `persistVaultLockRecord`), aber der Ausweis blieb danach im Speicher stehen.
// Nach dem Sperren las die Oberfläche weiter `documentPins[activeDocId]` — ein Tresor, dessen Schlüssel das
// Sperren überlebt, ist genau der Zustand, den ein Schloss ausschließen soll.
//
// **Warum ein eigener reiner Helfer und nicht eine fünfte Bedingung.**
// Ein Ausweis-Lebenszyklus ist eine Zustandsmaschine: er hat **einen** Haltezustand, **ein** Ereignis, das ihn
// beendet, und **eine** Richtung. Verteilte Bedingungen haben genau den Fehler erzeugt, den diese Datei behebt.
// Der Helfer bekommt den Zustand und das Ereignis und gibt den neuen Zustand zurück — er **mutiert nichts**,
// **kennt React nicht**, **liest keine Uhr** und **braucht kein DOM**. Genau deshalb ist er ohne Browser
// ausführbar, obwohl der Fehler in einer React-Komponente saß.
//
// **Reichweite, gemessen.** `WorkspaceApplicationFrame` importiert und **ruft** hier vier Funktionen im
// Produktionspfad: `vaultCredentialStateFor` (was wird gehalten?), `vaultLockTransitionOf` /
// `noVaultLockTransition` (in welche Richtung bewegt sich der Sperrvermerk?) und
// `vaultCredentialLifecycleTransition` (die Entscheidung) sowie `applyVaultCredentialRevocation` (das
// Ergebnis). Die Bedingung liegt damit **einmal** hier und nicht an vier Stellen im Rahmen.
//
// **Kein zweiter Speicher.** Der Ausweis liegt weiterhin genau dort, wo er lag: in den beiden Zustandskarten
// der Shell. Dieser Helfer hält keinen eigenen Zustand und schreibt nichts.

/** Die zwei Ausweisarten eines Dokuments. `mode` ist die Achse, `credential` der Wert — nie umgekehrt. */
export type VaultCredentialMode = 'pin' | 'password';

/** Nicht `string | null`: „fehlt" ist ein eigener Fall und nicht der leere Ausweis. */
export type VaultCredential = string | undefined;

/**
 * Ein Ausweis **im Speicher der Sitzung**. `documentId` ist Teil des Trägers, nicht des Werts: der Ausweis
 * gehört einem Dokument und darf nie versehentlich auf ein anderes angewendet werden.
 */
export interface VaultSessionCredential {
  readonly documentId: string;
  readonly mode: VaultCredentialMode;
  readonly credential: VaultCredential;
}

/**
 * `null` bedeutet **„kein Ausweis gehalten"** — nicht „ein leerer Ausweis". Ein leerer String wäre ein
 * Ausweis, den jeder erraten kann; ihn zu halten wäre schlimmer als ihn zu verwerfen.
 */
export type VaultCredentialState = VaultSessionCredential | null;

/**
 * Die Ereignisse, die den Lebenszyklus bewegen.
 *
 * **`vault.locked` ist das entscheidende.** Es ist das **einzige** Ereignis, das den Ausweis fallen lässt —
 * unabhängig davon, welcher Ausweis gehalten wird und ob überhaupt einer gehalten wird. Das Sperren ist
 * damit keine Bedingung mehr, die man vergessen kann: es ist der Übergang, den der Zustand nicht überlebt.
 */
export type VaultCredentialLifecycleEvent =
  | { readonly type: 'credential.revoked'; readonly documentId: string; readonly mode: VaultCredentialMode }
  /** Das Dokument wird gesperrt. Der Ausweis fällt — für dieses Dokument, in beiden Achsen. */
  | { readonly type: 'vault.locked'; readonly documentId: string }
  /** Das Dokument wird entsperrt. Der Ausweis wird **nicht** wiederhergestellt: dafür gibt es kein Ereignis. */
  | { readonly type: 'vault.unlocked'; readonly documentId: string }
  | { readonly type: 'session.cleared' };

/** Der einzige Haltezustand, der nach dem Sperren zulässig ist. */
export const NO_VAULT_CREDENTIAL_HELD: VaultCredentialState = null;

function isHeldCredential(value: VaultCredential): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * **Der Haltezustand aus den beiden Karten der Shell.**
 *
 * `WorkspaceApplicationFrame` hält `documentPins` und `documentPasswords` getrennt. Diese Funktion ist die
 * eine Stelle, an der aus beiden Karten abgelesen wird, **was gerade gehalten wird** — damit der Setzpfad und
 * der Sperrpfad nicht zwei verschiedene Antworten auf dieselbe Frage geben.
 */
export function vaultCredentialStateFor(
  pins: Readonly<Record<string, string>>,
  passwords: Readonly<Record<string, string>>,
  documentId: string,
): VaultCredentialState {
  const pin = pins[documentId];
  if (isHeldCredential(pin)) return { documentId, mode: 'pin', credential: pin };
  const password = passwords[documentId];
  if (isHeldCredential(password)) return { documentId, mode: 'password', credential: password };
  return NO_VAULT_CREDENTIAL_HELD;
}

/** Die beiden Karten, wie die Shell sie führt. */
export interface VaultCredentialMaps {
  readonly pins: Readonly<Record<string, string>>;
  readonly passwords: Readonly<Record<string, string>>;
}

function withoutKey(map: Readonly<Record<string, string>>, key: string): Record<string, string> {
  // Ein neues Objekt statt derselben Referenz: der Aufrufer vergleicht Referenzen, um Schreibvorgänge ohne
  // Wirkung zu vermeiden. `{ ...map }` ist die kleinste ehrliche Kopie.
  if (!Object.prototype.hasOwnProperty.call(map, key)) return { ...map };
  const next: Record<string, string> = {};
  for (const [candidate, value] of Object.entries(map)) if (candidate !== key) next[candidate] = value;
  return next;
}

/**
 * **Nimmt einen Ausweis zurück** — beide Achsen des Dokuments. Was ein Sperren tun muss: nicht „den PIN
 * löschen", sondern „für dieses Dokument ist kein Ausweis mehr im Speicher", gleich in welcher Achse er lag.
 */
export function applyVaultCredentialRevocation(maps: VaultCredentialMaps, documentId: string): VaultCredentialMaps {
  return { pins: withoutKey(maps.pins, documentId), passwords: withoutKey(maps.passwords, documentId) };
}

/**
 * Der Übergang. **Rein**: keine Mutation, kein `Date.now()`, kein DOM, kein Exception-Pfad.
 *
 * Die Richtung ist als Vertrag formuliert, nicht als Kommentar:
 *   • `vault.locked` **lässt fallen** — auch einen Ausweis, der zu einem früheren Zeitpunkt gesetzt wurde.
 *   • `vault.unlocked` **stellt nicht wieder her** — es gibt nichts wiederherzustellen, weil der Wert mit dem
 *     Sperren verworfen wurde. Ein „Entsperren", das den alten PIN zurückholt, wäre wieder ein Ausweis, der
 *     das Sperren überlebt.
 *   • `credential.revoked` entfernt nur, was zu `documentId` **und** `mode` passt. Ein globales „alles
 *     löschen" wäre eine zweite, gröbere Regel für dieselbe Sache.
 */
export function vaultCredentialLifecycleTransition(
  state: VaultCredentialState,
  event: VaultCredentialLifecycleEvent,
): VaultCredentialState {
  switch (event.type) {
    case 'credential.revoked': {
      if (state === null) return null;
      const matches = state.documentId === event.documentId && state.mode === event.mode;
      return matches ? null : state;
    }
    case 'vault.locked': {
      if (state === null) return null;
      // **Die eine Zeile, um die es geht.** Nur ein Ausweis desselben Dokuments fällt; der Ausweis eines
      // anderen Dokuments gehört nicht zu diesem Schließvorgang.
      return state.documentId === event.documentId ? null : state;
    }
    case 'vault.unlocked':
      // Bewusst ohne Wirkung: Entsperren erzeugt keinen Ausweis. Wer das ändert, macht das Sperren rückgängig.
      return state;
    case 'session.cleared':
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------
// **Der Übergang des Sperrvermerks.** Der Rahmen kennt nicht `runtimeLocked` (das lebt in
// `VaultFreeRuntime`), sondern das **Dokument**, in das der Sperrzustand geschrieben wird. Deshalb wird die
// Richtung aus dem Vermerk abgeleitet — und genau diese Ableitung ist der Teil, der sich ohne DOM messen lässt.
// ---------------------------------------------------------------------------------------------------

/** Der Sperrvermerk, wie er im Dokument liegt. Strukturell, damit die Ableitung keinen DOM braucht. */
export interface VaultLockRecordSnapshot {
  readonly lockedAt: number | null;
  readonly lastActivityAt: number | null;
}

export interface VaultLockTransition {
  /** `true` genau dann, wenn der Vermerk **neu gesetzt** wurde — der Sperrvorgang. */
  readonly locked: boolean;
  /** `true` genau dann, wenn ein gesetzter Vermerk **zurückgenommen** wurde — das Entsperren. */
  readonly unlocked: boolean;
  readonly prior: VaultLockRecordSnapshot;
  readonly next: VaultLockRecordSnapshot;
}

/**
 * Vergleicht zwei Sperrvermerke desselben Dokuments. **Nur `lockedAt` entscheidet die Richtung:**
 * `lastActivityAt` bewegt sich bei jeder Aktivität und darf keinen Sperrvorgang vortäuschen — sonst fiele der
 * Ausweis beim Tippen.
 */
export function vaultLockTransitionOf(
  prior: VaultLockRecordSnapshot,
  next: VaultLockRecordSnapshot,
): VaultLockTransition {
  const priorLocked = prior.lockedAt !== null;
  const nextLocked = next.lockedAt !== null;
  return {
    locked: !priorLocked && nextLocked,
    unlocked: priorLocked && !nextLocked,
    prior,
    next,
  };
}

/** Kein Übergang — der Ausgangswert für den ersten Vergleich eines Dokuments. */
export function noVaultLockTransition(record: VaultLockRecordSnapshot): VaultLockTransition {
  return { locked: false, unlocked: false, prior: record, next: record };
}
