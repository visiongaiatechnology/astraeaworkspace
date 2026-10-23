// STATUS: PLATIN — seven-locale rendered coverage for OCR feedback states.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PdfOcrFeedback } from '../PdfOcrFeedback';
import type { BatchOcrProgress } from '../pdfOcrEngine';
import { pdfWorkflowText, type PdfWorkflowCopyKey } from '../../locale/pdfWorkflowDialogsLocale';

const progressCases: readonly { state: BatchOcrProgress; copyKey: PdfWorkflowCopyKey }[] = [
  {
    state: { currentPage: 2, totalPages: 3, percentComplete: 42, status: 'Preprocessing page 2 locally…' },
    copyKey: 'ocr.preparingPage',
  },
  {
    state: { currentPage: 2, totalPages: 3, percentComplete: 67, status: 'Recognizing page 2 locally…' },
    copyKey: 'ocr.recognizingPage',
  },
  {
    state: { currentPage: 3, totalPages: 3, percentComplete: 100, status: 'Local OCR complete for 3 page(s).' },
    copyKey: 'ocr.completed',
  },
];

const errorKeys = [
  'ocr.error.inventory',
  'ocr.error.unavailable',
  'ocr.error.language',
  'ocr.error.noPages',
  'ocr.error.limit',
  'ocr.error.process',
  'ocr.error.correct',
  'ocr.error.convert',
] as const satisfies readonly PdfWorkflowCopyKey[];

describe('PDF OCR feedback localization', () => {
  it('renders progress, completion results, and each alert in every Workspace locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      for (const field of ['x', 'y', 'width', 'height'] as const) {
        expect(pdfWorkflowText(locale, `ocr.region.${field}`)).not.toBe('');
      }

      for (const { state, copyKey } of progressCases) {
        const progress = renderToStaticMarkup(
          <PdfOcrFeedback locale={locale} progress={state} error="" result={null} />,
        );
        expect(progress).toContain('aria-live="polite"');
        expect(progress).toContain(pdfWorkflowText(locale, copyKey, { page: state.currentPage }));
        expect(progress).toContain(`${new Intl.NumberFormat(locale).format(state.percentComplete)}%`);
        expect(progress).toContain(`width:${state.percentComplete}%`);
      }

      const result = renderToStaticMarkup(
        <PdfOcrFeedback
          locale={locale}
          progress={null}
          error=""
          result={{ pageCount: 3, wordCount: 200, wordCountCapped: true, averageConfidence: 92, maximumSkew: 4.1 }}
        />,
      );
      expect(result).toContain(pdfWorkflowText(locale, 'ocr.applied'));
      expect(result).toContain(`${pdfWorkflowText(locale, 'ocr.pages')}:`);
      expect(result).toContain(`${pdfWorkflowText(locale, 'ocr.words')}:`);
      expect(result).toContain(`${pdfWorkflowText(locale, 'ocr.confidence')}:`);
      expect(result).toContain(`${pdfWorkflowText(locale, 'ocr.skewMax')}:`);
      expect(result).toContain(`${new Intl.NumberFormat(locale).format(200)}+`);
      expect(result).toContain(`${new Intl.NumberFormat(locale).format(92)}%`);
      expect(result).toContain(`${new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(4.1)}°`);

      for (const errorKey of errorKeys) {
        const alert = renderToStaticMarkup(
          <PdfOcrFeedback locale={locale} progress={null} error={pdfWorkflowText(locale, errorKey)} result={null} />,
        );
        expect(alert).toContain('role="alert"');
        expect(alert).toContain(pdfWorkflowText(locale, errorKey));
      }
    }
  });
});
