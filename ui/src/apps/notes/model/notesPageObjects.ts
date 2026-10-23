// STATUS: PLATIN — Notes · **AST-0737-Abhängigkeit (4)**: die Seite als **Objekt** des Notes-Dokuments
//
// ## Warum dieses Modul existiert
//
// Der Träger (`integrations/notesParagraphCarrier.ts`) benennt einen Notes-Absatz als **Objekt**: `objectId = pageId`,
// `objectKind = 'TextBlock'`, `sourceApp = 'Notes'`. Der Resolver liest dafür **ausschließlich**
// `document.objects[objectId]` (`shared/workspace-interaction/workspaceInteractionResolver.ts:127-131`) und verlangt
// `type === objectKind`. *Es gibt keinen zweiten Zweig, der `notebooks` liest — eine zweite Route wäre eine zweite
// Wahrheit.* Gemessen war das Notes-Datenmodell bis hierher **objektlos**: `notesVnoteContainer.ts:11` schrieb
// `root_object_ids: []`, `objects: {}`, und **kein** Produktionspfad in `apps/notes` schrieb je ein Objekt. *Ohne
// dieses Modul wäre jeder Träger ein Scheinträger.*
//
// ## Der Präzedenzfall im selben Repo — und was davon übernommen wird
//
// `apps/tasks/persistence/tasksOnlyDocument.ts:215-234` führt seine Nutzdaten **als Objekt**: `type: 'TextBlock'`,
// `data.id === objectId`, im **selben** Dokument, das serialisiert wird — *dadurch überlebt es den Rundlauf von
// selbst, ohne Sonderweg.* **Drei Züge werden übernommen:** (1) die Nutzdaten bleiben an ihrem kanonischen Ort
// (`notebooks`) und das Objekt ist ein **Träger**, keine zweite Quelle; (2) das Objekt steht im Dokument selbst;
// (3) `data.id === objectId`.
//
// **Ein Zug wird bewusst NICHT übernommen:** Tasks schreibt **einen** Sammelträger unter einer **konstanten**
// Kennung. Notes braucht **je Seite ein Objekt unter der Seitenkennung** — *denn der Resolver prüft genau diese
// Kennung gegen `descriptor.objectId`. Ein Sammelobjekt wäre hier ein Scheinträger.*
//
// ## Eine Projektion, kein zweiter Eingang
//
// `withNotesPageObjects` liest die Notizbücher **aus dem Dokument selbst**. *Es gibt keinen zweiten Parameter, also
// kann das Ergebnis nicht von `document.notebooks` abweichen* — eine Divergenzquelle weniger.
//
// ## Die harte Kante: die Kennungsgrenze wird **nicht** neu erfunden
//
// Ein importiertes `.notes.json` kann **beliebige** Seitenkennungen tragen (`model/notesHierarchy.ts:52-97`
// normalisiert Titel, Inhalt, Tags — **nicht** die `id`). Die Speichergrenze
// (`platform/workspace/model/workspaceObjectModelDocumentPersistence.ts:192-251`) verlangt für **jedes** Objekt und
// **jeden** Absatz eine stabile Kennung (`assertStableWorkspaceId`: `^[A-Za-z0-9._:@-]+$`, ≤ 192 Zeichen) — *ein
// Objekt mit untragbarer Kennung ließe `packVnote` **werfen**, und der Nutzer könnte sein Notizbuch nicht mehr
// ausführen.* Deshalb prüft dieses Modul gegen **genau diese vorhandene Regel** (`assertStableWorkspaceId`) statt
// gegen eine zweite Kopie des Musters, und eine Seite außerhalb der Grenze trägt **kein** Objekt.
//
// **Und sie geht trotzdem nicht verloren:** ihre Daten fahren vollständig in `notebooks` mit. *Kein
// Denial-of-Export aus einer feindlichen Datei* — und der Zeuge
// `testing/integration/workspace/notesPageObjectLiveDocument.ast0737dep.test.ts` misst genau diesen Fall.
import type { NoteNotebook, NotePage, WorkspaceDocument, WorkspaceObject } from '../../../shared/contracts/workspace';
import { assertStableWorkspaceId } from '../../../platform/workspace/model/workspaceObjectModelPrimitives';
import { notePageParagraphs } from './noteModel';

/** Was die Projektion liefert: das Objekt je Seite und die Wurzel, unter der es erreichbar ist. */
export interface NotesPageObjectProjection {
  /** **Ein** Objekt je tragfähiger Seite — unter **der Seitenkennung**, weil der Träger sie adressiert. */
  readonly objects: Readonly<Record<string, WorkspaceObject>>;
  /** Die Wurzeln: ein Objekt ohne Wurzel ist im Workspace-Modell nicht erreichbar. */
  readonly root_object_ids: readonly string[];
}

/**
 * **Die eine** Umwandlung „Notes-Seite → Workspace-Objekt".
 *
 * Die Absätze kommen aus der **vorhandenen** Ableitung `notePageParagraphs` (`model/noteModel.ts`) — *dieselbe, die
 * der Writer-Entwurf liest: **ein** Entwurf, zwei Leser, keine zweite Umsetzung derselben Sache* ✓.
 *
 * Gibt `null` zurück, wenn die Seite die **vorhandene** Kennungsgrenze nicht trägt (siehe Modulkopf) — *kein
 * stiller Ersatz, keine erfundene Kennung: die Seite behält ihre Identität, sie bekommt nur kein Objekt.*
 */
function notePageObject(page: NotePage): WorkspaceObject | null {
  const paragraphs = notePageParagraphs(page);
  try {
    // **Die vorhandene Regel**, nicht eine zweite: Objektkennung *und* jede Absatzkennung müssen tragfähig und
    // innerhalb des Blocks eindeutig sein (`workspaceObjectModelValidation.ts:243-255`).
    assertStableWorkspaceId(page.id, 'Notes page object id');
    const paragraphIds = new Set<string>();
    for (const paragraph of paragraphs) {
      assertStableWorkspaceId(paragraph.id, 'Notes page paragraph id');
      if (paragraphIds.has(paragraph.id)) return null;
      paragraphIds.add(paragraph.id);
    }
  } catch {
    return null;
  }
  // `data.id === page.id` ist Pflicht der Speichergrenze (`validateTypedObject`: `Object <id> identity mismatch`).
  return { type: 'TextBlock', data: { id: page.id, paragraphs } };
}

/** Die Seiten eines Notizbuchsatzes — **eine** Zerlegung, dieselbe wie überall im Notes-Modell. */
function pagesOf(notebooks: readonly NoteNotebook[]): NotePage[] {
  const pages: NotePage[] = [];
  for (const notebook of notebooks) for (const section of notebook.sections) for (const page of section.pages) pages.push(page);
  return pages;
}

/**
 * **Die Projektion des Notizbuchsatzes.** Zwei Seiten mit **derselben** Kennung können nicht beide unter ihr
 * geführt werden — *die zweite bekommt kein Objekt statt das erste heimlich zu überschreiben.*
 */
export function notesPageObjects(notebooks: readonly NoteNotebook[]): NotesPageObjectProjection {
  const objects: Record<string, WorkspaceObject> = {};
  const root_object_ids: string[] = [];
  for (const page of pagesOf(notebooks)) {
    if (Object.prototype.hasOwnProperty.call(objects, page.id)) continue;
    const object = notePageObject(page);
    if (!object) continue;
    objects[page.id] = object;
    root_object_ids.push(page.id);
  }
  return Object.freeze({ objects: Object.freeze(objects), root_object_ids: Object.freeze(root_object_ids) });
}

/**
 * **Das Dokument mit seinen Seiten als Objekten** — die **eine** Stelle, an der ein Notes-Dokument assembliert wird.
 *
 * Fremde Objekte werden **erhalten**: *ein vorhandener Nutzdatensatz wird nie ohne Ersatz und ohne Grund gelöscht.*
 * Nur die Kennungen, die **jetzt** Seitengewicht haben, werden durch die Projektion ersetzt — *so bleibt die
 * Projektion idempotent, und ein zweiter Aufruf ändert nichts.*
 */
export function withNotesPageObjects(document: WorkspaceDocument): WorkspaceDocument {
  const projection = notesPageObjects(document.notebooks ?? []);
  const pageObjectIds = new Set(Object.keys(projection.objects));
  const keptObjects = Object.fromEntries(Object.entries(document.objects).filter(([id]) => !pageObjectIds.has(id)));
  const keptRoots = document.root_object_ids.filter((id) => !pageObjectIds.has(id));
  return {
    ...document,
    objects: { ...keptObjects, ...projection.objects },
    root_object_ids: Array.from(new Set([...keptRoots, ...projection.root_object_ids])),
  };
}
