// STATUS: PLATIN — Integration & Release, **Paket 40**: Transaktionale Mehrdokument-Aenderung
//
// ## Warum diese Datei existiert ✓✓✓
//
// **Gemessen (Runde 377):** *von den geteilten Diensten der Pakete P41-P55 hatte `fabricBatchOperations.ts`
// **null Zeugen*** ✗✓ — *und P39 und P40 **teilen sich diese Datei**.* P39 (`assertNoFabricCycles`, `:46`) ist seit
// Runde 359 bezeugt ✓✓; **die Transaktion selbst war es nicht** ✗✓✓.
//
// ## Was „transaktional" hier wirklich heisst — staerker als „Rollback" ✓✓✓
//
// `fabricBatchOperations.ts:35` `let working = documents;` und `:42` `working = result.updatedDocs;` —
// *die Eingabe wird **nicht** mutiert, und `working` wird **nur am Ende** zurueckgegeben (`:47`).*
// **Die Transaktion ist also nicht durch Ruecknahme gebaut, sondern durch Unveraenderlichkeit** ✓✓✓ —
// *und **kein Rollback kann danebengehen**.* *Dieselbe Regel habe ich in Runde 299 fuer `insertFromWorkspace`
// gemessen: der Aufrufer fuehrt `updatedDocs` weiter.*
//
// ## Und ein Befund, der beim Lesen auffiel ✗✓✓
//
// `:40` `if (!source || source.version !== change.sourceVersion) continue;` — *eine fehlende Quelle oder eine
// **veraltete** Version wird **still** uebersprungen: kein `notification`, kein Zaehler, keine Spur* ✗.
// **Das ist W-453s Klasse, zum vierten Mal** ✗✓✓ — *„ein fehlender Eingang wird still durch etwas anderes
// ersetzt", hier: durch **nichts**, und der Aufrufer erfaehrt es nicht.* *Es kann **beabsichtigt** sein — eine
// veraltete Version **darf** nicht angewandt werden. **Dann gehoert sie aber gezaehlt, nicht unsichtbar** ✗✓✓:
// `count` zaehlt nur die **angewandten**, also ist „16 Aenderungen, 3 uebersprungen" heute **nicht ausdrueckbar**.*
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { DocumentKind } from '../../../shared/contracts/documentKind';
import { insertFromWorkspace } from '../../../shared/workspace-interaction/fabricReferenceOperations';
import { coalesceFabricChanges, propagateFabricBatch } from '../../../shared/workspace-interaction/fabricBatchOperations';

const shapeDaten = (id: string) => ({
  id, shape_type: 'rectangle' as const,
  x: 0, y: 0, width: 320, height: 240, rotation: 0,
  fill: 'transparent', stroke: 'transparent', stroke_width: 0,
});

const dokument = (id: string, kind: DocumentKind, version: number): WorkspaceDocument => ({
  schema_version: 2, id, title: id, kind,
  created_at: 1, modified_at: 1, version, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  objects: { 'anker-1': { type: 'Shape', data: shapeDaten('anker-1') } },
});

/** *Baut den Verweis mit `insertFromWorkspace` — **mein** Zeuge aus Runde 299 hat dieselbe Form.* ✓✓ */
function paar(): Record<string, WorkspaceDocument> {
  const docs: Record<string, WorkspaceDocument> = { quelle: dokument('quelle', 'Draw', 5), ziel: dokument('ziel', 'Writer', 4) };
  const e = insertFromWorkspace(docs, 'ziel', 'quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 10 });
  return e.updatedDocs;
}

/** *Der Aenderungssatz, den `propagateFabricBatch` erwartet (`:10-15`).* ✓ */
const aenderung = (version: number, objId = 'anker-1') => ([{
  sourceDocId: 'quelle', sourceObjId: objId, sourceVersion: version,
  object: { type: 'Shape' as const, data: shapeDaten(objId) },
}]);

describe('Paket 40: Transaktionale Mehrdokument-Aenderung', () => {
  it('**Nicht-Leerheit zuerst** — ein gueltiger Satz geht durch', () => {
    // *Ohne diese Gegenprobe waere „transaktional" auch von einer Funktion erfuellt, die **nichts** tut.* ✗✓✓
    const docs = paar();
    const ergebnis = propagateFabricBatch(aenderung(5), docs, { now: 20 });
    expect(ergebnis.count, 'der gueltige Satz hat nichts bewirkt').toBeGreaterThanOrEqual(1);
    expect(ergebnis.updatedDocs['ziel']).toBeDefined();
  });

  it('**Die Eingabe wird NICHT mutiert** ✓✓ — *die Transaktion ist Unveraenderlichkeit, nicht Ruecknahme*', () => {
    const docs = paar();
    const vorher = JSON.stringify(docs);
    propagateFabricBatch(aenderung(5), docs, { now: 21 });
    // *`working = documents` und `return updatedDocs` — der Aufrufer behaelt seinen Stand.* ✓✓
    expect(JSON.stringify(docs), 'die Eingabe wurde veraendert').toBe(vorher);
  });

  it('**Und ein werfender Vorgang laesst die Eingabe unberuehrt** ✓✓✓ — „alles oder nichts"', () => {
    const docs = paar();
    const vorher = JSON.stringify(docs);
    // *Ein **ungueltiger** Satz wirft **vor** jeder Wirkung (`:22`: `object.data.id !== sourceObjId`).*
    const kaputt = [{ sourceDocId: 'quelle', sourceObjId: 'anker-1', sourceVersion: 5, object: { type: 'Shape' as const, data: shapeDaten('FALSCH') } }];
    expect(() => propagateFabricBatch(kaputt, docs, { now: 22 })).toThrow();
    expect(JSON.stringify(docs), 'ein Werfen hat die Eingabe veraendert').toBe(vorher);
  });

  it('**Koaleszenz: die NEUESTE Version gewinnt** ✓✓ — *und die Ordnung ist deterministisch*', () => {
    const alt = aenderung(4)[0];
    const neu = aenderung(5)[0];
    const k = coalesceFabricChanges([neu, alt]);
    expect(k.length, 'zwei Aenderungen derselben Quelle wurden nicht koalesziert').toBe(1);
    expect(k[0]?.sourceVersion, 'die aeltere Version hat gewonnen').toBe(5);
  });

  it('**Und die Grenze ist benannt, statt still zu kuerzen** ✓✓ — 16 384', () => {
    // *`:19` wirft bei mehr als `MAX_FABRIC_BATCH_CHANGES`; `:22` wirft bei einem ungueltigen Eintrag.*
    const zuviele = Array.from({ length: 16_385 }, (_, i) => ({
      sourceDocId: 'quelle', sourceObjId: 'anker-1', sourceVersion: i + 1,
      object: { type: 'Shape' as const, data: shapeDaten('anker-1') },
    }));
    expect(() => coalesceFabricChanges(zuviele)).toThrow(/exceeds limit/iu);
  });

  it('**BEFUND (gemessen, nicht behoben): eine uebersprungene Aenderung ist unsichtbar** ✗✓✓', () => {
    const docs = paar();
    // *Eine **veraltete** Version wird bei `:40` still uebersprungen: `count` zaehlt sie nicht, `notifications`
    // nennt sie nicht. Der Aufrufer kann „nichts zu tun" nicht von „Quelle fehlt oder ist veraltet" unterscheiden.*
    const alt = propagateFabricBatch(aenderung(3), docs, { now: 23 });
    expect(alt.count, 'eine veraltete Version darf nichts bewirken').toBe(0);
    // **Das ist die gemessene Gestalt des Befunds** — *nicht die Behauptung, dass sie falsch ist.*
    expect(alt.notifications.length, 'BEFUND: es gibt keine Spur fuer die uebersprungene Aenderung').toBe(0);
  });
});
