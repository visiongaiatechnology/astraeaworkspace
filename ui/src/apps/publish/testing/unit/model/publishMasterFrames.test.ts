// STATUS: PLATIN — Publish: Master-Rahmen steuern Kopfzeilen und Seitennummern (AST-1371)
//
// Der Akzeptanzsatz lautet: „Wiederkehrende Kopfzeilen und Seitennummern über Master steuern."
//
// Gemessen vorher: `PublishMasterPage.frameIds` existierte, `effectiveMasterFrameIds` existierte — aber
// **nichts** legte je einen Master-Rahmen an (`frameIds` war immer `[]`) und **nichts** zeichnete einen. Der
// Nutzer konnte am Master nur **Text** steuern (Kopf/Fuß), keine **Rahmen**.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, assertPublishDocument, effectiveMasterFrameIds } from '../../../model/publishDocumentEngine';
import {
  PUBLISH_MASTER_FRAME_HOST_INDEX, addPublishMasterFrame, copyMasterFrameToPage, describePublishMaster,
  isPublishMasterFrame, masterFramesOf, removePublishMasterFrame, setPublishMasterFrameOverride, splitPageLayers,
} from '../../../model/publishMasterFrames';
import { verifyPublishPayloadRoundtrip } from '../../../model/publishPersistence';
import { buildPublishSvgPage } from '../../../interchange/publishExportEngine';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

/** Drei Seiten auf **einem** Master — die Form, die „wiederkehrend" pruefbar macht. */
function brochure() {
  const project = createPublishProject({ pages: 3 });
  const masterId = project.masterPages[0]!.id;
  const withHeader = addPublishMasterFrame(project, masterId, { type: 'text', name: 'Kopfzeile', content: 'VGT Broschuere', heightMm: 8 });
  return { model: withHeader.model, masterId, headerId: withHeader.frameId };
}

describe('die eine Regel: „Master-Rahmen" ist eine Zugehoerigkeit', () => {
  it('erkennt einen Master-Rahmen an der Eintragung im Master, nicht an einer zweiten Rahmenart', () => {
    const { model, headerId } = brochure();
    expect(isPublishMasterFrame(model, headerId)).toBe(true);
    const plain = addFrameToPublish(model, 'text', { content: 'Seitentext', name: 'S' });
    expect(isPublishMasterFrame(plain, plain.frames.find((frame) => frame.name === 'S')!.id)).toBe(false);
  });

  it('legt den Host auf die **benannte** Seite und traegt den Rahmen in **beide** Eigentumslisten ein', () => {
    const { model, headerId, masterId } = brochure();
    const frame = model.frames.find((candidate) => candidate.id === headerId)!;
    expect(frame.pageId).toBe(model.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.id);
    // Der Vertrag verlangt beides: `frame-unowned` sonst, und der Master braucht seine Liste.
    expect(model.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.frameIds).toContain(headerId);
    expect(model.masterPages.find((master) => master.id === masterId)!.frameIds).toContain(headerId);
    assertPublishDocument(model);
  });

  it('legt den Rahmen in den Kopfbereich, wenn nichts anderes gesagt wird', () => {
    const project = createPublishProject({ pages: 1 });
    const created = addPublishMasterFrame(project, project.masterPages[0]!.id, { type: 'text', content: 'K' });
    const frame = created.model.frames[0]!;
    const geometry = created.model.pages[0]!.geometry;
    expect(frame.yMm).toBeLessThan(geometry.marginsMm.top);
    expect(frame.xMm).toBe(geometry.marginsMm.left);
  });
});

describe('splitPageLayers — die **eine** Aufteilung, damit nichts doppelt erscheint', () => {
  it('zeigt den Master-Rahmen auf **jeder** Seite, die den Master nutzt', () => {
    const { model, headerId } = brochure();
    for (const page of model.pages) {
      expect(effectiveMasterFrameIds(model, page.id)).toContain(headerId);
      expect(splitPageLayers(model, page.id).masterFrames.map((frame) => frame.id)).toEqual([headerId]);
    }
  });

  it('zeigt ihn auf seiner **Host-Seite nicht zusaetzlich** als Seitenrahmen', () => {
    // Das ist der Fehler, den eine zweite Aufteilung nach sich zieht: zweimal derselbe Rahmen.
    const { model, headerId } = brochure();
    const hostId = model.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.id;
    expect(splitPageLayers(model, hostId).pageFrames.map((frame) => frame.id)).not.toContain(headerId);
    const allRendered = [...splitPageLayers(model, hostId).masterFrames, ...splitPageLayers(model, hostId).pageFrames].map((frame) => frame.id);
    expect(allRendered.filter((id) => id === headerId)).toHaveLength(1);
  });

  it('trennt Seitenrahmen und Master-Rahmen sauber', () => {
    const { model } = brochure();
    const withPageText = addFrameToPublish(model, 'text', { content: 'Nur Seite 3', name: 'S3' });
    const pageId = withPageText.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.id;
    const layers = splitPageLayers(withPageText, pageId);
    expect(layers.masterFrames).toHaveLength(1);
    expect(layers.pageFrames.map((frame) => frame.name)).toEqual(['S3']);
  });

  it('blendet verborgene Master-Rahmen aus', () => {
    const { model, headerId } = brochure();
    const hidden = { ...model, frames: model.frames.map((frame) => frame.id === headerId ? { ...frame, hidden: true } : frame) };
    expect(splitPageLayers(hidden, model.pages[1]!.id).masterFrames).toHaveLength(0);
  });
});

describe('masterOverrides — „auf dieser Seite nicht"', () => {
  it('nimmt den Master-Rahmen von **einer** Seite, ohne die anderen zu beruehren', () => {
    const { model, headerId } = brochure();
    const secondPage = model.pages[1]!.id;
    const overridden = setPublishMasterFrameOverride(model, secondPage, headerId, true);
    expect(splitPageLayers(overridden, secondPage).masterFrames).toHaveLength(0);
    expect(splitPageLayers(overridden, model.pages[0]!.id).masterFrames).toHaveLength(1);
    expect(splitPageLayers(overridden, model.pages[2]!.id).masterFrames).toHaveLength(1);
    // Und die Uebersteuerung ist wieder aufhebbar.
    const restored = setPublishMasterFrameOverride(overridden, secondPage, headerId, false);
    expect(splitPageLayers(restored, secondPage).masterFrames).toHaveLength(1);
  });

  it('lehnt eine Seite ohne Master, einen unbekannten Rahmen und einen fremden Master benannt ab', () => {
    const { model, headerId } = brochure();
    const withoutMaster = { ...model, pages: model.pages.map((page) => ({ ...page, masterPageId: undefined })) };
    expect(codes(() => setPublishMasterFrameOverride(withoutMaster, model.pages[1]!.id, headerId, true))).toBe('page-without-master');
    expect(codes(() => setPublishMasterFrameOverride(model, model.pages[1]!.id, 'frame-nope', true))).toBe('master-frame-missing');
    const otherMaster = { ...model, masterPages: [...model.masterPages, { id: 'master-b', name: 'B', headerText: '', footerText: '', showPageNumbers: false, frameIds: [] }], pages: model.pages.map((page, index) => index === 1 ? { ...page, masterPageId: 'master-b' } : page) };
    expect(codes(() => setPublishMasterFrameOverride(otherMaster, model.pages[1]!.id, headerId, true))).toBe('master-frame-not-on-page-master');
  });
});

describe('anlegen, entfernen, beschreiben', () => {
  it('entfernt einen Master-Rahmen aus **beiden** Eigentumslisten', () => {
    const { model, headerId, masterId } = brochure();
    const removed = removePublishMasterFrame(model, headerId);
    expect(removed.frames.some((frame) => frame.id === headerId)).toBe(false);
    expect(removed.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.frameIds).not.toContain(headerId);
    expect(removed.masterPages.find((master) => master.id === masterId)!.frameIds).not.toContain(headerId);
    assertPublishDocument(removed);
  });

  it('legt mehrere Master-Rahmen mit verschiedenen IDs an', () => {
    const { model, masterId, headerId } = brochure();
    const withFooter = addPublishMasterFrame(model, masterId, { type: 'text', name: 'Fusszeile', content: 'Seite', yMm: 280 });
    expect(withFooter.frameId).not.toBe(headerId);
    expect(masterFramesOf(withFooter.model, masterId)).toHaveLength(2);
  });

  it('lehnt einen unbekannten Master und einen unbekannten Rahmen benannt ab', () => {
    const { model, headerId } = brochure();
    expect(codes(() => addPublishMasterFrame(model, 'master-nope', { type: 'text' }))).toBe('master-missing');
    expect(codes(() => removePublishMasterFrame(model, 'frame-nope'))).toBe('master-frame-missing');
    expect(codes(() => masterFramesOf(model, 'master-nope'))).toBe('master-missing');
    // Und der Header bleibt unangetastet, wenn die Ablehnung greift.
    expect(model.frames.some((frame) => frame.id === headerId)).toBe(true);
  });

  it('beschreibt den Master in Worten — Rahmenzahl, Seiten, Kopf/Fuss, Seitennummern', () => {
    const { model, masterId } = brochure();
    const withText = { ...model, masterPages: model.masterPages.map((master) => master.id === masterId ? { ...master, headerText: 'Kapitel', footerText: 'Vertraulich', showPageNumbers: true } : master) };
    const text = describePublishMaster(withText, masterId);
    expect(text).toContain('1 master frame(s)');
    expect(text).toContain('on 3 page(s)');
    expect(text).toContain('header "Kapitel"');
    expect(text).toContain('footer "Vertraulich"');
    expect(text).toContain('page numbers shown');
  });

  it('holt eine Kopie eines Master-Rahmens auf eine Seite', () => {
    const { model, headerId } = brochure();
    const pageId = model.pages[2]!.id;
    const copy = copyMasterFrameToPage(model, headerId, pageId);
    expect(copy.pageId).toBe(pageId);
    expect(copy.pageIndex).toBe(2);
    expect(copy.id).not.toBe(headerId);
    expect(copy.content).toBe('VGT Broschuere');
    // Eine **zweite** Kopie auf dieselbe Seite waere eine doppelte ID — benannt abgelehnt.
    const withCopy = { ...model, frames: [...model.frames, copy] };
    expect(codes(() => copyMasterFrameToPage(withCopy, headerId, pageId))).toBe('frame-id-collision');
  });
});

describe('der Master-Rahmen ueberlebt Speichern und Ausgabe (AST-1371)', () => {
  it('bleibt im Speichertext und beim Wiedereroeffnen identisch', () => {
    const { model, headerId } = brochure();
    const { reopened, diff } = verifyPublishPayloadRoundtrip(model, 0);
    expect(diff.identical).toBe(true);
    expect(isPublishMasterFrame(reopened, headerId)).toBe(true);
    expect(splitPageLayers(reopened, reopened.pages[1]!.id).masterFrames).toHaveLength(1);
  });

  it('erscheint im SVG-Export genau **einmal** je Seite', () => {
    const { model, headerId } = brochure();
    const svg = buildPublishSvgPage(model, model.pages[PUBLISH_MASTER_FRAME_HOST_INDEX]!.id);
    const occurrences = svg.split(`data-vgt-id="${headerId}"`).length - 1;
    expect(occurrences).toBe(1);
    expect(svg).toContain('VGT Broschuere');
  });

  it('behaelt die Kontur und Deckung eines Master-Rahmens', () => {
    const project = createPublishProject({ pages: 2 });
    const created = addPublishMasterFrame(project, project.masterPages[0]!.id, { type: 'graphic', name: 'Kopflinie', heightMm: 2 });
    const styled = { ...created.model, frames: created.model.frames.map((frame) => frame.id === created.frameId ? { ...frame, strokeColor: '#003366', strokeWidthPt: 2, opacity: 0.5 } : frame) };
    const { reopened, diff } = verifyPublishPayloadRoundtrip(styled, 0);
    expect(diff.identical).toBe(true);
    const frame = reopened.frames.find((candidate) => candidate.id === created.frameId)!;
    expect(frame.strokeColor).toBe('#003366');
    expect(frame.strokeWidthPt).toBe(2);
    expect(frame.opacity).toBe(0.5);
  });
});
