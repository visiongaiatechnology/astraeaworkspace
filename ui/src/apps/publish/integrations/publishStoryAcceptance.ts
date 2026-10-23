// STATUS: PLATIN — Integration & Release: die **annehmende** Hälfte des Writer-Abschnitts (Publish)
//
// ## Was gemessen fehlte — nicht vermutet
//
// Der Writer-Agent hat den **Träger-Erzeuger** gebaut (`writerWorkspaceCarrier.ts`, mit Aufrufer in
// `WriterEditor.tsx:57/579`). Die Publish-Seite ist zweigeteilt gemessen:
//
//   * **Die Ablagezone führt den Modus schon** ✓✓: `publishWorkspaceDropZone.ts:160` liest `requestedMode`,
//     `:631` reicht ihn **bedingt gespreizt** an den Resolver, und die Zustellung trägt `integrationKind` und
//     `mode` (`:530-533`). *Kein heimlicher Default — ein nicht gewählter Modus steht dort nicht.*
//   * **Niemand nimmt die Zustellung an** ✗✓: `PublishWorkspaceDropResolution` wird **nur** in der Zone und ihrem
//     Vertrag erwähnt (gemessen: zwei Dateien, beide erzeugen sie) — **keine** Stelle schreibt sie in ein
//     Dokument. Und die vorhandenen Annahmefunktionen (`linkWriterStory`, `attachPublishReference` in
//     `integrations/publishWorkspaceIntegration.ts`) hatten **null** Aufrufer.
//
// Dieses Modul ist die eine Stelle, an der aus einer **zugestellten** Resolution ein **verlinkter Story-Rahmen**
// wird. *Eine Fähigkeit ohne Aufrufer ist nicht geliefert* — der Aufrufer steht in `PublishView.tsx`.
//
// ## Keine zweite Trägerform, kein zweiter Parser, keine zweite MIME
//
// Es wird **nichts** geparst und **nichts** serialisiert: die Resolution kommt fertig aus dem Resolver (Paket 4),
// das Quelldokument kommt aus der Dokumentenkarte der Shell. Dieses Modul **liest** nur und **schreibt** über die
// vorhandenen Modellfunktionen (`createPublishWorkspaceReference` → `attachPublishReference`).
//
// ## Warum hier ein Modus übersetzt wird — und warum das **keine** zweite Vokabel ist
//
// Der kanonische Modus ist `WorkspaceLiveMode` = `'Live' | 'Frozen'` ✓ (Paket 15). Das **Publish-Modell** führt
// `PublishLinkMode` = `'live' | 'frozen' | 'broken'` ✓ — ein **Vertragsfeld in `shared/`**, das dieser Batch
// **nicht** ändern darf und nicht ändert. Die Übersetzung steht deshalb genau **einmal**, hier, an der
// Vertrauensgrenze, mit dem kanonischen Wert als Quelle; ein unbekannter Wert ist ein **benannter** Fehlschlag
// und kein stiller Rückfall. *Eine zweite Liste wäre es, wenn beide Seiten unabhängig eigene Wörter führten —
// hier ist die Quelle eine.*
//
// ## Was `broken` **nicht** ist
//
// `broken` ist der Zustand „die Quelle ist weg" und entsteht ausschließlich über `breakPublishReference`. Aus
// einem Träger kann er **nie** kommen: *eine Zustellung, die sich selbst für kaputt erklärt, wäre keine.*
//
// ## Fail-closed mit benanntem Grund
//
// Nichts zugestellt ✓, Quelle nicht in der Karte ✓, Zielrahmen fehlt ✓, Objektart keine Story ✓, Absicht keine
// Story ✓, Live ohne Modus ✓, unbekannter Modus ✓, Quellobjekt fehlt ✓, Snapshot fehlt bei Frozen ✓ → **benannt**
// abgelehnt. *Keine Attrappe, kein „Erfolg ohne Vorgang".*
//
// ## Was `NOT_TESTED` bleibt (Schicht 5)
//
// Der **Zeigerzug selbst** (`dragstart` → `drop` im Browser) und die sichtbare Wirkung im laufenden Fenster.
// Geprüft ist die Annahme aus einer **zugestellten** Resolution — rein, ohne DOM.
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { PublishDocumentModel, PublishWorkspaceReference } from '../../../shared/contracts/publish/workspacePublish';
import type { WorkspaceInteractionErrorCode, WorkspaceLiveMode, WorkspaceObjectKind } from '../../../shared/workspace-interaction';
import { PublishModelError } from '../model/publishDocumentEngine';
import {
  createPublishWorkspaceReference,
  attachPublishReference,
  freezePublishReference,
} from './publishWorkspaceIntegration';
import type { PublishWorkspaceDropResolution } from '../drop-zone/publishWorkspaceDropZoneContract';

/**
 * Die Objektart, die einen **Dokumentabschnitt** trägt — **gelesen**, nicht erfunden ✓.
 *
 * Der Writer-Träger benennt genau diese Art (`WRITER_WORKSPACE_CARRIER_SECTION_KIND` ✓); die Publish-Seite
 * wiederholt sie hier, weil sie die **Annahme** beschreibt und nicht den Erzeuger. *Ein anderer Name wäre eine
 * zweite Vokabel für dieselbe Sache.*
 */
export const PUBLISH_STORY_CARRIER_OBJECT_KIND: WorkspaceObjectKind = 'TextBlock';

/**
 * Die Absicht, die Publish für einen Abschnitt **annehmen kann** ✓✓.
 *
 * Der Akzeptanzwortlaut lautet „Dokumentabschnitt als **verlinkte Story** in Rahmen setzen" ✓. Eine **verlinkte**
 * Story ist `LIVE_REFERENCE` ✓ — nichts anderes. *Ein `COPY` wäre „Abschnitt als Text einfügen": eine andere
 * Zusage, die der Wortlaut nicht verlangt. Sie hier anzubieten wäre eine Fähigkeit, die niemand bestellt hat.*
 *
 * Der Writer-Träger bietet je nach Nutzerwahl `['COPY']` **oder** `['LIVE_REFERENCE']` ✓ — die Matrix trägt die
 * Route (Sache des Eigentümers); **diese** Seite nimmt die Verweis-Absicht an.
 */
export const PUBLISH_STORY_ACCEPTED_INTENT = 'LIVE_REFERENCE' as const;

/** Die **zwei** Modi, die aus einem Live-Verweis werden können ✓ — der kanonische Wert ist die Quelle. */
export const PUBLISH_STORY_MODES: readonly WorkspaceLiveMode[] = Object.freeze(['Live', 'Frozen']);

/** Die Gründe, die **diese** Seite selbst kennt — alles andere kommt aus dem vorhandenen Wortschatz ✓. */
export type PublishStoryAcceptanceLocalRefusal =
  | 'publish-carrier-resolution-not-delivered'
  | 'publish-carrier-source-missing'
  | 'publish-carrier-frame-missing'
  | 'publish-carrier-object-kind-not-story'
  | 'publish-carrier-mode-unknown'
  | 'publish-story-already-linked';

/** Der **benannte** Grund einer Ablehnung: bestehende Codes zuerst ✓, die eigenen danach ✓. */
export type PublishStoryAcceptanceRefusal = WorkspaceInteractionErrorCode | PublishStoryAcceptanceLocalRefusal;

/** Der Zustand „nichts zugestellt" — **kein** `null`, das wie Erfolg aussieht ✓. */
export type PublishStoryAcceptanceInput =
  | { readonly delivered: false }
  | { readonly delivered: true; readonly resolution: PublishWorkspaceDropResolution };

/** Das Ergebnis: das neue Dokument **oder** der benannte Grund ✓. */
export type PublishStoryAcceptanceStep =
  | { readonly ok: true; readonly model: PublishDocumentModel; readonly reference: PublishWorkspaceReference; readonly reason?: never }
  | { readonly ok: false; readonly reason: PublishStoryAcceptanceRefusal; readonly model?: never; readonly reference?: never };

/** Der sichtbare Satz zu jedem **eigenen** Grund — erschöpfend: ein neuer Grund bricht hier den Bau ✓. */
const LOCAL_REFUSAL_TEXT: Readonly<Record<PublishStoryAcceptanceLocalRefusal, string>> = Object.freeze({
  'publish-carrier-resolution-not-delivered': 'Nothing has been placed yet — there is no resolution to accept.',
  'publish-carrier-source-missing': 'The source document of this section is not available in the workspace.',
  'publish-carrier-frame-missing': 'Select a text frame before placing a linked story.',
  'publish-carrier-object-kind-not-story': 'Only a document section (TextBlock) becomes a linked story.',
  'publish-carrier-mode-unknown': 'Unknown live mode: Live or Frozen are the only modes.',
  'publish-story-already-linked': 'This frame already carries a linked story.',
});

/**
 * Der sichtbare Satz zu einem benannten Grund — **eine** Definition für die Fläche ✓.
 *
 * Für die Codes des Resolvers wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError` trägt zu
 * **jedem** Code seinen Satz ✓. *Ein zweites Wörterbuch über dieselben Codes wäre eine zweite Wahrheit.*
 */
export function publishStoryRefusalText(code: PublishStoryAcceptanceRefusal): string {
  const local = LOCAL_REFUSAL_TEXT[code as PublishStoryAcceptanceLocalRefusal];
  if (local !== undefined) return local;
  return code;
}

/**
 * Der **vollständige** sichtbare Satz — für die Fläche ✓.
 *
 * Für die Codes des vorhandenen Vokabulars wird **kein** zweites Wörterbuch angelegt: `WorkspaceInteractionError`
 * trägt zu jedem Code seinen Satz ✓, und die Funktionen dieses Moduls reichen ihn durch.
 */
export function publishStoryRefusalMessage(code: PublishStoryAcceptanceRefusal): string {
  const local = LOCAL_REFUSAL_TEXT[code as PublishStoryAcceptanceLocalRefusal];
  if (local !== undefined) return local;
  if (code === 'drop_intent_not_supported') return 'Only a linked story (LIVE_REFERENCE) can be placed from a document section.';
  if (code === 'drop_live_mode_required') return 'A live reference needs an explicit mode: Live or Frozen.';
  if (code === 'drop_source_object_missing') return 'The section carried by this drag is no longer part of the source document.';
  return publishStoryRefusalText(code);
}

/**
 * **Der Modus wird übersetzt — genau einmal** ✓, mit dem kanonischen Wert als Quelle ✓.
 *
 * `Live` → `'live'`, `Frozen` → `'frozen'`. Alles andere ist **benannt** abgelehnt und wird **nicht** auf einen
 * stillen Rückfall abgebildet ✓. *`'broken'` ist hier absichtlich nicht erreichbar: es ist der Zustand „Quelle
 * weg" und entsteht nur über `breakPublishReference`.*
 */
export function publishStoryLinkMode(mode: unknown): PublishWorkspaceReference['mode'] | null {
  if (mode === 'Live') return 'live';
  if (mode === 'Frozen') return 'frozen';
  return null;
}

/** Das Quellobjekt, **wörtlich** gelesen — kein zweiter Parser ✓: der Resolver hat es bereits identifiziert. */
function sourceObject(source: WorkspaceDocument, objectId: string): Record<string, unknown> | null {
  const objects = source.objects as unknown as Record<string, unknown> | undefined;
  if (!objects || typeof objects !== 'object') return null;
  const object = objects[objectId];
  return object && typeof object === 'object' && !Array.isArray(object) ? (object as Record<string, unknown>) : null;
}

/**
 * **Die Objektart eines zugestellten Trägers** — **der eine** Leser dieser Frage ✓✓.
 *
 * Gemessen (eigener Befund, Runde Publish-16): seit es **zwei** annehmende Hälften gibt (Abschnitt → Story,
 * Tabelle → Preisübersicht), las jede den Träger selbst — und die Ansicht hätte ein **drittes** Mal gelesen, um
 * zu entscheiden, welche zuständig ist. *Drei Leser derselben Frage sind drei Gelegenheiten, sie verschieden zu
 * beantworten.* Jetzt liest **eine** Funktion, und Annahme wie Weiche benutzen sie.
 */
export function publishCarrierObjectType(documents: Readonly<Record<string, WorkspaceDocument>>, sourceDocumentId: string, objectId: string): string | null {
  const source = documents[sourceDocumentId];
  if (!source) return null;
  const object = sourceObject(source, objectId);
  if (object === null) return null;
  return typeof object.type === 'string' ? object.type : null;
}

/** Ist die Objektart des Objekts wirklich ein Dokumentabschnitt? — **die eine** Prüfung dieser Frage ✓. */
function objectIsSection(object: Record<string, unknown> | null): boolean {
  return object !== null && object.type === PUBLISH_STORY_CARRIER_OBJECT_KIND;
}

/**
 * **Die Annahme eines zugestellten Abschnitts** ✓✓ — die eine Stelle, an der daraus eine verlinkte Story wird.
 *
 * Reihenfolge und Gründe sind absichtlich **spezifisch vor allgemein**: erst „gibt es eine Zustellung", dann
 * „gibt es die Quelle", dann „ist es überhaupt ein Abschnitt", dann „welcher Modus" — *wer mit dem Modus beginnt,
 * meldet bei einem fehlenden Dokument den falschen Grund.*
 */
export function acceptPublishStoryDrop(
  model: PublishDocumentModel,
  input: PublishStoryAcceptanceInput,
  documents: Readonly<Record<string, WorkspaceDocument>>,
): PublishStoryAcceptanceStep {
  if (!input || input.delivered !== true) return { ok: false, reason: 'publish-carrier-resolution-not-delivered' };
  const resolution = input.resolution;

  // **Nur die Verweis-Absicht** ✓ — eine Kopie ist eine andere Zusage (siehe Modulkopf).
  if (resolution.intent !== PUBLISH_STORY_ACCEPTED_INTENT) return { ok: false, reason: 'drop_intent_not_supported' };
  // **`live` oder gar nichts** ✓: eine Zustellung mit `integrationKind: 'copy'` trägt keine Referenz.
  if (resolution.integrationKind !== 'live') return { ok: false, reason: 'drop_intent_not_supported' };

  const source = documents[resolution.sourceDocumentId];
  if (!source) return { ok: false, reason: 'publish-carrier-source-missing' };

  /**
   * **Der Zielrahmen ist der ausgewählte Rahmen** ✓ — kein geratener Kandidat.
   *
   * Gemessen beim Schreiben dieser Funktion: meine erste Fassung suchte „irgendeinen Textrahmen ohne Verweis" und
   * fiel auf den ausgewählten zurück. Das hätte bei mehreren freien Rahmen **den falschen** verlinkt — eine
   * Ablage, die woanders landet als gezeigt, ist schlimmer als eine benannte Ablehnung. Der Nutzer wählt mit der
   * Auswahl (Maus oder Tastatur) — und die Zone zeigt ihm vorher, wohin.
   */
  const targetFrame = model.frames.find(frame => frame.id === model.selectedFrameId);
  if (!targetFrame) return { ok: false, reason: 'publish-carrier-frame-missing' };
  if (targetFrame.type !== 'text') return { ok: false, reason: 'publish-carrier-object-kind-not-story' };
  if (targetFrame.workspaceReferenceId !== undefined) return { ok: false, reason: 'publish-story-already-linked' };

  const object = sourceObject(source, resolution.sourceObjectId);
  if (!object) return { ok: false, reason: 'drop_source_object_missing' };
  if (!objectIsSection(object)) return { ok: false, reason: 'publish-carrier-object-kind-not-story' };

  /**
   * **Der Modus muss gesagt sein** ✓✓ — ein Live-Verweis **ohne** Modus ist der benannte Fehlschlag
   * `drop_live_mode_required` (Paket 15). *Hier einen Default einzusetzen wäre genau der heimliche Default, den
   * die Zone an ihrer Stelle schon verbietet.*
   */
  if (resolution.mode === undefined) return { ok: false, reason: 'drop_live_mode_required' };
  const mode = publishStoryLinkMode(resolution.mode);
  if (mode === null) return { ok: false, reason: 'publish-carrier-mode-unknown' };

  try {
    /**
     * Der Abschnitt wird über die **vorhandene** Referenz-Vokabel benannt: `objectId` ist der Abschnitt ✓,
     * `selector` trägt ihn (die kanonische Form führt kein sechstes Feld ✓).
     */
    const reference = createPublishWorkspaceReference(source, 'writer-story', resolution.sourceObjectId, mode);
    const linked = attachPublishReference(model, targetFrame.id, reference);
    if (mode === 'frozen') {
      /**
       * **Eingefroren heißt: der Abschnitt wird mitgenommen** ✓. Der Schnappschuss ist das Quellobjekt
       * **wörtlich** — *nicht interpretiert, nicht umgeschrieben: eine zweite Lesart des Writer-Modells wäre ein
       * zweiter Parser.*
       */
      const frozen = freezePublishReference(linked, reference.id, object, resolution.sourceVersion);
      return { ok: true, model: frozen, reference };
    }
    return { ok: true, model: linked, reference };
  } catch (error) {
    // **Die vorhandenen Modellfunktionen nennen den Grund** ✓ — kein zweiter Wortschatz, keine Attrappe.
    return { ok: false, reason: error instanceof PublishModelError ? (error.code as PublishStoryAcceptanceRefusal) : 'publish-carrier-source-missing' };
  }
}

/**
 * Die sichtbare Aussage nach einer Annahme ✓ — **ohne Farbe**, mit beiden Tatsachen: welcher Abschnitt und
 * **wie** er behandelt wird. *„Verlinkt" allein ließe Live und Eingefroren gleich aussehen.*
 */
export function publishStoryAcceptanceText(reference: PublishWorkspaceReference): string {
  const treatment = reference.mode === 'frozen' ? 'frozen section' : reference.mode === 'live' ? 'live-linked story' : 'broken link';
  return `Section ${reference.selector ?? reference.canonicalUri} · ${treatment}`;
}
