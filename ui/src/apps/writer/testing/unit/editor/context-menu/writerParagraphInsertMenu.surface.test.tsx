// STATUS: PLATIN — Zeuge (AST-0096): das Absatzkontextmenü bietet "Absatz davor/darunter einfügen".
//
// ## Warum dieser Zeuge so gebaut ist
//
// Die Anforderung lautet: *"Implementiere und verdrahte den direkt erreichbaren sichtbaren Einstieg für
// Absatzkontextmenü mit sinnvollen Aktionen"*. Ein Eintrag, den nur eine Quelldatei nicht nennt, ist
// **kein** Nachweis — der Nachweis muss die **Oberfläche** zeigen. Deshalb rendert dieser Zeuge das
// **echte** `WriterContextMenu` und vergleicht zwei Läufe: mit und ohne die beiden Einfüge-Aktionen.
// Fehlen die Einträge, sind beide Läufe **identisch** — genau das ist die Messung.
//
// Was dieser Zeuge **nicht** kann: den Klick auslösen (kein DOM, `renderToStaticMarkup` rendert nie neu).
// Die **Wirkung** der Einträge fährt `writerContextMenuInsertActions.test.ts` über die Handler selbst.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WriterContextMenu } from '../../../../editor/context-menu/WriterContextMenu';

const noop = (): void => undefined;

const PROPS = {
  x: 40,
  y: 40,
  paragraphIndex: 1,
  onClose: noop,
  onCut: noop,
  onCopy: noop,
  onPaste: noop,
  onMoveUp: noop,
  onMoveDown: noop,
  onDuplicate: noop,
  onDelete: noop,
  onOpenParagraphFormat: noop,
  onInsertTable: noop,
} as const;

const markupWithoutInsertActions = (): string => renderToStaticMarkup(<WriterContextMenu {...PROPS} />);

const markupWithInsertActions = (): string => renderToStaticMarkup(
  <WriterContextMenu
    {...PROPS}
    onInsertParagraphBefore={noop}
    onInsertParagraphAfter={noop}
  />,
);

describe('AST-0096 — die zwei Einfüge-Einträge fehlen im heutigen Menü', () => {
  it('nennt "Absatz davor einfügen" und "Absatz darunter einfügen" im gerenderten Menü', () => {
    const markup = markupWithInsertActions();
    expect(markup).toContain('Absatz davor einfügen');
    expect(markup).toContain('Absatz darunter einfügen');
  });

  it('markiert sie als eigene Menüaktion — nicht als bloßen Text', () => {
    const markup = markupWithInsertActions();
    expect(markup).toContain('data-writer-context-menu-action="insert-paragraph-before"');
    expect(markup).toContain('data-writer-context-menu-action="insert-paragraph-after"');
  });

  it('fügt dem Menü genau zwei bedienbare Einträge hinzu — die übrigen bleiben unberührt', () => {
    const without = markupWithoutInsertActions();
    const withBoth = markupWithInsertActions();
    const menuitems = (markup: string): number => (markup.match(/role="menuitem"/g) ?? []).length;
    // Das Menü ist **dasselbe** Menü: es wird erweitert, nicht ersetzt.
    expect(menuitems(withBoth)).toBe(menuitems(without) + 2);
    // Und die vorhandenen Aktionen sind unverändert vorhanden.
    // (ASTRAEA WRITER 50 V2 · M1, WR-022: der Tabelleneintrag ist jetzt eine
    // ausdrückliche Disclosure — „Tabelle einfügen ▸" — und das Raster dahinter
    // startet geschlossen. Der Eintrag selbst bleibt unverändert vorhanden.)
    for (const label of ['Ausschneiden', 'Nach oben verschieben', 'Absatz duplizieren', 'Tabelle einfügen ▸']) {
      expect(without, label).toContain(label);
      expect(withBoth, label).toContain(label);
    }
  });

  it('stellt beide Einträge in die Absatzgruppe, vor die Absatzformatierung', () => {
    const markup = markupWithInsertActions();
    const moveDown = markup.indexOf('Nach unten verschieben');
    const before = markup.indexOf('Absatz davor einfügen');
    const after = markup.indexOf('Absatz darunter einfügen');
    const paragraphFormat = markup.indexOf('Absatz formatieren');
    expect(moveDown).toBeGreaterThanOrEqual(0);
    expect(before).toBeGreaterThan(moveDown);
    expect(after).toBeGreaterThan(before);
    expect(paragraphFormat).toBeGreaterThan(after);
  });

  it('lässt Tastaturbedienung zu: beide Einträge sind echte Knöpfe mit sichtbarer Beschriftung', () => {
    const markup = markupWithInsertActions();
    // Each button element from its opening tag to its own closing tag — a label lives *inside* the
    // element, so an opening-tag-only match could never see it.
    const buttonElements = markup
      .split('<button')
      .slice(1)
      .map((chunk) => chunk.slice(0, chunk.indexOf('</button>')));
    const before = buttonElements.filter((element) => element.includes('Absatz davor einfügen'));
    const after = buttonElements.filter((element) => element.includes('Absatz darunter einfügen'));
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    // Both are real menu items, not painted text.
    expect(before[0]).toContain('role="menuitem"');
    expect(after[0]).toContain('role="menuitem"');
    // Not disabled: inserting **before** the first paragraph is possible (afterIdx = -1).
    expect(before[0]).not.toContain('disabled');
    expect(after[0]).not.toContain('disabled');
  });
});
