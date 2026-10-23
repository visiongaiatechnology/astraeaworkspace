// STATUS: PLATIN — rendered locale and value-preservation coverage for Writer fields.
import type { ReactElement, ReactNode } from 'react';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../../shell/localization/workspaceLocaleTypes';
import type { PageSetupConfig } from '../../../types';
import { WriterFieldsModal } from '../WriterFieldsModal';
import { WRITER_FIELDS_COPY, WRITER_FIELD_IDS, type WriterFieldId } from '../writerFieldsLocale';

const hookState = vi.hoisted(() => ({ cursor: 0, values: [] as string[] }));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: (initial: string) => {
      const index = hookState.cursor++;
      const value = hookState.values[index] ?? initial;
      return [value, (next: string | ((current: string) => string)) => {
        const current = hookState.values[index] ?? initial;
        hookState.values[index] = typeof next === 'function' ? next(current) : next;
      }] as const;
    },
  };
});

vi.mock('../../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

type ButtonProps = {
  'aria-label'?: string;
  children?: ReactNode;
  onClick?: () => void;
};

type ElementProps = {
  children?: ReactNode;
  className?: string;
};

const findElement = <Props extends ElementProps>(
  node: ReactNode,
  predicate: (element: ReactElement<Props>) => boolean,
): ReactElement<Props> | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement<Props>(child, predicate);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement<Props>(node)) return undefined;
  if (predicate(node)) return node;
  return findElement<Props>(node.props.children, predicate);
};

const findButton = (
  node: ReactNode,
  predicate: (button: ReactElement<ButtonProps>) => boolean,
): ReactElement<ButtonProps> | undefined => findElement<ButtonProps>(node, (element) => element.type === 'button' && predicate(element));

const textContent = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (!isValidElement<ElementProps>(node)) return '';
  return textContent(node.props.children);
};

const EXPECTED_CODES: Record<WriterFieldId, string> = {
  DATE_DE: String.raw`{DATE \@ "dd.MM.yyyy"}`,
  DATE_ISO: String.raw`{DATE \@ "yyyy-MM-dd"}`,
  TIME: String.raw`{TIME \@ "HH:mm:ss"}`,
  PAGE: '{PAGE}',
  NUMPAGES: '{NUMPAGES}',
  PAGE_OF_PAGES: '{PAGE} von {NUMPAGES}',
  TITLE: '{TITLE}',
  AUTHOR: '{AUTHOR}',
  WORDS: '{NUMWORDS}',
  HEADER_TEXT: '{HEADER}',
};

const pageSetup: PageSetupConfig = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  paperColor: 'white',
  showPageNumbers: true,
  headerText: 'Header example',
  footerText: '',
};

describe('Writer dynamic field localization', () => {
  it('renders all field copy in every locale and inserts the unchanged selected value', () => {
    const fixedNow = new Date('2026-06-07T08:09:10.000Z');
    const expectedValues: Record<WriterFieldId, string> = {
      DATE_DE: fixedNow.toLocaleDateString('de-DE'),
      DATE_ISO: fixedNow.toISOString().split('T')[0] ?? '',
      TIME: fixedNow.toLocaleTimeString('de-DE'),
      PAGE: '1',
      NUMPAGES: '3',
      PAGE_OF_PAGES: 'Seite 1 von 3',
      TITLE: 'Example document',
      AUTHOR: 'Astraea Author',
      WORDS: '42 Wörter',
      HEADER_TEXT: 'Header example',
    };

    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    try {
      for (const locale of WORKSPACE_LOCALES) {
        vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: () => undefined });
        const copy = WRITER_FIELDS_COPY[locale];

        for (const fieldId of WRITER_FIELD_IDS) {
          const onInsertField = vi.fn<(value: string) => void>();
          const onClose = vi.fn();
          const props = {
            isOpen: true,
            onClose,
            documentTitle: 'Example document',
            pageSetup,
            totalWords: 42,
            onInsertField,
          };

          hookState.cursor = 0;
          hookState.values = ['DATE_DE'];
          const initialTree = WriterFieldsModal(props) as ReactElement;
          const expectedCode = EXPECTED_CODES[fieldId];
          const option = findButton(initialTree, (button) => textContent(button.props.children).includes(expectedCode));
          expect(option, `${locale}.${fieldId} option`).toBeDefined();
          option?.props.onClick?.();
          expect(hookState.values[0], `${locale}.${fieldId} preserves its selection ID`).toBe(fieldId);

          hookState.cursor = 0;
          const selectedTree = WriterFieldsModal(props) as ReactElement;
          const markup = renderToStaticMarkup(selectedTree);
          const renderedText = textContent(selectedTree);
          const fieldCopy = copy.fields[fieldId];

          expect(renderedText, `${locale} dialog heading`).toContain(copy.title);
          expect(markup, `${locale} close accessible name`).toContain(`aria-label="${copy.closeDialog}"`);
          expect(renderedText, `${locale}.${fieldId} field name`).toContain(fieldCopy.name);
          expect(renderedText, `${locale}.${fieldId} category`).toContain(fieldCopy.category);
          expect(renderedText, `${locale}.${fieldId} field-code heading`).toContain(copy.fieldCode);
          expect(renderedText, `${locale}.${fieldId} category heading`).toContain(copy.category);
          expect(renderedText, `${locale}.${fieldId} output heading`).toContain(copy.outputValue);
          expect(renderedText, `${locale}.${fieldId} code syntax`).toContain(expectedCode);
          expect(renderedText, `${locale} cancel button`).toContain(copy.cancel);
          expect(renderedText, `${locale} insert button`).toContain(copy.insertFieldValue);

          const previewValue = findElement<ElementProps>(selectedTree, (element) => element.type === 'span' && element.props.className === 'text-emerald-400 font-mono');
          const insertedValue = textContent(previewValue?.props.children).replace(/^„/, '').replace(/“$/, '');
          const insertButton = findButton(selectedTree, (button) => textContent(button.props.children) === copy.insertFieldValue);
          expect(insertButton, `${locale} insert action`).toBeDefined();
          insertButton?.props.onClick?.();

          expect(onInsertField, `${locale}.${fieldId} callback`).toHaveBeenCalledExactlyOnceWith(expectedValues[fieldId]);
          expect(insertedValue, `${locale}.${fieldId} preview matches the preserved value`).toBe(expectedValues[fieldId]);
          expect(onClose, `${locale}.${fieldId} closes after insertion`).toHaveBeenCalledExactlyOnceWith();
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
