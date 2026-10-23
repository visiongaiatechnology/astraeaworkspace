// STATUS: PLATIN — Integration & Release, **Paket 37**: Freeze eines Live-Objekts
//
// ## Warum diese Datei existiert ✓✓✓
//
// **Gemessen (Runde 383):** `setReference` (`shared/workspace-interaction/fabricState.ts:84`) hatte **keinen**
// Zeugen — *der Grep fand nur **meinen eigenen** Kommentar.* Und Runde 388 hat den **Waechter** gefunden, der die
// Zusage haelt: `platform/workspace/model/workspaceObjectModelValidation.ts:395` —
// *„Live WorkspaceReference may not carry an implicit source snapshot"* ✓✓.
//
// ## Und meine eigene Vermutung war FALSCH ✗✓✓ — *und ich habe sie nicht behauptet*
//
// *In Runde 387 habe ich gelesen, dass `setReference` `...data` spreizt (`:92-98`) und **nur** `common.ownership`
// setzt — also schloss ich: „das Auftauen laesst den Schnappschuss stehen".* ✗✓
// **Die Messung in Runde 388 hat es widerlegt ✓✓:** *die Validierung **faengt** genau diesen Fall (`:395`), und
// `fabricReferenceOperations.ts` raeumt an **vier** Stellen mit demselben Ausdruck auf (`:95/97`, **`:158/160/166`**
// — *der Einfueger, also mein `Frozen`-Fix*, `:326/328/334`, `:421/423`).*
// **Die Regel, die beides entschieden hat:** *„einen Anker zu **finden** ist nicht dasselbe, wie ihn **zu Ende**
// zu pruefen"* ✓✓ — *zweimal angewandt, einmal bestaetigt (`W-455`), einmal widerlegt (hier), **beide Male richtig
// behandelt**.*
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { DocumentKind } from '../../../shared/contracts/documentKind';
import { setReference } from '../../../shared/workspace-interaction/fabricState';
import { insertFromWorkspace } from '../../../shared/workspace-interaction/fabricReferenceOperations';
import { validateTypedObject } from '../../../platform/workspace/model/workspaceObjectModelValidation';

const shapeDaten = (id: string) => ({
  id, shape_type: 'rectangle' as const,
  x: 0, y: 0, width: 320, height: 240, rotation: 0,
  fill: 'transparent', stroke: 'transparent', stroke_width: 0,
});

const dokument = (id: string, kind: DocumentKind): WorkspaceDocument => ({
  schema_version: 2, id, title: id, kind,
  created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  objects: { 'anker-1': { type: 'Shape', data: shapeDaten('anker-1') } },
});

/** *Der **Live**-Verweis, gebaut mit `insertFromWorkspace` — dieselbe Form wie mein Zeuge aus Runde 299.* ✓✓ */
function liveVerweis() {
  const docs: Record<string, WorkspaceDocument> = { quelle: dokument('quelle', 'Draw'), ziel: dokument('ziel', 'Writer') };
  const e = insertFromWorkspace(docs, 'ziel', 'quelle', 'anker-1', { referenceId: 'verweis-1', mode: 'Live', now: 10 });
  const ziel = e.updatedDocs['ziel'];
  if (!ziel) throw new Error('Fixture: Zieldokument fehlt');
  const obj = ziel.objects['verweis-1'];
  if (!obj || obj.type !== 'WorkspaceReference') throw new Error('Fixture: Verweis fehlt');
  return { ziel, daten: obj.data };
}

describe('Paket 37: Freeze eines Live-Objekts', () => {
  it('**Nicht-Leerheit zuerst** — der Live-Verweis traegt KEINEN Schnappschuss ✓✓', () => {
    const { daten } = liveVerweis();
    expect(daten.mode).toBe('Live');
    expect(daten.cached_snapshot, 'ein Live-Verweis darf keinen Schnappschuss tragen').toBeUndefined();
  });

  it('**① Einfrieren: der Stand faehrt mit, und die Eigentuemerschaft folgt dem Modus** ✓✓', () => {
    const { ziel, daten } = liveVerweis();
    const gefroren = setReference(ziel, 'verweis-1', {
      ...daten, mode: 'Frozen',
      cached_snapshot: { type: 'Shape', data: shapeDaten('anker-1') },
      fallback_snapshot: { type: 'Shape', data: shapeDaten('anker-1') },
      fallback_policy: 'allowed', frozen_at: 20,
    }, 20);
    const obj = gefroren.objects['verweis-1'];
    const d = obj?.type === 'WorkspaceReference' ? obj.data : undefined;
    expect(d?.cached_snapshot, 'der eingefrorene Stand fehlt').toBeDefined();
    expect(d?.fallback_policy).toBe('allowed');
    expect(d?.frozen_at).toBe(20);
    // *Die eine Regel, die `setReference` selbst setzt (`fabricState.ts:96`).* ✓✓
    expect(d?.common?.ownership, 'Frozen verlangt ExternalFrozen').toBe('ExternalFrozen');
    // *Und der eingefrorene Verweis besteht die Pruefung.* ✓✓
    expect(() => validateTypedObject('verweis-1', obj)).not.toThrow();
  });

  it('**② Auftauen: der Schnappschuss ist WEG, und die Eigentuemerschaft wechselt zurueck** ✓✓✓', () => {
    const { ziel, daten } = liveVerweis();
    const gefroren = setReference(ziel, 'verweis-1', {
      ...daten, mode: 'Frozen',
      cached_snapshot: { type: 'Shape', data: shapeDaten('anker-1') },
      fallback_snapshot: { type: 'Shape', data: shapeDaten('anker-1') },
      fallback_policy: 'allowed', frozen_at: 20,
    }, 20);
    const wiederLive = setReference(gefroren, 'verweis-1', {
      ...daten, mode: 'Live',
      cached_snapshot: undefined, fallback_snapshot: undefined, fallback_policy: 'forbidden', frozen_at: undefined,
    }, 30);
    const obj = wiederLive.objects['verweis-1'];
    const d = obj?.type === 'WorkspaceReference' ? obj.data : undefined;
    expect(d?.mode).toBe('Live');
    expect(d?.cached_snapshot, 'der Schnappschuss muss beim Auftauen verschwinden').toBeUndefined();
    expect(d?.frozen_at).toBeUndefined();
    expect(d?.common?.ownership).toBe('ExternalLive');
    expect(() => validateTypedObject('verweis-1', obj)).not.toThrow();
  });

  it('**③ UND DIE NEGATIVE: ein Live-Verweis MIT Schnappschuss kann gar nicht entstehen** ✓✓✓', () => {
    // *Das ist der staerkste Teil — er bezeugt den **Waechter**, nicht nur das Verhalten.*
    // **Eigene Korrektur, gemessen ✗✓✓:** *ich hatte die Ablehnung bei `validateTypedObject` erwartet — sie kommt
    // aber **frueher**, naemlich **in `setReference` selbst** (`fabricState.ts:104` ruft
    // `validateWorkspaceDocumentInvariants(next, …)`).* **Das ist die staerkere Aussage:** *das widerspruechliche
    // Objekt **entsteht nicht**, statt spaeter aufzufallen.*
    // `workspaceObjectModelValidation.ts:395`:
    //   mode === 'Live' && cached_snapshot !== undefined && explicitSnapshot !== true
    //     => 'Live WorkspaceReference may not carry an implicit source snapshot'
    const { ziel, daten } = liveVerweis();
    expect(
      () => setReference(ziel, 'verweis-1', { ...daten, mode: 'Live', cached_snapshot: { type: 'Shape', data: shapeDaten('anker-1') } }, 40),
      'ein Live-Verweis mit Schnappschuss muss schon beim Schreiben abgelehnt werden',
    ).toThrow(/implicit source snapshot/iu);
  });
});
