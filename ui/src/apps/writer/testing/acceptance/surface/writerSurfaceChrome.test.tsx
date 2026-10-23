// @vitest-environment happy-dom
// STATUS: PLATIN — Quiet chrome: passive header/footer, small context menu, German copy
//
// ASTRAEA WRITER 50 V2 · M1: WR-003, WR-004, WR-021, WR-024.
//
// These are the three surfaces a user meets *before* typing: the header strip on the
// sheet, the right-click menu, and the words on the empty page. Each of them used to
// shout. The tests below dispatch real events and read the real DOM, because "the
// marker exists in the markup" is not the same as "the input is gone".
import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { PageSetupConfig } from '../../../types';
import { WriterPageHeaderFooter } from '../../../layout/pages/WriterPageHeaderFooter';
import { WriterContextMenu } from '../../../editor/context-menu/WriterContextMenu';
import { workspaceText } from '../../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  pageNumberFormat: 'arabic',
  pageNumberPosition: 'footer-center',
  headerText: 'Astraea',
  footerText: '',
};

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

async function render(element: React.ReactElement): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(element);
  });
  return container;
}

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  if (container) {
    container.remove();
    container = null;
  }
});

describe('WR-003 — the header is a zone, not an input field', () => {
  it('renders the stored text without a single form control', async () => {
    const host = await render(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        pageSetup={pageSetup}
      />,
    );
    // The text of an existing header stays visible at its place …
    expect(host.textContent).toContain('Astraea');
    // … but nothing on the sheet invites typing, and no technical label is shown.
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('[data-writer-header-footer-state="passive"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Kopfzeilentext"]')).toBeNull();
    // The paper format is not printed next to the running text any more.
    expect(host.textContent).not.toContain('A4');
  });
});

describe('WR-004 — header/footer editing is a deliberate double-click', () => {
  it('asks for the edit mode on a double-click in the zone and never on a single one', async () => {
    const onRequestEdit = vi.fn();
    const host = await render(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={1}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        pageSetup={pageSetup}
        onRequestEdit={onRequestEdit}
      />,
    );
    const zone = host.querySelector<HTMLElement>('[data-writer-header-zone="true"]');
    expect(zone).not.toBeNull();
    await act(async () => {
      zone!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onRequestEdit, 'ein Einzelklick darf nie in den Kopfzeilenmodus führen').not.toHaveBeenCalled();
    await act(async () => {
      zone!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    expect(onRequestEdit).toHaveBeenCalledTimes(1);
  });

  it('edits the template and leaves the mode on Escape', async () => {
    const onExitEdit = vi.fn();
    const host = await render(
      <WriterPageHeaderFooter
        type="header"
        pageIndex={2}
        totalPages={3}
        documentTitle="Abnahme"
        wordCount={0}
        pageSetup={{ ...pageSetup, headerText: 'Astraea · Seite {PAGE}' }}
        editing
        onExitEdit={onExitEdit}
      />,
    );
    const input = host.querySelector<HTMLInputElement>('[data-writer-header-editor="true"]');
    expect(input, 'im Editiermodus muss ein Feld da sein').not.toBeNull();
    // The field holds the template, the preview shows this page's values.
    expect(input!.value).toBe('Astraea · Seite {PAGE}');
    expect(host.textContent).toContain('Astraea · Seite 2');
    // The marking must be temporary and visible; it exists only in this mode.
    expect(host.querySelector('[data-writer-header-footer-state="editing"]')).not.toBeNull();
    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onExitEdit).toHaveBeenCalledTimes(1);
  });
});

describe('WR-021 — a short menu with named disclosures and working keyboard exit', () => {
  function menu(): React.ReactElement {
    return (
      <WriterContextMenu
        x={40}
        y={40}
        paragraphIndex={0}
        onClose={() => undefined}
        onCut={() => undefined}
        onCopy={() => undefined}
        onPaste={() => undefined}
        onMoveUp={() => undefined}
        onMoveDown={() => undefined}
        onDuplicate={() => undefined}
        onDelete={() => undefined}
        onOpenParagraphFormat={() => undefined}
        onInsertTable={() => undefined}
      />
    );
  }

  it('starts a paper context with fewer entries than a text context', async () => {
    const textHost = await render(menu());
    const textItems = textHost.querySelectorAll('[role="menuitem"]').length;
    await act(async () => { root!.unmount(); });
    root = null;
    textHost.remove();
    container = null;

    const paperHost = await render(
      <WriterContextMenu x={40} y={40} kind="paper" onClose={() => undefined} onInsertTable={() => undefined} />,
    );
    const paperItems = paperHost.querySelectorAll('[role="menuitem"]').length;
    expect(paperItems).toBeLessThan(textItems);
    // A paper right-click offers no paragraph commands at all.
    expect(paperHost.querySelector('[data-writer-context-menu-group="Absatz"]')).toBeNull();
  });

  it('closes on Escape and gives the focus back to where it was', async () => {
    const onClose = vi.fn();
    // Something the user was in before the menu opened.
    const before = document.createElement('div');
    before.tabIndex = 0;
    document.body.appendChild(before);
    before.focus();
    expect(document.activeElement).toBe(before);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterContextMenu x={40} y={40} paragraphIndex={0} onClose={onClose} onCut={() => undefined} />,
      );
    });
    const menuRoot = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menuRoot).not.toBeNull();
    // The keyboard focus starts inside the menu, on the first permitted command.
    const first = container.querySelector<HTMLElement>('[role="menuitem"]');
    expect(document.activeElement).toBe(first);

    await act(async () => {
      menuRoot!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => { root!.unmount(); });
    root = null;
    container.remove();
    container = null;
    // Focus is handed back — the caret the user had before the menu is not lost.
    expect(document.activeElement).toBe(before);
    before.remove();
  });

  it('moves the focus with the arrow keys and keeps disabled entries out', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <WriterContextMenu
          x={40}
          y={40}
          paragraphIndex={0}
          onClose={() => undefined}
          onCut={() => undefined}
          onCopy={() => undefined}
          onMoveUp={() => undefined}
          onMoveDown={() => undefined}
          canMoveUp={false}
        />,
      );
    });
    const menuRoot = container.querySelector<HTMLElement>('[role="menu"]')!;
    const enabled = Array.from(menuRoot.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      .filter((item) => !item.hasAttribute('disabled') && item.closest('[hidden]') === null);
    // Real keyboard use: the key event originates on the focused entry and bubbles.
    expect(document.activeElement).toBe(enabled[0]);
    await act(async () => {
      enabled[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(enabled[1]);
    await act(async () => {
      enabled[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(enabled[enabled.length - 1]);
    await act(async () => {
      enabled[enabled.length - 1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    // Wrapping at the end rather than dead-ending.
    expect(document.activeElement).toBe(enabled[0]);
    // The disabled "Nach oben verschieben" never takes the focus.
    expect(enabled.some((item) => item.textContent?.includes('Nach oben verschieben'))).toBe(false);
  });
});

describe('WR-024 — the quiet view is localized, not hardcoded English', () => {
  it('has a writer translation for every locale, so no raw key can be rendered', () => {
    const keys = [
      'writer.surfaceLabel',
      'writer.placeholderBody',
      'writer.placeholderTitle',
      'writer.placeholderHeading',
      'writer.headerEditHint',
      'writer.statusWords',
      'writer.statusCharacters',
      'writer.statusParagraphs',
      'writer.statusPages',
      'writer.statusReadingTime',
      'writer.statusTrackChanges',
      'writer.statusShowOutline',
      'writer.statusHideOutline',
      'writer.statusZoom',
    ] as const;
    for (const locale of WORKSPACE_LOCALES) {
      for (const key of keys) {
        const value = workspaceText(key, locale);
        expect(typeof value, `${locale} · ${key}`).toBe('string');
        expect(value.length, `${locale} · ${key} is empty`).toBeGreaterThan(0);
        // A raw key leaking into the UI is the defect this guards against.
        expect(value, `${locale} · ${key}`).not.toBe(key);
      }
    }
  });

  it('speaks German by default and no longer greets the user with "sovereign text"', () => {
    expect(workspaceText('writer.placeholderBody', 'de-DE')).toBe('Text schreiben …');
    expect(workspaceText('writer.placeholderTitle', 'de-DE')).toBe('Dokumenttitel …');
    expect(workspaceText('writer.placeholderHeading', 'de-DE')).toBe('Überschrift …');
    for (const locale of WORKSPACE_LOCALES) {
      const body = workspaceText('writer.placeholderBody', locale);
      expect(body).not.toContain('sovereign');
      expect(body).not.toContain('Type ');
      expect(workspaceText('writer.placeholderHeading', locale)).not.toBe('Heading 1');
    }
  });
});
