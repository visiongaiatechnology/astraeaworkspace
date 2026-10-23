// STATUS: DIAMANT VGT SUPREME — native .vnote envelope delegated to authoritative Workspace container crypto
//
// ## AST-0737-Abhängigkeit (4) — die Seite ist ein **Objekt**, und sie überlebt den Rundlauf
//
// Gemessen war Zeile 11 dieser Datei `root_object_ids: []`, `objects: {}` ✗: die Seiten fuhren **ausschließlich**
// in `notebooks` mit, und **kein** Produktionspfad in `apps/notes` führte sie als Workspace-Objekt. *Der Träger
// (`integrations/notesParagraphCarrier.ts`) adressiert einen Absatz aber als Objekt (`objectId = pageId`,
// `objectKind = 'TextBlock'`), und der Resolver liest **nur** `document.objects[objectId]`* ✗✓ — *ohne Objekt ist
// jeder Träger ein Scheinträger.*
//
// **Die Reparatur benutzt den Präzedenzfall im selben Repo** (`apps/tasks/persistence/tasksOnlyDocument.ts:215-234`:
// ein `TextBlock` **als Objekt** im selben Dokument, `data.id === objectId`): das Dokument, das hier gepackt wird,
// führt seine Seiten **als Objekte** (`model/notesPageObjects.ts`). *Der ganze `WorkspaceDocument` wird gepackt —
// also überlebt das Objekt den Rundlauf **von selbst**, ohne Sonderweg.*
//
// **Und der Leser kann es sehen** ✓: `unpackVnote` gibt `objects` und `root_object_ids` **aus dem entschlüsselten
// Dokument** zurück — *nicht neu erfunden, sondern gelesen* ✓. Eine Ausfuhr ohne lesbare Einfuhr wäre eine Zusage
// ohne Deckung (genau der Defekt der AST-0728/0734-Runde, hier für die **Objekthälfte** geschlossen).
import type { NoteNotebook, WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import { packContainer, unpackContainer, type PackOptions, type UnpackOptions } from '../../../../platform/containers/container';
import { withNotesPageObjects } from '../../model/notesPageObjects';

export async function packVnote(notebooks: NoteNotebook[], title: string, options: PackOptions = {}): Promise<Uint8Array> {
  const now = Date.now();
  const document: WorkspaceDocument = {
    schema_version: 1,
    id: typeof crypto.randomUUID === 'function' ? `vnote-${crypto.randomUUID()}` : `vnote-${now}`,
    title: title.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240) || 'Astraea Notes',
    kind: 'Notes', created_at: now, modified_at: now, version: 1, theme_id: 'astraea-default', root_object_ids: [], objects: {}, notebooks,
  };
  // **Der eine Ort**, an dem ein Notes-Dokument assembliert wird: die Seiten werden zu Objekten — *bevor* gepackt
  // wird, damit sie **in den Bytes** stehen und nicht erst beim Lesen entstehen.
  return packContainer(withNotesPageObjects(document), options);
}

export async function unpackVnote(bytes: Uint8Array, credentials: string | UnpackOptions = {}): Promise<{
  title: string;
  notebooks: NoteNotebook[];
  /** Die **gelesenen** Seitenobjekte — aus dem entschlüsselten Dokument, nicht nachgerechnet. */
  objects: Record<string, WorkspaceObject>;
  root_object_ids: string[];
}> {
  const document = await unpackContainer(bytes, credentials);
  if (document.kind !== 'Notes' || !Array.isArray(document.notebooks)) throw new Error('Encrypted container is not an Astraea Notes .vnote document.');
  return { title: document.title, notebooks: document.notebooks, objects: document.objects, root_object_ids: document.root_object_ids };
}
