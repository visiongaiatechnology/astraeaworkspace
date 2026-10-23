// STATUS: PLATIN — Publish nimmt einen Writer-Dokumentabschnitt als **verlinkte Story** an
//
// Der Punkt lautet: „Dokumentabschnitt als verlinkte Story in Rahmen setzen" (`AST-1983`, Integration & Release).
// Gemessen war die Publish-Seite zweigeteilt: die **Ablagezone führt den Modus schon** ✓✓
// (`publishWorkspaceDropZone.ts:160/631/530-533`), aber **niemand nahm die Zustellung an** ✗✓ —
// `PublishWorkspaceDropResolution` wurde in genau zwei Dateien erwähnt, beide **erzeugen** sie.
//
// Diese Datei prüft die **annehmende Hälfte**: aus einer zugestellten Resolution wird ein verlinkter
// Story-Rahmen — mit benannten Ablehnungen und **ohne** heimlichen Modus-Default.
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument, WorkspaceObject } from '../../../../shared/contracts/workspace';
import type { TextBlockObject } from '../../../../shared/contracts/writer/workspaceWriterText';
import { createPublishProject } from '../../model/publishDocumentFactory';
import { addFrameToPublish, assertPublishDocument } from '../../model/publishDocumentEngine';
import {
  PUBLISH_STORY_ACCEPTED_INTENT, PUBLISH_STORY_CARRIER_OBJECT_KIND, PUBLISH_STORY_MODES,
  acceptPublishStoryDrop, publishStoryAcceptanceText, publishStoryLinkMode, publishStoryRefusalMessage,
} from '../../integrations/publishStoryAcceptance';
import type { PublishStoryAcceptanceRefusal } from '../../integrations/publishStoryAcceptance';
import type { PublishWorkspaceDropResolution } from '../../drop-zone/publishWorkspaceDropZoneContract';

/**
 * Ein **gültiger** `TextBlockObject` — die Absätze eines Writer-Dokuments.
 *
 * Meine Annahme liest die Absätze **nicht** (sie prüft die Objektart und nimmt das Objekt wörtlich mit), aber der
 * Vertrag verlangt die Form. *Ein `as any` hätte den Test grün und die Aussage wertlos gemacht.*
 */
function textBlock(id: string, text: string): TextBlockObject {
  return {
    id,
    paragraphs: [{
      id: `${id}-p1`,
      style: { alignment: 'left', line_height: 1.4, space_before: 0, space_after: 0 },
      spans: [{ text }],
    }],
  };
}

/** Ein Writer-Dokument mit dem `TextBlock`-Wurzelobjekt — die Form, die der Träger-Erzeuger liest. */
function writerDocument(sectionId = 'tb-root'): WorkspaceDocument {
  const objects: Record<string, WorkspaceObject> = {
    [sectionId]: { type: 'TextBlock', data: textBlock(sectionId, 'Der erste Absatz.') },
  };
  return {
    id: 'writer-doc', title: 'Architektur', kind: 'Writer', created_at: 0, modified_at: 0, version: 7,
    theme_id: 'vgt-default', root_object_ids: [sectionId], objects,
  };
}

function resolution(overrides: Partial<PublishWorkspaceDropResolution> = {}): PublishWorkspaceDropResolution {
  return {
    adapterId: 'fabric-writer-textblock-to-publish',
    intent: PUBLISH_STORY_ACCEPTED_INTENT,
    integrationKind: 'live',
    mode: 'Live',
    sourceDocumentId: 'writer-doc',
    sourceObjectId: 'tb-root',
    targetDocumentId: 'publish-doc',
    sourceVersion: 7,
    targetVersion: 1,
    ...overrides,
  };
}

/** Ein Publish-Dokument mit einem **ausgewählten** Textrahmen — der Zielrahmen der Ablage. */
function publishWithSelectedFrame() {
  const project = createPublishProject({ pages: 2 });
  const withFrame = addFrameToPublish(project, 'text', { content: '', name: 'Story frame' });
  return { model: withFrame, frameId: withFrame.selectedFrameId! };
}

const codes = (run: () => unknown): string => {
  const result = run() as { ok: boolean; reason?: string };
  return result.ok ? 'no-error' : String(result.reason);
};

describe('publishStoryLinkMode — der Modus wird **einmal** übersetzt', () => {
  it('führt die Objektart des Abschnitts genau einmal — denselben Namen wie der Writer-Träger', () => {
    // Der Erzeuger benennt `WRITER_WORKSPACE_CARRIER_SECTION_KIND = 'TextBlock'`; die Publish-Seite wiederholt
    // **denselben** Namen. Ein anderer hier wäre eine zweite Vokabel für dieselbe Sache.
    expect(PUBLISH_STORY_CARRIER_OBJECT_KIND).toBe('TextBlock');
  });

  it('übersetzt die beiden kanonischen Modi', () => {
    expect(publishStoryLinkMode('Live')).toBe('live');
    expect(publishStoryLinkMode('Frozen')).toBe('frozen');
  });

  it('bildet keinen unbekannten Wert auf einen stillen Rückfall ab', () => {
    // `'broken'` ist der Zustand „Quelle weg" und entsteht nur über `breakPublishReference` — nie aus einem Träger.
    expect(publishStoryLinkMode('broken')).toBeNull();
    expect(publishStoryLinkMode('LIVE')).toBeNull();
    expect(publishStoryLinkMode(undefined)).toBeNull();
    expect(publishStoryLinkMode(7)).toBeNull();
  });

  it('führt genau die zwei Modi, die aus einem Live-Verweis werden können', () => {
    expect([...PUBLISH_STORY_MODES]).toEqual(['Live', 'Frozen']);
  });
});

describe('acceptPublishStoryDrop — die gültigen Wege', () => {
  it('setzt einen Live-Verweis als verlinkte Story in den ausgewählten Rahmen', () => {
    const { model, frameId } = publishWithSelectedFrame();
    const step = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() });
    expect(step.ok).toBe(true);
    if (!step.ok) throw new Error('unerwartet abgelehnt');
    const frame = step.model.frames.find(candidate => candidate.id === frameId)!;
    // Der Rahmen **trägt** den Verweis — und der Verweis steht im Modell, nicht nur am Rahmen.
    expect(frame.workspaceReferenceId).toBe(step.reference.id);
    expect(step.model.workspaceReferences).toHaveLength(1);
    expect(step.reference.sourceKind).toBe('writer-story');
    expect(step.reference.sourceDocumentId).toBe('writer-doc');
    // Der Abschnitt wird **benannt** (die kanonische Form führt kein sechstes Feld).
    expect(step.reference.selector).toBe('tb-root');
    expect(step.reference.mode).toBe('live');
    expect(step.reference.lastSourceVersion).toBe(7);
    assertPublishDocument(step.model);
  });

  it('nimmt dieselbe Ablage kein zweites Mal an: der Rahmen trägt schon eine Story', () => {
    const { model } = publishWithSelectedFrame();
    const first = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() });
    if (!first.ok) throw new Error('unerwartet abgelehnt');
    expect(codes(() => acceptPublishStoryDrop(first.model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() })))
      .toBe('publish-story-already-linked');
  });

  it('friert den Abschnitt **wörtlich** ein — nicht interpretiert', () => {
    const { model } = publishWithSelectedFrame();
    const step = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution({ mode: 'Frozen' }) }, { 'writer-doc': writerDocument() });
    expect(step.ok).toBe(true);
    if (!step.ok) throw new Error('unerwartet abgelehnt');
    const reference = step.model.workspaceReferences[0]!;
    expect(reference.mode).toBe('frozen');
    // Der Schnappschuss ist das Quellobjekt selbst — eine zweite Lesart des Writer-Modells wäre ein zweiter Parser.
    expect(reference.frozenSnapshot).toEqual(writerDocument().objects['tb-root']);
  });

  it('nimmt auch einen **anderen** TextBlock als den Wurzelknoten an', () => {
    const document = writerDocument();
    document.objects['tb-second'] = { type: 'TextBlock', data: textBlock('tb-second', 'Zweiter.') };
    const { model } = publishWithSelectedFrame();
    const step = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution({ sourceObjectId: 'tb-second' }) }, { 'writer-doc': document });
    expect(step.ok).toBe(true);
    if (!step.ok) throw new Error('unerwartet abgelehnt');
    expect(step.reference.selector).toBe('tb-second');
  });

  it('ist deterministisch: dieselbe Ablage ergibt dieselbe Referenz-ID', () => {
    const { model } = publishWithSelectedFrame();
    const left = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() });
    const right = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() });
    if (!left.ok || !right.ok) throw new Error('unerwartet abgelehnt');
    expect(right.reference.id).toBe(left.reference.id);
  });
});

describe('acceptPublishStoryDrop — jede Ablehnung ist benannt', () => {
  const cases: Array<[string, () => string, PublishStoryAcceptanceRefusal]> = [
    ['nichts zugestellt', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: false }, {})), 'publish-carrier-resolution-not-delivered'],
    ['Quelle nicht in der Karte', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: resolution() }, {})), 'publish-carrier-source-missing'],
    ['Quellobjekt fehlt', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: resolution({ sourceObjectId: 'tb-weg' }) }, { 'writer-doc': writerDocument() })), 'drop_source_object_missing'],
    /**
     * Ein Objekt mit **fremder** Objektart. Nur die Kennung `type` ist hier von Bedeutung — die Nutzlast wird
     * nicht gelesen. *Deshalb steht hier bewusst kein vollständiger `ShapeObject`-Aufbau: er würde eine zweite
     * Wahrheit über die Form eines Draw-Objekts in einen Publish-Test tragen.*
     */
    ['Objektart ist keine Story', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: resolution({ sourceObjectId: 'shape-1' }) }, { 'writer-doc': { ...writerDocument(), objects: { 'shape-1': { type: 'Shape', data: {} } as unknown as WorkspaceObject } } })), 'publish-carrier-object-kind-not-story'],
    ['Absicht ist eine Kopie', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: resolution({ intent: 'COPY', integrationKind: 'copy' }) }, { 'writer-doc': writerDocument() })), 'drop_intent_not_supported'],
    ['Modus fehlt', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: { ...resolution(), mode: undefined } }, { 'writer-doc': writerDocument() })), 'drop_live_mode_required'],
    ['Modus unbekannt', () => codes(() => acceptPublishStoryDrop(publishWithSelectedFrame().model, { delivered: true, resolution: resolution({ mode: 'Ewig' as never }) }, { 'writer-doc': writerDocument() })), 'publish-carrier-mode-unknown'],
  ];
  for (const [name, run, expected] of cases) {
    it(`lehnt ab: ${name}`, () => { expect(run()).toBe(expected); });
  }

  it('lehnt ab, wenn kein Rahmen ausgewählt ist', () => {
    const { model } = publishWithSelectedFrame();
    const deselected = { ...model, selectedFrameId: null };
    expect(codes(() => acceptPublishStoryDrop(deselected, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() })))
      .toBe('publish-carrier-frame-missing');
  });

  it('lehnt einen **Bildrahmen** als Ziel ab, statt den falschen Rahmen zu verlinken', () => {
    // Gemessen beim Schreiben: eine erste Fassung suchte „irgendeinen Textrahmen ohne Verweis" — und hätte bei
    // mehreren freien Rahmen den falschen verlinkt.
    const base = publishWithSelectedFrame();
    const withImage = addFrameToPublish(base.model, 'image', { name: 'Bild' });
    expect(codes(() => acceptPublishStoryDrop(withImage, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() })))
      .toBe('publish-carrier-object-kind-not-story');
  });

  it('nennt zu jedem lokalen Grund einen sichtbaren Satz', () => {
    const local: PublishStoryAcceptanceRefusal[] = [
      'publish-carrier-resolution-not-delivered', 'publish-carrier-source-missing', 'publish-carrier-frame-missing',
      'publish-carrier-object-kind-not-story', 'publish-carrier-mode-unknown', 'publish-story-already-linked',
    ];
    for (const code of local) {
      const text = publishStoryRefusalMessage(code);
      expect(text, code).not.toBe(code);
      expect(text.trim().length, code).toBeGreaterThan(10);
    }
    // Und die durchgereichten Codes des vorhandenen Vokabulars haben **hier** ihren Satz, ohne zweites Wörterbuch.
    expect(publishStoryRefusalMessage('drop_live_mode_required')).toContain('Live or Frozen');
    expect(publishStoryRefusalMessage('drop_intent_not_supported')).toContain('LIVE_REFERENCE');
    expect(publishStoryRefusalMessage('drop_source_object_missing')).toContain('no longer part');
  });
});

describe('publishStoryAcceptanceText — Behandlung ohne Farbe sichtbar', () => {
  it('unterscheidet Live und Eingefroren in Worten', () => {
    const { model } = publishWithSelectedFrame();
    const live = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution() }, { 'writer-doc': writerDocument() });
    const frozen = acceptPublishStoryDrop(model, { delivered: true, resolution: resolution({ mode: 'Frozen' }) }, { 'writer-doc': writerDocument() });
    if (!live.ok || !frozen.ok) throw new Error('unerwartet abgelehnt');
    expect(publishStoryAcceptanceText(live.reference)).toContain('live-linked story');
    expect(publishStoryAcceptanceText(frozen.reference)).toContain('frozen section');
    expect(publishStoryAcceptanceText(live.reference)).toContain('tb-root');
  });
});
