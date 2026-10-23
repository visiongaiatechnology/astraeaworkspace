// STATUS: PLATIN — Publish: Stile, Grundlinienraster, Laufweite, Farbfelder und Tabellen bedienbar
//
// Die Punkte lauten: "Globale Stilaenderung auf 50 Absaetze replizieren ohne lokale Sonderfaelle zu verlieren",
// "Text an Baseline Grid ausrichten und Laufweiten praezise kontrollieren", "Spot-/Prozessfarben getrennt
// behandeln" und "Preisuebersicht aus Grid einfuegen". Vorher waren `resolvePublishStyle`, `upsertPublishStyle`
// und `alignToBaselineGrid` aus **keiner** Komponente erreichbar.
import { describe, expect, it } from 'vitest';
import type { PublishDocumentModel } from '../../../../../shared/contracts/publish/workspacePublish';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { PublishModelError, addFrameToPublish, assertPublishDocument } from '../../../model/publishDocumentEngine';
import {
  applyStyleToAllAbsaetze, assignPublishStyle, assignPublishSwatch, createPublishStyle, createPublishSwatch,
  framesUsingStyle, insertPublishTable,
  setPublishBaselineGridAlignment, setPublishTracking, swatchToCss, upsertPublishSwatch,
} from '../../../model/publishStyleOps';
// Das Ausgabeprofil gehoert zur Druckvorstufe — **eine** Definition, und sie steht dort, wo die ICC-Profile stehen.
import { describePublishOutputProfile } from '../../../prepress/publishPrepressEngine';

const codes = (run: () => unknown): string => {
  try { run(); return 'no-error'; } catch (error) { return error instanceof PublishModelError ? error.code : `not-a-model-error:${String(error)}`; }
};

const BODY_STYLE = { id: 'style-body', name: 'Body', kind: 'paragraph' as const, properties: { fontFamily: 'Georgia, serif', fontSizePt: 11, leadingPt: 15 } };

/** Ein Dokument mit `count` Textabsaetzen im Stil `style-body`. */
function withParagraphs(count: number, localOverride = false) {
  const base: PublishDocumentModel = { ...createPublishProject({ pages: 2 }), styles: [BODY_STYLE] };
  return Array.from({ length: count }, (_, index) => index).reduce<PublishDocumentModel>(
    (carry, index) => addFrameToPublish(carry, 'text', {
      content: `Absatz ${index + 1}`,
      name: `P${index + 1}`,
      paragraphStyleId: BODY_STYLE.id,
      ...(localOverride && index === 0 ? { fontSizePt: 18, fontFamily: 'Arial' } : {}),
    }),
    base,
  );
}

describe('framesUsingStyle', () => {
  it('findet genau die Absaetze des Stils', () => {
    const model = withParagraphs(3);
    expect(framesUsingStyle(model, BODY_STYLE.id, 'paragraph')).toHaveLength(3);
    expect(framesUsingStyle(model, 'style-unknown', 'paragraph')).toHaveLength(0);
  });
});

describe('applyStyleToAllAbsaetze — die Akzeptanzhandlung mit 50 Absaetzen', () => {
  it('repliziert eine Aenderung auf 50 Absaetze', () => {
    const model = withParagraphs(50);
    const result = applyStyleToAllAbsaetze(model, BODY_STYLE.id, { fontSizePt: 12, leadingPt: 16 });
    expect(result.affectedFrameIds).toHaveLength(50);
    // Jeder Absatz traegt die neuen Werte — auf beiden Ebenen, damit Anzeige und Stil nicht auseinanderlaufen.
    expect(result.model.frames.every(frame => frame.typography!.fontSizePt === 12)).toBe(true);
    expect(result.model.frames.every(frame => frame.typography!.leadingPt === 16)).toBe(true);
    expect(result.model.frames.every(frame => frame.fontSizePt === 12)).toBe(true);
    // Und keine Vorgabe wird als "lokaler Sonderfall" gezaehlt: alle 50 tragen nur die Vorgabewerte.
    expect(result.preservedLocalOverrideCount).toBe(0);
    assertPublishDocument(result.model);
  });

  it('verliert keine lokalen Sonderfaelle: sie werden gezaehlt und bleiben erhalten', () => {
    const model = withParagraphs(4, true);
    const result = applyStyleToAllAbsaetze(model, BODY_STYLE.id, { fontFamily: 'Helvetica', fontSizePt: 12, leadingPt: 16 });
    /**
     * Genau **ein** Absatz traegt echte lokale Werte (18 pt, Arial); die anderen drei tragen nur die Vorgaben
     * aus `createPublishFrame` (10 pt, system-ui) und sind deshalb **keine** Sonderfaelle.
     */
    expect(result.preservedLocalOverrideCount).toBe(1);
    // Der abweichende Absatz wird gezaehlt und nicht ueberschrieben.
    const local = result.model.frames.find(frame => frame.name === 'P1')!;
    expect(local.fontSizePt).toBe(18);
    expect(local.fontFamily).toBe('Arial');
    // Die drei uebrigen bekommen den Stilwert — vorher wirkte die Stilaenderung auf gar keinen Absatz.
    const plain = result.model.frames.find(frame => frame.name === 'P2')!;
    expect(plain.fontSizePt).toBe(12);
    expect(plain.fontFamily).toBe('Helvetica');
  });

  it('aendert nur die Absaetze des Stils, nicht das ganze Dokument', () => {
    const base = { ...createPublishProject({ pages: 2 }), styles: [BODY_STYLE] };
    const withOther = addFrameToPublish(base, 'text', { content: 'Anders', name: 'Anders', paragraphStyleId: 'style-other' });
    const model = addFrameToPublish(withOther, 'text', { content: 'Body', name: 'Body', paragraphStyleId: BODY_STYLE.id });
    const result = applyStyleToAllAbsaetze(model, BODY_STYLE.id, { fontSizePt: 20 });
    expect(result.affectedFrameIds).toHaveLength(1);
    // Der Absatz mit anderem Stil behaelt seinen Wert — auf beiden Ebenen.
    const other = result.model.frames.find(frame => frame.name === 'Anders')!;
    expect(other.typography!.fontSizePt).toBe(10);
    expect(other.fontSizePt).toBe(10);
  });

  it('weigert sich bei einem unbekannten Stil', () => {
    const model = withParagraphs(2);
    expect(codes(() => applyStyleToAllAbsaetze(model, 'style-nope', { fontSizePt: 12 }))).toBe('style-missing');
  });
});

describe('assignPublishStyle', () => {
  it('weist einen Absatzstil zu und lehnt die falsche Art ab', () => {
    const model = withParagraphs(2);
    const withCharacter = { ...model, styles: [...model.styles, { id: 'style-emph', name: 'Emphasis', kind: 'character' as const, properties: { italic: true } }] };
    const frameId = model.frames[0]!.id;
    const character = assignPublishStyle(withCharacter, frameId, 'style-emph');
    expect(character.frames.find(frame => frame.id === frameId)!.characterStyleId).toBe('style-emph');
    const image = addFrameToPublish(model, 'image', { name: 'Bild' });
    expect(codes(() => assignPublishStyle(image, image.selectedFrameId!, BODY_STYLE.id))).toBe('style-kind-mismatch');
    expect(codes(() => assignPublishStyle(model, frameId, 'style-nope'))).toBe('style-missing');
  });
});

describe('Grundlinienraster und Laufweite', () => {
  it('setzt die Ausrichtung am Raster und nimmt sie zurueck', () => {
    const model = withParagraphs(1);
    const frameId = model.frames[0]!.id;
    const aligned = setPublishBaselineGridAlignment(model, frameId, true);
    expect(aligned.frames[0]!.text!.alignToBaselineGrid).toBe(true);
    expect(setPublishBaselineGridAlignment(aligned, frameId, false).frames[0]!.text!.alignToBaselineGrid).toBe(false);
  });

  it('setzt die Laufweite innerhalb der benannten Grenze', () => {
    const model = withParagraphs(1);
    const frameId = model.frames[0]!.id;
    expect(setPublishTracking(model, frameId, 25).frames[0]!.typography!.tracking).toBe(25);
    expect(setPublishTracking(model, frameId, -1000).frames[0]!.typography!.tracking).toBe(-1000);
    expect(codes(() => setPublishTracking(model, frameId, 10_001))).toBe('typography-tracking-boundary');
    expect(codes(() => setPublishTracking(model, frameId, Number.NaN))).toBe('typography-tracking-boundary');
  });

  it('weigert sich bei einem Bildrahmen', () => {
    const model = addFrameToPublish(withParagraphs(1), 'image', { name: 'Bild' });
    expect(codes(() => setPublishBaselineGridAlignment(model, model.selectedFrameId!, true))).toBe('frame-not-text');
    expect(codes(() => setPublishTracking(model, model.selectedFrameId!, 5))).toBe('frame-not-text');
  });
});

describe('Farbfelder: Prozess- und Sonderfarben getrennt', () => {
  const cmyk = { id: 'sw-cmyk', name: 'Hausblau', space: 'CMYK' as const, components: [100, 60, 0, 10], tintPercent: 100 };
  const spot = { id: 'sw-spot', name: 'Gold', space: 'Spot' as const, components: [0, 20, 60, 10], tintPercent: 100, spotName: 'PANTONE 871 C' };

  it('legt ein CMYK- und ein Sonderfarbfeld an', () => {
    const withCmyk = upsertPublishSwatch(createPublishProject({ pages: 1 }), cmyk);
    const withBoth = upsertPublishSwatch(withCmyk, spot);
    expect(withBoth.swatches.map(swatch => swatch.id)).toEqual(['sw-cmyk', 'sw-spot']);
  });

  it('stellt Prozess- und Sonderfarbe unterscheidbar dar', () => {
    expect(swatchToCss(cmyk)).toBe('cmyk(100% 60% 0% 10%)');
    // Eine Sonderfarbe wird als Token dargestellt, nicht als geratene RGB-Naeherung.
    expect(swatchToCss(spot)).toBe('spot(PANTONE 871 C 100%)');
    expect(swatchToCss({ id: 's', name: 'Grau', space: 'Gray', components: [50], tintPercent: 100 })).toBe('rgb(128 128 128)');
    expect(swatchToCss({ id: 'r', name: 'Rot', space: 'RGB', components: [255, 0, 0], tintPercent: 100 })).toBe('rgb(255 0 0)');
    expect(swatchToCss({ id: 'r2', name: 'Rot halb', space: 'RGB', components: [255, 0, 0], tintPercent: 50 })).toBe('rgb(128 0 0)');
  });

  it('lehnt ungueltige Komponenten, Tints und fehlende Sondernamen ab', () => {
    const project = createPublishProject({ pages: 1 });
    // Zu **wenige** Komponenten: der generische Grund (die Zahl fehlt, nicht der Wert).
    expect(codes(() => upsertPublishSwatch(project, { ...cmyk, components: [100, 60] }))).toBe('swatch-components-invalid');
    // Ein Wert **ausserhalb**: der spezifischere Grund nennt Farbraum, Stelle und Bereich — *das ist die
    // Verbesserung aus Publish-16: „ungueltig" allein sagt dem Nutzer nicht, welchen Wert er aendern soll.*
    expect(codes(() => upsertPublishSwatch(project, { ...cmyk, components: [100, 60, 0, 120] }))).toBe('swatch-component-out-of-range:CMYK:3:0..100');
    expect(codes(() => upsertPublishSwatch(project, { ...cmyk, tintPercent: 101 }))).toBe('swatch-tint-invalid');
    expect(codes(() => upsertPublishSwatch(project, { ...spot, spotName: '' }))).toBe('swatch-spot-name-missing');
    expect(codes(() => upsertPublishSwatch(project, { ...cmyk, name: '  ' }))).toBe('swatch-name-empty');
  });

  it('ersetzt ein vorhandenes Feld, statt es zu verdoppeln', () => {
    const once = upsertPublishSwatch(createPublishProject({ pages: 1 }), cmyk);
    const twice = upsertPublishSwatch(once, { ...cmyk, name: 'Hausblau 2' });
    expect(twice.swatches).toHaveLength(1);
    expect(twice.swatches[0]!.name).toBe('Hausblau 2');
  });

  it('weist ein Feld einem Rahmen als Fuellung oder Kontur zu', () => {
    const withSwatch = upsertPublishSwatch(withParagraphs(1), cmyk);
    const frameId = withSwatch.frames[0]!.id;
    const filled = assignPublishSwatch(withSwatch, frameId, cmyk.id, 'fill');
    expect(filled.frames[0]!.fillColor).toBe('cmyk(100% 60% 0% 10%)');
    const stroked = assignPublishSwatch(withSwatch, frameId, cmyk.id, 'stroke');
    expect(stroked.frames[0]!.strokeColor).toBe('cmyk(100% 60% 0% 10%)');
    expect(stroked.frames[0]!.strokeWidthPt).toBe(1);
  });

  it('weigert sich bei einem unbekannten Feld oder Rahmen', () => {
    const withSwatch = upsertPublishSwatch(withParagraphs(1), cmyk);
    expect(codes(() => assignPublishSwatch(withSwatch, withSwatch.frames[0]!.id, 'sw-nope', 'fill'))).toBe('swatch-missing');
    expect(codes(() => assignPublishSwatch(withSwatch, 'frame-nope', cmyk.id, 'fill'))).toBe('frame-missing');
  });
});

describe('createPublishStyle — einen Stil anlegen (AST-1386)', () => {
  it('legt einen Stil mit stabiler ID an', () => {
    const project = createPublishProject({ pages: 1 });
    expect(project.styles).toEqual([]);
    const first = createPublishStyle(project, 'Fliesstext', 'paragraph', { fontSizePt: 11 });
    expect(first.model.styles).toHaveLength(1);
    expect(first.model.styles[0]!.name).toBe('Fliesstext');
    expect(first.model.styles[0]!.kind).toBe('paragraph');
    expect(first.model.styles[0]!.properties.fontSizePt).toBe(11);
    // **Stabil:** derselbe Name und dieselbe Art ergeben **denselben** Stil, keinen zweiten.
    const second = createPublishStyle(first.model, 'Fliesstext', 'paragraph', { fontSizePt: 99 });
    expect(second.model.styles).toHaveLength(1);
    expect(second.styleId).toBe(first.styleId);
    expect(second.model.styles[0]!.properties.fontSizePt).toBe(11);
  });

  it('haelt verschiedene Arten auseinander', () => {
    const first = createPublishStyle(createPublishProject({ pages: 1 }), 'Titel', 'paragraph');
    const second = createPublishStyle(first.model, 'Titel', 'character');
    expect(second.model.styles).toHaveLength(2);
    expect(second.styleId).not.toBe(first.styleId);
  });

  it('ist danach zuweisbar und replizierbar — der angelegte Stil wirkt wirklich', () => {
    const created = createPublishStyle(createPublishProject({ pages: 1 }), 'Fliesstext', 'paragraph', { fontSizePt: 11 });
    const withFrame = addFrameToPublish(created.model, 'text', { content: 'A', name: 'P1', paragraphStyleId: created.styleId });
    const replication = applyStyleToAllAbsaetze(withFrame, created.styleId, { fontSizePt: 13 });
    expect(replication.affectedFrameIds).toHaveLength(1);
    expect(replication.model.frames[0]!.fontSizePt).toBe(13);
  });

  it('lehnt leeren Namen, unbekannte Art und die Obergrenze benannt ab', () => {
    const project = createPublishProject({ pages: 1 });
    expect(codes(() => createPublishStyle(project, '   ', 'paragraph'))).toBe('style-name-empty');
    expect(codes(() => createPublishStyle(project, 'X', 'heading' as never))).toBe('style-kind-unknown:heading');
    const full = { ...project, styles: Array.from({ length: 8192 }, (_, index) => ({ id: `s${index}`, name: `S${index}`, kind: 'paragraph' as const, properties: {} })) };
    expect(codes(() => createPublishStyle(full, 'Einer zu viel', 'paragraph'))).toBe('style-count-limit');
  });
});

describe('createPublishSwatch — ein Farbfeld anlegen (AST-1396)', () => {
  it('legt ein CMYK-Feld mit vier Komponenten an', () => {
    const project = createPublishProject({ pages: 1 });
    expect(project.swatches).toEqual([]);
    const created = createPublishSwatch(project, { name: 'Hausblau', space: 'CMYK', components: [100, 60, 0, 10] });
    expect(created.model.swatches).toHaveLength(1);
    expect(created.model.swatches[0]!.components).toEqual([100, 60, 0, 10]);
    expect(created.model.swatches[0]!.tintPercent).toBe(100);
  });

  it('fuellt fehlende Komponenten auf, statt abzulehnen', () => {
    const gray = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Grau', space: 'Gray', components: [40] });
    expect(gray.model.swatches[0]!.components).toEqual([40]);
    // **RGB fuehrt 0…255** — dieselbe Bedeutung wie `rgbToCmyk` in der Prepress-Engine.
    const rgb = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Rot', space: 'RGB', components: [255, 0, 0] });
    expect(rgb.model.swatches[0]!.components).toEqual([255, 0, 0]);
    // Fehlende Werte werden mit 0 aufgefuellt.
    const partial = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Halbweiss', space: 'RGB', components: [255] });
    expect(partial.model.swatches[0]!.components).toEqual([255, 0, 0]);
  });

  it('prueft die Wertebereiche **je Farbraum**, nicht mit einer Zahl fuer alle', () => {
    // Gemessen (eigener Fehler): die erste Fassung pruefte ueberall 0…100 und haette `rgb(255,0,0)` abgelehnt.
    expect(codes(() => createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Zu hell', space: 'RGB', components: [256, 0, 0] }))).toBe('swatch-component-out-of-range:RGB:0:0..255');
    expect(codes(() => createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Zu viel', space: 'CMYK', components: [101, 0, 0, 0] }))).toBe('swatch-component-out-of-range:CMYK:0:0..100');
    // Lab fuehrt negatives a/b.
    const lab = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Lab-Gruen', space: 'Lab', components: [50, -80, 60] });
    expect(lab.model.swatches[0]!.components).toEqual([50, -80, 60]);
    expect(codes(() => createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Lab falsch', space: 'Lab', components: [50, -200, 0] }))).toBe('swatch-component-out-of-range:Lab:1:-128..127');
  });

  it('behandelt Sonderfarbe als **eigenen** Weg: der Name ist Pflicht und wird gesetzt', () => {
    const created = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Gold', space: 'Spot', components: [0, 20, 60, 10], spotName: 'PANTONE 871 C' });
    const swatch = created.model.swatches[0]!;
    expect(swatch.space).toBe('Spot');
    expect(swatch.spotName).toBe('PANTONE 871 C');
    expect(swatchToCss(swatch)).toBe('spot(PANTONE 871 C 100%)');
    // Ohne eigenen Sondernamen wird der Feldname benutzt — die Pflicht bleibt erfuellt.
    const plain = createPublishSwatch(createPublishProject({ pages: 1 }), { name: 'Silber', space: 'Spot', components: [0, 0, 0, 30] });
    expect(plain.model.swatches[0]!.spotName).toBe('Silber');
  });

  it('ist stabil und danach zuweisbar — anlegen ersetzt **nicht**', () => {
    const project = createPublishProject({ pages: 1 });
    const first = createPublishSwatch(project, { name: 'Hausblau', space: 'CMYK', components: [100, 60, 0, 10] });
    const second = createPublishSwatch(first.model, { name: 'Hausblau', space: 'CMYK', components: [1, 2, 3, 4] });
    expect(second.model.swatches).toHaveLength(1);
    expect(second.swatchId).toBe(first.swatchId);
    // **Anlegen ist nicht ersetzen** — dieselbe Regel wie bei `createPublishStyle`.
    expect(second.model.swatches[0]!.components).toEqual([100, 60, 0, 10]);
    // Wer aendern will, aendert — ueber den vorhandenen Aufnehmer.
    const changed = upsertPublishSwatch(second.model, { ...second.model.swatches[0]!, components: [1, 2, 3, 4] });
    expect(changed.swatches[0]!.components).toEqual([1, 2, 3, 4]);
    const withFrame = addFrameToPublish(second.model, 'text', { content: 'A', name: 'P1' });
    const assigned = assignPublishSwatch(withFrame, withFrame.frames[0]!.id, second.swatchId, 'fill');
    expect(assigned.frames[0]!.fillColor).toBe('cmyk(100% 60% 0% 10%)');
  });

  it('lehnt einen leeren Namen ueber den vorhandenen Aufnehmer ab', () => {
    expect(codes(() => createPublishSwatch(createPublishProject({ pages: 1 }), { name: '  ', space: 'CMYK', components: [0, 0, 0, 0] }))).toBe('swatch-name-empty');
  });
});

describe('describePublishOutputProfile — das Ausgabeprofil anzeigen (AST-1396)', () => {
  it('nennt Name, Standard, TIC-Grenze und den **einen** Unterschied: eingebettet oder nur benannt', () => {
    const referenced = describePublishOutputProfile(createPublishProject({ pages: 1 }), 'FOGRA51');
    expect(referenced.profileId).toBe('FOGRA51');
    expect(referenced.name).toContain('FOGRA51');
    expect(referenced.standard).toBe('ISO 12647-2:2013');
    expect(referenced.maxTicPercent).toBe(300);
    expect(referenced.state).toBe('referenced');
    // Die Aussage traegt **beide** Tatsachen als Text — nicht nur eine Farbe.
    expect(referenced.summary).toContain('registered condition name only');
    expect(referenced.summary).toContain('300% TIC');
  });

  it('meldet `embedded`, sobald das Profil wirklich im Dokument liegt', () => {
    const project = createPublishProject({ pages: 1 });
    const withProfile = {
      ...project,
      iccProfiles: [{ id: 'FOGRA51', name: 'PSO Coated v3', colorSpace: 'CMYK' as const, source: 'builtin' as const, sha256: 'a'.repeat(64), maxTicPercent: 300 }],
    };
    const view = describePublishOutputProfile(withProfile, 'FOGRA51');
    expect(view.state).toBe('embedded');
    expect(view.summary).toContain('profile embedded in the document');
  });

  it('faellt bei unbekannter Kennung auf das Vorgabeprofil zurueck, statt zu werfen', () => {
    expect(describePublishOutputProfile(createPublishProject({ pages: 1 }), 'UNKNOWN' as never).profileId).toBe('FOGRA51');
  });
});

describe('insertPublishTable', () => {
  it('legt eine Tabelle an und bindet sie an den Rahmen', () => {
    const model = withParagraphs(1);
    const frameId = model.frames[0]!.id;
    const result = insertPublishTable(model, frameId, 'Preisuebersicht', 4, 3);
    expect(result.table.rows).toBe(4);
    expect(result.table.columns).toBe(3);
    const frame = result.model.frames.find(candidate => candidate.id === frameId)!;
    expect(frame.type).toBe('table');
    expect(frame.tableId).toBe(result.table.id);
    expect(frame.semanticRole).toBe('Table');
    expect(result.model.tables).toHaveLength(1);
    assertPublishDocument(result.model);
  });

  it('weigert sich bei einem unbekannten Rahmen', () => {
    expect(codes(() => insertPublishTable(withParagraphs(1), 'frame-nope', 'T', 2, 2))).toBe('frame-missing');
  });
});
