// STATUS: PLATIN — Integration & Release, **Paket 22 (Writer)**: der Träger-Erzeuger der Quellenseite
//
// ## Die Lücke, die dieses Modul schließt — gemessen, nicht vermutet ✓✓
//
// Die gesiegelte Matrix (`shell/fabric/fabricGraphWorkspaceDrop.ts` ✓) trägt **Publish** als **Ziel** ✓
// (`fabric-grid-table-to-publish` ✓) — aber **keine** Quelle außer **Grid** ✗: das **Writer**-Manifest hat
// `exports: []` ✓. *Bis heute wurde also **kein** Träger aus einem Writer-Dokument erzeugt* ✗✓ — das ist
// **diese** Hälfte ✓.
//
// ## Was der Träger ist — und was **nicht** ✓
//
// **Eine Referenz** ✓: `documentId` ✓, `objectId` (der **Abschnitt**, das vorhandene `TextBlock`-Objekt ✓),
// `objectKind` ✓, `sourceApp` ✓, `supportedIntents` ✓. **Nicht der Text** ✗✓ — *wer den Text mitschickt, hat
// eine Kopie gebaut und nennt sie einen Verweis* ✗.
//
// ## **Ein** Format, **kein** zweiter Trägerpfad ✓✓
//
// Erzeugt wird mit den **vorhandenen** Funktionen aus Paket 7 ✓: `createWorkspaceDragPayload` ✓ +
// `serializeWorkspaceDragPayload` ✓ (`shared/workspace-interaction` ✓). *Die kanonischen Felder
// (`['documentId','objectId','objectKind','sourceApp','supportedIntents']` ✓) sind **dort** definiert und
// werden **dort** geprüft* ✓ — dieses Modul schreibt **keine** zweite Feldliste ✗ und **parst** nichts ✗.
// Die MIME bleibt die **eine** aus Paket 4 ✓ (`FABRIC_WORKSPACE_OBJECT_DRAG_MIME` ✓).
//
// ## Fail-closed mit **benanntem** Grund ✓✓
//
// Kein Dokument ✓, kein Writer-Dokument ✓, kein Abschnittsobjekt ✓, ein Objekt der falschen Art ✓, eine
// unbekannte Behandlungsart ✓, ein Modus an einer Kopie ✓ (er hätte dort **keine** Bedeutung ✗), ein
// unbekannter Modus ✓ → **benannt** abgelehnt ✓. *Keine Attrappe, kein „Erfolg ohne Vorgang"* ✗✓.
//
// ## Live/Kopie — dieselbe Unterscheidung wie im Empfänger ✓✓
//
// Der Träger **sagt**, was er anbietet ✓: `integrationKind` ✓ (`copy` ✓ / `live` ✓) und — **nur** bei `live`
// ✓ — der Modus ✓ (`Live` / `Frozen` ✓). Bei der Kopie ist er **abwesend**, nicht `undefined` ✓✓
// (*bedingtes Spreizen* ✓, dieselbe Form wie in `writerWorkspaceDropZone.ts` ✓).
import type { DocumentKind, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  createWorkspaceDragPayload,
  serializeWorkspaceDragPayload,
  WorkspaceInteractionError,
} from '../../../../shared/workspace-interaction';
import type {
  WorkspaceDropIntent,
  WorkspaceIntegrationKind,
  WorkspaceInteractionErrorCode,
  WorkspaceLiveMode,
  WorkspaceObjectKind,
} from '../../../../shared/workspace-interaction';
import {
  WRITER_WORKSPACE_DROP_INTENT_LABEL,
  WRITER_WORKSPACE_LIVE_MODE_LABEL,
  writerWorkspaceDropObjectKindLabel,
  writerWorkspaceDropRefusalText,
} from '../workspace-drop/writerWorkspaceDropZoneContract';

/** Die **eine** Quellanwendung dieser Seite ✓ — *ein zweiter Name für „Writer" wäre eine zweite Adresse* ✗. */
export const WRITER_WORKSPACE_CARRIER_SOURCE_APP: DocumentKind = 'Writer';

/**
 * Die Objektart, die ein Dokumentabschnitt **als Objekt** ist ✓ — **gemessen im vorhandenen Modell** ✓: die
 * Absätze eines Writer-Dokuments leben im `TextBlock`-Wurzelobjekt ✓ (`useWriterState.ts` ✓,
 * `writerTextBlockWrite.ts` ✓, `writerWorkspaceIntegration.ts` ✓). *Keine erfundene Vokabel* ✓.
 */
export const WRITER_WORKSPACE_CARRIER_SECTION_KIND: WorkspaceObjectKind = 'TextBlock';

/** Die Gründe, die **diese** Seite selbst kennt ✓ — alles andere kommt aus dem vorhandenen Wortschatz ✓. */
export type WriterWorkspaceCarrierLocalRefusal =
  | 'carrier-document-missing'
  | 'carrier-source-not-writer'
  | 'carrier-section-missing'
  | 'carrier-section-kind-invalid'
  | 'carrier-integration-kind-invalid'
  | 'carrier-copy-mode-not-allowed'
  | 'carrier-live-mode-unknown';

/** Der **benannte** Grund einer Ablehnung ✓ — bestehende Codes zuerst ✓, die eigenen danach ✓. */
export type WriterWorkspaceCarrierRefusal = WorkspaceInteractionErrorCode | WriterWorkspaceCarrierLocalRefusal;

/** **Der Träger** ✓ — die Referenz auf den Abschnitt ✓, **nicht** sein Inhalt ✗, plus die Behandlungsart ✓. */
export interface WriterWorkspaceSectionCarrier {
  /** Der **eine** serialisierte Träger (Paket 7 ✓). */
  readonly payload: string;
  readonly integrationKind: WorkspaceIntegrationKind;
  /** **Nur** bei `live` ✓ — und nur, wenn er **gesagt** wurde ✓ (*abwesend statt `undefined`* ✓✓). */
  readonly mode?: WorkspaceLiveMode;
  readonly documentId: string;
  readonly objectId: string;
  readonly objectKind: WorkspaceObjectKind;
  readonly sourceApp: DocumentKind;
  readonly supportedIntents: readonly WorkspaceDropIntent[];
}

export type WriterWorkspaceCarrierStep =
  | { readonly ok: true; readonly carrier: WriterWorkspaceSectionCarrier; readonly reason?: never }
  | { readonly ok: false; readonly reason: WriterWorkspaceCarrierRefusal; readonly carrier?: never };

/** Die Eingaben des Erzeugers ✓ — das Dokument **untrusted** ✓ (die Prüfung ist hier, nicht beim Aufrufer ✓). */
export interface WriterWorkspaceCarrierRequest {
  readonly document: unknown;
  /** Ein **bestimmtes** Abschnittsobjekt ✓; fehlt es, wird der vorhandene Abschnitt gelesen ✓. */
  readonly sectionObjectId?: unknown;
  readonly integrationKind: unknown;
  /** **Nur** für `live` ✓ — bei einer Kopie ist ein Modus ein benannter Fehler ✓, kein stilles Verwerfen ✗. */
  readonly requestedMode?: unknown;
}

const COPY_INTENTS: readonly WorkspaceDropIntent[] = Object.freeze(['COPY']);
const LIVE_INTENTS: readonly WorkspaceDropIntent[] = Object.freeze(['LIVE_REFERENCE']);

/**
 * **Was der Träger anbietet** ✓ — **eine** Ableitung aus der Behandlungsart ✓ (*keine zweite Liste* ✓):
 * eine Kopie bietet `COPY` ✓, ein Live-Verweis bietet `LIVE_REFERENCE` ✓. *Mehr anzubieten, als der Nutzer
 * gesagt hat, wäre ein heimlicher zweiter Weg* ✗✓.
 */
export function writerWorkspaceCarrierSupportedIntents(kind: WorkspaceIntegrationKind): readonly WorkspaceDropIntent[] {
  return kind === 'live' ? LIVE_INTENTS : COPY_INTENTS;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * **Welches Objekt ist der Abschnitt?** ✓ — die **vorhandene** Leseregel des Writer-Modells ✓: das
 * `TextBlock`-**Wurzelobjekt** zuerst ✓, sonst irgendein `TextBlock` ✓ (*genau so lesen `useWriterState` ✓,
 * `writerWorkspaceIntegration` ✓, `writerPortableInterop` ✓ und `useWriterReviewState` ✓*).
 *
 * Zurückgegeben wird der **Schlüssel in `objects`** ✓ — *denn genau den schlägt der Resolver nach* ✓
 * (`source.objects[descriptor.objectId]` ✓). Ein erfundener `tb-<id>` wäre ein **Verweis auf nichts** ✗✓.
 */
export function writerWorkspaceCarrierSectionObjectId(document: WorkspaceDocument): string | null {
  const objects = document.objects as unknown;
  if (!isRecord(objects)) return null;
  const rootIds = Array.isArray(document.root_object_ids) ? document.root_object_ids : [];
  const root = rootIds.find((id) => isRecord(objects[id]) && objects[id].type === WRITER_WORKSPACE_CARRIER_SECTION_KIND);
  if (typeof root === 'string' && root.length > 0) return root;
  const fallback = Object.entries(objects).find(([, object]) => isRecord(object) && object.type === WRITER_WORKSPACE_CARRIER_SECTION_KIND);
  return fallback ? fallback[0] : null;
}

/**
 * **Der Träger für einen Dokumentabschnitt** ✓ — fail-closed ✓, **ein** Format ✓, Referenz statt Inhalt ✓.
 */
export function createWriterWorkspaceSectionCarrier(request: WriterWorkspaceCarrierRequest): WriterWorkspaceCarrierStep {
  const document = request.document;
  if (!isRecord(document) || typeof document.id !== 'string' || document.id.length === 0) {
    return { ok: false, reason: 'carrier-document-missing' };
  }
  const writerDocument = document as unknown as WorkspaceDocument;
  if (writerDocument.kind !== WRITER_WORKSPACE_CARRIER_SOURCE_APP) return { ok: false, reason: 'carrier-source-not-writer' };
  const objects = writerDocument.objects as unknown;
  if (!isRecord(objects)) return { ok: false, reason: 'carrier-section-missing' };

  const requestedId = request.sectionObjectId;
  if (requestedId !== undefined && (typeof requestedId !== 'string' || requestedId.length === 0)) {
    return { ok: false, reason: 'carrier-section-missing' };
  }
  const objectId = typeof requestedId === 'string' ? requestedId : writerWorkspaceCarrierSectionObjectId(writerDocument);
  if (objectId === null) return { ok: false, reason: 'carrier-section-missing' };
  const object = objects[objectId];
  if (!isRecord(object)) return { ok: false, reason: 'carrier-section-missing' };
  if (object.type !== WRITER_WORKSPACE_CARRIER_SECTION_KIND) return { ok: false, reason: 'carrier-section-kind-invalid' };

  const kind = request.integrationKind;
  if (kind !== 'copy' && kind !== 'live') return { ok: false, reason: 'carrier-integration-kind-invalid' };
  const rawMode = request.requestedMode;
  if (rawMode !== undefined && rawMode !== 'Live' && rawMode !== 'Frozen') return { ok: false, reason: 'carrier-live-mode-unknown' };
  if (kind === 'copy' && rawMode !== undefined) return { ok: false, reason: 'carrier-copy-mode-not-allowed' };
  const mode: WorkspaceLiveMode | undefined = rawMode === 'Live' || rawMode === 'Frozen' ? rawMode : undefined;
  const supportedIntents = writerWorkspaceCarrierSupportedIntents(kind);

  try {
    const payload = serializeWorkspaceDragPayload(createWorkspaceDragPayload({
      documentId: writerDocument.id,
      objectId,
      objectKind: WRITER_WORKSPACE_CARRIER_SECTION_KIND,
      sourceApp: WRITER_WORKSPACE_CARRIER_SOURCE_APP,
      supportedIntents,
    }));
    return {
      ok: true,
      carrier: Object.freeze({
        payload,
        integrationKind: kind,
        ...(mode === undefined ? {} : { mode }),
        documentId: writerDocument.id,
        objectId,
        objectKind: WRITER_WORKSPACE_CARRIER_SECTION_KIND,
        sourceApp: WRITER_WORKSPACE_CARRIER_SOURCE_APP,
        supportedIntents,
      }),
    };
  } catch (error) {
    // **Der eine Serialisierer entscheidet** ✓ — sein Code wird weitergereicht ✓, kein zweiter Wortschatz ✗.
    return { ok: false, reason: error instanceof WorkspaceInteractionError ? error.code : 'payload_invalid' };
  }
}

/** Der sichtbare Satz der **eigenen** Gründe ✓ — die Sätze der vorhandenen Codes stehen **einmal** ✓. */
const CARRIER_REFUSAL_TEXT: Readonly<Record<WriterWorkspaceCarrierLocalRefusal, string>> = Object.freeze({
  'carrier-document-missing': 'Es ist kein Dokument bekannt, aus dem ein Abschnitt stammen könnte.',
  'carrier-source-not-writer': 'Nur ein Writer-Dokument hat Abschnitte, die als Story verlinkt werden können.',
  'carrier-section-missing': 'Dieses Dokument hat keinen Abschnitt (kein TextBlock-Objekt) zum Verweisen.',
  'carrier-section-kind-invalid': 'Das gewählte Objekt ist kein Dokumentabschnitt.',
  'carrier-integration-kind-invalid': 'Unbekannte Behandlungsart: erlaubt sind Kopie oder Live-Verweis.',
  'carrier-copy-mode-not-allowed': 'Eine Kopie hat keinen Live-Modus.',
  'carrier-live-mode-unknown': 'Unbekannter Modus: erlaubt sind Live oder Eingefroren.',
});

/** Der sichtbare Satz zu einem benannten Grund ✓ — **eine** Definition für beide Seiten ✓. */
export function writerWorkspaceCarrierRefusalText(code: WriterWorkspaceCarrierRefusal): string {
  return Object.prototype.hasOwnProperty.call(CARRIER_REFUSAL_TEXT, code)
    ? CARRIER_REFUSAL_TEXT[code as WriterWorkspaceCarrierLocalRefusal]
    : writerWorkspaceDropRefusalText(code as WorkspaceInteractionErrorCode);
}

/** Der Zustand der Quellenseite ✓: **der** bereitgestellte Träger **oder** der benannte Grund ✓. */
export interface WriterWorkspaceCarrierState {
  readonly carrier: WriterWorkspaceSectionCarrier | null;
  readonly refusal: WriterWorkspaceCarrierRefusal | null;
}

export function createWriterWorkspaceCarrierState(): WriterWorkspaceCarrierState {
  return Object.freeze({ carrier: null, refusal: null });
}

/**
 * **Bereitstellen** ✓ — der eine Vorgang ✓: gelungen trägt der Zustand den Träger ✓, sonst den Grund ✓.
 *
 * Die Form ist die eines **Reduzierers** ✓ (vorheriger Zustand → neuer Zustand ✓, wie in den
 * Zustandsmaschinen dieses Pakets ✓), auch wenn der Vorgang den vorherigen Zustand **nicht** braucht ✗:
 * *der neue Zustand **ersetzt** ihn, er schreibt ihn nicht fort* ✓ — deshalb heißt der Parameter `_previous` ✓
 * und wird **nicht** heimlich gelesen ✗✓.
 */
export function carryWriterWorkspaceSection(
  _previous: WriterWorkspaceCarrierState,
  request: WriterWorkspaceCarrierRequest,
): WriterWorkspaceCarrierState {
  const step = createWriterWorkspaceSectionCarrier(request);
  return step.ok
    ? Object.freeze({ carrier: step.carrier, refusal: null })
    : Object.freeze({ carrier: null, refusal: step.reason });
}

export function clearWriterWorkspaceCarrierState(): WriterWorkspaceCarrierState {
  return createWriterWorkspaceCarrierState();
}

export function writerWorkspaceCarrierIsVisible(state: WriterWorkspaceCarrierState): boolean {
  return state.carrier !== null || state.refusal !== null;
}

/**
 * **Die sichtbare Aussage** ✓ — in Worten, ohne Farbe ✓. *„Bereitgestellt" ist **nicht** „zugestellt"* ✗✓:
 * die Quellenseite hat den Träger gebaut ✓; ob ein Ziel ihn annimmt, entscheidet die **Matrix** ✓.
 */
export function writerWorkspaceCarrierStateText(state: WriterWorkspaceCarrierState): string {
  if (state.refusal !== null) return writerWorkspaceCarrierRefusalText(state.refusal);
  const carrier = state.carrier;
  if (carrier === null) return 'Kein Abschnitt bereitgestellt.';
  const kind = carrier.integrationKind === 'live'
    ? WRITER_WORKSPACE_DROP_INTENT_LABEL.LIVE_REFERENCE
    : WRITER_WORKSPACE_DROP_INTENT_LABEL.COPY;
  const mode = carrier.mode === undefined ? '' : ` · ${WRITER_WORKSPACE_LIVE_MODE_LABEL[carrier.mode]}`;
  return `Bereitgestellt: ${writerWorkspaceDropObjectKindLabel(carrier.objectKind)} „${carrier.objectId}" aus ${carrier.documentId} · ${kind}${mode}`;
}
