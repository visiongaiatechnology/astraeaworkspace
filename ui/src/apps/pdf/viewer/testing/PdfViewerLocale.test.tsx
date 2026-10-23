// STATUS: PLATIN — rendered seven-locale coverage for PDF page thumbnails and native controls.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { PdfThumbnailsSidebar } from '../thumbnails/PdfThumbnailsSidebar';
import { PdfNativeViewer } from '../PdfNativeViewer';
import { PDF_VIEWER_COPY, pdfViewerFailureCopy } from '../pdfViewerLocale';
import { PdfJsDocumentNavigator } from '../navigation/PdfJsDocumentNavigator';
import { PdfJsReflowView } from '../reflow/PdfJsReflowView';
import type { PdfJsDisplayDocument } from '../contracts/pdfJsDisplayTypes';
import type { PdfJsDocumentSnapshot } from '../../../../platform/documents/pdfjs/pdfJsWorkerClient';
import { PDF_NAVIGATION_COPY, pdfNavigationFailureCopy } from '../pdfNavigationLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));
const noop = (): void => undefined;

const thumbnailProps = {
  pages: [{ pageNumber: 1, title: 'User authored page title', sections: [{ id: 's1', type: 'paragraph', content: 'Private document content', isRedacted: true }] }],
  currentPage: 1, onScrollToPage: noop, onAddPage: noop, annotations: [{ id: 'a1', page: 1, type: 'comment', text: 'Author note', color: '#fff' }],
  onReorderPage: noop, onRotatePage: noop, onDuplicatePage: noop, onDeletePage: noop,
} satisfies ComponentProps<typeof PdfThumbnailsSidebar>;

const nativeProps = {
  title: 'Document title', dataUrl: 'data:application/pdf;base64,', fileName: 'document.pdf', byteLength: 0,
} satisfies ComponentProps<typeof PdfNativeViewer>;
const snapshot = {
  version: '6.3.289', pageCount: 1, fingerprints: [], pageLabels: null, outline: null, attachments: null,
  optionalContentConfig: null, fieldObjects: null, permissions: null, metadata: null, hasJavaScriptActions: false, pages: [],
} satisfies PdfJsDocumentSnapshot;
const navigationProps = { document: null, snapshot, currentPage: 3, onNavigatePage: noop } satisfies ComponentProps<typeof PdfJsDocumentNavigator>;
const reflowProps = { document: { numPages: 1 } as unknown as PdfJsDisplayDocument, pageNumbers: [1] } satisfies ComponentProps<typeof PdfJsReflowView>;

describe('PDF viewer localization', () => {
  it('keeps thumbnail and native-control catalogs complete with safe interpolation', () => {
    const thumbnailKeys = Object.keys(PDF_VIEWER_COPY['en-US'].thumbnails).sort();
    const nativeKeys = Object.keys(PDF_VIEWER_COPY['en-US'].native).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PDF_VIEWER_COPY[locale];
      expect(Object.keys(copy.thumbnails).sort(), `${locale}.thumbnails`).toEqual(thumbnailKeys);
      expect(Object.keys(copy.native).sort(), `${locale}.native`).toEqual(nativeKeys);
      expect(copy.thumbnails.pages(3), `${locale}.pageCount`).toContain('3');
      expect(copy.thumbnails.goToPage(7), `${locale}.page`).toContain('7');
      expect(copy.native.rotateAria(90), `${locale}.rotation`).toContain('90');
      for (const kind of ['parse', 'signature', 'form'] as const) {
        const fallback = pdfViewerFailureCopy(locale, kind, new Error('internal parser token path'));
        expect(fallback).not.toMatch(/internal parser token path/);
        expect(fallback).toBe(kind === 'parse' ? copy.native.parseFailed : kind === 'signature' ? copy.native.signatureValidationFailed : copy.native.formInspectionFailed);
      }
      expect(Object.keys(PDF_NAVIGATION_COPY[locale].navigation).sort()).toEqual(Object.keys(PDF_NAVIGATION_COPY['en-US'].navigation).sort());
      expect(Object.keys(PDF_NAVIGATION_COPY[locale].reflow).sort()).toEqual(Object.keys(PDF_NAVIGATION_COPY['en-US'].reflow).sort());
      expect(PDF_NAVIGATION_COPY[locale].navigation.linksOnPage(3)).toContain('3');
      expect(PDF_NAVIGATION_COPY[locale].navigation.parsedMatches('4', true)).toContain('4');
      for (const kind of ['attachments', 'links', 'search', 'destination', 'external', 'reflow'] as const) {
        expect(pdfNavigationFailureCopy(locale, kind, new Error('secret token parser path'))).not.toContain('secret token parser path');
      }
    }
  });

  it('renders thumbnail labels and native viewing controls for all seven locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PDF_VIEWER_COPY[locale];
      const thumbnails = renderToStaticMarkup(<PdfThumbnailsSidebar {...thumbnailProps} />);
      for (const label of [copy.thumbnails.pages(1), copy.thumbnails.addBlank, copy.thumbnails.reorderHint, copy.thumbnails.goToPage(1), copy.thumbnails.page(1), copy.thumbnails.rotate, copy.thumbnails.duplicate, copy.thumbnails.delete, copy.thumbnails.redacted, copy.thumbnails.structured, copy.thumbnails.sanitized]) {
        expect(thumbnails, `${locale}: ${label}`).toContain(label);
      }
      expect(thumbnails).toContain('aria-current="page"');
      expect(thumbnails).toContain('User authored page title');
      expect(thumbnails).toContain('w-56');
      expect(thumbnails).toContain('break-words');

      const native = renderToStaticMarkup(<PdfNativeViewer {...nativeProps} />);
      for (const label of [copy.native.controls, copy.native.inspectToggle, copy.native.inspectTitle, copy.native.original, copy.native.modeContinuous, copy.native.modePage, copy.native.modeTwoPage, copy.native.zoomOut, copy.native.zoomIn, copy.native.fitPage, copy.native.fitWidth, copy.native.rotateAria(0), copy.native.present, copy.native.fullscreen, copy.native.documentViewport]) {
        expect(native, `${locale}: ${label}`).toContain(label);
      }
      expect(native).toContain('flex flex-wrap items-center gap-1.5');

      const navigation = renderToStaticMarkup(<PdfJsDocumentNavigator {...navigationProps} />);
      for (const label of [PDF_NAVIGATION_COPY[locale].navigation.title, PDF_NAVIGATION_COPY[locale].navigation.bookmarks, PDF_NAVIGATION_COPY[locale].navigation.noOutline, PDF_NAVIGATION_COPY[locale].navigation.linksOnPage(3), PDF_NAVIGATION_COPY[locale].navigation.noLinks, PDF_NAVIGATION_COPY[locale].navigation.attachments, PDF_NAVIGATION_COPY[locale].navigation.noAttachments, PDF_NAVIGATION_COPY[locale].navigation.localSearch, PDF_NAVIGATION_COPY[locale].navigation.searchPlaceholder, PDF_NAVIGATION_COPY[locale].navigation.search]) {
        expect(navigation, `${locale}: ${label}`).toContain(label);
      }
      const reflow = renderToStaticMarkup(<PdfJsReflowView {...reflowProps} />);
      expect(reflow).toContain(PDF_NAVIGATION_COPY[locale].reflow.building);
    }
  });
});
