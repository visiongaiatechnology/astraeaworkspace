// STATUS: PLATIN — Integration & Release, **Paket 23**: die **erste Nicht-Grid-Route** der Sitzung ✓✓
//
// ## Warum diese Datei existiert ✓✓
//
// In Runde 285 habe ich `Draw → Present` über `'Shape'` **eingetragen** (`exports` bei Draw ✓, `imports` + Adapter
// bei Present ✓) — *und **nichts** hat bewiesen, dass die Route **durchläuft*** ✗✓. **Nach meiner eigenen Regel
// gehört der Zeuge *vor* die Behauptung** ✓✓ — *und genau in dieser Prüfschicht habe ich in Runde 283 zwei Runden
// lang eine **falsche** Aussage getragen* ✗✓. **Also misst diese Datei die Fahrt, nicht die Eintragung.** ✓
//
// ## Was hier gemessen wird ✓✓
//
// 1. **Der Erzeuger liefert einen Träger aus Draw** ✓✓ — *vor Runde 282 gab er für **jede** Draw-Quelle `null`* ✗✓
//    (`fabricGraphWorkspaceDrop.ts:175` war eine **zweite Liste** neben der Matrix ✗).
// 2. **Der Träger ist eine Referenz** ✓ — *er nennt `documentId` **und** `objectId = Anker`* ✓✓ (*„Quelle bleibt
//    identifizierbar"* ✓) und trägt **keine** Zeichnungsdaten ✗.
// 3. **Genau eine Absicht** ✓ → `accepted` ✓ (*`needsChoice` bräuchte zwei* ✗) — *weil Draw **nur**
//    `LIVE_REFERENCE` anbietet* ✓ (*„eine Kopie des Ankers wäre ein **unsichtbares Rechteck**"* ✓✓).
// 4. **Live ⇒ Modus ist Pflicht** ✓✓ — *ohne ihn `drop_live_mode_required`* ✓, **benannt** ✓, *kein heimlicher
//    Default* ✗✓; **mit** gesagtem Modus stellt dieselbe Route zu ✓✓.
// 5. **Und `COPY` ist benannt abgelehnt** ✓ — *Draw bietet es nicht an, also gibt es die Route nicht* ✗✓.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import {
  assessFabricWorkspaceDrop,
  createFabricWorkspaceObjectDragPayload,
  resolveFabricWorkspaceDrop,
} from '../../shell/fabric/fabricGraphWorkspaceDrop';

/** **Der kanonische WOM-Anker**, den `drawWorkspaceIntegration.ts:96-111` schreibt ✓ — *gemessen vom Draw-Agenten* ✓. */
const draw: WorkspaceDocument = {
  schema_version: 2, id: 'draw-quelle', title: 'Zeichnung', kind: 'Draw',
  created_at: 1, modified_at: 1, version: 5, theme_id: 'cosmic-obsidian',
  root_object_ids: ['anker-1'],
  // **Der Anker trägt nur die Rahmenmaße als Platzhalter** ✓✓ — *die Zeichnung selbst bleibt in `drawData`* ✓
  // (*so beschreibt es der Draw-Agent, und die Feldliste ist aus `ShapeObject` **gelesen**, nicht geraten* ✓✓:
  // `shared/contracts/visualization/workspaceShapesChartsCore.ts:3-15` ✓). **Transparent und `stroke_width: 0`** ✓✓
  // — *genau deshalb ist eine **Kopie** des Ankers „ein unsichtbares Rechteck"* ✓ (Draw bietet `COPY` nicht an ✓).
  objects: {
    'anker-1': {
      type: 'Shape',
      data: {
        id: 'anker-1', shape_type: 'rectangle',
        x: 0, y: 0, width: 320, height: 240, rotation: 0,
        fill: 'transparent', stroke: 'transparent', stroke_width: 0,
      },
    },
  },
};

const present: WorkspaceDocument = {
  schema_version: 2, id: 'present-ziel', title: 'Deck', kind: 'Present',
  created_at: 1, modified_at: 1, version: 4, theme_id: 'cosmic-obsidian',
  root_object_ids: [], objects: {},
};

const documents = { [draw.id]: draw, [present.id]: present };

function traeger(): string {
  const anker = draw.objects['anker-1'];
  if (!anker) throw new Error('Fixture-Anker fehlt');
  const payload = createFabricWorkspaceObjectDragPayload(draw, anker);
  if (!payload) throw new Error('Der Erzeuger lieferte keinen Träger aus Draw');
  return payload;
}

describe('Paket 23: Draw → Present über `Shape` — die erste Nicht-Grid-Route', () => {
  it('**Der Erzeuger liefert einen Träger aus Draw** ✓✓ — die Grid-Sperre ist weg', () => {
    // *Vor Runde 282 war dies `null` — für **jede** Draw-Quelle* ✗✓ (*die Zeile `kind !== 'Grid'` ✗*).
    const payload = traeger();
    expect(payload.length).toBeGreaterThan(0);
    // **Eine Referenz, kein Inhalt** ✓✓: *der Träger nennt Dokument, Objekt, Art und App — **nicht** die Zeichnung* ✓.
    expect(payload).toContain('draw-quelle');
    expect(payload).toContain('anker-1');
    expect(payload).toContain('Shape');
    expect(payload).toContain('Draw');
    expect(payload, 'Zeichnungsdaten dürfen nicht mitfahren').not.toContain('shape_type');
  });

  it('**Genau eine Absicht** ✓ → `accepted` (*nicht* `needsChoice`)', () => {
    // *Draw bietet nur `LIVE_REFERENCE` an; der Schnitt aus Quelle ∩ Ziel ∩ Adapter ist damit **eine** Absicht* ✓✓.
    const frage = assessFabricWorkspaceDrop(traeger(), present.id, documents, { effect: 'Allow' });
    expect(frage.status).toBe('accepted');
    if (frage.status === 'accepted') {
      expect(frage.selection.intent).toBe('LIVE_REFERENCE');
      expect(frage.selection.adapterId).toBe('fabric-draw-shape-to-present');
      expect(frage.selection.integrationKind).toBe('live');
      // **Und ohne gesagten Modus trägt die Auswahl keinen** ✓✓ — *abwesend, nicht `undefined`* ✓.
      expect(Object.hasOwn(frage.selection, 'mode')).toBe(false);
    }
  });

  it('**Live ⇒ Modus ist Pflicht** ✓✓ — benannt, kein heimlicher Default', () => {
    const ohneModus = resolveFabricWorkspaceDrop(traeger(), present.id, documents, 'LIVE_REFERENCE', undefined, { effect: 'Allow' });
    expect(ohneModus.status).toBe('rejected');
    if (ohneModus.status === 'rejected') expect(ohneModus.code).toBe('drop_live_mode_required');
  });

  it('**Mit gesagtem Modus stellt dieselbe Route zu** ✓✓ — mit Art, Modus und beiden Versionen', () => {
    const zustellung = resolveFabricWorkspaceDrop(traeger(), present.id, documents, 'LIVE_REFERENCE', 'Live', { effect: 'Allow' });
    expect(zustellung.status).toBe('resolved');
    if (zustellung.status === 'resolved') {
      expect(zustellung.selection.adapterId).toBe('fabric-draw-shape-to-present');
      expect(zustellung.selection.integrationKind).toBe('live');
      expect(zustellung.selection.mode).toBe('Live');
      expect(zustellung.sourceVersion).toBe(5);
      expect(zustellung.targetVersion).toBe(4);
    }
    // **Und `Frozen` ist ebenso wählbar** ✓ — *zwei Modi, keine Vorauswahl* ✓.
    const frozen = resolveFabricWorkspaceDrop(traeger(), present.id, documents, 'LIVE_REFERENCE', 'Frozen', { effect: 'Allow' });
    expect(frozen.status).toBe('resolved');
    if (frozen.status === 'resolved') expect(frozen.selection.mode).toBe('Frozen');
  });

  it('**`COPY` ist benannt abgelehnt** ✓✓ — Draw bietet es nicht an, also gibt es die Route nicht', () => {
    // *Ein Adapter, der eine Absicht anbietet, die die **Quelle** nicht hat, wäre ein Versprechen ohne Fähigkeit* ✗✓.
    const copy = resolveFabricWorkspaceDrop(traeger(), present.id, documents, 'COPY', undefined, { effect: 'Allow' });
    expect(copy.status).toBe('rejected');
    // **Der Grund ist die fehlende Absicht**, nicht eine fehlende Route ✓✓ (*sie fehlt in **beiden** Seiten → 
    // `selectedIntents.length === 0` → `drop_intent_not_supported`* ✓).
    if (copy.status === 'rejected') expect(copy.code).toBe('drop_intent_not_supported');
  });
});
