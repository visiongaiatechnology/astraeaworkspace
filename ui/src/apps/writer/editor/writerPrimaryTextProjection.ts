// STATUS: PLATIN — AST-0737 Folge: die **Leseregel** fuer einen gelieferten Workspace-Verweis und die
// **Schreibgrenze**, die dazugehoert. Reine Projektion: kein React, kein DOM, keine zweite Wahrheit.
//
// ## Warum dieses Modul existiert
//
// Bis hierher waehlte `useWriterState` den Primaertext so:
//
//   `root_object_ids.find((id) => objects[id]?.type === 'TextBlock') || root_object_ids[0]`
//
// und las dann `objects[id].data` mit einem **Cast** `as TextBlockObject`. Zwei gemessene Folgen
// (eigene Messung, AST-0737 Folge — Rohausgabe `logs/rtemp/ast0737folge_probe.txt`):
//
//  1. **Der Empfangspunkt war keiner.** Ein gelieferter Verweis
//     (`fabricReferenceOperations.ts:152-185`, `type: 'WorkspaceReference'`) faellt durch das `find`
//     und wird ueber den Rueckfall `root_object_ids[0]` gelesen — `data.paragraphs` gibt es dort
//     nicht. Gemessen: `LIVE_CURRENT_PROJECTION=[]` fuer einen Verweis auf den Notes-Absatz
//     `GEHEIMER-ABSATZ-INHALT-42`.
//
//  2. **Derselbe Rueckfall war ein SCHREIBZIEL.** `useWriterPersistence.ts:154-159` reicht
//     `primaryTextBlockId`/`textBlockObj` **woertlich** an `planWriterTextBlockWrite`. Bei einem
//     Verweis als `root_object_ids[0]` war die Kennung die **Verweis-Kennung** und das Objekt die
//     **Verweis-Daten** — der erste Tastendruck schrieb `{ type: 'TextBlock' }` an **dieselbe**
//     Kennung und zerstoerte den Live-Verweis **still**. Gemessen: `WRITE_TARGET_ID=verweis-live-1`,
//     `WRITE_REFERENCE_SURVIVES=TextBlock`.
//
// ## Die Invariante, die daraus folgt
//
//   EIN OBJEKT MIT `type === 'WorkspaceReference'` IST NIE DAS ZIEL VON `planWriterTextBlockWrite`.
//
// Sie steht hier als **eine** Aussage: der Verweis liefert **Absaetze zum Lesen** und **kein**
// Schreibziel. Wer beides trennt, kann den Text zeigen, ohne den Verweis zu fressen.
//
// ## Und woher der Inhalt eines Verweises kommt
//
// `insertFromWorkspace` legt `cached_snapshot`/`fallback_snapshot` **nur** fuer `mode: 'Frozen'` an
// (`fabricReferenceOperations.ts:158-159`) — gemessen: `LIVE_CACHED=undefined`, `LIVE_FALLBACK=undefined`.
// Ein Live-Verweis traegt damit **nur** `uri`, `mode`, `expected_type`; **der Inhalt liegt im
// Quelldokument**. Deshalb liest diese Projektion, wenn kein eingebetteter Schnappschuss da ist,
// ueber die **eine vorhandene Aufloesungsautoritaet** `resolveFabricReference` (`fabricState.ts:137-235`,
// nur gelesen) — sie baut **keine** zweite Regel. Fehlen die bekannten Dokumente oder ist der
// Verweis nicht lesbar, bleibt es bei `[]`: benannt, nicht still ersetzt.
import type {
  Paragraph,
  TextBlockObject,
  WorkspaceDocument,
  WorkspaceObject,
  WorkspaceReferenceObject,
} from '../../../shared/contracts/workspace';
import { parseVgtUri, resolveFabricReference } from '../../../shared/workspace-interaction/fabricState';

/**
 * Woher der gelesene Text kommt, wenn es **nicht** der eigene ist.
 *
 * Die Oberflaeche kann damit sagen, wessen Text sie zeigt — *ein fremder Text, der als eigener
 * erscheint, ist genau die stille Verwechslung, die dieses Projekt am teuersten bezahlt.*
 */
export interface WriterBorrowedTextSource {
  readonly referenceId: string;
  readonly uri: string;
  readonly mode: WorkspaceReferenceObject['mode'];
  readonly sourceDocumentId: string | undefined;
  readonly sourceObjectId: string | undefined;
}

export interface WriterPrimaryTextProjection {
  /**
   * Das **Schreibziel** — **nie** ein Verweisobjekt. `undefined` heisst: dieses Dokument hat (noch)
   * keinen eigenen TextBlock; der naechste Schreibvorgang legt dann den kanonischen an
   * (`planWriterTextBlockWrite` → `tb-<document.id>`), und der Verweis bleibt unberuehrt.
   */
  readonly writeTextBlockId: string | undefined;
  readonly writeTextBlock: TextBlockObject | undefined;
  /** Was der Editor **liest** — der eigene Text oder der gelieferte. */
  readonly paragraphs: Paragraph[];
  /** `null` = eigener Text. Sonst: der Verweis, aus dem gelesen wird. */
  readonly borrowedText: WriterBorrowedTextSource | null;
}

/** Dieselbe Konstante wie im Hook: leere Absaetze sind **eine** Sache, keine neue je Aufruf. */
const NO_PARAGRAPHS: Paragraph[] = [];

/** Die Verengung am RAND: aus einem Objekt wird der TextBlock-Inhalt — oder `null`. */
function textBlockData(object: WorkspaceObject | undefined): TextBlockObject | null {
  return object && object.type === 'TextBlock' ? object.data : null;
}

/**
 * Der **eingebettete** Schnappschuss des Verweises, wenn er ein TextBlock ist.
 *
 * Der Rueckfall traegt einen Ausweis: `fallback_policy: 'forbidden'` heisst, dass er **nicht**
 * gelesen werden darf — der Aktualisierer setzt genau das (`fabricReferenceOperations.ts:95-97`).
 * Ein Ausweis wird gelesen, nicht uebergangen.
 */
function embeddedTextBlock(reference: WorkspaceReferenceObject): TextBlockObject | null {
  const cached = textBlockData(reference.cached_snapshot);
  if (cached) return cached;
  if (reference.fallback_policy !== 'allowed') return null;
  return textBlockData(reference.fallback_snapshot);
}

/**
 * Der Inhalt aus dem **Quelldokument** — ueber die vorhandene Aufloesung, nicht ueber eine eigene.
 *
 * Zwei Waechter, damit diese Leseregel **nie** wirft: das Zieldokument muss in der Karte liegen und
 * den Verweis wirklich fuehren (sonst wirft `resolveFabricReference` benannt), und der aufgeloeste
 * Quellgegenstand muss ein TextBlock sein.
 */
function resolvedTextBlock(
  document: WorkspaceDocument,
  documents: Record<string, WorkspaceDocument> | undefined,
  referenceId: string,
): TextBlockObject | null {
  const target = documents?.[document.id];
  if (!target || target.objects[referenceId]?.type !== 'WorkspaceReference') return null;
  const resolution = resolveFabricReference(documents as Record<string, WorkspaceDocument>, document.id, referenceId);
  return textBlockData(resolution.sourceObject);
}

interface BorrowedText {
  readonly paragraphs: Paragraph[];
  readonly source: WriterBorrowedTextSource;
}

/**
 * Der **erste** Verweis im Dokument, der einen `'TextBlock'` **ankuendigt** (`expected_type`).
 * Ohne diese Ankuendigung ist der Verweis nicht gemeint: `expected_type` ist die Zusage, die der
 * Einfüger schreibt (`fabricReferenceOperations.ts:162`) — und `resolveFabricReference` prueft sie
 * gegen den Quellgegenstand (`fabricState.ts:215-223`).
 */
function findBorrowedText(
  document: WorkspaceDocument,
  documents: Record<string, WorkspaceDocument> | undefined,
): BorrowedText | null {
  const referenceId = document.root_object_ids.find((id) => {
    const object = document.objects[id];
    return object?.type === 'WorkspaceReference' && object.data.expected_type === 'TextBlock';
  });
  if (!referenceId) return null;
  const object = document.objects[referenceId];
  if (!object || object.type !== 'WorkspaceReference') return null;
  const reference = object.data;
  const coordinates = parseVgtUri(reference.uri);
  const textBlock = embeddedTextBlock(reference) ?? resolvedTextBlock(document, documents, referenceId);
  if (!textBlock) return null;
  return {
    paragraphs: textBlock.paragraphs,
    source: {
      referenceId,
      uri: reference.uri,
      mode: reference.mode,
      sourceDocumentId: coordinates?.docId,
      sourceObjectId: coordinates?.objId,
    },
  };
}

/**
 * Was Writer als Primaertext **liest** und **wohin** er schreibt.
 *
 * Die Reihenfolge ist die vorhandene, nur um den Verweis erweitert:
 *   1. der **eigene** TextBlock (unveraendert zuerst — *ein Verweis, der vor ihm liegt, verdeckt ihn
 *      nicht*; die Ordnung im Dokument entscheidet also nicht ueber den eigenen Text),
 *   2. sonst der **erste angekuendigte TextBlock-Verweis** (eingebetteter Schnappschuss, sonst das
 *      Quelldokument),
 *   3. sonst nichts — **und kein Schreibziel**, damit ein fremdes Objekt nie ueberschrieben wird.
 */
/**
 * Die Absätze des **eigenen** TextBlocks — dieselbe Leseregel wie in
 * `projectWriterPrimaryText`, ohne die Verweis-Auflösung.
 *
 * Gebraucht von der Verlaufserkennung des Editors: sie muss billig (O(Absätze))
 * erkennen, ob ein vom Host gestempeltes/geklontes Dokument denselben Writer-Inhalt
 * trägt. Eine zweite Leseregel entsteht dabei nicht.
 */
export function readWriterOwnParagraphs(document: WorkspaceDocument): readonly Paragraph[] {
  const ownTextBlockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock');
  const own = ownTextBlockId ? textBlockData(document.objects[ownTextBlockId]) : null;
  return own?.paragraphs ?? NO_PARAGRAPHS;
}
export function projectWriterPrimaryText(
  document: WorkspaceDocument,
  documents?: Record<string, WorkspaceDocument>,
): WriterPrimaryTextProjection {
  const ownTextBlockId = document.root_object_ids.find((id) => document.objects[id]?.type === 'TextBlock');
  const ownTextBlock = ownTextBlockId ? textBlockData(document.objects[ownTextBlockId]) : null;
  if (ownTextBlockId && ownTextBlock) {
    return {
      writeTextBlockId: ownTextBlockId,
      writeTextBlock: ownTextBlock,
      paragraphs: ownTextBlock.paragraphs,
      borrowedText: null,
    };
  }

  const borrowed = findBorrowedText(document, documents);
  if (!borrowed) {
    return {
      writeTextBlockId: undefined,
      writeTextBlock: undefined,
      paragraphs: NO_PARAGRAPHS,
      borrowedText: null,
    };
  }
  return {
    writeTextBlockId: undefined,
    writeTextBlock: undefined,
    paragraphs: borrowed.paragraphs,
    borrowedText: borrowed.source,
  };
}
