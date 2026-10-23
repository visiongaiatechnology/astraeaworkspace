// STATUS: PLATIN — Integration & Release, **Paket 10**: Vokabular und Vertrag des Present-Ablageziels
//
// ## Warum Vokabular und Regeln getrennt liegen
//
// Dieses Modul **benennt** — Zustände, Gründe, Wörter, Formen. Es **entscheidet nichts** ✗. Die Regeln
// stehen in `presentWorkspaceDropZone.ts` ✓. *Wer Wörter und Regeln in eine Datei legt, kann den Vertrag
// nicht mehr prüfen, ohne die Regel zu laden* ✓.
//
// ## Zustände ohne Farbe
//
// Jeder Zustand trägt **drei** sichtbare Achsen: ein **Zeichen** (`glyph`), eine **Form** (`pattern`, die
// Rahmenart) und **Wörter** (`headline`). Eine Farbe ist **keine** davon ✗ — *wer allein auf einen Farbton
// zeigt, hat für Farbenblinde keinen Zustand, sondern sechs gleiche Flächen*.
//
// ## Das Urteil kommt aus **Paket 6**, nicht von hier
//
// `DropVerdict` (`none` / `accept` / `reject`) und `DropRejectReason` sind die Werte, die
// `hoverDropTarget` / `commitDropTarget` (`shell/workspace/drag/dragDropVerdict.ts`) liefern ✓. Dieses
// Modul **liest** sie ✓. Es gibt **keine** zweite Erlaubnisregel ✗ und keine zweite Vorschau ✗.
//
// **Warum der Zustand beides trägt** — die Phase **und** das Urteil: *zwei verschiedene Tatsachen dürfen
// nicht in einem Feld wohnen* ✓. Die Phase sagt, **wo** die Fläche im Lebenslauf steht ✓; das Urteil sagt,
// **was** das vorhandene Modul über diesen Träger entschieden hat ✓. Dieselbe Trennung, die Paket 6 für
// „Phase vs. Urteil" festgelegt hat, wird hier nicht wieder eingeebnet.
import type { DropPreview, DropRejectReason, DropVerdict } from '../../../../shell/workspace/drag/dragDropVerdict';
import type { DragEndReason } from '../../../../shell/workspace/drag/dragSession';
import type { WorkspaceDropIntent, WorkspaceInteractionErrorCode } from '../../../../shared/workspace-interaction';

/**
 * Der Lebenslauf der Ablagefläche — sechs Zustände, jeder mit eigener Form und eigenen Worten.
 *
 *   * `closed`   — kein Zug in Sicht; die Ansicht rendert **nichts**.
 *   * `open`     — ein Zug ist über der Fläche, aber **noch kein** Träger gelesen. *Der leere Zustand.*
 *   * `ready`    — der Träger passt und die Matrix bietet **genau eine** Absicht → Enter legt ab.
 *   * `choice`   — der Träger passt, aber die Absicht ist **offen** → ohne Wahl wird **nicht** abgelegt.
 *   * `refused`  — die Matrix (oder die Geometrie) **lehnt ab**, mit benanntem Grund.
 *   * `resolved` — die Route ist **aufgelöst** (Adapter, Absicht, Ziel), **nicht** eingefügt:
 *     `resolveWorkspaceDrop` mutiert nichts (siehe `workspaceInteractionResolver.ts`). *„Zugestellt" wäre
 *     eine Lüge über eine Einfügung, die diese Fläche nicht vornimmt.*
 */
export type PresentWorkspaceDropZonePhase = 'closed' | 'open' | 'ready' | 'choice' | 'refused' | 'resolved';

/**
 * Die Gründe, die **diese** Fläche selbst kennt. Alles andere kommt aus den vorhandenen Quellen:
 * `WorkspaceInteractionErrorCode` aus der Matrix und `DropRejectReason` aus Paket 6 — *damit hier keine
 * zweite Fehlerliste entsteht*.
 *
 *   * `drop-zone-transfer-missing`    — es wurde **kein** Träger gelesen (nicht: „ein kaputter").
 *   * `drop-zone-transfer-unreadable` — die Ablagefläche gibt ihren Inhalt nicht her (kein `getData`).
 *   * `drop-zone-target-missing`      — diese Oberfläche weiß nicht, **welches** Dokument sie ist.
 *   * `drop-zone-inactive`            — der Befehl traf ein **geschlossenes** Ziel (benannter No-op).
 *   * `drop-zone-already-decided`     — der Fall ist entschieden; ein zweiter Abschluss ist ein No-op.
 *   * `drop-zone-command-unknown`     — ein Befehl, den die Maschine nicht kennt (fail-closed).
 *   * `drop-zone-registry-unavailable`— die **eine** Autorität ist nicht verfügbar (fail-closed).
 *   * `drop-zone-routing-failed`      — die Zustellung selbst ist geworfen (fail-closed, nie still).
 *   * `drop-zone-no-free-region`      — die Folie hat **keinen freien Platz** (Geometrie, nicht Route).
 *   * `drop-zone-verdict-unavailable` — Paket 6 konnte das Ziel nicht beurteilen.
 *   * `drop-zone-key-unbound`         — diese Taste ist **kein** Befehl (kein stiller No-op).
 */
export type PresentWorkspaceDropZoneLocalRefusal =
  | 'drop-zone-transfer-missing'
  | 'drop-zone-transfer-unreadable'
  | 'drop-zone-target-missing'
  | 'drop-zone-inactive'
  | 'drop-zone-already-decided'
  | 'drop-zone-command-unknown'
  | 'drop-zone-registry-unavailable'
  | 'drop-zone-routing-failed'
  | 'drop-zone-no-free-region'
  | 'drop-zone-verdict-unavailable'
  | 'drop-zone-key-unbound';

/**
 * Der **benannte** Grund einer Ablehnung — die vorhandenen Codes zuerst, die eigenen danach.
 *
 * Die Schreibweisen sind bewusst **nicht** vereinheitlicht: die Matrix spricht `snake_case`
 * (`registry_adapter_route_missing`), Paket 6 spricht `kebab-case` (`route-not-capable`). *Eine
 * Umschreibung wäre eine zweite Vokabel für dieselbe Tatsache* — und ein Test könnte den Code dann nicht
 * mehr gegen seine Quelle prüfen.
 */
export type PresentWorkspaceDropZoneRefusal =
  | WorkspaceInteractionErrorCode
  | DropRejectReason
  | PresentWorkspaceDropZoneLocalRefusal;

/**
 * Warum die Fläche wieder **schließt**. Zwei Gründe sind **wiederverwendet**: `pointer-lost` und
 * `window-blur` sind die Abbruchgründe der Zieh-Session (Paket 5) — *ein Touch, den das System abbricht,
 * kommt als `pointercancel` und damit als `pointer-lost`, nicht als eigene Erfindung*.
 */
export type PresentWorkspaceDropZoneCloseReason =
  | 'drag-left'
  | 'keyboard-dismiss'
  | Extract<DragEndReason, 'pointer-lost' | 'window-blur'>;

export interface PresentWorkspaceDropZonePresentation {
  readonly glyph: string;
  readonly pattern: 'none' | 'dashed' | 'solid' | 'double';
  readonly headline: string;
}

/** Die Präsentation je Zustand — **erschöpfend** typisiert: ein neuer Zustand fällt beim Bauen auf. */
export const PRESENT_WORKSPACE_DROP_ZONE_PRESENTATION: Readonly<Record<PresentWorkspaceDropZonePhase, PresentWorkspaceDropZonePresentation>> = Object.freeze({
  closed: { glyph: '', pattern: 'none', headline: '' },
  open: { glyph: '↓', pattern: 'dashed', headline: 'Ablageziel Present: Workspace-Objekt hier ablegen' },
  ready: { glyph: '⊞', pattern: 'solid', headline: 'Ablageziel Present: bereit' },
  choice: { glyph: '?', pattern: 'double', headline: 'Ablageziel Present: Absicht erforderlich' },
  refused: { glyph: '!', pattern: 'double', headline: 'Ablageziel Present: Ablage abgelehnt' },
  resolved: { glyph: '✓', pattern: 'solid', headline: 'Ablageziel Present: Route aufgelöst' },
});

/**
 * Der sichtbare Satz zu jedem benannten Grund — **erschöpfend**. Ein neuer Fehlercode in der Matrix
 * bricht hier den Bau, statt still als leerer Text zu erscheinen.
 */
const PRESENT_WORKSPACE_DROP_REFUSAL_TEXT: Readonly<Record<PresentWorkspaceDropZoneRefusal, string>> = Object.freeze({
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
  // **Paket 15** ✓: benannter Grund statt heimlichem Default ✗ — *der Typ erzwingt, dass jede Fläche ihn benennt* ✓.
  drop_live_mode_required: 'Ein Live-Verweis braucht einen gewählten Modus: Live oder Frozen.',
  // **W-455** ✓✓: der **sichtbare** Satz je neuem Grund — *ein ganzer Satz, kein Code als Text* ✓✓, und
  // `RequireApproval` traegt den **Unterschied** zu `Deny` ✓✓ (*„verlangt eine Freigabe"* gegen *„erlaubt nicht"*).
  // Das Komma am Zeilenende ist die Unterschrift ② ✗✓: *nach `drop_live_mode_required` folgt `drag_already_active`.*
  drop_policy_decision_required: 'Für diese Ablage fehlt die Entscheidung der Arbeitsbereichsrichtlinie.',
  drop_policy_denied: 'Die Arbeitsbereichsrichtlinie erlaubt diese Ablage nicht.',
  drop_policy_approval_required: 'Die Arbeitsbereichsrichtlinie verlangt eine Freigabe für diese Ablage.',
  drag_already_active: 'Es läuft bereits ein Zug.',
  drag_pointer_invalid: 'Die Zeigerkennung des Zuges ist ungültig.',
  drag_point_invalid: 'Die Koordinaten des Zuges sind ungültig.',
  drag_threshold_invalid: 'Die Zugschwelle ist ungültig.',
  'object-kind-unknown': 'Der Träger hat keine Objektart — er kann nicht beurteilt werden.',
  'intent-unknown': 'Der Träger hat keine Absicht — er kann nicht beurteilt werden.',
  'route-not-capable': 'Dieses Ziel nimmt diesen Träger nicht an.',
  'payload-missing': 'Es liegt kein Träger vor, der abgelegt werden könnte.',
  'verdict-unavailable': 'Das Ziel konnte nicht beurteilt werden — im Zweifel wird nicht angenommen.',
  'drop-zone-transfer-missing': 'Es wurde kein Workspace-Objekt übergeben.',
  'drop-zone-transfer-unreadable': 'Die Ablagefläche gibt ihren Inhalt nicht her.',
  'drop-zone-target-missing': 'Diese Oberfläche kennt ihr eigenes Zieldokument nicht.',
  'drop-zone-inactive': 'Das Ablageziel ist nicht geöffnet.',
  'drop-zone-already-decided': 'Diese Ablage ist bereits entschieden.',
  'drop-zone-command-unknown': 'Diesen Ablagebefehl kennt die Maschine nicht.',
  'drop-zone-registry-unavailable': 'Die Interaktionsmatrix ist nicht verfügbar — es wird nichts abgelegt.',
  'drop-zone-routing-failed': 'Die Zustellung ist fehlgeschlagen; es wurde nichts abgelegt.',
  'drop-zone-no-free-region': 'Auf dieser Folie ist kein freier Platz mehr für eine Workspace-Referenz.',
  'drop-zone-verdict-unavailable': 'Das Ablageziel konnte nicht beurteilt werden; im Zweifel wird nicht angenommen.',
  'drop-zone-key-unbound': 'Diese Taste ist kein Ablagebefehl.',
});

/** Der sichtbare Satz zu einem benannten Grund — **eine** Definition für alle Oberflächen. */
export function presentWorkspaceDropRefusalText(code: PresentWorkspaceDropZoneRefusal): string {
  return PRESENT_WORKSPACE_DROP_REFUSAL_TEXT[code];
}

/** Ob ein beliebiger Grund in diesem Vokabular **benannt** ist — sonst zeigt die Ansicht den Code roh. */
export function isPresentWorkspaceDropRefusal(code: unknown): code is PresentWorkspaceDropZoneRefusal {
  return typeof code === 'string' && Object.hasOwn(PRESENT_WORKSPACE_DROP_REFUSAL_TEXT, code);
}

/** Die Beschriftung der Vorschau — **eine** Definition, damit `preview.label` wörtlich daneben steht. */
export const PRESENT_WORKSPACE_DROP_ZONE_PREVIEW_LABEL = 'Vorschau:';

/** Was dort steht, wenn noch **kein** Träger gelesen wurde — der leere Zustand, **kein** Fehler. */
export const PRESENT_WORKSPACE_DROP_ZONE_NO_PREVIEW = 'noch kein Objekt gelesen';

/**
 * Die sichtbare Vorschau — **wörtlich** `preview.label` aus Paket 6.
 *
 * Dieses Modul **erfindet keine** Vorschau und formuliert sie **nicht** um: es gibt den Text zurück, den
 * `hoverDropTarget` gebaut hat. *Eine zweite Beschriftung wäre eine zweite Vorschau.*
 */
export function presentWorkspaceDropPreviewText(preview: DropPreview | null): string {
  return preview === null ? PRESENT_WORKSPACE_DROP_ZONE_NO_PREVIEW : preview.label;
}

/** Der sichtbare Satz zum Urteil aus Paket 6 — das Urteil bleibt **das** Urteil, nur lesbar. */
export function presentWorkspaceDropVerdictText(verdict: DropVerdict): string {
  if (verdict === 'accept') return 'Urteil: wird angenommen';
  if (verdict === 'reject') return 'Urteil: wird abgelehnt';
  return 'Urteil: noch keines';
}

/** Die Tastenhinweise — *eine Ziffer lässt sich ansagen, eine Mausgeste nicht*. */
export const PRESENT_WORKSPACE_DROP_ZONE_TITLE = 'Workspace-Ablageziel Present';
export const PRESENT_WORKSPACE_DROP_ZONE_CONFIRM_LABEL = 'Ablegen (ohne Zeiger)';
export const PRESENT_WORKSPACE_DROP_ZONE_DISMISS_LABEL = 'Ablageziel schließen';
export const PRESENT_WORKSPACE_DROP_ZONE_KEY_HINT = 'Tastatur: Enter legt ab · Ziffer wählt die Absicht · Esc schließt';

/** Die sichtbare Beschriftung einer wählbaren Absicht — **ohne** zweite Wortliste (der Code genügt). */
export function presentWorkspaceDropIntentLabel(intent: WorkspaceDropIntent, key: string): string {
  return `${key} · ${intent}`;
}

/** Der Hinweis zum Berühren — er sagt die **Entscheidung** an, nicht eine Stilregel. */
export const PRESENT_WORKSPACE_DROP_ZONE_TOUCH_HINT = 'Berühren: halten, dann ziehen · Scrollen bleibt möglich';
