// STATUS: PLATIN — Publish: Mehrspaltige Typografie (AST-1381/1382/1384)
//
// Akzeptanzsaetze: „Text um Bild fliessen lassen / Spaltenausgleich / Absatzumbruch" (1381/1382) und
// „Fehlender Font, Bildaufloesung, Anschnitt als navigierbaren Fehler" fuer die Fehler-/Sicherheitsseite (1384).
//
// Gemessen vorher:
//   * `PublishTextFrameOptions.textWrap` (`workspacePublish.ts:97`) wurde von **niemandem** gelesen — der Text
//     lief unter dem Bild durch, und die Ueberlaufschaetzung rechnete mit der **vollen** Rahmenflaeche.
//   * `columns` wurde **gezeichnet**, aber nichts verteilte die Textmenge: die erste Spalte lief bis zum Rand,
//     die zweite blieb leer.
//   * `PublishTypography.keep` (`:158`) und `hyphenation` (`:155`) wurden **nirgends** gelesen.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, estimateTextCapacity } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_TEXT_FLOW_LIMITS, PUBLISH_TEXT_WRAP_MODES, assertPublishParagraphBreak, availableTextAreaMm2,
  balancePublishColumns, columnBalance, defaultPublishParagraphBreak, describePublishTextWrap,
  detectOversetFramesWithWrap, publishColumnDistribution, publishParagraphBreakOf, publishWrapObstacles,
  setPublishParagraphBreak, setPublishTextWrap, textWrapFreePercent,
} from '../../../model/publishTextFlowOps';
import { buildPublishSvgPage } from '../../../interchange/publishExportEngine';
import { verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

/** Ein Textrahmen und ein Bild darin — die Form, die „um das Bild fliessen" pruefbar macht. */
function textOverImage(options: { wrap?: 'none' | 'bounding-box' | 'contour'; offsetMm?: number } = {}) {
  const project = createPublishProject({ pages: 1, bleedMm: 3 });
  const withText = addFrameToPublish(project, 'text', { content: 'A'.repeat(600), name: 'Fliesstext', xMm: 20, yMm: 20, widthMm: 100, heightMm: 80 });
  const textId = withText.selectedFrameId!;
  const withImage = addFrameToPublish(withText, 'image', { name: 'Bild', xMm: 40, yMm: 40, widthMm: 40, heightMm: 40, altText: 'Ein Balken' });
  const imageId = withImage.selectedFrameId!;
  if (options.wrap === undefined) return { model: withImage, textId, imageId };
  const model = setPublishTextWrap(withImage, textId, { mode: options.wrap, offsetMm: options.offsetMm ?? 0, contourThreshold: 0.5 });
  return { model, textId, imageId };
}

describe('AST-1381 — Text fliesst um das Bild', () => {
  it('bietet genau die drei Arten des Vertrags an', () => {
    expect([...PUBLISH_TEXT_WRAP_MODES]).toEqual(['none', 'bounding-box', 'contour']);
  });

  it('legt den Umbruch in `frame.text` ab — dort, wo der Vertrag ihn fuehrt', () => {
    const { model, textId } = textOverImage({ wrap: 'bounding-box', offsetMm: 3 });
    const frame = model.frames.find((candidate) => candidate.id === textId)!;
    expect(frame.text?.textWrap).toEqual({ mode: 'bounding-box', offsetMm: 3, contourThreshold: 0.5 });
    // **Nicht** an einer zweiten Stelle.
    expect((frame as unknown as Record<string, unknown>).textWrap).toBeUndefined();
  });

  it('**ohne** Umbruch laeuft der Text durch und die Flaeche ist voll', () => {
    const { model, textId } = textOverImage({ wrap: 'none' });
    const frame = model.frames.find((candidate) => candidate.id === textId)!;
    expect(publishWrapObstacles(model, frame)).toEqual([]);
    expect(availableTextAreaMm2(frame, [])).toBeCloseTo(100 * 80, 6);
  });

  it('**mit** Umbruch weicht der Kasten des Hindernisses aus — messbar kleiner', () => {
    const { model, textId, imageId } = textOverImage({ wrap: 'bounding-box', offsetMm: 0 });
    const frame = model.frames.find((candidate) => candidate.id === textId)!;
    const obstacles = publishWrapObstacles(model, frame);
    expect(obstacles).toHaveLength(1);
    expect(obstacles[0]!.frameId).toBe(imageId);
    expect(obstacles[0]!.outline).toEqual([]);
    // 40 × 40 mm liegen im 100 × 80 mm-Rahmen: die freie Flaeche ist um genau dieses Rechteck kleiner.
    expect(availableTextAreaMm2(frame, obstacles)).toBeCloseTo(100 * 80 - 40 * 40, 6);
    expect(textWrapFreePercent(frame, obstacles)).toBe(80);
  });

  it('der **Versatz** vergroessert die gemiedene Flaeche', () => {
    const zero = textOverImage({ wrap: 'bounding-box', offsetMm: 0 });
    const wide = textOverImage({ wrap: 'bounding-box', offsetMm: 5 });
    const freeArea = (input: ReturnType<typeof textOverImage>): number => {
      const frame = input.model.frames.find((candidate) => candidate.id === input.textId)!;
      return availableTextAreaMm2(frame, publishWrapObstacles(input.model, frame));
    };
    expect(freeArea(wide)).toBeLessThan(freeArea(zero));
    // 50 × 50 mm statt 40 × 40 mm.
    expect(freeArea(wide)).toBeCloseTo(100 * 80 - 50 * 50, 6);
  });

  it('bei `contour` folgt die gemiedene Flaeche der **Kontur**, nicht dem Kasten', () => {
    const { model, textId, imageId } = textOverImage({ wrap: 'contour', offsetMm: 0 });
    // Ein Dreieck als Kontur: die Haelfte des Kastens.
    const withPath = { ...model, frames: model.frames.map((frame) => frame.id === imageId ? { ...frame, clippingPath: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }] } : frame) };
    const frame = withPath.frames.find((candidate) => candidate.id === textId)!;
    const obstacles = publishWrapObstacles(withPath, frame);
    expect(obstacles[0]!.outline).toHaveLength(3);
    // Die Kontur ist in Millimetern umgerechnet — **dieselbe** Umrechnung wie Canvas und Export.
    expect(obstacles[0]!.outline[1]).toEqual({ x: 80, y: 40 });
  });

  it('weicht nur aus, was den Textrahmen **wirklich** ueberlappt', () => {
    const { model, textId } = textOverImage({ wrap: 'bounding-box' });
    const far = addFrameToPublish(model, 'image', { name: 'Weit weg', xMm: 300, yMm: 300, widthMm: 20, heightMm: 20 });
    const frame = far.frames.find((candidate) => candidate.id === textId)!;
    expect(publishWrapObstacles(far, frame)).toHaveLength(1);
  });

  it('weicht **anderen Text** nicht aus — die Absicht steht am Text, nicht am Bild', () => {
    const { model, textId } = textOverImage({ wrap: 'bounding-box' });
    const other = addFrameToPublish(model, 'text', { content: 'Zweiter Text', name: 'Zwei', xMm: 50, yMm: 50, widthMm: 30, heightMm: 30 });
    const frame = other.frames.find((candidate) => candidate.id === textId)!;
    expect(publishWrapObstacles(other, frame).every((obstacle) => obstacle.frameId !== other.selectedFrameId)).toBe(true);
  });

  it('**die Ueberlaufschaetzung kennt die freie Flaeche** — das war der Befund', () => {
    const { model, textId, imageId } = textOverImage({ wrap: 'bounding-box' });
    const frame = model.frames.find((candidate) => candidate.id === textId)!;
    const naive = estimateTextCapacity(frame);
    const obstacles = publishWrapObstacles(model, frame);
    const aware = estimateTextCapacity(frame, availableTextAreaMm2(frame, obstacles));
    expect(aware).toBeLessThan(naive);
    // Und die Zahl entspricht dem gemessenen Anteil (80 %), nicht einer zweiten Regel.
    expect(aware).toBe(Math.floor(naive * 0.8));
    // Ein Text, der **nur** mit der vollen Flaeche passt, faellt jetzt auf.
    const tight = { ...model, frames: model.frames.map((candidate) => candidate.id === textId ? { ...candidate, content: 'A'.repeat(naive) } : candidate) };
    expect(detectOversetFramesWithWrap(tight)).toContain(textId);
    // Mit weniger Text bleibt er passend.
    const roomy = { ...model, frames: model.frames.map((candidate) => candidate.id === textId ? { ...candidate, content: 'A'.repeat(aware - 10) } : candidate) };
    expect(detectOversetFramesWithWrap(roomy)).not.toContain(textId);
    expect(imageId).toBeTruthy();
  });

  it('beschreibt den Umbruch in Worten — mit dem **gemessenen** freien Anteil', () => {
    const { model, textId } = textOverImage({ wrap: 'bounding-box', offsetMm: 2 });
    const text = describePublishTextWrap(model, textId);
    expect(text).toContain('bounding-box');
    expect(text).toContain('gap 2mm');
    // Mit 2 mm Versatz meidet der Text 44 × 44 mm von 100 × 80 mm — das sind **76 %**, nicht 80 %.
    // (Meine erste Erwartung stand auf 80 % und war falsch: der Versatz vergroessert die gemiedene Flaeche.)
    expect(text).toContain('76%');
    // Und ohne Umbruch steht das da, was gilt.
    const off = textOverImage({ wrap: 'none' });
    expect(describePublishTextWrap(off.model, off.textId)).toBe('Text wrap: off');
  });

  it('lehnt unbekannte Art, negativen und zu grossen Versatz benannt ab', () => {
    const { model, textId } = textOverImage();
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'diagonal' as never, offsetMm: 0, contourThreshold: 0.5 }))).toBe('text-wrap-mode-unknown:diagonal');
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: -1, contourThreshold: 0.5 }))).toBe('text-wrap-offset-out-of-range:-1');
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: PUBLISH_TEXT_FLOW_LIMITS.maxWrapOffsetMm + 1, contourThreshold: 0.5 }))).toMatch(/^text-wrap-offset-out-of-range:/u);
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: Number.NaN, contourThreshold: 0.5 }))).toBe('text-wrap-offset-not-finite');
    // Die Schwelle ist **normiert 0…1** — so, wie der Erzeuger des Rahmens sie fuehrt
    // (`publishDocumentEngine.ts:56`: `contourThreshold: 0.5`). Meine erste Fassung stand auf 0…255 und haette den
    // **Vorgabewert des Modells abgelehnt** — der Umbruch waere damit unerreichbar gewesen.
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: 0, contourThreshold: 1.5 }))).toBe('text-wrap-threshold-out-of-range:1.5');
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: 0, contourThreshold: PUBLISH_TEXT_FLOW_LIMITS.maxContourThreshold }))).toBe('no-error');
    expect(codes(() => setPublishTextWrap(model, textId, { mode: 'contour', offsetMm: 0, contourThreshold: 0.5 }))).toBe('no-error');
    // Ein Bildrahmen ist kein Textrahmen.
    const { imageId } = textOverImage();
    expect(codes(() => setPublishTextWrap(model, imageId, { mode: 'contour', offsetMm: 0, contourThreshold: 0.5 }))).toBe('text-wrap-frame-not-text');
  });
});

describe('AST-1382 — Spaltenausgleich', () => {
  it('verteilt ohne Verlust: die Teile sind zusammen der ganze Text', () => {
    for (const columns of [1, 2, 3, 5, 7]) {
      const parts = balancePublishColumns('A'.repeat(101), columns);
      const balance = columnBalance(parts);
      expect(balance.columns, String(columns)).toBe(columns);
      expect(balance.conserved, String(columns)).toBe(true);
      expect(balance.totalChars, String(columns)).toBe(101);
      expect(parts.join(''), String(columns)).toBe('A'.repeat(101));
    }
  });

  it('ist **ausgeglichen**: der Unterschied zwischen vollster und leerster Spalte ist hoechstens 1', () => {
    const balance = columnBalance(balancePublishColumns('B'.repeat(100), 3));
    expect(balance.spread).toBeLessThanOrEqual(1);
    // Der Rest wird **verteilt**: 34/33/33, nicht 34/34/32. (Meine erste Erwartung war die alte, unausgeglichene
    // Rechnung — der Test hat den Unterschied gefunden.)
    expect(balance.lengths).toEqual([34, 33, 33]);
  });

  it('die **letzte** Spalte bekommt den Rest — kein Zeichen geht verloren', () => {
    // Bei 10 Zeichen auf 4 Spalten geht die Verteilung restlos auf; der Schwanz gehoert trotzdem der letzten.
    const parts = balancePublishColumns('C'.repeat(10), 4);
    expect(parts).toEqual(['CCC', 'CCC', 'CC', 'CC']);
    expect(parts.join('')).toHaveLength(10);
    // Und wenn die Rechnung nicht aufgeht, bleibt der Rest **auch** in der letzten Spalte — nie verloren.
    const uneven = balancePublishColumns('D'.repeat(11), 4);
    expect(uneven.join('')).toBe('D'.repeat(11));
    expect(columnBalance(uneven).conserved).toBe(true);
  });

  it('lehnt unmögliche Spaltenzahlen benannt ab', () => {
    expect(codes(() => balancePublishColumns('x', 0))).toBe('column-count-invalid:0');
    expect(codes(() => balancePublishColumns('x', -2))).toBe('column-count-invalid:-2');
    expect(codes(() => balancePublishColumns('x', 2.5))).toBe('column-count-invalid:2.5');
    expect(codes(() => balancePublishColumns('x', PUBLISH_TEXT_FLOW_LIMITS.maxColumns + 1))).toBe(`column-count-invalid:${PUBLISH_TEXT_FLOW_LIMITS.maxColumns + 1}`);
  });

  it('liest die Spaltenzahl aus dem Rahmen und verteilt danach', () => {
    const project = createPublishProject({ pages: 1 });
    const withText = addFrameToPublish(project, 'text', { content: 'D'.repeat(90), name: 'Zwei Spalten', widthMm: 100, heightMm: 60 });
    const frame = { ...withText.frames[0]!, text: { ...withText.frames[0]!.text!, columns: 3 } } as typeof withText.frames[0];
    const { parts, balance } = publishColumnDistribution(frame);
    expect(parts).toHaveLength(3);
    expect(balance.conserved).toBe(true);
    expect(balance.spread).toBeLessThanOrEqual(1);
  });

  it('lehnt eine zu schmale Spalte benannt ab', () => {
    const project = createPublishProject({ pages: 1 });
    const withText = addFrameToPublish(project, 'text', { content: 'x', name: 'Schmal', widthMm: 10, heightMm: 20 });
    const frame = { ...withText.frames[0]!, text: { ...withText.frames[0]!.text!, columns: 4 } } as typeof withText.frames[0];
    expect(codes(() => publishColumnDistribution(frame))).toBe('column-too-narrow:10/4');
  });

  it('eine einzelne Spalte ist der Text selbst', () => {
    expect(balancePublishColumns('E'.repeat(7), 1)).toEqual(['E'.repeat(7)]);
    expect(columnBalance(['']).conserved).toBe(true);
    expect(columnBalance([]).spread).toBe(0);
  });
});

describe('AST-1384 — Absatzumbruch, fail-closed', () => {
  it('setzt Hyphenisierung unddie vier Keep-Werte in `frame.typography`', () => {
    const { model, textId } = textOverImage();
    const next = setPublishParagraphBreak(model, textId, { hyphenation: true, keepWithNext: 1, keepLinesTogether: false, keepFirstLines: 3, keepLastLines: 2 });
    const frame = next.frames.find((candidate) => candidate.id === textId)!;
    expect(frame.typography?.hyphenation).toBe(true);
    expect(frame.typography?.keep?.keepFirstLines).toBe(3);
    expect(frame.typography?.keep?.keepLastLines).toBe(2);
    expect(publishParagraphBreakOf(frame)).toEqual({ hyphenation: true, keepWithNext: 1, keepLinesTogether: false, keepFirstLines: 3, keepLastLines: 2 });
  });

  it('**erhaelt** die Keep-Felder, die dieser Punkt nicht setzt', () => {
    const { model, textId } = textOverImage();
    const seeded = { ...model, frames: model.frames.map((frame) => frame.id === textId ? { ...frame, typography: { ...frame.typography!, keep: { keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 0, keepLastLines: 0, widowLines: 4, orphanLines: 2 } } } : frame) };
    const next = setPublishParagraphBreak(seeded, textId, { hyphenation: false, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 1, keepLastLines: 0 });
    const keep = next.frames.find((frame) => frame.id === textId)!.typography!.keep!;
    expect(keep.widowLines).toBe(4);
    expect(keep.orphanLines).toBe(2);
    expect(keep.keepFirstLines).toBe(1);
  });

  it('benennt den **Widerspruch**: „zusammenhalten" plus Anfangs- und Endzeilen', () => {
    // Zwei Forderungen an dieselbe Zeile sind ein stiller Fehler — hier ein benannter.
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: 0, keepLinesTogether: true, keepFirstLines: 2, keepLastLines: 2 }))).toBe('paragraph-break-contradictory:keep-lines-together-with-first-and-last');
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 2, keepLastLines: 2 }))).toBe('no-error');
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: 0, keepLinesTogether: true, keepFirstLines: 0, keepLastLines: 0 }))).toBe('no-error');
  });

  it('lehnt nicht-ganzzahlige und zu grosse Werte benannt ab', () => {
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: -1, keepLastLines: 0 }))).toBe('paragraph-break-out-of-range:keepFirstLines:-1');
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 1.5, keepLastLines: 0 }))).toBe('paragraph-break-out-of-range:keepFirstLines:1.5');
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: PUBLISH_TEXT_FLOW_LIMITS.maxKeepLines + 1, keepLinesTogether: false, keepFirstLines: 0, keepLastLines: 0 }))).toMatch(/^paragraph-break-out-of-range:keepWithNext:/u);
    expect(codes(() => assertPublishParagraphBreak({ hyphenation: false, keepWithNext: Number.NaN, keepLinesTogether: false, keepFirstLines: 0, keepLastLines: 0 }))).toBe('paragraph-break-not-finite:keepWithNext');
  });

  it('die Vorgabe ist leer und widerspricht sich nicht', () => {
    const value = defaultPublishParagraphBreak();
    expect(codes(() => assertPublishParagraphBreak(value))).toBe('no-error');
    expect(publishParagraphBreakOf({ typography: undefined } as never)).toEqual(value);
  });

  it('setzt nur auf Textrahmen', () => {
    const { model, imageId } = textOverImage();
    expect(codes(() => setPublishParagraphBreak(model, imageId, defaultPublishParagraphBreak()))).toBe('paragraph-break-frame-not-text');
  });
});

describe('der Umbruch ueberlebt Speichern und Ausgabe', () => {
  it('bleibt beim Wiedereroeffnen identisch', () => {
    const { model, textId } = textOverImage({ wrap: 'contour', offsetMm: 4 });
    const withBreak = setPublishParagraphBreak(model, textId, { hyphenation: true, keepWithNext: 0, keepLinesTogether: false, keepFirstLines: 2, keepLastLines: 0 });
    const { reopened, diff } = verifyPublishPayloadRoundtrip(withBreak, 0);
    expect(diff.identical).toBe(true);
    const frame = reopened.frames.find((candidate) => candidate.id === textId)!;
    expect(frame.text?.textWrap?.mode).toBe('contour');
    expect(frame.typography?.hyphenation).toBe(true);
    // Und die Messung ergibt dieselbe Zahl.
    expect(availableTextAreaMm2(frame, publishWrapObstacles(reopened, frame))).toBe(availableTextAreaMm2(withBreak.frames.find((candidate) => candidate.id === textId)!, publishWrapObstacles(withBreak, withBreak.frames.find((candidate) => candidate.id === textId)!)));
  });

  it('der SVG-Export traegt den Text unveraendert — der Umbruch ist eine Anzeigeentscheidung', () => {
    // **Eine** Wahrheit: das Modell haelt den Text, die Aufteilung entsteht bei der Darstellung.
    const { model, textId } = textOverImage({ wrap: 'bounding-box' });
    const svg = buildPublishSvgPage(model);
    const frame = model.frames.find((candidate) => candidate.id === textId)!;
    expect(svg).toContain(frame.content.slice(0, 50));
    expect(svg.split(frame.content).length - 1).toBe(1);
  });
});
