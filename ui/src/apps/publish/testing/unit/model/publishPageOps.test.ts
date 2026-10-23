// STATUS: PLATIN — Publish: Seitenanlage, Umordnung, Master, Drehung
//
// Der Punkt lautet: "Seiten anlegen, duplizieren und sortieren, Story-Anker bleiben erhalten". Vorher konnte
// die Toolbar Seiten nur **anhaengen** und durchblaettern; `removePublishPage` existierte gar nicht.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import {
  PublishModelError, addFrameToPublish, addPublishMasterPage, addPublishPage, assertPublishDocument,
  duplicatePublishPage, movePublishPage, removePublishPage, setPublishPageMaster, setPublishPageRotation,
  updatePublishMasterPage,
} from '../../../model/publishDocumentEngine';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

const label = (model: ReturnType<typeof createPublishProject>) => model.pages.map(page => page.id.slice(-4)).join('|');

describe('addPublishPage', () => {
  it('fuegt nach dem angegebenen Index ein und aktiviert die neue Seite', () => {
    const project = createPublishProject({ pages: 2 });
    const next = addPublishPage(project, project.geometry, 0);
    expect(next.pages).toHaveLength(3);
    expect(next.activePageIndex).toBe(1);
    assertPublishDocument(next);
  });

  it('erbt den Master der Nachbarseite', () => {
    const project = createPublishProject({ pages: 1 });
    const withMaster = setPublishPageMaster(project, project.pages[0]!.id, project.masterPages[0]!.id);
    const next = addPublishPage(withMaster, withMaster.geometry, 0);
    expect(next.pages[1]!.masterPageId).toBe(withMaster.masterPages[0]!.id);
  });

  it('weigert sich bei unbekanntem Index nicht, sondern klemmt ihn', () => {
    // `addPublishPage` klemmt: ein Aufruf mit Index 99 haengt hinten an, statt zu werfen.
    const project = createPublishProject({ pages: 2 });
    expect(addPublishPage(project, project.geometry, 99).activePageIndex).toBe(2);
  });
});

describe('duplicatePublishPage', () => {
  it('kopiert Geometrie, Master und alle Rahmen mit neuen IDs', () => {
    const project = createPublishProject({ pages: 1 });
    const withFrame = addFrameToPublish(project, 'text', { content: 'Original', name: 'Story' });
    const next = duplicatePublishPage(withFrame, 0);
    expect(next.pages).toHaveLength(2);
    const copy = next.pages[1]!;
    expect(copy.geometry).toEqual(withFrame.pages[0]!.geometry);
    expect(copy.masterPageId).toBe(withFrame.pages[0]!.masterPageId);
    expect(copy.name).toBe(`${withFrame.pages[0]!.name} copy`);
    expect(copy.frameIds).toHaveLength(1);
    // Neue IDs: eine Kopie darf den Originalrahmen nicht ueberschreiben.
    expect(copy.frameIds[0]).not.toBe(withFrame.frames[0]!.id);
    const copiedFrame = next.frames.find(frame => frame.id === copy.frameIds[0]!)!;
    expect(copiedFrame.content).toBe('Original');
    expect(copiedFrame.pageId).toBe(copy.id);
    assertPublishDocument(next);
  });

  it('weigert sich bei einem Index ausserhalb der Grenzen', () => {
    const project = createPublishProject({ pages: 2 });
    expect(codes(() => duplicatePublishPage(project, 2))).toBe('page-index-boundary');
    expect(codes(() => duplicatePublishPage(project, -1))).toBe('page-index-boundary');
  });
});

describe('movePublishPage', () => {
  it('ordnet um und haelt das Eigentum der Rahmen intakt', () => {
    const project = createPublishProject({ pages: 3 });
    const movingId = project.pages[0]!.id;
    const next = movePublishPage(project, 0, 2);
    expect(next.pages[2]!.id).toBe(movingId);
    expect(next.activePageIndex).toBe(2);
    assertPublishDocument(next);
    // `page.frameIds` bleibt die kanonische Eigentumsliste: keine Seite verliert ihren Rahmen.
    for (const page of next.pages) for (const id of page.frameIds) expect(next.frames.find(frame => frame.id === id)!.pageId).toBe(page.id);
  });

  it('ist bei gleichem Index ein No-op mit gueltigem Ergebnis', () => {
    const project = createPublishProject({ pages: 2 });
    const next = movePublishPage(project, 1, 1);
    expect(label(next)).toBe(label(project));
    assertPublishDocument(next);
  });

  it('weigert sich bei einem Index ausserhalb der Grenzen', () => {
    const project = createPublishProject({ pages: 2 });
    expect(codes(() => movePublishPage(project, 0, 5))).toBe('page-index-boundary');
  });
});

describe('removePublishPage', () => {
  it('loescht die Seite und ihre Rahmen und waehlt einen gueltigen Index', () => {
    const project = createPublishProject({ pages: 3 });
    const withFrame = addFrameToPublish({ ...project, activePageIndex: 1 }, 'text', { content: 'X', name: 'S' });
    const next = removePublishPage(withFrame, 1);
    expect(next.pages).toHaveLength(2);
    expect(next.frames).toHaveLength(0);
    expect(next.activePageIndex).toBe(1);
    assertPublishDocument(next);
  });

  it('verweigert das Loeschen der letzten Seite, statt ein leeres Dokument zu erzeugen', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => removePublishPage(project, 0))).toBe('page-last-undeletable');
  });

  it('trennt Verkettungen, die auf die geloeschte Seite zeigen', () => {
    const project = createPublishProject({ pages: 2 });
    const withFirst = addFrameToPublish(project, 'text', { content: 'A', name: 'A' });
    const secondPage = { ...withFirst, activePageIndex: 1 };
    const withSecond = addFrameToPublish(secondPage, 'text', { content: 'B', name: 'B' });
    const [frameA, frameB] = withSecond.frames;
    // Von Hand verkettet, damit die Verweise auf die zweite Seite zeigen.
    const linked = {
      ...withSecond,
      frames: withSecond.frames.map(frame => frame.id === frameA!.id
        ? { ...frame, text: { ...frame.text!, nextFrameId: frameB!.id } }
        : { ...frame, text: { ...frame.text!, previousFrameId: frameA!.id } }),
    };
    const next = removePublishPage(linked, 1);
    expect(next.frames.find(frame => frame.id === frameA!.id)!.text!.nextFrameId).toBeUndefined();
    assertPublishDocument(next);
  });
});

describe('Master-Seiten', () => {
  it('legt einen Master an und weist ihn einer Seite zu', () => {
    const project = createPublishProject({ pages: 2 });
    const withMaster = addPublishMasterPage(project, 'B-Master', 'Kapitel', 'Seite');
    const master = withMaster.masterPages[1]!;
    expect(master.headerText).toBe('Kapitel');
    const assigned = setPublishPageMaster(withMaster, withMaster.pages[0]!.id, master.id);
    expect(assigned.pages[0]!.masterPageId).toBe(master.id);
    assertPublishDocument(assigned);
  });

  it('kann den Master wieder entfernen', () => {
    const project = createPublishProject({ pages: 1 });
    const cleared = setPublishPageMaster(project, project.pages[0]!.id, null);
    expect(cleared.pages[0]!.masterPageId).toBeUndefined();
    assertPublishDocument(cleared);
  });

  it('weigert sich bei einem unbekannten Master', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => setPublishPageMaster(project, project.pages[0]!.id, 'master-nope'))).toBe('page-master-missing');
  });

  it('weigert sich bei einem leeren Namen', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => addPublishMasterPage(project, '   '))).toBe('master-name-empty');
  });

  it('aendert Kopf- und Fusstext und die Seitennummernanzeige', () => {
    const project = createPublishProject({ pages: 1 });
    const master = project.masterPages[0]!;
    const next = updatePublishMasterPage(project, master.id, { headerText: 'Astraea', footerText: 'Vertraulich', showPageNumbers: false });
    expect(next.masterPages[0]!.headerText).toBe('Astraea');
    expect(next.masterPages[0]!.footerText).toBe('Vertraulich');
    expect(next.masterPages[0]!.showPageNumbers).toBe(false);
    assertPublishDocument(next);
  });

  it('weigert sich, den Namen zu leeren', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => updatePublishMasterPage(project, project.masterPages[0]!.id, { name: '  ' }))).toBe('master-name-empty');
  });
});

describe('setPublishPageRotation', () => {
  it('setzt 90/180/270 und weist andere Werte ab', () => {
    const project = createPublishProject({ pages: 1 });
    expect(setPublishPageRotation(project, project.pages[0]!.id, 90).pages[0]!.rotationDeg).toBe(90);
    expect(codes(() => setPublishPageRotation(project, project.pages[0]!.id, 45 as never))).toBe('page-rotation-invalid');
  });

  it('weigert sich bei einer unbekannten Seite', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => setPublishPageRotation(project, 'page-nope', 90))).toBe('page-missing');
  });
});
