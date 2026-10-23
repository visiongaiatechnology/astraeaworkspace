// STATUS: GOLD — checks complete Draw locale parity and rendered toolbar/status labels.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { DRAW_CANVAS_COPY, DRAW_CANVAS_ERROR_COPY, drawCanvasEngineError, drawCanvasErrorText } from '../../drawCanvasLocale';
import { DrawCanvas } from '../../canvas/DrawCanvas';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;
const drawDocument = {
  id: 'draw-locale', title: 'Locale example', kind: 'Draw', created_at: 0, modified_at: 0, version: 1,
  theme_id: 'cosmic', root_object_ids: [], objects: {},
} satisfies ComponentProps<typeof DrawCanvas>['document'];
const props = { document: drawDocument, onUpdateDocument: noop } satisfies ComponentProps<typeof DrawCanvas>;

describe('Draw canvas locale coverage', () => {
  it('keeps every supported locale complete and populated', () => {
    const expectedKeys = Object.keys(DRAW_CANVAS_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = DRAW_CANVAS_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
    }
  });

  it('renders localized toolbar, canvas accessibility, and status text', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = DRAW_CANVAS_COPY[locale];
      const markup = renderToStaticMarkup(<DrawCanvas {...props} />);
      for (const key of ['workspace', 'tools', 'addRectangle', 'rectangle', 'template', 'applyTemplate', 'activePage', 'activeLayer', 'undo', 'redo', 'importSvg', 'encryptedVdraw', 'openVdraw'] as const) {
        expect(markup).toContain(copy[key]);
      }
      expect(markup).toContain(copy.localFirst);
      expect(markup).toContain(copy.pageCount.replace('{count}', '1'));
    }
  });

  it('keeps operation errors in parity and renders localized validation messages', () => {
    const expectedKeys = Object.keys(DRAW_CANVAS_ERROR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = DRAW_CANVAS_ERROR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      for (const key of expectedKeys as (keyof typeof copy)[]) expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
      const markup = renderToStaticMarkup(<div role="alert">{drawCanvasErrorText('exportPassword', locale)}</div>);
      expect(markup).toContain(copy.exportPassword);
      expect(drawCanvasEngineError({ code: 'svg-size-boundary' }, locale)).toBe(copy.svgImportFailed);
      expect(drawCanvasEngineError({ code: 'native-size-boundary' }, locale)).toBe(copy.nativeImportFailed);
      expect(drawCanvasEngineError(new Error('private engine detail'), locale)).toBe(copy.operationFailed);
    }
  });
});
