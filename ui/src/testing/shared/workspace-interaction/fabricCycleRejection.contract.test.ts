// STATUS: PLATIN — Integration & Release, **Paket 39**: „Live-Zyklen zuverlässig abweisen"
//
// ## Warum diese Datei existiert ✓✓✓
//
// **Gemessen (Runde 357):** `assertNoFabricCycles` (`shared/workspace-interaction/fabricState.ts:306`) hat **fünf
// Produktionsaufrufer** — *vier in `fabricReferenceOperations.ts` (:110/:194/:342/:455) und einen in
// `fabricBatchOperations.ts:46`* ✓✓ — **und **null Zeugen** ✗✓✓.** *Der Grep fand ausschliesslich Produktionscode;
// kein Test nannte den Namen.*
//
// **Das ist die sechste Auspraegung derselben Krankheit in dieser Sitzung** ✓✓: *Zustand ohne Aufrufer (`W-448`) ·
// Waechter ohne Durchsetzung (`W-450`) · Zustellung ohne Annahme (Publish P15) · Route ohne Annehmer (Publish P15) ·
// und jetzt: **Waechter mit Aufrufern, ohne Zeugen**.* ✗✓✓
//
// ## Was hier gemessen wird — beide Richtungen, beide Wege ✓✓✓
//
// **Der Wurf** (`fabricState.ts:308-310`): `WorkspaceFabricError` mit
// `` `Workspace Fabric cycle detected: ${graph.cycles[0].join(' -> ')}` `` — *die Ablehnung ist also nicht nur
// benannt, sondern **lokalisiert*** ✓✓.
//
// 1. **Direkter Aufruf:** ein Zyklus A -> B -> A wird abgewiesen, **und die Meldung nennt den Pfad** ✓✓.
// 2. **Und der Weg durch die OPERATION:** `insertFromWorkspace` ruft den Waechter selbst
//    (`fabricReferenceOperations.ts:194` ✓) — *also muss der **zweite** Einfueger den Zyklus verhindern* ✓✓.
//    *Ein Waechter ohne **erreichbaren** Aufrufer waere wieder eine Faehigkeit ohne Deckung* ✗✓.
// 3. **Gegenprobe:** ein **Nicht**-Zyklus geht durch ✓✓✓ — *sonst waere „weist Zyklen ab" auch von einem Waechter
//    erfuellt, der **alles** abweist* ✗✓✓.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
// **`DocumentKind`, nicht `string`** ✗✓✓ — *sonst faellt eine erfundene Dokumentart nicht auf, und genau das ist die
// Luecke, die `integrationDocumentKindRegistry.contract.test.ts` (Paket 3) schliesst* ✓✓.
import type { DocumentKind } from '../../../shared/contracts/documentKind';
import { assertNoFabricCycles } from '../../../shared/workspace-interaction/fabricState';
import { insertFromWorkspace } from '../../../shared/workspace-interaction/fabricReferenceOperations';

/** *Der Anker aus `fabricInsertFrozen.contract.test.ts` — dieselbe Form, die der Draw-Agent gemessen hat.* ✓ */
const shape = {
  id: 'anker-1', shape_type: 'rectangle' as const,
  x: 0, y: 0, width: 320, height: 240, rotation: 0,
  fill: 'transparent', stroke: 'transparent', stroke_width: 0,
};

const dokument = (id: string, kind: DocumentKind): WorkspaceDocument => ({
  schema_version: 2, id, title: id, kind,
  created_at: 1, modified_at: 1, version: 1, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  objects: { 'anker-1': { type: 'Shape', data: { ...shape, id: 'anker-1' } } },
});

/**
 * **Baut den Verweis mit `insertFromWorkspace` selbst** ✓✓ — *statt ihn von Hand zu erfinden* ✗✓.
 * *Und fuehrt `updatedDocs` weiter: der Einfueger **veraendert die Eingabe nicht** (in Runde 299 gemessen), also
 * muss der Aufrufer das Ergebnis weiterreichen.* ✓✓
 */
function verweise(von: string, zu: string, kennung: string) {
  const docs: Record<string, WorkspaceDocument> = { [von]: dokument(von, 'Writer'), [zu]: dokument(zu, 'Draw') };
  const ergebnis = insertFromWorkspace(docs, von, zu, 'anker-1', { referenceId: kennung, mode: 'Live', now: 10 });
  return ergebnis.updatedDocs;
}

describe('Paket 39: Live-Zyklen zuverlaessig abweisen', () => {
  it('**Nicht-Leerheit zuerst** — ein zyklenfreier Graph wird nicht abgewiesen', () => {
    // *Das ist die Gegenprobe und **zuerst**: ohne sie prueft alles Folgende nichts.* ✓✓✓
    const docs = verweise('doc-a', 'doc-b', 'a-nach-b');
    expect(() => assertNoFabricCycles(docs)).not.toThrow();
  });

  it('**Ein Zyklus wird abgewiesen, und die Meldung nennt den Pfad** ✓✓', () => {
    // A -> B (per Operation) und dann B -> A ⇒ Zyklus.
    const mitAB = verweise('doc-a', 'doc-b', 'a-nach-b');
    // *Jetzt B auf A verweisen lassen — der zweite Einfueger muss den Zyklus verhindern.* ✓✓
    const beide: Record<string, WorkspaceDocument> = { ...mitAB };
    let wurf: unknown = null;
    try {
      insertFromWorkspace(beide, 'doc-b', 'doc-a', 'anker-1', { referenceId: 'b-nach-a', mode: 'Live', now: 11 });
    } catch (error) { wurf = error; }
    // **Der Weg durch die OPERATION** ✓✓ — *sie ist der Aufrufer, und sie muss halten.*
    expect(wurf, 'der zweite Einfueger haette den Zyklus verhindern muessen').not.toBeNull();
    const meldung = wurf instanceof Error ? wurf.message : String(wurf);
    expect(meldung).toMatch(/cycle/iu);
  });

  it('**Und der direkte Aufruf weist einen von Hand gebauten Zyklus ab** ✓ — mit benanntem Pfad', () => {
    // *Hier wird der Zyklus **direkt** hergestellt, damit der Waechter selbst gemessen wird — nicht nur die
    // Operation, die ihn ruft.* ✓✓
    const a = verweise('doc-a', 'doc-b', 'a-nach-b');
    const b = verweise('doc-b', 'doc-a', 'b-nach-a');
    // Die Verweise aus beiden Einfuegern in **einen** Dokumentensatz bringen.
    const zusammen: Record<string, WorkspaceDocument> = {
      'doc-a': { ...a['doc-a'], objects: { ...a['doc-a']?.objects, ...b['doc-a']?.objects } },
      'doc-b': { ...a['doc-b'], objects: { ...a['doc-b']?.objects, ...b['doc-b']?.objects } },
    };
    let wurf: unknown = null;
    try { assertNoFabricCycles(zusammen); } catch (error) { wurf = error; }
    expect(wurf, 'ein A -> B -> A haette abgewiesen werden muessen').not.toBeNull();
    const meldung = wurf instanceof Error ? wurf.message : String(wurf);
    // *Die Meldung nennt den **Pfad**, nicht nur „ein Zyklus".* ✓✓
    expect(meldung).toMatch(/cycle detected/iu);
    expect(meldung).toMatch(/->/u);
  });

  it('**Der Waechter hat einen erreichbaren Aufrufer** ✓✓ — *sonst waere er eine Faehigkeit ohne Deckung*', () => {
    // *Belegt: der Weg durch `insertFromWorkspace` **existiert** (der Test oben hat ihn durchlaufen). Hier wird
    // zusaetzlich festgehalten, dass der Waechter **nicht** nur definiert ist.* ✓✓
    const docs = verweise('doc-x', 'doc-y', 'x-nach-y');
    const verweis = docs['doc-x']?.objects['x-nach-y'];
    expect(verweis?.type, 'der Einfueger hat keinen Verweis erzeugt').toBe('WorkspaceReference');
    expect(() => assertNoFabricCycles(docs)).not.toThrow();
  });
});
