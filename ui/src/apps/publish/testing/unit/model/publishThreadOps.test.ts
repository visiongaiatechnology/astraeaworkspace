// STATUS: PLATIN -- Publish: Story ueber verbundene Textrahmen und mehrere Seiten
//
// Die Punkte lauten: "Story ueber verbundene Textrahmen und mehrere Seiten fortsetzen" und "Overset-Text
// anzeigen, neuen Rahmen anhaengen und Overflow aufloesen". Vorher waren `threadTextFrames` und
// `reflowTextThread` aus **keiner** Komponente erreichbar; es gab keinen Knopf dafuer. Diese Datei prueft die
// Operationen, die daraus einen bedienbaren Textfluss machen.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, detectOversetFrames, estimateTextCapacity } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_THREAD_ANCHOR_GAP_MM, PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM, appendThreadFrame, createStandaloneTextFrame,
  inspectThreadOverflow, linkPublishFrames, resolvePublishThreadOverflow, threadChain, threadRemainingText,
  unlinkPublishFrameAfter,
} from '../../../model/publishThreadOps';
import { threadPosition } from '../../../model/publishThreadRead';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

/**
 * Zwei Textrahmen auf Seite 1.
 *
 * Der Text wird **nur** in den ersten Rahmen gelegt: der zweite entsteht leer. Andernfalls verdoppelte sich
 * der Text beim Umfluss, weil eine Story aus der Verkettung aller Inhalte gebildet wird.
 */
function twoFrames(content = 'A'.repeat(20_000)) {
  const project = createPublishProject({ pages: 2 });
  const first = addFrameToPublish(project, 'text', { content, name: 'Column A', xMm: 20, yMm: 40, widthMm: 60, heightMm: 60 });
  const second = addFrameToPublish(first, 'text', { content: '', name: 'Column B', xMm: 110, yMm: 40, widthMm: 60, heightMm: 60 });
  const frameIds = second.frames.map(frame => frame.id);
  return { model: second, firstId: frameIds[0]!, secondId: frameIds[1]! };
}

describe('threadChain', () => {
  it('findet die ganze Kette, egal welcher Rahmen gefragt wird', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(threadChain(linked, firstId).map(frame => frame.id)).toEqual([firstId, secondId]);
    expect(threadChain(linked, secondId).map(frame => frame.id)).toEqual([firstId, secondId]);
  });

  it('weigert sich bei einem Bildrahmen', () => {
    const project = createPublishProject({ pages: 1 });
    const model = addFrameToPublish(project, 'image', { name: 'Bild' });
    expect(codes(() => threadChain(model, model.selectedFrameId!))).toBe('text-thread-start-invalid');
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = twoFrames('kurz');
    expect(codes(() => threadChain(model, 'frame-nope'))).toBe('text-thread-start-invalid');
  });
});

describe('linkPublishFrames', () => {
  it('verkettet, fliesst um und verliert kein Zeichen', () => {
    const { model, firstId, secondId } = twoFrames();
    const linked = linkPublishFrames(model, firstId, secondId);
    const first = linked.frames.find(frame => frame.id === firstId)!;
    const second = linked.frames.find(frame => frame.id === secondId)!;
    // Vorher verkettete `threadTextFrames` nur: der Text blieb, wo er war, und der Nutzer sah keine Aenderung.
    expect(first.content.length).toBe(estimateTextCapacity(first));
    expect(first.text!.nextFrameId).toBe(secondId);
    expect(second.text!.previousFrameId).toBe(firstId);
    /**
     * Der wichtigere Teil, gemessen am **eigenen** Fehler (Runde Publish-11): die Vorgaengerfassung des
     * Umflusses schnitt bei der Summe der Kapazitaeten ab. Aus 60.000 Zeichen wurden 660 — 59.340 Zeichen
     * Nutzertext verschwanden beim blossen Verketten, ohne Meldung. Jetzt bleibt alles erhalten und der Rest
     * steht mit `overset` im letzten Rahmen.
     */
    expect(first.content.length + second.content.length).toBe(20_000);
    expect(second.content.length).toBeGreaterThan(estimateTextCapacity(second));
    expect(second.text!.overset).toBe(true);
    expect(detectOversetFrames(linked)).toEqual([secondId]);
  });

  it('lehnt einen Zyklus ab, statt eine Endlosschleife zu bauen', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(codes(() => linkPublishFrames(linked, secondId, firstId))).toBe('text-thread-cycle');
  });

  it('lehnt das Verketten mit sich selbst ab', () => {
    const { model, firstId } = twoFrames('kurz');
    expect(codes(() => linkPublishFrames(model, firstId, firstId))).toBe('text-thread-cycle');
  });

  it('lehnt ein Ziel ab, das selbst schon eine Fortsetzung hat', () => {
    // Der Schutz greift **vor** dem Zyklusschutz: ein Ziel mit eigener Fortsetzung wuerde drei Rahmen mit
    // einem Ende verbinden. Beide Wege sind zu, hier wird der genauere Grund geprueft.
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    const third = addFrameToPublish(linked, 'text', { content: '', name: 'Third' });
    const thirdId = third.frames[2]!.id;
    expect(codes(() => linkPublishFrames(third, thirdId, secondId))).toBe('text-thread-target-has-continuation');
  });

  it('weigert sich, aus einem Mittelstueck heraus zu verketten', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    const third = addFrameToPublish(linked, 'text', { content: '', name: 'Third' });
    const thirdId = third.frames[2]!.id;
    expect(codes(() => linkPublishFrames(third, firstId, thirdId))).toBe('text-thread-source-not-last');
  });

  it('lehnt einen unbekannten Zielrahmen ab', () => {
    const { model, firstId } = twoFrames('kurz');
    expect(codes(() => linkPublishFrames(model, firstId, 'frame-nope'))).toBe('text-thread-target-invalid');
  });
});

describe('unlinkPublishFrameAfter', () => {
  it('trennt die Verbindung und behaelt den Text auf beiden Seiten', () => {
    const { model, firstId, secondId } = twoFrames();
    const linked = linkPublishFrames(model, firstId, secondId);
    const beforeTotal = linked.frames.reduce((sum, frame) => sum + frame.content.length, 0);
    const unlinked = unlinkPublishFrameAfter(linked, firstId);
    const first = unlinked.frames.find(frame => frame.id === firstId)!;
    const second = unlinked.frames.find(frame => frame.id === secondId)!;
    expect(first.text!.nextFrameId).toBeUndefined();
    expect(second.text!.previousFrameId).toBeUndefined();
    // Nichts wird stillschweigend verworfen.
    expect(first.content.length + second.content.length).toBe(beforeTotal);
    expect(second.content.length).toBeGreaterThan(0);
  });

  it('weigert sich, wenn gar keine Verbindung besteht', () => {
    const { model, firstId } = twoFrames('kurz');
    expect(codes(() => unlinkPublishFrameAfter(model, firstId))).toBe('text-thread-not-linked');
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const { model } = twoFrames('kurz');
    expect(codes(() => unlinkPublishFrameAfter(model, 'frame-nope'))).toBe('frame-missing');
  });
});

describe('appendThreadFrame', () => {
  it('haengt einen Fortsetzungsrahmen an und gibt den Ueberlauf dorthin', () => {
    const { model, firstId, secondId } = twoFrames('A'.repeat(60_000));
    const linked = linkPublishFrames(model, firstId, secondId);
    const before = linked.frames.reduce((sum, frame) => sum + frame.content.length, 0);
    expect(before).toBe(60_000);
    const grown = appendThreadFrame(linked, secondId);
    expect(grown.frames).toHaveLength(3);
    const chain = threadChain(grown, firstId);
    expect(chain).toHaveLength(3);
    // Der Kern: der neue Rahmen nimmt auf, was vorher Ueberlauf war — kein Zeichen verschwindet dabei.
    expect(chain.reduce((sum, frame) => sum + frame.content.length, 0)).toBe(60_000);
    const tail = chain[chain.length - 1]!;
    // Der neue Rahmen traegt jetzt den Rest. Er ist voll, solange noch mehr Text uebrig ist als hineinpasst.
    expect(tail.content.length).toBeGreaterThan(0);
    expect(tail.text!.overset).toBe(tail.content.length > estimateTextCapacity(tail));
  });

  it('legt eine neue Seite an, wenn der Anker am Seitenende steht', () => {
    const project = createPublishProject({ pages: 1 });
    // Absichtlich ueber den Nutzflaechenrand hinaus: `assertPublishDocument` prueft nur die absolute Grenze,
    // und genau dieser Zustand ("Rahmen steht am Seitenende") ist der Anlass fuer eine neue Seite.
    const withFrame = addFrameToPublish(project, 'text', {
      content: 'A'.repeat(40_000), name: 'Bottom', xMm: 20, yMm: 250, widthMm: 80, heightMm: 40,
    });
    const frameId = withFrame.selectedFrameId!;
    const grown = appendThreadFrame(withFrame, frameId);
    expect(grown.pages).toHaveLength(2);
    const added = grown.frames.find(frame => frame.id !== frameId)!;
    expect(added.pageId).toBe(grown.pages[1]!.id);
    expect(added.heightMm).toBe(PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM);
  });

  it('bleibt auf derselben Seite, wenn unter dem Anker noch Platz ist', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrame = addFrameToPublish(project, 'text', { content: 'A'.repeat(40_000), name: 'Top', xMm: 20, yMm: 40, widthMm: 80, heightMm: 60 });
    const frameId = withFrame.selectedFrameId!;
    const grown = appendThreadFrame(withFrame, frameId);
    expect(grown.pages).toHaveLength(1);
    const added = grown.frames.find(frame => frame.id !== frameId)!;
    // Direkt unter dem Anker mit dem einen benannten Abstand -- nicht irgendwo auf der Seite.
    expect(added.yMm).toBe(40 + 60 + PUBLISH_THREAD_ANCHOR_GAP_MM);
    expect(added.xMm).toBe(20);
    expect(added.widthMm).toBe(80);
    expect(added.heightMm).toBe(PUBLISH_THREAD_FRAME_DEFAULT_HEIGHT_MM);
  });

  it('schiebt sich zwischen Anker und Nachfolger, wenn der Anker nicht das Ende ist', () => {
    // Gemessen (eigener Fehler, Runde Publish-11): die erste Fassung verlangte, dass der Anker das Ende der
    // Story ist. Der Ueberlauf sitzt aber oft in einem **mittleren** Rahmen — dort war "Ueberlauf aufloesen"
    // wirkungslos. Jetzt wird der neue Rahmen eingeschoben und die Kette neu geschlossen.
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    const grown = appendThreadFrame(linked, firstId);
    expect(grown.frames).toHaveLength(3);
    const chain = threadChain(grown, firstId);
    expect(chain.map(frame => frame.id)).toEqual([firstId, grown.selectedFrameId, secondId]);
    // Der Nachfolger zeigt jetzt auf den neuen Rahmen, nicht mehr auf den Anker.
    expect(chain[0]!.text!.nextFrameId).toBe(grown.selectedFrameId);
    expect(chain[2]!.text!.previousFrameId).toBe(grown.selectedFrameId);
  });
});

describe('resolvePublishThreadOverflow', () => {
  it('loest einen Ueberlauf ueber mehrere neue Rahmen auf', () => {
    // 40.000 Zeichen bei 330 Zeichen je Rahmen: die Aufloesung braucht rund 120 Rahmen und bleibt damit
    // innerhalb der benannten Grenze von 256. Vorher (Abschneiden bei der Kapazitaet) gab es hier nichts
    // aufzuloesen — der Text war schon weg.
    const { model, firstId, secondId } = twoFrames('A'.repeat(40_000));
    const linked = linkPublishFrames(model, firstId, secondId);
    const resolved = resolvePublishThreadOverflow(linked, firstId);
    const chain = threadChain(resolved, firstId);
    expect(chain.length).toBeGreaterThan(2);
    expect(chain.reduce((sum, frame) => sum + frame.content.length, 0)).toBe(40_000);
    expect(chain.every(frame => !frame.text!.overset)).toBe(true);
    expect(detectOversetFrames(resolved)).toEqual([]);
  });

  it('nennt die Grenze, wenn der Ueberlauf nicht in 256 Rahmen passt', () => {
    // 200.000 Zeichen braeuchten rund 600 Rahmen. Fail-closed: der Aufruf bricht ab und nennt die Grenze,
    // statt still eine halbe Story zu verteilen.
    const { model, firstId, secondId } = twoFrames('A'.repeat(200_000));
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(codes(() => resolvePublishThreadOverflow(linked, firstId))).toBe('thread-overflow-unresolved-after:256');
  });

  it('tut nichts, wenn nichts ueberlaeuft', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(resolvePublishThreadOverflow(linked, firstId)).toBe(linked);
  });

  it('bricht mit benannter Grenze ab, statt endlos Rahmen anzulegen', () => {
    const { model, firstId, secondId } = twoFrames('A'.repeat(120_000));
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(codes(() => resolvePublishThreadOverflow(linked, firstId, 1))).toBe('thread-overflow-unresolved-after:1');
  });

  it('lehnt eine unsinnige Grenze ab', () => {
    const { model, firstId } = twoFrames('kurz');
    expect(codes(() => resolvePublishThreadOverflow(model, firstId, 0))).toBe('thread-overflow-limit-invalid');
    expect(codes(() => resolvePublishThreadOverflow(model, firstId, 1000))).toBe('thread-overflow-limit-invalid');
  });
});

describe('inspectThreadOverflow und threadRemainingText -- "Overset-Text anzeigen"', () => {
  it('zeigt den Resttext und die Zahl der nicht passenden Zeichen', () => {
    const { model, firstId, secondId } = twoFrames('A'.repeat(60_000));
    const linked = linkPublishFrames(model, firstId, secondId);
    const report = inspectThreadOverflow(linked, firstId);
    expect(report.chain).toHaveLength(2);
    expect(report.oversetFrameIds).toEqual([secondId]);
    // Gemessen gegen die Summe der Kapazitaeten: 60.000 minus zwei Rahmen. Vorher meldete die Rechnung
    // gegen den letzten Rahmen allein hier eine falsche Null.
    const capacity = report.chain.reduce((sum, frame) => sum + estimateTextCapacity(frame), 0);
    expect(report.remainingChars).toBe(60_000 - capacity);
    expect(report.remainingText.startsWith('A')).toBe(true);
    expect(report.summary).toContain('overflows');
  });

  it('meldet "passt" als Ergebnis, wenn nichts ueberlaeuft', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    const report = inspectThreadOverflow(linked, firstId);
    expect(report.oversetFrameIds).toEqual([]);
    expect(report.remainingChars).toBe(0);
    expect(report.summary).toContain('fits without overflow');
  });

  it('begrenzt den zurueckgegebenen Resttext', () => {
    const { model, firstId } = twoFrames('A'.repeat(5_000));
    expect(threadRemainingText(model, firstId, 100)).toHaveLength(100);
  });
});

describe('threadPosition -- die Aussage "Rahmen 2 von 3"', () => {
  it('antwortet auch fuer einen Bildrahmen, ohne zu werfen', () => {
    const project = createPublishProject({ pages: 1 });
    const model = addFrameToPublish(project, 'image', { name: 'Bild' });
    expect(threadPosition(model, model.selectedFrameId!)).toEqual({ linked: false, position: 0, length: 0, frameIds: [] });
  });

  it('nennt Position und Laenge einer verbundenen Story', () => {
    const { model, firstId, secondId } = twoFrames('kurz');
    const linked = linkPublishFrames(model, firstId, secondId);
    expect(threadPosition(linked, secondId)).toEqual({ linked: true, position: 2, length: 2, frameIds: [firstId, secondId] });
  });

  it('meldet einen Einzelrahmen als nicht verbunden', () => {
    const { model, firstId } = twoFrames('kurz');
    expect(threadPosition(model, firstId)).toEqual({ linked: false, position: 1, length: 1, frameIds: [firstId] });
  });
});

describe('createStandaloneTextFrame -- leer und sofort tippbar', () => {
  it('erzeugt einen leeren Rahmen mit eigener Story-ID, innerhalb der Nutzflaeche', () => {
    const project = createPublishProject({ pages: 1, marginMm: 20 });
    const frame = createStandaloneTextFrame(project, { x: 5, y: 5, width: 400, height: 400 });
    expect(frame.content).toBe('');
    expect(frame.type).toBe('text');
    expect(frame.text!.threadId).toMatch(/^thread-[0-9a-f]{8}$/u);
    // Ueber den Rand hinaus wird **eingepasst**, nicht abgeschnitten: der Rahmen bleibt nutzbar.
    expect(frame.xMm).toBeGreaterThanOrEqual(20);
    expect(frame.yMm).toBeGreaterThanOrEqual(20);
    expect(frame.xMm + frame.widthMm).toBeLessThanOrEqual(190);
    expect(frame.yMm + frame.heightMm).toBeLessThanOrEqual(277);
  });
});
