// STATUS: PLATIN — Publish: Vektoren und Formen (AST-1406/1407/1408)
//
// Der Akzeptanzsatz lautet: „SVG-/Draw-Objekt einbetten, **Kontur und Transparenz erhalten**."
//
// Gemessen vorher: `PublishFrameType` führte `'graphic'`, aber der Canvas zeichnete dafür **denselben
// gestrichelten Bildplatzhalter** wie für ein fehlendes Bild, es gab **keinen** Einstieg „Form einfügen", und der
// SVG-Export schrieb für jeden Nicht-Text-Rahmen ein `<rect>` **ohne** `stroke-width` und **ohne** `opacity`.
// Eine Form mit 4 pt Kontur und 40 % Deckung verlor in der Ausgabe genau das, was der Satz verlangt.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, assertPublishDocument } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_SHAPE_KINDS, PUBLISH_SHAPE_MIN_POINTS, assertPublishShapeOutline, assertSvgBytes, compareShapeFidelity,
  embedPublishSvg, insertPublishShape, isPublishShapeFrame, isPublishSvgFrame, publishShapeLabel, shapeFramePatch,
  shapeOutlineFor, shapeOutlinePoints,
} from '../../../model/publishShapeOps';
import { buildPublishHtml, buildPublishSvgPage, importPublishSvgPage } from '../../../interchange/publishExportEngine';
import { verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';

const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8" fill="none" stroke="#0af" stroke-width="2"/></svg>');
const SVG_ACTIVE = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>');

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};
const asyncCodes = async (run: () => Promise<unknown>): Promise<string> => {
  try { await run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

describe('die Formvokabel ist kurz und benannt', () => {
  it('führt genau vier Formen mit benannten Mindestpunktzahlen', () => {
    expect([...PUBLISH_SHAPE_KINDS]).toEqual(['rectangle', 'ellipse', 'line', 'polygon']);
    expect(PUBLISH_SHAPE_MIN_POINTS.rectangle).toBe(0);
    expect(PUBLISH_SHAPE_MIN_POINTS.line).toBe(2);
    expect(PUBLISH_SHAPE_MIN_POINTS.polygon).toBe(3);
  });

  it('lehnt eine unbekannte Form und zu wenige Punkte benannt ab', () => {
    expect(codes(() => assertPublishShapeOutline('blob' as never, []))).toBe('shape-kind-unknown:blob');
    expect(codes(() => assertPublishShapeOutline('polygon', [{ x: 0, y: 0 }, { x: 1, y: 1 }]))).toBe('shape-points-below-minimum:polygon:2<3');
    expect(codes(() => assertPublishShapeOutline('line', [{ x: 0, y: 0 }]))).toBe('shape-points-below-minimum:line:1<2');
  });

  it('lehnt einen nicht-endlichen Punkt und einen weit ausserhalb liegenden benannt ab', () => {
    // Zwei **verschiedene** Gruende, und der spezifischere gewinnt: ein `NaN` ist kein „ausserhalb", es ist
    // „nicht endlich". *Ein gemeinsamer Grund haette dem Aufrufer gesagt, er solle einen Wert verschieben, der
    // gar keine Zahl ist.*
    expect(codes(() => assertPublishShapeOutline('line', [{ x: Number.NaN, y: 0 }, { x: 1, y: 1 }]))).toBe('shape-point-not-finite:0');
    expect(codes(() => assertPublishShapeOutline('line', [{ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 1 }]))).toBe('shape-point-not-finite:1');
    expect(codes(() => assertPublishShapeOutline('line', [{ x: 0, y: 0 }, { x: 99, y: 1 }]))).toBe('shape-point-out-of-bounds:1');
  });

  it('gibt für Rechteck, Ellipse, Linie und Vieleck die erwartete Punktzahl', () => {
    expect(shapeOutlineFor({ kind: 'rectangle' })).toEqual([]);
    expect(shapeOutlineFor({ kind: 'ellipse' })).toHaveLength(32);
    expect(shapeOutlineFor({ kind: 'line' })).toHaveLength(2);
    expect(shapeOutlineFor({ kind: 'polygon' })).toHaveLength(3);
    // Eigene Punkte gewinnen gegen die Vorgabe.
    expect(shapeOutlineFor({ kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 0.5, y: 0.5 }] })).toHaveLength(4);
  });
});

describe('shapeOutlinePoints — die eine Umrechnung normiert → Millimeter', () => {
  it('rechnet auf den Rahmenkasten um', () => {
    const points = shapeOutlinePoints({ xMm: 20, yMm: 40, widthMm: 100, heightMm: 50, rotationDeg: 0, clippingPath: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }] });
    expect(points).toEqual([{ x: 20, y: 40 }, { x: 120, y: 90 }, { x: 70, y: 65 }]);
  });

  it('gibt für einen Rahmen ohne Pfad nichts zurück', () => {
    expect(shapeOutlinePoints({ xMm: 0, yMm: 0, widthMm: 10, heightMm: 10, rotationDeg: 0 })).toEqual([]);
  });

  it('folgt der vorhandenen Bedeutung aus `fitAssetFrame` (0…1), nicht einer zweiten', () => {
    // `fitAssetFrame` schreibt `{x:(1-w)/2,y:0,width:w,height:1}` — also **normiert**. Ein Bildrahmen im
    // Zuschnitt-Modus hat damit ebenfalls einen Pfad; die Umrechnung muss dieselbe sein.
    const frame = addFrameToPublish(createPublishProject({ pages: 1 }), 'image', { name: 'Bild', xMm: 10, yMm: 10, widthMm: 80, heightMm: 40 });
    const withPath = { ...frame.frames[0]!, clippingPath: [{ x: 0.25, y: 0 }, { x: 0.75, y: 1 }] };
    expect(shapeOutlinePoints(withPath)).toEqual([{ x: 30, y: 10 }, { x: 70, y: 50 }]);
  });
});

describe('isPublishShapeFrame / isPublishSvgFrame — die eine Unterscheidung', () => {
  it('unterscheidet Form, SVG-Rahmen und Bildplatzhalter', () => {
    const base = createPublishProject({ pages: 1 });
    const model = insertPublishShape(base, { kind: 'ellipse' });
    const shape = model.frames[0]!;
    expect(isPublishShapeFrame(shape)).toBe(true);
    expect(isPublishSvgFrame(shape, model)).toBe(false);
    // Ein Grafikrahmen **ohne** Pfad und **ohne** Asset ist kein Formrahmen — er ist ein Platzhalter.
    expect(isPublishShapeFrame({ type: 'graphic', assetId: undefined, clippingPath: [] })).toBe(false);
    // Ein Bildrahmen ist nie eine Form.
    expect(isPublishShapeFrame({ type: 'image', assetId: undefined, clippingPath: [{ x: 0, y: 0 }] })).toBe(false);
  });

  it('erkennt einen eingebetteten SVG-Rahmen', async () => {
    const withGraphic = addFrameToPublish(createPublishProject({ pages: 1 }), 'graphic', { name: 'Vektor' });
    const embedded = await embedPublishSvg(withGraphic, withGraphic.selectedFrameId!, { name: 'kreis.svg', bytes: SVG });
    const frame = embedded.model.frames.find((candidate) => candidate.id === withGraphic.selectedFrameId)!;
    expect(isPublishSvgFrame(frame, embedded.model)).toBe(true);
    expect(isPublishShapeFrame(frame)).toBe(false);
  });
});

describe('insertPublishShape — der eine Einstieg', () => {
  it('legt fuer jede Form einen Grafikrahmen mit Kontur an', () => {
    for (const kind of PUBLISH_SHAPE_KINDS) {
      const model = insertPublishShape(createPublishProject({ pages: 1 }), { kind });
      expect(model.frames).toHaveLength(1);
      const frame = model.frames[0]!;
      expect(frame.type, kind).toBe('graphic');
      expect(frame.semanticRole, kind).toBe('Artifact');
      // Eine Form **ohne** Kontur waere unsichtbar — die Vorgabe ist deshalb eine.
      expect(frame.strokeWidthPt, kind).toBeGreaterThan(0);
      expect(frame.strokeColor, kind).toBeTruthy();
      expect(frame.opacity, kind).toBe(1);
      assertPublishDocument(model);
    }
  });

  it('nimmt eigene Masse, Fuellung, Kontur, Deckung und Punkte an', () => {
    const model = insertPublishShape(createPublishProject({ pages: 1 }), {
      kind: 'polygon', xMm: 30, yMm: 40, widthMm: 60, heightMm: 20,
      fillColor: '#ffcc00', strokeColor: '#003366', strokeWidthPt: 2.5, opacity: 0.4,
      points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
    });
    const frame = model.frames[0]!;
    expect(frame.widthMm).toBe(60);
    expect(frame.heightMm).toBe(20);
    expect(frame.fillColor).toBe('#ffcc00');
    expect(frame.strokeColor).toBe('#003366');
    expect(frame.strokeWidthPt).toBe(2.5);
    expect(frame.opacity).toBe(0.4);
    expect(frame.clippingPath).toHaveLength(3);
  });

  it('benennt die Form im Klartext statt nur in Farbe', () => {
    const model = insertPublishShape(createPublishProject({ pages: 1 }), { kind: 'ellipse', strokeWidthPt: 3, opacity: 0.5 });
    const label = publishShapeLabel(model.frames[0]!);
    expect(label).toContain('ellipse');
    expect(label).toContain('3pt contour');
    expect(label).toContain('50% opaque');
  });

  it('weist einen Punkt ausserhalb der benannten Grenze ab', () => {
    expect(codes(() => insertPublishShape(createPublishProject({ pages: 1 }), { kind: 'polygon', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 40, y: 0 }] })))
      .toBe('shape-point-out-of-bounds:2');
  });

  it('laesst einen Bildrahmen mit Pfad nicht als Form gelten', () => {
    const withImage = addFrameToPublish(createPublishProject({ pages: 1 }), 'image', { name: 'Bild' });
    const patched = shapeFramePatch({ kind: 'rectangle', strokeWidthPt: 1 });
    // Der Patch selbst beschreibt eine Form — die Entscheidung, ob der Rahmen eine **ist**, trifft die Art.
    expect(patched.type).toBe('graphic');
    expect(isPublishShapeFrame({ ...withImage.frames[0]!, clippingPath: [{ x: 0, y: 0 }], type: 'image' })).toBe(false);
  });
});

describe('SVG einbetten (AST-1407) — durch den vorhandenen Aufnehmer', () => {
  const withGraphic = () => {
    const model = addFrameToPublish(createPublishProject({ pages: 1 }), 'graphic', { name: 'Vektor', strokeColor: '#c026d3', strokeWidthPt: 4, opacity: 0.4 });
    return { model, frameId: model.selectedFrameId! };
  };

  it('bettet ein SVG ein und bestimmt die Art ueber den Aufnehmer, nicht selbst', async () => {
    const { model, frameId } = withGraphic();
    const result = await embedPublishSvg(model, frameId, { name: 'kreis.svg', bytes: SVG });
    const asset = result.model.assets[0]!;
    expect(asset.mimeType).toBe('image/svg+xml');
    expect(asset.kind).toBe('svg');
    expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.model.frames[0]!.assetId).toBe(asset.id);
  });

  it('**erhaelt Kontur und Transparenz** des Rahmens beim Einbetten', async () => {
    const { model, frameId } = withGraphic();
    const before = model.frames[0]!;
    const result = await embedPublishSvg(model, frameId, { name: 'kreis.svg', bytes: SVG });
    const after = result.model.frames[0]!;
    const fidelity = compareShapeFidelity(before, after);
    // Das ist der Akzeptanzsatz, gemessen: die drei Felder und der Pfad bleiben.
    expect(fidelity.identical, JSON.stringify(fidelity)).toBe(true);
    expect(after.strokeColor).toBe('#c026d3');
    expect(after.strokeWidthPt).toBe(4);
    expect(after.opacity).toBe(0.4);
  });

  it('setzt Kontur und Deckung nur, wenn der Aufruf sie nennt', async () => {
    const { model, frameId } = withGraphic();
    const named = await embedPublishSvg(model, frameId, { name: 'kreis.svg', bytes: SVG, strokeColor: '#000', strokeWidthPt: 9, opacity: 1 });
    expect(named.model.frames[0]!.strokeWidthPt).toBe(9);
    expect(named.model.frames[0]!.opacity).toBe(1);
  });

  it('lehnt Bytes ab, die kein SVG sind, und aktive Inhalte benannt', async () => {
    const { model, frameId } = withGraphic();
    expect(await asyncCodes(() => embedPublishSvg(model, frameId, { name: 'x.txt', bytes: new TextEncoder().encode('kein svg') }))).toBe('svg-root-element-missing:x.txt');
    expect(await asyncCodes(() => embedPublishSvg(model, frameId, { name: 'leer.svg', bytes: new Uint8Array(0) }))).toBe('svg-bytes-empty');
    // Der vorhandene Aufnehmer weist den Ereignishandler ab — **eine** Pruefung, nicht zwei.
    expect(await asyncCodes(() => embedPublishSvg(model, frameId, { name: 'boese.svg', bytes: SVG_ACTIVE }))).toMatch(/svg-active-content|asset-/u);
  });

  it('lehnt einen Textrahmen als Ziel ab', async () => {
    const withText = addFrameToPublish(createPublishProject({ pages: 1 }), 'text', { content: '', name: 'Text' });
    expect(await asyncCodes(() => embedPublishSvg(withText, withText.selectedFrameId!, { name: 'k.svg', bytes: SVG }))).toBe('asset-frame-type-invalid');
  });

  it('prueft die Kopfzeile und die Groessengrenze benannt', () => {
    expect(codes(() => assertSvgBytes(SVG, 'ok.svg'))).toBe('no-error');
    const huge = new Uint8Array(24 * 1024 * 1024 + 1);
    huge.set(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'), 0);
    expect(codes(() => assertSvgBytes(huge, 'riesig.svg'))).toMatch(/^svg-size-boundary:/u);
  });
});

describe('Kontur und Transparenz erreichen die Ausgabe (AST-1406/1407/1408)', () => {
  const shapeModel = () => insertPublishShape(createPublishProject({ pages: 1 }), {
    kind: 'polygon', xMm: 20, yMm: 30, widthMm: 50, heightMm: 40,
    fillColor: '#ffcc00', strokeColor: '#003366', strokeWidthPt: 3, opacity: 0.4,
    points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0.5, y: 1 }],
  });

  it('der SVG-Export traegt Punkte, Konturbreite und Deckung', () => {
    const svg = buildPublishSvgPage(shapeModel());
    expect(svg).toContain('data-vgt-shape="polygon"');
    expect(svg).toContain('stroke-width="3"');
    expect(svg).toContain('opacity="0.4"');
    expect(svg).toContain('stroke="#003366"');
    expect(svg).toContain('fill="#ffcc00"');
    // Die Punkte sind in Millimetern, nicht normiert.
    expect(svg).toContain('20,30');
  });

  it('die HTML-Ausgabe traegt **genau ein** style-Attribut mit Kontur und Deckung', () => {
    // Gemessen (eigener Fehler): die erste Fassung haengte ein zweites `style=` an, sobald das feste Layout schon
    // eines trug — ungueltiges HTML, und der Browser nimmt stillschweigend das erste. Die Kontur waere spurlos weg.
    for (const layout of ['reflow', 'fixed'] as const) {
      const html = buildPublishHtml(shapeModel(), layout);
      const div = /<div style="([^"]*)"[^>]*data-vgt-frame-type="graphic"/u.exec(html);
      expect(div, layout).not.toBeNull();
      const declarations = div![1]!;
      expect(declarations, layout).toContain('border:3pt solid #003366');
      expect((html.match(/<div[^>]*data-vgt-frame-type="graphic"[^>]*>/u)?.[0].match(/style=/gu) ?? []).length, layout).toBe(1);
    }
  });

  it('der feste Satz behaelt zusaetzlich die absolute Position', () => {
    const html = buildPublishHtml(shapeModel(), 'fixed');
    const tag = /<div[^>]*data-vgt-frame-type="graphic"[^>]*>/u.exec(html)![0];
    expect(tag).toContain('position:absolute');
    expect(tag).toContain('border:3pt solid #003366');
  });

  it('der Rundlauf durch SVG erhaelt die Form', () => {
    const model = shapeModel();
    const { model: reimported } = importPublishSvgPage(buildPublishSvgPage(model));
    const fidelity = compareShapeFidelity(model.frames[0]!, reimported.frames[0]!);
    expect(fidelity.identical, JSON.stringify(fidelity)).toBe(true);
  });

  it('der Rundlauf durch den Speichertext erhaelt die Form', () => {
    const model = shapeModel();
    const { reopened, diff } = verifyPublishPayloadRoundtrip(model, 0);
    expect(diff.identical).toBe(true);
    const fidelity = compareShapeFidelity(model.frames[0]!, reopened.frames[0]!);
    expect(fidelity.identical, JSON.stringify(fidelity)).toBe(true);
  });

  it('zeichnet ein eingebettetes SVG im SVG-Export mit seiner Kontur', async () => {
    const withGraphic = addFrameToPublish(createPublishProject({ pages: 1 }), 'graphic', { name: 'Vektor', strokeColor: '#0af', strokeWidthPt: 2, opacity: 0.8 });
    const embedded = await embedPublishSvg(withGraphic, withGraphic.selectedFrameId!, { name: 'kreis.svg', bytes: SVG });
    const svg = buildPublishSvgPage(embedded.model);
    expect(svg).toContain('stroke-width="2"');
    expect(svg).toContain('opacity="0.8"');
    // Und der Inhalt selbst faehrt im semantischen Metadatenblock mit (der Rundlauf traegt ihn).
    const roundtrip = importPublishSvgPage(svg);
    expect(roundtrip.model.assets[0]!.mimeType).toBe('image/svg+xml');
  });
});
