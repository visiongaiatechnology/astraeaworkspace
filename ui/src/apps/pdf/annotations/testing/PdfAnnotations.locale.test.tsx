// STATUS: PLATIN — rendered locale, accessible-name, fallback, and narrow-layout coverage for PDF review.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import type { PdfAnnotation } from '../../../../shared/contracts/workspace';
import { PdfAnnotationsDrawer } from '../PdfAnnotationsDrawer';
import { PdfReviewComposer } from '../PdfReviewComposer';
import { PDF_ANNOTATION_COPY, pdfReviewImportFailureCopy } from '../pdfAnnotationsLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const annotation: PdfAnnotation = {
  id: 'annotation-1', page: 2, type: 'text-replace', text: 'Review note', color: '#38bdf8', author: 'Example reviewer',
  createdAt: Date.UTC(2026, 0, 1), targetText: 'old phrase', replacementText: 'new phrase', status: 'open',
  replies: [{ id: 'reply-1', text: 'Reply content', author: 'Second reviewer', createdAt: Date.UTC(2026, 0, 2) }],
  attachment: { fileName: 'review.pdf', mimeType: 'application/pdf', byteLength: 128, sha256: 'a'.repeat(64) },
};
const drawerProps = {
  isOpen: true,
  onClose: noop,
  annotations: [annotation],
  currentPage: 2,
  totalPages: 8,
  onScrollToPage: noop,
  onDeleteAnnotation: noop,
  onCreateAnnotation: noop,
  onReply: noop,
  onSetStatus: noop,
  onExportSummary: noop,
  onImportSummary: async (): Promise<void> => undefined,
} satisfies ComponentProps<typeof PdfAnnotationsDrawer>;

describe('PDF annotation localization', () => {
  it('keeps seven-locale drawer, composer, type, status, and shape catalogs aligned', () => {
    const base = PDF_ANNOTATION_COPY['en-US'];
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PDF_ANNOTATION_COPY[locale];
      expect(Object.keys(copy.drawer).sort(), `${locale}.drawer`).toEqual(Object.keys(base.drawer).sort());
      expect(Object.keys(copy.composer).sort(), `${locale}.composer`).toEqual(Object.keys(base.composer).sort());
      expect(Object.keys(copy.annotationTypes).sort(), `${locale}.annotationTypes`).toEqual(Object.keys(base.annotationTypes).sort());
      expect(Object.keys(copy.statuses).sort(), `${locale}.statuses`).toEqual(Object.keys(base.statuses).sort());
      expect(Object.keys(copy.composer.types).sort(), `${locale}.composer.types`).toEqual(Object.keys(base.composer.types).sort());
      expect(Object.keys(copy.composer.shapes).sort(), `${locale}.composer.shapes`).toEqual(Object.keys(base.composer.shapes).sort());
      expect(copy.drawer.heading(4), `${locale}.heading`).toContain('4');
      expect(copy.drawer.pageAnnotation(2, copy.annotationTypes.comment), `${locale}.pageAnnotation`).toContain('2');
      expect(copy.drawer.attachmentBytes(128), `${locale}.attachmentBytes`).toContain('128');
      expect(copy.composer.capturedPoints(3), `${locale}.capturedPoints`).toContain('3');
      expect(copy.drawer.importFailed, `${locale}.importFailed`).toBeTruthy();
      expect(copy.composer.attachmentRejected, `${locale}.attachmentRejected`).toBeTruthy();
      expect(copy.composer.createFailed, `${locale}.createFailed`).toBeTruthy();
    }
  });

  it('renders localized drawer controls, annotation metadata, composer labels, and accessible names', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PDF_ANNOTATION_COPY[locale];
      const drawer = renderToStaticMarkup(<PdfAnnotationsDrawer {...drawerProps} />);
      const composer = renderToStaticMarkup(<PdfReviewComposer currentPage={2} totalPages={8} onCreate={noop} />);

      expect(drawer).toContain(`aria-label="${copy.drawer.accessibleName}"`);
      expect(drawer).toContain(`aria-label="${copy.drawer.close}"`);
      expect(drawer).toContain(`aria-label="${copy.drawer.search}"`);
      expect(drawer).toContain(`aria-label="${copy.drawer.typeFilter}"`);
      expect(drawer).toContain(copy.drawer.heading(1));
      expect(drawer).toContain(copy.drawer.pageAnnotation(2, copy.annotationTypes['text-replace']));
      expect(drawer).toContain(copy.drawer.target);
      expect(drawer).toContain(copy.drawer.replacement);
      expect(drawer).toContain(copy.drawer.metadataOnly);
      expect(drawer).toContain(copy.statuses.open);
      expect(drawer).toContain(copy.drawer.replyPlaceholder);

      expect(composer).toContain(`aria-label="${copy.composer.accessibleName}"`);
      expect(composer).toContain(`aria-label="${copy.composer.color}"`);
      expect(composer).toContain(copy.composer.types.comment);
    }
  });

  it('uses an opaque localized import error and keeps long German and Russian labels inside the responsive drawer', () => {
    const sensitiveCause = new Error('C:\\private\\review-summary.json: parser details');
    for (const locale of ['de-DE', 'ru-RU'] as const) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PDF_ANNOTATION_COPY[locale];
      const failure = pdfReviewImportFailureCopy(locale, sensitiveCause);
      const markup = renderToStaticMarkup(<PdfAnnotationsDrawer {...drawerProps} />);

      expect(failure).toBe(copy.drawer.importFailed);
      expect(failure).not.toContain('private');
      expect(markup).toContain(copy.drawer.search);
      expect(markup).toContain(copy.drawer.import);
      expect(markup).toContain('max-w-[min(360px,92vw)]');
      expect(markup).toContain('grid-cols-3');
      expect(markup).toContain('min-w-0 break-words');
    }
  });
});
