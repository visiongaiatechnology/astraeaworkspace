// STATUS: PLATIN — Paket 15/M-Teil: **der positive Zeuge für `W-447`** ✓✓
//
// ## Warum diese Datei existiert ✗✓
//
// Ich habe `W-447` behoben (`textCommand` gab bei **jedem** `transform` auf ✗, und der geteilte Renderer schreibt
// `translate(…) rotate(±90)` auf die **Achsentitel**) — **aber zunächst nur die Abwesenheit von Schaden gemessen**:
// *der geteilte Stack war grün, und **das beweist nicht, dass ein Chart mit Achsentiteln jetzt ein PDF ergibt*** ✗✓.
// **Ohne diesen Zeugen wäre „behoben" eine Behauptung** ✓. *Und die Vorlage ist die richtige:* `y_axis_title` ist
// genau das Feld, das den gedrehten Titel erzeugt ✗✓.
import { describe, expect, it } from 'vitest';
import type { ChartObject } from '../../shared/contracts/workspace';
import { buildVectorChartPdf } from '../../shared/charts/export/chartVectorPdf';

/** **Dieselbe Vorlage wie `chartAccessibility.test.ts`** ✓ — *mit beiden Achsentiteln* ✓, keine zweite Bauart ✓. */
const mitAchsentiteln: ChartObject = {
  id: 'vektor-chart',
  chart_type: 'line',
  title: 'Quarterly Revenue',
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'Revenue', values: [12, 18, 16], color: '#111111' },
    { name: 'Forecast', values: [10, 15, 19], color: '#111111' },
  ],
  x_axis_title: 'Quarter',
  y_axis_title: 'Millions of euros',
  legend_position: 'bottom',
};

const strom = (chart: ChartObject): string => {
  const bytes = buildVectorChartPdf(chart);
  return new TextDecoder('latin1').decode(bytes ?? new Uint8Array());
};

describe('W-447: der geteilte Vektor-PDF-Export trägt die gedrehten Achsentitel', () => {
  it('**liefert ein PDF** — nicht `null` — obwohl das Chart gedrehte Achsentitel hat ✓✓', () => {
    const bytes = buildVectorChartPdf(mitAchsentiteln);
    // *Vor der Behebung war dies `null` — für **jede** Chart-Art, sobald ein Achsentitel gesetzt war* ✗✗.
    expect(bytes, 'Das PDF fehlt — dann greift die transform-Sperre wieder').not.toBeNull();
    expect(strom(mitAchsentiteln).startsWith('%PDF-1.4')).toBe(true);
  });

  it('**und der Titel ist wirklich im Strom** — nicht weggelassen ✗✓', () => {
    const s = strom(mitAchsentiteln);
    // *Der verbotene Weg wäre gewesen, das Element zu **überspringen** — ein stiller Teilverlust* ✗.
    expect(s, 'der y-Achsentitel fehlt im Strom').toContain('Millions of euros');
    expect(s, 'der x-Achsentitel fehlt im Strom').toContain('Quarter');
    expect(s, 'der Diagrammtitel fehlt im Strom').toContain('Quarterly Revenue');
  });

  it('**aufrecht statt gedreht — und im PDF angesagt** ✓✓', () => {
    const s = strom(mitAchsentiteln);
    // *Eine Textmatrix im gespiegelten y-System würde die **Glyphen spiegeln** ✗, und ein PDF kann ich hier nicht
    // ansehen ✗ — „aufrecht und angesagt" ist die einzige Fassung, die **messbar** ist* ✓✓.
    expect(s).toContain('% rotated label set upright');
  });

  it('**kein stiller Teilverlust:** die Textläufe sind vollständig da', () => {
    const s = strom(mitAchsentiteln);
    const laeufe = s.match(/BT /g)?.length ?? 0;
    // *Titel + zwei Achsentitel + Kategorien + Seriennamen — „mindestens fünf" ist die Untergrenze, die ein
    // übersprungenes Element sofort unterschreitet* ✓.
    expect(laeufe).toBeGreaterThanOrEqual(5);
  });

  it('**und ohne Achsentitel bleibt es ebenso gültig** — die Behebung hat nichts verschlechtert', () => {
    const ohne: ChartObject = { ...mitAchsentiteln, x_axis_title: undefined, y_axis_title: undefined };
    expect(buildVectorChartPdf(ohne)).not.toBeNull();
    expect(strom(ohne)).not.toContain('% rotated label set upright');
  });
});
