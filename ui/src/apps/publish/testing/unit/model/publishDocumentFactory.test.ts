// STATUS: PLATIN -- Publish: "Neues Layoutdokument" wirklich, mit Grenzen und ohne Beispielinhalte
//
// Der Punkt lautet: "Eine Broschuere mit zwei Seiten aus leerer Vorlage beginnen." Vorher gab es keinen
// Einstieg, der ein leeres Dokument erzeugte -- `createEmptyPublishDocument` lieferte immer dieselbe
// Beispielbroschuere mit drei Beispielrahmen. Diese Datei prueft beides: dass das Ergebnis **leer** ist und
// dass unsinnige Angaben **abgelehnt** werden statt still gekappt.
import { describe, expect, it } from 'vitest';
import {
  PUBLISH_CREATION_LIMITS, PUBLISH_PAPER_SIZES, createPublishProject, describeFrameReadiness,
  describePublishCreation, validatePublishCreationSpec,
} from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, assertPublishDocument } from '../../../model/publishDocumentEngine';
import { setPublishFrameContent } from '../../../model/publishFrameOps';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

describe('validatePublishCreationSpec', () => {
  it('nimmt die Vorgabe und ergibt genau eine leere A4-Seite im Hochformat', () => {
    const plan = validatePublishCreationSpec();
    expect(plan.pages).toBe(1);
    expect(plan.geometry.widthMm).toBe(PUBLISH_PAPER_SIZES.A4.widthMm);
    expect(plan.geometry.heightMm).toBe(PUBLISH_PAPER_SIZES.A4.heightMm);
    expect(plan.geometry.orientation).toBe('portrait');
  });

  it('dreht die Masse fuer Querformat, statt ein zweites Format zu erfinden', () => {
    const plan = validatePublishCreationSpec({ paper: 'A3', orientation: 'landscape' });
    expect(plan.geometry.widthMm).toBe(PUBLISH_PAPER_SIZES.A3.heightMm);
    expect(plan.geometry.heightMm).toBe(PUBLISH_PAPER_SIZES.A3.widthMm);
  });

  it('nimmt eigene Masse nur bei paper Custom', () => {
    const custom = validatePublishCreationSpec({ paper: 'Custom', widthMm: 320, heightMm: 450 });
    expect(custom.geometry.widthMm).toBe(320);
    expect(custom.geometry.heightMm).toBe(450);
    // Bei A4 werden die uebergebenen Masse **ignoriert**, weil das Format die Quelle ist.
    const a4 = validatePublishCreationSpec({ paper: 'A4', widthMm: 999 });
    expect(a4.geometry.widthMm).toBe(PUBLISH_PAPER_SIZES.A4.widthMm);
  });

  it('lehnt eine Seitenzahl ueber der Grenze ab und nennt die Grenze', () => {
    const code = codes(() => validatePublishCreationSpec({ pages: PUBLISH_CREATION_LIMITS.maxPages + 1 }));
    expect(code).toBe(`page-count-above-maximum:${PUBLISH_CREATION_LIMITS.maxPages}`);
  });

  it('lehnt eine Seitenzahl unter der Grenze ab, statt sie auf 1 zu heben', () => {
    expect(codes(() => validatePublishCreationSpec({ pages: 0 }))).toBe(`page-count-below-minimum:${PUBLISH_CREATION_LIMITS.minPages}`);
  });

  it('lehnt eine nicht-ganzzahlige Seitenzahl ab', () => {
    expect(codes(() => validatePublishCreationSpec({ pages: 2.5 }))).toBe('page-count-not-an-integer');
  });

  it('lehnt einen Rand ab, der die Nutzflaeche leerraeumt', () => {
    expect(codes(() => validatePublishCreationSpec({ paper: 'A5', marginMm: 74 }))).toBe('page-margin-exceeds-page');
  });

  it('lehnt einen negativen Rand ab', () => {
    expect(codes(() => validatePublishCreationSpec({ marginMm: -1 }))).toBe('page-margin-below-minimum:0');
  });

  it('lehnt einen Anschnitt ueber der Grenze ab', () => {
    expect(codes(() => validatePublishCreationSpec({ bleedMm: 101 }))).toBe(`page-bleed-above-maximum:${PUBLISH_CREATION_LIMITS.maxBleedMm}`);
  });

  it('lehnt ein unbekanntes Papierformat ab', () => {
    expect(codes(() => validatePublishCreationSpec({ paper: 'Poster' as never }))).toBe('paper-standard-unknown:Poster');
  });

  it('lehnt eine unbekannte Ausrichtung ab', () => {
    expect(codes(() => validatePublishCreationSpec({ orientation: 'diagonal' as never }))).toBe('page-orientation-unknown:diagonal');
  });

  it('lehnt einen nicht-numerischen Rand ab, statt NaN weiterzureichen', () => {
    expect(codes(() => validatePublishCreationSpec({ marginMm: Number.NaN }))).toBe('page-margin-not-a-number');
  });
});

describe('createPublishProject', () => {
  it('erzeugt eine Broschuere mit zwei Seiten aus leerer Vorlage', () => {
    const model = createPublishProject({ title: 'VGT Broschuere', pages: 2 });
    assertPublishDocument(model);
    expect(model.pagesCount).toBe(2);
    expect(model.pages).toHaveLength(2);
    // Der Kern des Akzeptanzsatzes: **leer** heisst leer. Kein Beispieltext, keine Beispielrahmen.
    expect(model.frames).toEqual([]);
    expect(model.pages.every(page => page.frameIds.length === 0)).toBe(true);
    expect(model.masterPages).toHaveLength(1);
    expect(model.masterPages[0]!.headerText).toBe('');
    expect(model.masterPages[0]!.footerText).toBe('');
    expect(model.masterPages[0]!.frameIds).toEqual([]);
    expect(model.styles).toEqual([]);
    expect(model.swatches).toEqual([]);
    expect(model.assets).toEqual([]);
  });

  it('setzt Rand und Anschnitt und bleibt gueltig', () => {
    const model = createPublishProject({ marginMm: 12, bleedMm: 3 });
    expect(model.geometry.marginsMm).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
    expect(model.geometry.bleedMm).toBe(3);
    assertPublishDocument(model);
  });

  it('ist deterministisch und unterscheidet Formate an den stabilen IDs', () => {
    const left = createPublishProject({ pages: 2 });
    const right = createPublishProject({ pages: 2 });
    expect(right.pages[0]!.id).toBe(left.pages[0]!.id);
    const a3 = createPublishProject({ pages: 2, paper: 'A3' });
    expect(a3.pages[0]!.id).not.toBe(left.pages[0]!.id);
    expect(a3.masterPages[0]!.id).not.toBe(left.masterPages[0]!.id);
  });

  it('bindet jede Seite an den leeren Master', () => {
    const model = createPublishProject({ pages: 3 });
    expect(model.pages.every(page => page.masterPageId === model.masterPages[0]!.id)).toBe(true);
  });

  it('weist den ersten Abschnitt auf die erste Seite', () => {
    const model = createPublishProject({ pages: 2 });
    expect(model.sections[0]!.startPageId).toBe(model.pages[0]!.id);
    expect(model.sections[0]!.startNumber).toBe(1);
  });

  it('traegt keine Beispiel-Swatches und keine Beispielstile', () => {
    // Gegenprobe zum Beispielcharakter von `createEmptyPublishDocument`: dort stehen zwei Farbfelder und
    // sechs Stile, die kein Nutzer angelegt hat.
    const model = createPublishProject({});
    expect(model.swatches).toHaveLength(0);
    expect(model.styles).toHaveLength(0);
    expect(model.preflightProfiles).toHaveLength(0);
  });
});

describe('describePublishCreation', () => {
  it('beschreibt die leere Broschuere mit Seitenzahl, Format und leerem Master', () => {
    const model = createPublishProject({ pages: 2 });
    const report = describePublishCreation(model, 'VGT Broschuere');
    expect(report.pages).toBe(2);
    expect(report.emptyFrames).toBe(0);
    expect(report.firstPageLabel).toBe('1');
    expect(report.summary).toContain('2 pages');
    expect(report.summary).toContain('210 x 297 mm');
    expect(report.summary).toContain('empty master');
  });

  it('zaehlt vorhandene Rahmen der ersten Seite, statt null zu behaupten', () => {
    const project = createPublishProject({ pages: 2 });
    const model = addFrameToPublish(project, 'text', { content: 'A', name: 'Story' });
    expect(describePublishCreation(model, 'T').emptyFrames).toBe(1);
  });
});

describe('describeFrameReadiness -- "sofort tippen" als pruefbare Aussage', () => {
  it('ist bereit, wenn der Rahmen leer, ausgewaehlt und unverkettet ist', () => {
    const project = createPublishProject({ pages: 2 });
    const created = addFrameToPublish(project, 'text', { content: '', name: 'Story' });
    const frame = created.frames[0]!;
    const ready = describeFrameReadiness(created, frame.id);
    expect(ready.ready).toBe(true);
    expect(ready.blockers).toEqual([]);
    expect(ready.pageId).toBe(frame.pageId);
  });

  it('benennt jeden Blocker einzeln', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrame = addFrameToPublish(project, 'text', { content: '', name: 'Story' });
    const frameId = withFrame.frames[0]!.id;
    const deselected = { ...withFrame, selectedFrameId: null };
    const locked = { ...withFrame, frames: withFrame.frames.map(frame => frame.id === frameId ? { ...frame, locked: true } : frame) };
    // Der Ueberlauf kommt aus der kanonischen Schreibfunktion, nicht aus einer handgesetzten Marke.
    const overset = setPublishFrameContent(withFrame, frameId, 'x'.repeat(200_000));
    expect(describeFrameReadiness(deselected, frameId).blockers).toContain('frame-not-selected');
    expect(describeFrameReadiness(locked, frameId).blockers).toContain('frame-locked');
    expect(describeFrameReadiness(overset, frameId).blockers).toContain('frame-overset');
  });

  it('meldet einen Rahmen auf einer nicht aktiven Seite', () => {
    const project = createPublishProject({ pages: 2 });
    const withFrame = addFrameToPublish(project, 'text', { content: '', name: 'Story' });
    const onSecondPage = { ...withFrame, activePageIndex: 1 };
    expect(describeFrameReadiness(onSecondPage, withFrame.frames[0]!.id).blockers).toContain('frame-not-on-active-page');
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    const withFrame = addFrameToPublish(createPublishProject({ pages: 2 }), 'text', { content: '', name: 'Story' });
    expect(codes(() => describeFrameReadiness(withFrame, 'frame-does-not-exist'))).toBe('frame-missing');
  });
});

describe('die Randpruefung ist doppelt abgesichert', () => {
  it('kein Pfad fuehrt an der Nutzflaechenbedingung vorbei', () => {
    // Der Rand wird in der Spezifikation geprueft **und** die Planpruefung wiederholt die Bedingung.
    expect(codes(() => createPublishProject({ paper: 'A5', marginMm: 100 }))).toBe('page-margin-exceeds-page');
  });
});
