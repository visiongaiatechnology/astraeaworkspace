// STATUS: PLATIN — Integration & Release, **Paket 9**: Vokabular und Vertrag des Writer-Ablageziels
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — Zustände, Gründe, Wörter, Formen. Es **entscheidet nichts** ✗. Die Regeln stehen
// in `writerWorkspaceDropZone.ts` ✓. *Wer Wörter und Regeln in eine Datei legt, kann den Vertrag nicht mehr
// prüfen, ohne die Regel zu laden* ✓ — und umgekehrt.
//
// ## Zustände ohne Farbe ✓
//
// Jeder Zustand trägt **drei** sichtbare Achsen: ein **Zeichen** ✓ (`glyph`), eine **Form** ✓ (`pattern`,
// die Rahmenart) und **Wörter** ✓ (`headline`). Eine Farbe ist **keine** davon ✗ ✓ — *wer allein auf einen
// Farbton zeigt, hat für Farbenblinde keinen Zustand, sondern vier gleiche Flächen* ✓.
//
// ## Erlaubt / unerlaubt ist ein **Zustand**, keine Anzeigefrage ✓
//
// `acceptance` ist das Urteil der **vorhandenen** Matrix ✓ (`evaluateWorkspaceDrop` / `resolveWorkspaceDrop`
// über `FABRIC_WORKSPACE_DROP_REGISTRY` ✓) — nicht dieses Moduls ✗. Die Anzeige **liest** es ✓, sie erfindet
// es nicht ✓. *Eine zweite Regel über dieselbe Frage wäre eine zweite Wahrheit* ✓.
//
// ## Die Wörter sind eine Definition ✓
//
// Die Absichts-Wörter (`COPY` → „Kopie einfügen") gibt es bereits für genau diese beiden Absichten ✓
// (`shell/i18n/fabricGraphLocale.ts`: `transfer.PasteCopy` / `transfer.LiveLink` ✓). Die **Objektart-Wörter**
// werden von dort **wiederverwendet** ✓ statt ein zweites Mal geschrieben ✓ (`objectType`, elf Arten ✓).
import type {
  WorkspaceDropIntent,
  WorkspaceIntegrationKind,
  WorkspaceInteractionErrorCode,
  WorkspaceLiveMode,
  WorkspaceObjectKind,
} from '../../../../shared/workspace-interaction';
import { FABRIC_GRAPH_COPY } from '../../../../shell/i18n/fabricGraphLocale';
import type { DragEndReason } from '../../../../shell/workspace/drag/dragSession';

/**
 * Der Lebenslauf des Ablageziels ✓ — sechs Zustände, jeder mit eigener Form und eigenen Worten ✓.
 *
 *   * `closed`   — kein Zug in Sicht; die Ansicht rendert **nichts** ✓.
 *   * `open`     — ein Zug ist über der Fläche, aber **noch kein** Träger gelesen ✓. *Der leere Zustand* ✓.
 *   * `ready`    — der Träger passt, die Matrix hat **genau eine** Absicht ✓ → Enter legt ab ✓.
 *   * `choice`   — der Träger passt, aber die Absicht ist **offen** ✓ → ohne Wahl wird **nicht** abgelegt ✗ ✓.
 *   * `refused`  — die Matrix **lehnt ab** ✓, mit benanntem Grund ✓.
 *   * `resolved` — zugestellt ✓, mit Adapter, Absicht und beiden Versionen ✓.
 */
export type WriterWorkspaceDropZonePhase = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **dieses** Ablageziel selbst kennt ✓ — alles andere kommt aus der bestehenden Matrix ✓
 * (`WorkspaceInteractionErrorCode` ✓), damit hier keine zweite Fehlerliste entsteht ✓.
 *
 *   * `drop-zone-transfer-missing`   — es wurde **kein** Träger übergeben ✓ (nicht: „ein kaputter" ✗).
 *   * `drop-zone-transfer-unreadable`— die Ablagefläche gibt ihren Inhalt nicht her ✓ (kein `getData` ✓).
 *   * `drop-zone-target-missing`     — diese Oberfläche weiß nicht, **welches** Dokument sie ist ✓.
 *   * `drop-zone-inactive`           — der Befehl traf ein **geschlossenes** Ziel ✓ (benannter No-op ✓).
 *   * `drop-zone-already-decided`    — der Fall ist **entschieden** ✓; ein zweiter Abschluss ist ein No-op ✓.
 *   * `drop-zone-command-unknown`    — ein Befehl, den die Maschine nicht kennt ✓ (fail-closed ✓).
 */
export type WriterWorkspaceDropZoneLocalRefusal =
  | 'drop-zone-transfer-missing'
  | 'drop-zone-transfer-unreadable'
  | 'drop-zone-target-missing'
  | 'drop-zone-inactive'
  | 'drop-zone-already-decided'
  | 'drop-zone-command-unknown';

/** Der **benannte** Grund einer Ablehnung ✓ — bestehende Codes zuerst ✓, die eigenen danach ✓. */
export type WriterWorkspaceDropZoneRefusal = WorkspaceInteractionErrorCode | WriterWorkspaceDropZoneLocalRefusal;

/**
 * Warum das Ziel wieder **schließt** ✓. Zwei Gründe sind **wiederverwendet** ✓: `pointer-lost` und
 * `window-blur` sind die Abbruchgründe der Zieh-Session (Paket 5 ✓) — *ein Touch, den das System abbricht,
 * kommt als `pointercancel` und damit als `pointer-lost` ✓, nicht als eigene Erfindung* ✗ ✓.
 */
export type WriterWorkspaceDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

/** Eine wählbare Absicht ✓ — mit der Taste, die sie **ohne Zeiger** wählt ✓. */
export interface WriterWorkspaceDropChoice {
  readonly intent: WorkspaceDropIntent;
  /** **Die neue Tatsache** ✓ (Paket 15 ✓): `COPY` → `copy` ✓, `LIVE_REFERENCE` → `live` ✓. */
  readonly integrationKind: WorkspaceIntegrationKind;
  /** Der Modus, **falls einer gesagt wurde** ✓ — `null` heißt „noch offen" ✓, **nicht** „Live" ✗. */
  readonly mode: WorkspaceLiveMode | null;
  readonly label: string;
  readonly adapterId: string;
  /** Die Ziffer, die diese Absicht wählt ✓ — *eine Ziffer lässt sich ansagen* ✓, eine Mausgeste nicht ✗. */
  readonly key: string;
  readonly shortcutLabel: string;
}

/**
 * Die **Vorschau** dessen, was abgelegt würde ✓ — mindestens als benannter Zustand ✓, den die Ansicht
 * rendern kann ✓. `intent` ist `null`, solange die Absicht offen ist ✓ — *eine Vorschau, die eine Absicht
 * behauptet, die noch niemand gewählt hat, wäre eine Lüge* ✗ ✓.
 *
 * **Paket 15** ✓: `integrationKind` ✓ und `mode` ✓ stehen **im Zustand** ✓ — `mode === null` heißt „der Modus
 * ist noch nicht gesagt" ✓, und **nur** `live` kann überhaupt einen Modus tragen ✓ (*bei `copy` ist die
 * Abwesenheit die Aussage* ✓).
 */
export interface WriterWorkspaceDropPreview {
  readonly objectKind: WorkspaceObjectKind;
  readonly objectKindLabel: string;
  readonly sourceDocumentId: string;
  readonly sourceObjectId: string;
  readonly intent: WorkspaceDropIntent | null;
  readonly intentLabel: string | null;
  readonly integrationKind: WorkspaceIntegrationKind;
  readonly mode: WorkspaceLiveMode | null;
  readonly modeLabel: string | null;
  readonly adapterId: string;
}

/** Was **wirklich** zugestellt wurde ✓ — Adapter, Absicht, Art, Modus, beide Versionen ✓. */
export interface WriterWorkspaceDropResolution {
  readonly adapterId: string;
  readonly intent: WorkspaceDropIntent;
  /** **Paket 15** ✓: `copy` ✓ oder `live` ✓ — *die Art der Zustellung, nicht eine Anzeigemeinung* ✓. */
  readonly integrationKind: WorkspaceIntegrationKind;
  /**
   * **Nur** bei `live` ✓ — und nur, wenn er **gesagt** wurde ✓✓. Fehlt er, ist das die Aussage ✓:
   * *ein Modus, den niemand gewählt hat, darf hier nicht auftauchen* ✗ ✓.
   */
  readonly mode?: WorkspaceLiveMode;
  readonly sourceDocumentId: string;
  readonly sourceObjectId: string;
  readonly targetDocumentId: string;
  readonly sourceVersion: number;
  readonly targetVersion: number;
}

export interface WriterWorkspaceDropZoneState {
  readonly phase: WriterWorkspaceDropZonePhase;
  /** Das sichtbare **Zeichen** ✓ — die erste Achse ohne Farbe ✓. */
  readonly glyph: string;
  /** Die sichtbare **Form** ✓ — die zweite Achse ohne Farbe ✓. */
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
  readonly detail: string | null;
  /** Der **benannte** Grund ✓ — `null`, solange nichts abgelehnt wurde ✓. */
  readonly code: WriterWorkspaceDropZoneRefusal | null;
  /**
   * Das Urteil der **vorhandenen** Matrix ✓: `accepted` heißt „dieses Ziel nimmt diesen Träger an" ✓
   * (`accepted` **und** `needsChoice` der Matrix ✓), `refused` heißt „nein" ✓. Es gibt **keine** dritte
   * Regel ✓ und keine zweite Quelle ✓.
   */
  readonly acceptance: 'unknown' | 'accepted' | 'refused';
  readonly targetDocumentId: string | null;
  readonly choices: readonly WriterWorkspaceDropChoice[];
  readonly preview: WriterWorkspaceDropPreview | null;
  readonly resolution: WriterWorkspaceDropResolution | null;
  /** Ob „bestätigen" **jetzt** etwas zustellt ✓ — die Frage, die Beschriftung und `disabled` stellen ✓. */
  readonly canConfirmWithKeyboard: boolean;
  /** Der Grund des letzten Schließens ✓ — auch im geschlossenen Zustand **benannt** ✓. */
  readonly closedReason: WriterWorkspaceDropZoneCloseReason | null;
}

/**
 * **Dieselbe Form wie `DragStep`** ✓ (Paket 5 ✓) — eine Ursache, eine Behebung ✓.
 *
 * `ok: false` heißt: **der Aufruf** war unbrauchbar ✓ (kein Träger übergeben ✓, unbekannter Befehl ✓,
 * Befehl auf ein geschlossenes Ziel ✓). Ein **Urteil der Matrix** (`refused` ✓) ist dagegen ein gültiger
 * Zustandsübergang ✓ — der Zustand trägt den Grund sichtbar ✓.
 */
export type WriterWorkspaceDropZoneStep =
  | { readonly ok: true; readonly state: WriterWorkspaceDropZoneState; readonly reason?: never }
  | { readonly ok: false; readonly reason: WriterWorkspaceDropZoneRefusal; readonly state: WriterWorkspaceDropZoneState };

/**
 * Die **Tastatur als Absicht** ✓: ein Befehl, der **dieselbe** Zustellung ausführt wie die Ablage ✓.
 * *Ein Drop-Ziel, das man nur mit dem Zeiger bestätigen kann, ist ein Befund* ✓ — deshalb ist der
 * Bestätigen-Befehl kein Sonderweg ✗, sondern derselbe Aufruf ✓.
 */
export type WriterWorkspaceDropCommand =
  | { readonly kind: 'confirm' }
  | { readonly kind: 'choose'; readonly intent: WorkspaceDropIntent }
  | { readonly kind: 'dismiss' };

/** Warum eine Taste **kein** Befehl ist ✓ — benannt ✓, damit aus einem Tastendruck kein stiller No-op wird ✗. */
export type WriterWorkspaceDropCommandStep =
  | { readonly ok: true; readonly command: WriterWorkspaceDropCommand; readonly reason?: never }
  | { readonly ok: false; readonly reason: 'drop-zone-key-unbound'; readonly command?: never };

/** Die Absichts-Wörter ✓ — die beiden echten aus der Fabric-Oberfläche ✓, die beiden übrigen benannt ✓. */
export const WRITER_WORKSPACE_DROP_INTENT_LABEL: Readonly<Record<WorkspaceDropIntent, string>> = Object.freeze({
  COPY: FABRIC_GRAPH_COPY['de-DE'].transfer.PasteCopy,
  LIVE_REFERENCE: FABRIC_GRAPH_COPY['de-DE'].transfer.LiveLink,
  FROZEN_SNAPSHOT: 'Eingefrorener Snapshot',
  MOVE: 'Verschieben',
});

/** Die Objektart-Wörter ✓ — **wiederverwendet** aus der Fabric-Oberfläche ✓, nicht neu geschrieben ✓. */
export function writerWorkspaceDropObjectKindLabel(kind: WorkspaceObjectKind): string {
  return FABRIC_GRAPH_COPY['de-DE'].objectType[kind];
}

export interface WriterWorkspaceDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

/** Die Präsentation je Zustand ✓ — **erschöpfend** typisiert ✓: ein neuer Zustand fällt beim Bauen auf ✓. */
export const WRITER_WORKSPACE_DROP_ZONE_PRESENTATION: Readonly<Record<WriterWorkspaceDropZonePhase, WriterWorkspaceDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Ablageziel Writer: Grid-Objekt hier ablegen' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Ablageziel Writer: bereit' },
  choice: { glyph: '?', pattern: 'double', headline: 'Ablageziel Writer: Absicht erforderlich' },
  refused: { glyph: '!', pattern: 'dashed', headline: 'Ablageziel Writer: Ablage abgelehnt' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Ablageziel Writer: zugestellt' },
});

/**
 * Der sichtbare Satz zu jedem benannten Grund ✓ — **erschöpfend** ✓. Ein neuer Fehlercode in der Matrix
 * bricht hier den Bau ✓, statt still als leerer Text zu erscheinen ✗ ✓.
 */
const WRITER_WORKSPACE_DROP_REFUSAL_TEXT: Readonly<Record<WriterWorkspaceDropZoneRefusal, string>> = Object.freeze({
  payload_invalid: 'Das Übertragungsobjekt ist unlesbar oder hat nicht die vereinbarten Felder.',
  payload_too_large: 'Das Übertragungsobjekt ist größer als erlaubt.',
  payload_version_unsupported: 'Die Version des Übertragungsobjekts wird nicht unterstützt.',
  identifier_invalid: 'Eine Kennung im Übertragungsobjekt ist ungültig.',
  intent_unknown: 'Die angeforderte Absicht ist unbekannt.',
  object_kind_unknown: 'Die Objektart des Trägers ist unbekannt.',
  app_unknown: 'Die Quellanwendung des Trägers ist unbekannt.',
  registry_unsealed: 'Die Interaktionsmatrix ist nicht versiegelt.',
  registry_manifest_invalid: 'Ein Manifest der Interaktionsmatrix ist ungültig.',
  registry_manifest_duplicate: 'Ein Manifest der Interaktionsmatrix ist doppelt eingetragen.',
  registry_manifest_missing: 'Ein benötigtes Manifest der Interaktionsmatrix fehlt.',
  registry_adapter_invalid: 'Ein Ablageadapter der Matrix ist ungültig.',
  registry_adapter_id_duplicate: 'Eine Adapterkennung der Matrix ist doppelt vergeben.',
  registry_adapter_route_duplicate: 'Eine Adapterroute der Matrix ist doppelt vergeben.',
  registry_adapter_route_missing: 'Für diese Quelle und dieses Ziel ist keine Route eingetragen.',
  registry_read_only: 'Die Interaktionsmatrix ist schreibgeschützt.',
  drop_target_document_missing: 'Das Zieldokument ist nicht verfügbar.',
  drop_source_document_missing: 'Das Quelldokument ist nicht verfügbar.',
  drop_source_object_missing: 'Das Quellobjekt ist im Quelldokument nicht vorhanden.',
  drop_identity_mismatch: 'Die Identität des Trägers stimmt nicht mit dem Quellobjekt überein.',
  drop_authorization_failed: 'Die Ablage ist nach der Richtlinie nicht erlaubt.',
  drop_intent_not_supported: 'Diese Absicht wird für diesen Träger nicht angeboten.',
  drop_intent_choice_required: 'Eine Ablageabsicht muss gewählt werden.',
  drop_move_transaction_unavailable: 'Verschieben ist ohne Transaktion nicht verfügbar.',
  // **Paket 15** ✓: benannter Grund statt heimlichem Default ✗.
  drop_live_mode_required: 'Ein Live-Verweis braucht einen gewählten Modus: Live oder Frozen.',
  // **W-455** ✓✓: der **sichtbare** Satz je neuem Grund — *ein ganzer Satz, kein Code als Text* ✓✓; das Komma am
  // Zeilenende ist die Unterschrift ② ✗✓ (*`drag_already_active` folgt unmittelbar*).
  drop_policy_decision_required: 'Für diese Ablage fehlt die Entscheidung der Arbeitsbereichsrichtlinie.',
  drop_policy_denied: 'Die Arbeitsbereichsrichtlinie erlaubt diese Ablage nicht.',
  drop_policy_approval_required: 'Die Arbeitsbereichsrichtlinie verlangt eine Freigabe für diese Ablage.',
  drag_already_active: 'Es läuft bereits ein Zug.',
  drag_pointer_invalid: 'Die Zeigerkennung des Zuges ist ungültig.',
  drag_point_invalid: 'Die Koordinaten des Zuges sind ungültig.',
  drag_threshold_invalid: 'Die Zugschwelle ist ungültig.',
  'drop-zone-transfer-missing': 'Es wurde kein Workspace-Objekt übergeben.',
  'drop-zone-transfer-unreadable': 'Die Ablagefläche gibt ihren Inhalt nicht her.',
  'drop-zone-target-missing': 'Diese Oberfläche kennt ihr eigenes Zieldokument nicht.',
  'drop-zone-inactive': 'Das Ablageziel ist nicht geöffnet.',
  'drop-zone-already-decided': 'Diese Ablage ist bereits entschieden.',
  'drop-zone-command-unknown': 'Diesen Ablagebefehl kennt die Maschine nicht.',
});

/** Der sichtbare Satz zu einem benannten Grund ✓ — **eine** Definition für alle Oberflächen ✓. */
export function writerWorkspaceDropRefusalText(code: WriterWorkspaceDropZoneRefusal): string {
  return WRITER_WORKSPACE_DROP_REFUSAL_TEXT[code];
}

/**
 * **Die zwei Modi eines Live-Verweises** ✓ (Paket 15 ✓) — und ihre Wörter sind **wiederverwendet** ✓, nicht
 * erfunden ✓: `Live` ist das **vorhandene** Live-Verweis-Wort ✓, `Frozen` das **vorhandene** Wort der
 * eingefrorenen Momentaufnahme ✓ (`WRITER_WORKSPACE_DROP_INTENT_LABEL.FROZEN_SNAPSHOT` ✓). **Ein**
 * Wort-Register ✓ — *der Modus wird **gewählt**, nie angenommen* ✗✓.
 */
export const WRITER_WORKSPACE_LIVE_MODE_LABEL: Readonly<Record<WorkspaceLiveMode, string>> = Object.freeze({
  Live: WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE,
  Frozen: WRITER_WORKSPACE_DROP_INTENT_LABEL.FROZEN_SNAPSHOT,
});

/**
 * Die Modi, **die die Anzeige anbietet** ✓ — **abgeleitet** aus dem Wort-Register ✓, damit **keine zweite
 * Liste** entsteht ✓: *ein neuer Modus bricht dort den Bau* ✓ (`Record<WorkspaceLiveMode, string>` ist
 * erschöpfend ✓) *und bekommt hier von selbst seinen Knopf* ✓.
 */
export const WRITER_WORKSPACE_LIVE_MODES = Object.keys(WRITER_WORKSPACE_LIVE_MODE_LABEL) as readonly WorkspaceLiveMode[];

/**
 * Die sichtbare **Aufforderung**, den Modus zu sagen ✓ — der Satz neben den zwei Knöpfen ✓.
 * *Ohne ihn wäre die Modus-Auswahl ein stiller Zwang statt einer Wahl* ✗✓.
 */
export const WRITER_WORKSPACE_DROP_MODE_PROMPT = 'Modus des Live-Verweises wählen:';

/** Die sichtbare Vorschau ✓ — was abgelegt würde ✓, nicht was abgelegt wurde ✓. */
export function writerWorkspaceDropPreviewText(preview: WriterWorkspaceDropPreview): string {
  const base = `Vorschau: ${preview.objectKindLabel} „${preview.sourceObjectId}" aus ${preview.sourceDocumentId}`;
  if (preview.intent === null || preview.intentLabel === null) {
    return `${base} → Absicht noch offen · ${preview.adapterId}`;
  }
  // **Das Absichtswort bleibt schlicht** ✓ (wie in der Notes-Zone ✓) — *die Modusfrage stellt der
  // **Modus-Block** ✓ (Aufforderung + zwei Knöpfe ✓), nicht ein zusammengesetztes Wort* ✓. Der **gesagte**
  // Modus steht daneben als eigene Aussage ✓; ein **nicht** gesagter wird als solcher benannt ✓ (kein Default ✗).
  const intent = WRITER_WORKSPACE_DROP_INTENT_LABEL[preview.intent];
  const mode = preview.integrationKind === 'live'
    ? ` · Modus: ${preview.modeLabel ?? 'noch nicht gesagt'}`
    : '';
  return `${base} → ${intent}${mode} · ${preview.adapterId}`;
}

export const WRITER_WORKSPACE_DROP_ZONE_TITLE = 'Workspace-Ablageziel Writer';
export const WRITER_WORKSPACE_DROP_ZONE_CONFIRM_LABEL = 'Ablegen';
export const WRITER_WORKSPACE_DROP_ZONE_DISMISS_LABEL = 'Schließen';
export const WRITER_WORKSPACE_DROP_ZONE_KEY_HINT = 'Tastatur: Enter legt ab · 1–4 wählt die Absicht · Esc schließt';
