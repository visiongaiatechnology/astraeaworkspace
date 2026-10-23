import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Paragraph } from '../../../../shared/contracts/workspace';
import type { PageSetupConfig } from '../../types';
import { ensureWriterStyleCatalog } from '../../formatting/styles/writerStyles';
import { recalculateNotes } from '../../references/notes/writerNotesEngine';
import { WriterPagePaper } from '../../layout/pages/WriterPagePaper';

// AST-0001 · Masterplan Zeile 117 fordert Maus- **und** Tastatursteuerung.
//
// ## Warum diese Datei existiert
//
// Runde 151 hat bewiesen, dass die fünf DEF-RE-001-Auflöser **lasttragend getestet** sind: eine Neutralisierung
// lässt 5 bis 15 Tests rot werden. **Das beweist den Auflöser, nicht die Verdrahtung.** Genau dieser Fall ist
// in dieser Sitzung eingetreten: `resolveWriterEnterIntent` war vollständig getestet **und verdrahtet**, und
// es brauchte zwei Runden (137/138), um die Verdrahtung überhaupt zu finden.
//
// ## Warum `WriterPagePaper` und nicht `WriterEditor`
//
// Gemessen in Runde 160:
//
//   WriterEditor       4 Props, 2 Hooks (useEffect, useMemo)  → direkter Aufruf scheitert: kein Hook-Dispatcher
//   WriterPagePaper   49 Props, 0 Hooks                       → direkter Aufruf funktioniert
//
// **Diese Komponente hat keine Hooks**, also braucht der Aufruf keinen React-Render und keinen `Capture`-
// Wrapper. Das `div[data-writer-page-body="true"]` steht in ihrem **eigenen** JSX, deshalb ist der Handler
// direkt im Rückgabewert erreichbar.
//
// ## Was zugesichert wird — die Verdrahtung, nicht die Wirkung
//
// Der Weg ist in Runde 158 durchgezeichnet:
//
//   WriterPagePaper.onKeyDown → onKeyboardEntry(key, modifiers) → handleKeyboardEntry → … → onUpdateDocument
//
// **Hier wird die erste Kante geprüft:** ruft `onKeyDown` die übergebene `onKeyboardEntry`-Prop mit der Taste
// und den Modifikatoren — und setzt es `preventDefault` **nur**, wenn die Prop `true` zurückgibt?
//
// Der zweite Punkt ist die Regel aus Runde 112: ein `preventDefault` ohne übernommenen Tastendruck würde
// Ctrl+S, F5 und Tab verschlucken.
//
// Die Prop-Satz-Vorlage stammt aus `writerPagePaper.domContract.test.tsx` — ein **laufender** Test, der
// beweist, dass dieser Satz rendert.

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: '',
  footerText: '',
};

const styleCatalog = ensureWriterStyleCatalog(undefined, undefined);

function paragraph(id: string, text: string): Paragraph {
  return {
    id,
    style: { alignment: 'left', line_height: 1.6, space_before: 0, space_after: 0 },
    spans: [{ text }],
  };
}

const emptyParagraph = paragraph('p1', '');

function buildPage(paragraphs: Paragraph[]) {
  return {
    id: 'page-1',
    pageIndex: 1,
    paragraphs,
    fragments: paragraphs.map((item) => ({
      key: `${item.id}:0`,
      paragraph: item,
      startOffset: 0,
      endOffset: item.spans.reduce((total, span) => total + span.text.length, 0),
      lineCount: 1,
      isFirst: true,
      isLast: true,
    })),
    tableFragments: [],
    usedFlowHeightPx: 0,
    availableFlowHeightPx: 500,
    isFirst: true,
    pageSetup,
    sectionId: 'document-default',
    sectionPageIndex: 1,
    displayPageNumber: 1,
    displayPageNumberString: '1',
  };
}

type AnyElement = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;

/**
 * Expands the element tree inline the way `collectButtons` does in the whiteboard toolbar test. Needed only
 * for the *children* of the page body here - the page body itself sits in `WriterPagePaper`'s own JSX.
 */
function collect(node: React.ReactNode, matches: (element: AnyElement) => boolean): AnyElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => collect(child, matches));
  if (!React.isValidElement(node)) return [];
  const element = node as AnyElement;
  const found = matches(element) ? [element] : [];
  return [...found, ...collect(element.props.children, matches)];
}

/**
 * Calls `WriterPagePaper` **directly** - legal because it has no hooks - and returns the element tree. That is
 * the difference from `writerEditorRenderWitness`, where `WriterEditor` must go through a render to get a
 * hook dispatcher.
 */
function paperProps(onKeyboardEntry: (key: string, modifiers: unknown) => boolean) {
  const paragraphs = [emptyParagraph];
  return {
    page: buildPage(paragraphs),
    totalPages: 1,
    docWordCount: 0,
    viewMode: 'print',
    showRuler: false,
    effectivePageSetup: pageSetup,
    isLight: true,
    paperBg: 'text-slate-900',
    backgroundColor: '#ffffff',
    activeParagraph: paragraphs[0],
    activeParagraphId: paragraphs[0]?.id ?? null,
    paragraphs,
    tables: [],
    images: [],
    equations: [],
    footnotes: [],
    separatedNotes: recalculateNotes([], []),
    styles: styleCatalog.paragraphStyles,
    styleCatalog,
    draggedPIdx: null,
    dragOverPIdx: null,
    showNonPrinting: false,
    reviewMode: 'none',
    reviewerFilter: 'all',
    revisions: [],
    documentTitle: 'Witness',
    readOnly: false,
    onParagraphChange: vi.fn(() => 0),
    onTextSelection: vi.fn(),
    onSelectParagraph: vi.fn(),
    onAddParagraph: vi.fn(),
    onEmptyAreaClick: vi.fn(),
    onKeyboardEntry,
  };
}

function findPageBody(onKeyboardEntry: (key: string, modifiers: unknown) => boolean): AnyElement {
  const tree = (WriterPagePaper as unknown as (props: unknown) => React.ReactNode)(paperProps(onKeyboardEntry));
  const pageBody = collect(tree, (element) => element.props['data-writer-page-body'] === 'true')[0];
  expect(pageBody, 'the page body must exist in the element tree').toBeTruthy();
  return pageBody!;
}

describe('WriterPagePaper keyboard wiring (AST-0001)', () => {
  it('forwards a keystroke on the empty page to onKeyboardEntry', () => {
    const onKeyboardEntry = vi.fn(() => false);
    const pageBody = findPageBody(onKeyboardEntry);
    expect(typeof pageBody.props.onKeyDown, 'the page body must carry an onKeyDown').toBe('function');

    (pageBody.props.onKeyDown as (event: unknown) => void)({
      key: 'H',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      preventDefault: vi.fn(),
    });

    expect(onKeyboardEntry, 'the keystroke must reach the entry resolver').toHaveBeenCalledTimes(1);
    expect(onKeyboardEntry).toHaveBeenCalledWith('H', { ctrlKey: false, metaKey: false, altKey: false });
  });

  it('prevents the default only when the entry was actually taken', () => {
    // Taken: the resolver returns true -> preventDefault, so the character does not also reach the browser.
    const accepted = vi.fn(() => true);
    const acceptedPageBody = findPageBody(accepted);
    const preventWhenAccepted = vi.fn();
    (acceptedPageBody.props.onKeyDown as (event: unknown) => void)({
      key: 'H', ctrlKey: false, metaKey: false, altKey: false, preventDefault: preventWhenAccepted,
    });
    expect(preventWhenAccepted, 'an accepted keystroke must be prevented').toHaveBeenCalled();

    // Not taken: the resolver returns false -> no preventDefault, or Ctrl+S, F5 and Tab are swallowed.
    const ignored = vi.fn(() => false);
    const ignoredPageBody = findPageBody(ignored);
    const preventWhenIgnored = vi.fn();
    (ignoredPageBody.props.onKeyDown as (event: unknown) => void)({
      key: 'F5', ctrlKey: false, metaKey: false, altKey: false, preventDefault: preventWhenIgnored,
    });
    expect(preventWhenIgnored, 'F5 must not be swallowed').not.toHaveBeenCalled();
  });
});
