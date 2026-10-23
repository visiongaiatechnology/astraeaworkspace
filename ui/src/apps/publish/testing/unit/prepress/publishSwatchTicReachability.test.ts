// STATUS: DIAMANT VGT SUPREME — Publish: die Schwaeze-TIC wird gemeldet (GAP-0053)
//
// WARUM DIESER TEST — GEMESSEN, nicht angenommen:
//
// `analyzePublishPrepress` zaehlt seit jeher die Schwaeze mit
// (`for(const swatch of model.swatches){const c=colorToCmyk(swatch); samples++;
// max=Math.max(max,c.totalInk); …}`), aber es pushte fuer sie KEINE Violation.
// `colorToCmyk` nimmt bei einer CMYK-Schwaeze die Komponenten DIREKT, damit
// sind Werte bis 400 % erreichbar — im Gegensatz zu `hexToCmyk` in der
// Frames-Schleife, das als UCR-Naeherung hoechstens 300 % erzeugt.
//
// DIE FOLGE WAR EIN WIDERSPRUCH IM SELBEN BERICHT: `maxTicMeasured` konnte
// 400 % melden, waehrend `violations` leer blieb und `ticViolationsCount` 0
// sagte. Ein Pruefer, der die hoechste gemessene Zahl liest und die
// Verstossliste daneben, bekam zwei Antworten auf dieselbe Frage.
//
// DIESER TEST MISST DIE WIRKUNG, NICHT DIE ZEILE. Er baut ein Dokument mit
// einer CMYK-Schwaeze, deren Auftrag die Grenze ueberschreitet, und liest, was
// der Bericht meldet. Es gibt kein `focus()`, kein `activeElement` und keine
// Attrappen an der geprueften Stelle.
import { describe, expect, it } from 'vitest';
import { createPublishProject } from '../../../model/publishDocumentFactory';
import { createPublishSwatch } from '../../../model/publishStyleOps';
import { analyzePublishPrepress, colorToCmyk } from '../../../prepress/publishPrepressEngine';

/** Ein Dokument mit genau EINER Schwaeze, deren Auftrag ueber der Grenze liegt. */
function documentMitVollton() {
  const project = createPublishProject({ pages: 1, bleedMm: 3 });
  // 100/100/100/100 = 400 % Gesamtauftrag. FOGRA51 erlaubt 300 %.
  const withSwatch = createPublishSwatch(project, {
    name: 'Tiefschwarz',
    space: 'CMYK',
    components: [100, 100, 100, 100],
  });
  return withSwatch.model;
}

/** Ein Dokument mit einer Schwaeze, die die Grenze EINHAELT. */
function documentMitSparfarbe() {
  const project = createPublishProject({ pages: 1, bleedMm: 3 });
  const withSwatch = createPublishSwatch(project, {
    name: 'Hausblau',
    space: 'CMYK',
    components: [100, 60, 0, 10],
  });
  return withSwatch.model;
}

describe('GAP-0053 — die Schwaetze-TIC wird gemeldet, nicht nur gezaehlt', () => {
  it('die Schwaeze allein erreicht die Grenze ueberhaupt', () => {
    // Die Voraussetzung des ganzen Befundes, gemessen: die CMYK-Quelle kann
    // Werte erzeugen, die die RGB-Quelle nicht erreichen kann.
    const vollton = colorToCmyk({ id: 's1', name: 'Tiefschwarz', space: 'CMYK', components: [100, 100, 100, 100], tintPercent: 100 });
    expect(vollton.totalInk).toBe(400);

    const project = createPublishProject({ pages: 1, bleedMm: 3 });
    const mitSchwaeze = createPublishSwatch(project, { name: 'Tiefschwarz', space: 'CMYK', components: [100, 100, 100, 100] });
    const bericht = analyzePublishPrepress(mitSchwaeze.model, 'FOGRA51');
    // Das ist die ZAHL, die schon immer stimmte.
    expect(bericht.maxTicMeasured).toBe(400);
    expect(bericht.profile.maxTicPercent).toBe(300);
  });

  it('und sie erscheint als VERSTOSS — die Liste widerspricht der Zahl nicht mehr', () => {
    const bericht = analyzePublishPrepress(documentMitVollton(), 'FOGRA51');

    // DIE WIRKUNG: der Verstoss steht in der Liste.
    expect(bericht.violations).toHaveLength(1);
    expect(bericht.ticViolationsCount).toBe(1);

    const verstoss = bericht.violations[0]!;
    expect(verstoss.measuredTic).toBe(400);
    expect(verstoss.limitTic).toBe(300);
    // Die Schwaeze ist das Dokumentobjekt — ihre Kennung steht im Befund.
    expect(verstoss.frameId).toContain('swatch');
    expect(verstoss.description).toContain('Tiefschwarz');
    expect(verstoss.description).toContain('400');
    expect(verstoss.description).toContain('300');
  });

  it('eine Schwaeze INNERHALB der Grenze erzeugt KEINEN Verstoss', () => {
    // Die Gegenrichtung: der Test darf nicht jeden Vollton melden.
    const bericht = analyzePublishPrepress(documentMitSparfarbe(), 'FOGRA51');
    expect(bericht.maxTicMeasured).toBe(170);
    expect(bericht.violations).toHaveLength(0);
    expect(bericht.ticViolationsCount).toBe(0);
  });

  it('der Bericht ist in sich stimmig: gleiche Zahl, gleiche Aussage', () => {
    const bericht = analyzePublishPrepress(documentMitVollton(), 'FOGRA51');
    // Vorher konnte `maxTicMeasured` die Grenze ueberschreiten, waehrend
    // `violations` leer war. Jetzt gilt: ueber der Grenze heisst gemeldet.
    const ueberGrenze = bericht.maxTicMeasured > bericht.profile.maxTicPercent;
    expect(ueberGrenze).toBe(bericht.violations.length > 0);
    expect(bericht.pdfXCompliant).toBe(false);
    expect(bericht.summary).toContain('400');
  });
});
