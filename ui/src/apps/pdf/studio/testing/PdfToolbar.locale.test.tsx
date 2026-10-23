// STATUS: PLATIN — rendered coverage for PDF toolbar actions, interpolated labels, and guide anchor stability.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { PdfToolbar } from '../PdfToolbar';
import { PDF_TOOLBAR_COPY } from '../pdfToolbarLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const props = {
  currentPage: 2,
  totalPages: 7,
  onScrollToPage: noop,
  canUndo: true,
  canRedo: true,
  onUndo: noop,
  onRedo: noop,
  activeTool: 'highlight',
  setActiveTool: noop,
  onApplyHighlight: noop,
  selectedHighlightColor: '#f59e0b',
  setSelectedHighlightColor: noop,
  onApplyUnderline: noop,
  onApplyStrike: noop,
  onInitiateComment: noop,
  onRedactSelection: noop,
  onOpenTrueRedaction: noop,
  onVerifiedRedactionExport: noop,
  onOpenSignatureModal: noop,
  onOpenSanitizeModal: noop,
  onOpenFormFiller: noop,
  onOpenAssembler: noop,
  onOpenOcrModal: noop,
  onOpenDigitalSignatureModal: noop,
  onOpenPasswordProtection: noop,
  onOpenRoundtripModal: noop,
  onOpenWorkspaceIntegration: noop,
  onOpenCompare: noop,
  onOpenConversion: noop,
  onOpenOptimization: noop,
  onOpenContentEditor: noop,
  totalRedactionsCount: 2,
  zoomLevel: 125,
  onZoomChange: noop,
  onZoomIn: noop,
  onZoomOut: noop,
  onOpenAuditModal: noop,
  isAnnotationsDrawerOpen: false,
  onToggleAnnotationsDrawer: noop,
  onExportPdf: noop,
} satisfies ComponentProps<typeof PdfToolbar>;

describe('PDF Studio toolbar localization', () => {
  it('keeps message and secondary-action catalogs complete with interpolated values', () => {
    const expectedKeys = Object.keys(PDF_TOOLBAR_COPY['en-US']).sort();
    const expectedActionIds = Object.keys(PDF_TOOLBAR_COPY['en-US'].actions).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = PDF_TOOLBAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(Object.keys(copy.actions).sort(), `${locale}.actions`).toEqual(expectedActionIds);
      expect(copy.pagePosition(2, 7), `${locale}.pagePosition`).toContain('2');
      expect(copy.pagePosition(2, 7), `${locale}.pagePosition`).toContain('7');
      expect(copy.currentZoom(125), `${locale}.currentZoom`).toContain('125');
      expect(copy.setZoom(150), `${locale}.setZoom`).toContain('150');
      expect(copy.redactSelected(2), `${locale}.redactSelected`).toContain('2');
      for (const [id, action] of Object.entries(copy.actions)) {
        expect(action.label.trim(), `${locale}.${id}.label`).not.toBe('');
        expect(action.description.trim(), `${locale}.${id}.description`).not.toBe('');
      }
    }
  });

  it('renders translated controls, action descriptions, and accessible names for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = PDF_TOOLBAR_COPY[locale];
      const markup = renderToStaticMarkup(<PdfToolbar {...props} />);

      expect(markup).toContain(`aria-label="${copy.pagePosition(2, 7)}"`);
      expect(markup).toContain(`aria-label="${copy.annotationTools}"`);
      expect(markup).toContain(`aria-label="${copy.highlightColor(copy.highlightColors['#f59e0b'])}"`);
      expect(markup).toContain(`aria-label="${copy.redactSelected(2)}"`);
      expect(markup).toContain(`aria-label="${copy.setZoom(125)}"`);
      expect(markup).toContain(`title="${copy.actions.digitalSignature.description}"`);
      expect(markup).toContain(copy.actions.redactionExport.label);
      expect(markup).toContain(copy.groupEdit);
      expect(markup).toContain(copy.groupProtect);
      expect(markup).toContain(copy.groupReview);
      expect(markup).toContain(copy.moreDescription);
      expect(markup.match(/data-vgt-app-guide-anchor="PdfStudio:second"/g)).toHaveLength(1);
    }
  });
});
