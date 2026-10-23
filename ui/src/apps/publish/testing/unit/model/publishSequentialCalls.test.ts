// STATUS: PLATIN — Publish: zwei Aufrufe in **derselben** Instanz (W-397, P1-Klasse)
//
// Der Grund fuer diese Datei ist eine gemessene Fehlerklasse aus einem anderen App-Bereich: eine Zustands-
// schicht hielt ihre Felder als **`const`-Kopie** des Zustands zum Konstruktionszeitpunkt. Jeder Aufruf rechnete
// gegen die veraltete Kopie und schrieb nur den neuen Wert zurueck. Zwei Aufrufe in derselben Instanz
// zerstoerten sich gegenseitig (`deleteFile` → `restore` warf, zwei Loeschungen behielten nur die zweite).
//
// Gemessenes Ergebnis fuer Publish: die Fehlerklasse tritt hier **nicht** auf, weil jede Operation aus dem
// uebergebenen Modell liest und ein **neues** Modell zurueckgibt (kein Zustand in einem Objekt). Diese Datei
// belegt das mit Aufrufen, die sich **akkumulieren** muessen — nicht mit Einzelaufrufen, die den Fehler
// verbergen. Ein Einzelaufruf-Test ist hier wertlos: nur die zweite Operation deckt eine veraltete Kopie auf.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import {
  addFrameToPublish, addPublishPage, duplicatePublishPage, estimateTextCapacity,
} from '../../../model/publishDocumentEngine';
import { removePublishFrame, setPublishFrameContent, updatePublishFrame } from '../../../model/publishFrameOps';
import { appendThreadFrame, linkPublishFrames, threadChain } from '../../../model/publishThreadOps';
import { createPublishHistory, pushPublishHistory, redoPublishHistory, undoPublishHistory } from '../../../history/publishHistoryEngine';
import { serializePublishPayload, deserializePublishPayload, verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';

describe('zwei Aufrufe in derselben Instanz — der Zustand akkumuliert', () => {
  it('zwei Rahmen nacheinander: beide sind da, nicht nur der letzte', () => {
    const project = createPublishProject({ pages: 1 });
    const once = addFrameToPublish(project, 'text', { content: 'erster', name: 'A' });
    const twice = addFrameToPublish(once, 'text', { content: 'zweiter', name: 'B' });
    // Der Vorgaengerfall haette hier nur einen Rahmen behalten.
    expect(twice.frames).toHaveLength(2);
    expect(twice.pages[0]!.frameIds).toHaveLength(2);
    expect(twice.frames.map(frame => frame.content).sort()).toEqual(['erster', 'zweiter']);
  });

  it('zwei Loeschungen nacheinander: beide Rahmen sind weg', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrames = ['A', 'B', 'C'].reduce((carry, name) => addFrameToPublish(carry, 'text', { content: name, name }), project);
    const [first, second, third] = withFrames.frames;
    const afterOne = removePublishFrame(withFrames, first!.id);
    const afterTwo = removePublishFrame(afterOne, second!.id);
    expect(afterTwo.frames.map(frame => frame.id)).toEqual([third!.id]);
    expect(afterTwo.pages[0]!.frameIds).toEqual([third!.id]);
  });

  it('zweimal Inhalt setzen: der zweite Text gewinnt und der Ueberlauf folgt ihm', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrame = addFrameToPublish(project, 'text', { content: 'kurz', name: 'A' });
    const frameId = withFrame.frames[0]!.id;
    const once = setPublishFrameContent(withFrame, frameId, 'x'.repeat(50_000));
    const twice = setPublishFrameContent(once, frameId, 'wieder kurz');
    expect(twice.frames[0]!.content).toBe('wieder kurz');
    // Der Ueberlaufzustand stammt aus dem **letzten** Aufruf, nicht aus dem ersten.
    expect(twice.frames[0]!.text!.overset).toBe(false);
  });

  it('zweimal patchen: beide Aenderungen bleiben erhalten', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrame = addFrameToPublish(project, 'text', { content: '', name: 'A' });
    const frameId = withFrame.frames[0]!.id;
    const once = updatePublishFrame(withFrame, frameId, { altText: 'Erster Text' });
    const twice = updatePublishFrame(once, frameId, { semanticRole: 'H2' });
    // Der Vorgaengerfall haette beim zweiten Aufruf den ersten Patch verloren.
    expect(twice.frames[0]!.altText).toBe('Erster Text');
    expect(twice.frames[0]!.semanticRole).toBe('H2');
  });

  it('zwei Seiten nacheinander anlegen: beide sind da', () => {
    const project = createPublishProject({ pages: 1 });
    const once = addPublishPage(project, project.geometry, 0);
    const twice = addPublishPage(once, project.geometry, once.activePageIndex);
    expect(twice.pages).toHaveLength(3);
  });

  it('duplizieren und dann erneut duplizieren: jede Kopie ist eigenstaendig', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrame = addFrameToPublish(project, 'text', { content: 'Original', name: 'A' });
    const once = duplicatePublishPage(withFrame, 0);
    const twice = duplicatePublishPage(once, 0);
    expect(twice.pages).toHaveLength(3);
    const ids = twice.pages.flatMap(page => page.frameIds);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('zweimal verketten: die Story waechst auf drei Rahmen', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrames = ['A', 'B', 'C'].reduce((carry, name) => addFrameToPublish(carry, 'text', { content: name.repeat(5), name }), project);
    const byName = (name: string) => withFrames.frames.find(frame => frame.name === name)!;
    const once = linkPublishFrames(withFrames, byName('A').id, byName('B').id);
    const twice = linkPublishFrames(once, byName('B').id, byName('C').id);
    expect(threadChain(twice, byName('A').id)).toHaveLength(3);
  });

  it('zweimal anhaengen: zwei neue Rahmen, kein verlorener', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrames = addFrameToPublish(project, 'text', { content: 'A'.repeat(900), name: 'A' });
    const anchor = withFrames.frames[0]!.id;
    const once = appendThreadFrame(withFrames, anchor);
    const twice = appendThreadFrame(once, anchor);
    const chain = threadChain(twice, anchor);
    expect(chain).toHaveLength(3);
    // Und der Text bleibt vollstaendig, egal wie oft angehaengt wird.
    expect(chain.reduce((sum, frame) => sum + frame.content.length, 0)).toBe(900);
  });

  it('zweimal rueckgaengig: der Zustand geht zwei Schritte zurueck', () => {
    let history = createPublishHistory(createPublishProject({ pages: 1 }));
    const first = addFrameToPublish(history.present, 'text', { content: 'A', name: 'A' });
    history = pushPublishHistory(history, first);
    const second = addFrameToPublish(history.present, 'text', { content: 'B', name: 'B' });
    history = pushPublishHistory(history, second);
    expect(history.present.frames).toHaveLength(2);
    const once = undoPublishHistory(history);
    const twice = undoPublishHistory(once);
    expect(once.present.frames).toHaveLength(1);
    expect(twice.present.frames).toHaveLength(0);
    // Und zweimal wiederherstellen kommt an denselben Punkt zurueck.
    const redoOnce = redoPublishHistory(twice);
    const redoTwice = redoPublishHistory(redoOnce);
    expect(redoTwice.present.frames).toHaveLength(2);
  });

  it('speichern und sofort wieder oeffnen: dieselben Nutzdaten', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrames = addFrameToPublish(project, 'text', { content: 'Bleibt erhalten', name: 'A' });
    const { reopened, diff, payloadBytes } = verifyPublishPayloadRoundtrip(withFrames, 1_000);
    expect(diff.identical).toBe(true);
    expect(diff.changed).toEqual([]);
    expect(reopened.frames[0]!.content).toBe('Bleibt erhalten');
    expect(payloadBytes).toBeGreaterThan(100);
  });

  it('zweimal serialisieren und lesen: stabil und verlustfrei', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrames = addFrameToPublish(project, 'text', { content: 'X'.repeat(400), name: 'A' });
    const first = deserializePublishPayload(serializePublishPayload(withFrames));
    const second = deserializePublishPayload(serializePublishPayload(first));
    expect(serializePublishPayload(second)).toBe(serializePublishPayload(first));
  });

  it('Text setzen, dann anhaengen: der Ueberlauf wird tatsaechlich aufgeloest', () => {
    // Die Kette der beiden Aufrufe ist der eigentliche Test: erst Ueberlauf erzeugen, dann Platz schaffen.
    const project = createPublishProject({ pages: 2 });
    const withFrame = addFrameToPublish(project, 'text', { content: '', name: 'A' });
    const frameId = withFrame.frames[0]!.id;
    const overflowing = setPublishFrameContent(withFrame, frameId, 'y'.repeat(estimateTextCapacity(withFrame.frames[0]!) * 3));
    expect(overflowing.frames[0]!.text!.overset).toBe(true);
    const grown = appendThreadFrame(overflowing, frameId);
    expect(threadChain(grown, frameId)).toHaveLength(2);
    // Der neue Rahmen nimmt einen Teil auf, der Rest bleibt als Ueberlauf im ersten.
    const chain = threadChain(grown, frameId);
    expect(chain[1]!.content.length).toBeGreaterThan(0);
    expect(chain.reduce((sum, frame) => sum + frame.content.length, 0)).toBe(overflowing.frames[0]!.content.length);
  });
});
