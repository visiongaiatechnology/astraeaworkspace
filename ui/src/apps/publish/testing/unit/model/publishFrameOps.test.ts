// STATUS: PLATIN -- Publish: Rahmen mit der Tastatur praezise nachjustieren
//
// Der Punkt lautet: "Ausgewaehlten Rahmen per Tastatur praezise nachjustieren." Vorher gab es keinen
// Tastaturpfad: `moveResizeFrame` existierte, aber niemand rief es aus einem Tastenereignis auf. Die
// Tastenabsicht ist eine reine Funktion, damit sie ohne DOM pruefbar ist.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_NUDGE_COARSE_MM, PUBLISH_NUDGE_STEP_MM, nudgeDelta, nudgePublishFrame, removePublishFrame,
  resolvePublishKeyIntent, selectPublishFrame, setPublishFrameContent, updatePublishFrame,
} from '../../../model/publishFrameOps';
import { linkPublishFrames } from '../../../model/publishThreadOps';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

function projectWithTextFrame(content = 'Astraea') {
  const project = createPublishProject({ pages: 2 });
  const model = addFrameToPublish(project, 'text', { content, name: 'Story', xMm: 20, yMm: 40, widthMm: 80, heightMm: 50 });
  return { model, frameId: model.selectedFrameId! };
}

describe('resolvePublishKeyIntent -- was eine Taste bedeutet und was nicht', () => {
  it('bewegt mit den Pfeiltasten, fein ohne und grob mit Umschalt', () => {
    expect(resolvePublishKeyIntent({ key: 'ArrowLeft' })).toEqual({ kind: 'nudge', direction: 'left', coarse: false });
    expect(resolvePublishKeyIntent({ key: 'ArrowDown', shiftKey: true })).toEqual({ kind: 'nudge', direction: 'down', coarse: true });
  });

  it('loescht mit Entf und Backspace und hebt mit Escape die Auswahl auf', () => {
    expect(resolvePublishKeyIntent({ key: 'Delete' })).toEqual({ kind: 'delete-frame' });
    expect(resolvePublishKeyIntent({ key: 'Backspace' })).toEqual({ kind: 'delete-frame' });
    expect(resolvePublishKeyIntent({ key: 'Escape' })).toEqual({ kind: 'deselect' });
  });

  it('laesst Tippen in einem Eingabefeld unangetastet', () => {
    // Der wichtigere Teil des Vertrags: ein globaler Handler, der jede Pfeiltaste schluckt, macht das
    // Tippen im Textrahmen unmoeglich.
    expect(resolvePublishKeyIntent({ key: 'ArrowLeft', editingText: true })).toBeNull();
    expect(resolvePublishKeyIntent({ key: 'Backspace', editingText: true })).toBeNull();
    expect(resolvePublishKeyIntent({ key: 'Delete', editingText: true })).toBeNull();
    expect(resolvePublishKeyIntent({ key: 'ArrowDown', editingText: true, shiftKey: true })).toBeNull();
    // Ausser Strg/Cmd wird gehalten: das ist die Ebene der Anwendung.
    expect(resolvePublishKeyIntent({ key: 'ArrowRight', editingText: true, ctrlKey: true })).toEqual({ kind: 'nudge', direction: 'right', coarse: false });
  });

  it('ueberlaesst unbekannte Tasten dem Rest der Anwendung', () => {
    expect(resolvePublishKeyIntent({ key: 'a' })).toBeNull();
    expect(resolvePublishKeyIntent({ key: 'F5' })).toBeNull();
  });
});

describe('nudgeDelta', () => {
  it('nennt 0,1 mm fein und 10 mm grob', () => {
    expect(PUBLISH_NUDGE_STEP_MM).toBe(0.1);
    expect(PUBLISH_NUDGE_COARSE_MM).toBe(10);
    expect(nudgeDelta('left')).toEqual({ dxMm: -0.1, dyMm: 0 });
    expect(nudgeDelta('down', true)).toEqual({ dxMm: 0, dyMm: 10 });
  });
});

describe('nudgePublishFrame', () => {
  it('verschiebt um genau einen feinen Schritt, ohne am Raster haengenzubleiben', () => {
    const { model, frameId } = projectWithTextFrame();
    const before = model.frames[0]!;
    const next = nudgePublishFrame(model, frameId, 'right');
    const after = next.frames[0]!;
    // Die entscheidende Messung: mit aktivem Fang rastete 0,1 mm auf die naechste Hilfslinie ein und der
    // Rahmen bewegte sich scheinbar gar nicht. Die Differenz wird auf 4 Stellen geprueft, weil 20 + 0.1 in
    // Gleitkomma nicht exakt 20.1 ergibt.
    expect(Number((after.xMm - before.xMm).toFixed(4))).toBe(PUBLISH_NUDGE_STEP_MM);
    expect(after.yMm).toBe(before.yMm);
    expect(next.revision).toBe(model.revision + 1);
  });

  it('verschiebt mit coarse um 10 mm', () => {
    const { model, frameId } = projectWithTextFrame();
    const after = nudgePublishFrame(model, frameId, 'up', true).frames[0]!;
    expect(Number((after.yMm - model.frames[0]!.yMm).toFixed(4))).toBe(-PUBLISH_NUDGE_COARSE_MM);
  });

  it('weigert sich bei einem gesperrten Rahmen und nennt den Grund', () => {
    const { model, frameId } = projectWithTextFrame();
    const locked = updatePublishFrame(model, frameId, { locked: true });
    expect(codes(() => nudgePublishFrame(locked, frameId, 'left'))).toBe('frame-locked');
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = projectWithTextFrame();
    expect(codes(() => nudgePublishFrame(model, 'frame-nope', 'left'))).toBe('frame-missing');
  });
});

describe('setPublishFrameContent -- die einzige Stelle, die Inhalt schreibt', () => {
  it('setzt Inhalt und berechnet den Ueberlauf neu', () => {
    const { model, frameId } = projectWithTextFrame('kurz');
    expect(model.frames[0]!.text!.overset).toBe(false);
    const overflowing = setPublishFrameContent(model, frameId, 'x'.repeat(50_000));
    expect(overflowing.frames[0]!.text!.overset).toBe(true);
    expect(overflowing.frames[0]!.content).toHaveLength(50_000);
    // Gegenprobe: wieder hineinpassender Text nimmt die Ueberlaufmarke zurueck.
    const resolved = setPublishFrameContent(overflowing, frameId, 'ok');
    expect(resolved.frames[0]!.text!.overset).toBe(false);
  });

  it('lehnt Text ueber der Grenze ab, statt ihn zu kuerzen', () => {
    const { model, frameId } = projectWithTextFrame();
    expect(codes(() => setPublishFrameContent(model, frameId, 'x'.repeat(8_000_001)))).toBe('frame-text-boundary');
  });

  it('lehnt einen Bildrahmen ab', () => {
    const project = createPublishProject({ pages: 1 });
    const model = addFrameToPublish(project, 'image', { name: 'Bild' });
    expect(codes(() => setPublishFrameContent(model, model.selectedFrameId!, 'text'))).toBe('frame-not-text');
  });
});

describe('removePublishFrame', () => {
  it('entfernt den Rahmen aus dem Dokument und aus der Seite', () => {
    const { model, frameId } = projectWithTextFrame();
    const next = removePublishFrame(model, frameId);
    expect(next.frames).toHaveLength(0);
    expect(next.pages[0]!.frameIds).toEqual([]);
    expect(next.selectedFrameId).toBeNull();
  });

  it('haengt eine geloeschte Mitte nicht ab: Vorgaenger zeigt auf Nachfolger', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrames = ['A', 'B', 'C'].reduce((carry, name) => addFrameToPublish(carry, 'text', { content: name.repeat(200), name }), project);
    /** Nach Namen suchen, **nicht** nach Array-Position: `page.frameIds` ordnet die Rahmen um. */
    const byName = (name: string) => withFrames.frames.find(frame => frame.name === name)!;
    const first = byName('A'); const middle = byName('B'); const third = byName('C');
    const linked = linkPublishFrames(linkPublishFrames(withFrames, first.id, middle.id), middle.id, third.id);
    const beforeDelete = linked.frames.reduce((sum, frame) => sum + frame.content.length, 0);
    const removed = removePublishFrame(linked, middle.id);
    const head = removed.frames.find(frame => frame.id === first.id)!;
    const tail = removed.frames.find(frame => frame.id === third.id)!;
    // Die Kette ist repariert: A zeigt auf C und C zurueck auf A.
    expect(head.text!.nextFrameId).toBe(third.id);
    expect(tail.text!.previousFrameId).toBe(first.id);
    /**
     * Kein Zeichen entsteht neu, keines der verbliebenen geht verloren.
     *
     * Der Text der **geloeschten** Mitte verschwindet mit ihr — das ist die Absicht des Nutzers. Die Zusage
     * "der Umfluss verliert oder erfindet nichts" prueft `reflowAllTextThreads` bei jedem Aufruf selbst
     * (Bilanz pro Kette) und wirft sonst.
     */
    const afterDelete = head.content.length + tail.content.length;
    expect(afterDelete).toBeLessThanOrEqual(beforeDelete);
    expect(afterDelete).toBeGreaterThanOrEqual(200);
    expect(head.text!.overset).toBe(false);
  });

  it('laesst bei einem unverbundenen Rahmen den Text der anderen in Ruhe', () => {
    // Ein Umfluss ueber alle Kopfrahmen fasste zuvor voellig getrennte Texte als eine Story zusammen.
    const project = createPublishProject({ pages: 2 });
    const model = addFrameToPublish(project, 'text', { content: 'A', name: 'A' });
    const twoFrames = addFrameToPublish(model, 'text', { content: 'B', name: 'B' });
    const removed = removePublishFrame(twoFrames, twoFrames.frames[1]!.id);
    expect(removed.frames.reduce((sum, frame) => sum + frame.content.length, 0)).toBe(1);
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = projectWithTextFrame();
    expect(codes(() => removePublishFrame(model, 'frame-nope'))).toBe('frame-missing');
  });
});

describe('updatePublishFrame -- id, pageId und pageIndex gehoeren dem Dokument', () => {
  it('aendert erlaubte Felder', () => {
    const { model, frameId } = projectWithTextFrame();
    const next = updatePublishFrame(model, frameId, { altText: 'Ein Diagramm', semanticRole: 'Figure' });
    expect(next.frames[0]!.altText).toBe('Ein Diagramm');
    expect(next.frames[0]!.semanticRole).toBe('Figure');
  });

  it('kann die Seitenzugehoerigkeit nicht zerreissen', () => {
    const { model, frameId } = projectWithTextFrame();
    const next = updatePublishFrame(model, frameId, { pageId: 'page-does-not-exist', pageIndex: 99 } as never);
    expect(next.frames[0]!.pageId).toBe(model.pages[0]!.id);
    expect(next.frames[0]!.pageIndex).toBe(0);
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = projectWithTextFrame();
    expect(codes(() => updatePublishFrame(model, 'frame-nope', { locked: true }))).toBe('frame-missing');
  });
});

describe('selectPublishFrame', () => {
  it('waehlt aus und ab', () => {
    const { model, frameId } = projectWithTextFrame();
    expect(selectPublishFrame(model, null).selectedFrameId).toBeNull();
    expect(selectPublishFrame(model, frameId).selectedFrameId).toBe(frameId);
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = projectWithTextFrame();
    expect(codes(() => selectPublishFrame(model, 'frame-nope'))).toBe('frame-missing');
  });
});
