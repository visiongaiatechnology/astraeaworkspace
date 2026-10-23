// STATUS: PLATIN — Integration & Release, **Notes · Paket 21** (Notes → Writer): der **Träger-Erzeuger** der Quellenseite
//
// ## Was dieser Erzeuger liefert — und was **nicht**
//
// Er baut den **einen** vorhandenen Träger (Paket 7: `createWorkspaceDragPayload` → `serializeWorkspaceDragPayload`)
// für **einen Markdown-Absatz** einer Notes-Seite. Der Träger ist eine **Referenz**: Dokument-ID, Objekt-ID,
// Objektart, Quell-Anwendung, angebotene Absichten — **kein Inhalt** ✗✓. *Der Absatztext fährt nicht mit; wer ihn
// braucht, holt ihn über die Referenz.*
//
// ## Warum die Objekt-ID die **Seite** ist und der Absatz in der **Referenz** steht
//
// Der kanonische Deskriptor hat **genau fünf** Schlüssel (`['documentId','objectId','objectKind','sourceApp',
// 'supportedIntents']`, Paket 7) — **ein Absatz hat darin keinen Platz** ✗. *Ein sechstes Feld wäre ein zweites
// Format und würde vom vorhandenen Parser abgelehnt.* Deshalb trägt der Träger die **Seite** als Objekt
// (`objectKind: 'TextBlock'`) und der Absatz wird über die **vorhandene** Referenz-Vokabel benannt:
// `noteWorkspaceUri(documentId, pageId)` + das **vorhandene** Zeilenfragment `#line-<n>`
// (`notesWorkspaceActions.ts`: `const lineUri = \`${sourceUri}#line-${index}\``). *Kein neues URI-Schema.*
//
// ## Kein zweiter Trägerpfad
//
// Hier steht **kein** `JSON.stringify`, **kein** eigener Parser und **keine** zweite MIME-Konstante: der Träger
// entsteht ausschließlich über den vorhandenen Erzeuger und wird mit dem vorhandenen Serialisierer geschrieben.
// Die MIME-Art ist **die eine** (`FABRIC_WORKSPACE_OBJECT_DRAG_MIME`) — *sie wird hier nur benannt, nicht gesetzt.*
//
// ## Fail-closed, mit **benanntem** Grund
//
// Ein Absatz, der **nicht** ziehbar ist, ergibt **keinen** Träger, sondern einen Namen: unbekanntes Dokument,
// falsche Dokumentart, fehlende Seite, Seite im Papierkorb, **gesperrte** Seite (Schutzrichtlinie), unbrauchbare
// Zeilennummer, leerer Absatz. Und lehnt der **vorhandene** Erzeuger ab (z. B. `identifier_invalid`), wird **sein**
// Code durchgereicht — *dieses Modul führt keine zweite Kennungsprüfung.*
//
// ## Die Tastatur ist ein **eigener** Zugang, kein Ersatz
//
// `resolveNotesCarrierCommand` / `applyNotesCarrierCommand` erzeugen **denselben** Träger wie ein Zeiger-Zug:
// beide rufen `notesParagraphCarrier`. *Ziehen ist damit nie der einzige Weg* ✓ — und die **Absicht** (Kopie oder
// Referenz) bleibt am Träger **sichtbar** (`intents`), statt heimlich gewählt zu werden: *welche gilt, entscheidet
// die Ablage (Paket 15: der Modus wird **gesagt**).*
//
// ## Der gemessene Produktionszustand (nicht behauptet)
//
// Die versiegelte Matrix trägt für Notes heute **keine Ausfuhr** (`exports: []`) und für Writer **keinen** Import
// der Objektart `TextBlock` ✗ — die Route Notes → Writer ist damit **als Ziel gedeckt, als Quelle offen** ✗✓.
// Ein Notes-Absatz-Träger ist deshalb heute ein **benannter** Fehlschlag des Resolvers, und **zwar**:
// `drop_source_object_missing` (der Absatz ist kein Objekt des Notes-Dokuments — gemessen: `objects: {}`) bzw.
// `registry_adapter_route_missing` (keine Route mit dieser Quelle). *Beides wird in
// `notesParagraphCarrier.test.ts` gegen die **echte** gesiegelte Matrix gemessen — nicht in diesem Modul
// vorweggenommen: die Route ist nicht Sache des Erzeugers.*
//
// ## Was hier `NOT_TESTED` bleibt (Schicht 5)
//
// Das **Binden** des Zuges selbst: `dragstart` mit `dataTransfer.setData(carrier.mime, carrier.payload)` und die
// Tastatur-Bindung im Notes-Rumpf. *Dafür braucht es einen Browser mit Ereignissen, den diese Umgebung nicht hat*
// — geprüft sind der **Erzeuger** und die **Befehls-Absicht**, nicht ihr Anschlag.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import {
  WorkspaceInteractionError,
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
} from '../../../shared/workspace-interaction';
import type { WorkspaceDropIntent, WorkspaceInteractionErrorCode } from '../../../shared/workspace-interaction';
import { FABRIC_WORKSPACE_OBJECT_DRAG_MIME } from '../../../shell/fabric/fabricGraphWorkspaceDrop';
import { noteWorkspaceUri } from './notesWorkspaceActions';

/**
 * Die Objektart, die einen Notes-**Absatz** trägt — **gelesen**, nicht erfunden: Writer führt seine Absätze als
 * `TextBlock` (`notesWorkspaceActions.ts` schreibt genau diese Art in den Entwurf). *Eine andere Art wäre eine
 * zweite Vokabel für dieselbe Sache.*
 */
export const NOTES_CARRIER_OBJECT_KIND = 'TextBlock' as const;

/**
 * **Die zwei Absichten des Absatzes** — der Akzeptanzwortlaut von **Notes · Paket 21** lautet „als kopierten
 * **oder** referenzierten Rich Text". Beide werden **angeboten**; welche gilt, entscheidet die Ablage (Paket 15).
 * *`FROZEN_SNAPSHOT` fehlt hier bewusst: er wäre eine dritte Zusage, die der Wortlaut nicht verlangt.*
 */
export const NOTES_CARRIER_INTENTS: readonly WorkspaceDropIntent[] = Object.freeze(['COPY', 'LIVE_REFERENCE']);

/** Die Gründe, die **dieser Erzeuger** selbst kennt — alles andere kommt aus dem vorhandenen Erzeuger/Fehler. */
export type NotesCarrierLocalRefusal =
  | 'notes-carrier-document-missing'
  | 'notes-carrier-document-kind-invalid'
  | 'notes-carrier-page-missing'
  | 'notes-carrier-page-trashed'
  | 'notes-carrier-page-locked'
  | 'notes-carrier-line-invalid'
  | 'notes-carrier-line-empty'
  | 'notes-carrier-key-unbound'
  | 'notes-carrier-command-unknown';

/** Der **benannte** Grund einer Ablehnung: die bestehenden Codes zuerst, die eigenen danach. */
export type NotesCarrierRefusal = NotesCarrierLocalRefusal | WorkspaceInteractionErrorCode;

/**
 * Die Eingaben — **strukturell** und ohne DOM: das Dokument, die Seite, die Zeile, und die **Tatsache** „gesperrt".
 *
 * `locked` wird **gereicht**, nicht ermittelt: *die Schutzregel lebt in `notesSecurity` (`pageRequiresUnlock` /
 * `isPageLocked`) — eine zweite Prüfung derselben Richtlinie wäre eine zweite Wahrheit.* Dieses Modul lehnt
 * lediglich **benannt** ab, wenn die Fläche sagt, dass die Seite gesperrt ist.
 */
export interface NotesCarrierRequest {
  readonly document: unknown;
  readonly page: unknown;
  readonly lineIndex: unknown;
  readonly locked?: unknown;
}

/** Was der Nutzer zieht: die **Referenz** und der **eine** Träger — ohne Inhalt. */
export interface NotesParagraphCarrier {
  /** Der vorhandene Träger (Paket 7) — **die eine** Form, kein zweites Format. */
  readonly payload: string;
  /** Die **eine** MIME-Konstante — die Fläche setzt sie beim Ziehen, dieses Modul erfindet keine. */
  readonly mime: string;
  /** Die Referenz auf **den Absatz**: Seiten-URI + vorhandenes Zeilenfragment (`#line-<n>`). */
  readonly reference: string;
  readonly documentId: string;
  readonly pageId: string;
  readonly lineIndex: number;
  readonly objectKind: typeof NOTES_CARRIER_OBJECT_KIND;
  /** **Sichtbar am Träger:** Kopie **und** Referenz stehen hier — *keine heimliche Absicht.* */
  readonly intents: readonly WorkspaceDropIntent[];
  /** Die sichtbare Beschreibung des Zuges — **ohne** Absatztext. */
  readonly label: string;
}

export type NotesCarrierStep =
  | { readonly ok: true; readonly carrier: NotesParagraphCarrier; readonly reason?: never }
  | { readonly ok: false; readonly reason: NotesCarrierRefusal; readonly carrier?: never };

/** Die Tastatur als **Absicht** — derselbe Träger, nur ohne Zeiger. */
export type NotesCarrierCommand = { readonly kind: 'carry' } | { readonly kind: 'dismiss' };

export type NotesCarrierCommandStep =
  | { readonly ok: true; readonly command: NotesCarrierCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'notes-carrier-key-unbound'; readonly command?: never };

export type NotesCarrierCommandResult =
  | { readonly ok: true; readonly kind: 'carried'; readonly carrier: NotesParagraphCarrier }
  | { readonly ok: true; readonly kind: 'dismissed' }
  | { readonly ok: false; readonly reason: NotesCarrierRefusal };

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer Grund bricht hier den Bau. */
const NOTES_CARRIER_LOCAL_REFUSAL_TEXT: Readonly<Record<NotesCarrierLocalRefusal, string>> = Object.freeze({
  'notes-carrier-document-missing': 'No Notes document was handed over.',
  'notes-carrier-document-kind-invalid': 'Only a Notes document can carry a note paragraph.',
  'notes-carrier-page-missing': 'The note page is unavailable.',
  'notes-carrier-page-trashed': 'A page in the trash cannot be carried.',
  'notes-carrier-page-locked': 'A protected page cannot be carried until it is unlocked.',
  'notes-carrier-line-invalid': 'The paragraph position is outside this page.',
  'notes-carrier-line-empty': 'An empty paragraph has nothing to reference.',
  'notes-carrier-key-unbound': 'This key is not bound to a carrier command.',
  'notes-carrier-command-unknown': 'The carrier does not know this command.',
});

const LOCAL_REFUSALS: Readonly<Record<string, string>> = NOTES_CARRIER_LOCAL_REFUSAL_TEXT;

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für die Fläche.
 *
 * Für die Codes des vorhandenen Erzeugers wird **kein** zweites Wörterbuch angelegt:
 * `WorkspaceInteractionError` trägt zu **jedem** Code seinen Satz, und diese Nachricht ist bereits die eine
 * Definition. *Ein zweites Wörterbuch über dieselben Codes wäre eine zweite Wahrheit.*
 */
export function notesCarrierRefusalText(code: NotesCarrierRefusal): string {
  const local = LOCAL_REFUSALS[code];
  if (local !== undefined) return local;
  try {
    return new WorkspaceInteractionError(code as WorkspaceInteractionErrorCode).message;
  } catch {
    return String(code);
  }
}

function refuse(reason: NotesCarrierRefusal): NotesCarrierStep {
  return { ok: false, reason };
}

/** Nur „ist überhaupt eine nicht-leere Zeichenkette da" — die **Format**prüfung bleibt beim vorhandenen Erzeuger. */
function identifier(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Die Zeilen eines Absatzes — **eine** Zerlegung, dieselbe wie im vorhandenen Notes-Modell (`split('\n')`). */
function linesOf(content: unknown): string[] {
  return typeof content === 'string' ? content.split('\n') : [];
}

/**
 * **Der Träger für einen Markdown-Absatz** — die **eine** Stelle, an der er entsteht.
 *
 * Zeiger und Tastatur rufen **diese** Funktion: *zwei Wege, ein Träger.*
 */
export function notesParagraphCarrier(request: NotesCarrierRequest): NotesCarrierStep {
  const document = (request.document ?? null) as Pick<WorkspaceDocument, 'id' | 'kind'> | null;
  if (!document || typeof document !== 'object') return refuse('notes-carrier-document-missing');
  if (document.kind !== 'Notes') return refuse('notes-carrier-document-kind-invalid');
  const documentId = identifier(document.id);
  if (documentId === null) return refuse('notes-carrier-document-missing');

  const page = (request.page ?? null) as { id?: unknown; content?: unknown; trashedAt?: unknown } | null;
  if (!page || typeof page !== 'object') return refuse('notes-carrier-page-missing');
  const pageId = identifier(page.id);
  if (pageId === null) return refuse('notes-carrier-page-missing');
  if (page.trashedAt !== undefined && page.trashedAt !== null) return refuse('notes-carrier-page-trashed');
  // **Die Schutzrichtlinie wird gereicht, nicht nachgebaut** — *eine zweite Prüfung wäre eine zweite Wahrheit.*
  if (request.locked === true) return refuse('notes-carrier-page-locked');

  const lines = linesOf(page.content);
  const lineIndex = request.lineIndex;
  if (typeof lineIndex !== 'number' || !Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
    return refuse('notes-carrier-line-invalid');
  }
  if ((lines[lineIndex] ?? '').trim().length === 0) return refuse('notes-carrier-line-empty');

  let payload: string;
  try {
    payload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId,
      // **Die Objekt-ID ist die Seite** — der Absatz wird über die Referenz benannt (siehe Modulkopf).
      objectId: pageId,
      objectKind: NOTES_CARRIER_OBJECT_KIND,
      sourceApp: 'Notes',
      supportedIntents: [...NOTES_CARRIER_INTENTS],
    }));
  } catch (error) {
    // **Der vorhandene Erzeuger nennt den Grund** (`identifier_invalid`, `payload_too_large`, …) — *kein zweiter
    // Kennungsprüfer, keine zweite Fehlerliste.*
    return refuse(error instanceof WorkspaceInteractionError ? error.code : 'payload_invalid');
  }

  return {
    ok: true,
    carrier: Object.freeze({
      payload,
      mime: FABRIC_WORKSPACE_OBJECT_DRAG_MIME,
      // **Die vorhandene Referenz-Vokabel**: Seiten-URI + vorhandenes Zeilenfragment.
      reference: `${noteWorkspaceUri(documentId, pageId)}#line-${lineIndex}`,
      documentId,
      pageId,
      lineIndex,
      objectKind: NOTES_CARRIER_OBJECT_KIND,
      intents: NOTES_CARRIER_INTENTS,
      // **Ohne Inhalt:** der sichtbare Satz nennt Seite und Zeile, nicht den Text.
      label: `Notes paragraph · ${pageId} · line ${lineIndex}`,
    }),
  };
}

/** **Die Taste wird zur Absicht** — rein und ohne DOM: nur der Tastenname wird ausgewertet. */
export function resolveNotesCarrierCommand(key: unknown): NotesCarrierCommandStep {
  if (typeof key !== 'string' || key.length === 0) return { ok: false, reason: 'notes-carrier-key-unbound' };
  if (key === 'Escape') return { ok: true, command: { kind: 'dismiss' } };
  if (key === 'Enter' || key === ' ') return { ok: true, command: { kind: 'carry' } };
  return { ok: false, reason: 'notes-carrier-key-unbound' };
}

/**
 * **Die Tastatur führt denselben Weg aus** — `carry` ruft **denselben** Erzeuger wie ein Zeiger-Zug.
 * *Gäbe es hier einen zweiten Weg, wäre die Tastatur kein gleichwertiger Zugang, sondern ein anderer.*
 */
export function applyNotesCarrierCommand(
  request: NotesCarrierRequest,
  command: NotesCarrierCommand,
): NotesCarrierCommandResult {
  if (!command || typeof command !== 'object') return { ok: false, reason: 'notes-carrier-command-unknown' };
  switch (command.kind) {
    case 'carry': {
      const step = notesParagraphCarrier(request);
      return step.ok ? { ok: true, kind: 'carried', carrier: step.carrier } : { ok: false, reason: step.reason };
    }
    case 'dismiss':
      return { ok: true, kind: 'dismissed' };
    default:
      return { ok: false, reason: 'notes-carrier-command-unknown' };
  }
}
