// STATUS: PLATIN — Zeuge (AST-0096): die **Wirkung** der beiden Einfüge-Einträge, gefahren über die
// Handler, die das Menü tatsächlich bekommt.
//
// `renderToStaticMarkup` kann keine Ereignisse auslösen — "gerendert ist nicht bedient". Deshalb fährt
// dieser Zeuge nicht das Markup, sondern die **Aktionsfabrik**, aus der das Menü seine Einträge erhält:
// `createWriterContextMenuInsertActions`. Der Spion auf `addParagraph` zeigt, **welchen Index** der
// jeweilige Eintrag an `handleAddParagraph(afterIdx)` gibt — und genau das ist die Wirkung.
import { describe, expect, it, vi } from 'vitest';
import {
  createWriterContextMenuInsertActions,
  resolveWriterParagraphInsertTarget,
} from '../../../../editor/context-menu/writerContextMenuActions';

const noop = (): void => undefined;

describe('AST-0096 — welchen Absatz der Eintrag trifft', () => {
  it('setzt "davor" auf den Vorgänger und "darunter" auf den Absatz selbst', () => {
    expect(resolveWriterParagraphInsertTarget(2, 5)).toEqual({ before: 1, after: 2 });
  });

  it('kann auch **vor** dem ersten Absatz einfügen — der Index ist dann -1', () => {
    expect(resolveWriterParagraphInsertTarget(0, 5)).toEqual({ before: -1, after: 0 });
  });

  it('hängt an, wenn kein Absatz getroffen ist (Rechtsklick neben dem Text)', () => {
    expect(resolveWriterParagraphInsertTarget(-1, 5)).toEqual({ before: 4, after: 4 });
  });

  it('bleibt bei einem leeren Dokument beim Anfang statt zu werfen', () => {
    expect(resolveWriterParagraphInsertTarget(-1, 0)).toEqual({ before: -1, after: -1 });
    expect(resolveWriterParagraphInsertTarget(3, 0)).toEqual({ before: -1, after: -1 });
  });

  it('trifft einen Index hinter dem letzten Absatz nicht daneben', () => {
    // Der Index ist veraltet (das Dokument ist geschrumpft): gemeint ist der letzte Absatz.
    expect(resolveWriterParagraphInsertTarget(9, 3)).toEqual({ before: 1, after: 2 });
  });
});

describe('AST-0096 — die Einträge sind verdrahtet, nicht nur beschriftet', () => {
  it('ruft "Absatz davor einfügen" mit dem Vorgänger-Index auf', () => {
    const addParagraph = vi.fn();
    const actions = createWriterContextMenuInsertActions({
      paragraphCount: 4,
      targetParagraphIndex: 2,
      anchorParagraphId: 'p-2',
      addParagraph,
      insertTable: noop,
    });
    actions.onInsertParagraphBefore();
    expect(addParagraph).toHaveBeenCalledTimes(1);
    expect(addParagraph).toHaveBeenCalledWith(1);
  });

  it('ruft "Absatz darunter einfügen" mit dem Absatz-Index auf', () => {
    const addParagraph = vi.fn();
    const actions = createWriterContextMenuInsertActions({
      paragraphCount: 4,
      targetParagraphIndex: 2,
      anchorParagraphId: 'p-2',
      addParagraph,
      insertTable: noop,
    });
    actions.onInsertParagraphAfter();
    expect(addParagraph).toHaveBeenCalledTimes(1);
    expect(addParagraph).toHaveBeenCalledWith(2);
  });

  it('unterscheidet die beiden Einträge am ersten Absatz — sonst wären sie derselbe Eintrag', () => {
    const addParagraph = vi.fn();
    const actions = createWriterContextMenuInsertActions({
      paragraphCount: 4,
      targetParagraphIndex: 0,
      anchorParagraphId: 'p-0',
      addParagraph,
      insertTable: noop,
    });
    actions.onInsertParagraphBefore();
    actions.onInsertParagraphAfter();
    expect(addParagraph.mock.calls).toEqual([[-1], [0]]);
  });
});
