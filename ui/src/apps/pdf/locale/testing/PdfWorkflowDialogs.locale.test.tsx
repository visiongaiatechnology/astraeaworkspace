// STATUS: PLATIN — seven-locale rendered coverage for the assigned PDF workflow dialogs.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import type { PdfDocumentModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { SecurityWatermarkContext } from '../../security/watermark';
import { DEFAULT_PDF_MODEL } from '../../../../shared/seeds/pdfDefaults';
import { PdfCompareModal } from '../../compare/PdfCompareModal';
import { PdfDirectContentEditorModal } from '../../editing/PdfDirectContentEditorModal';
import { PdfConversionModal } from '../../interchange/PdfConversionModal';
import { PdfDocumentAssemblerModal } from '../../interchange/PdfDocumentAssemblerModal';
import { PdfForeignPageInsertPanel } from '../../interchange/PdfForeignPageInsertPanel';
import { PdfWorkspaceIntegrationModal } from '../../integrations/PdfWorkspaceIntegrationModal';
import { PdfOptimizationModal } from '../../optimization/PdfOptimizationModal';
import { PdfPasswordProtectionModal } from '../../security/encryption/PdfPasswordProtectionModal';
import { PdfTrueRedactionModal } from '../../security/redaction/PdfTrueRedactionModal';
import { PdfSignatureModal } from '../../signatures/visual/PdfSignatureModal';
import { PdfDigitalSignatureModal } from '../../signatures/PdfDigitalSignatureModal';
import { PdfFormFillerModal } from '../../forms/PdfFormFillerModal';
import { PdfOcrModal } from '../../ocr/PdfOcrModal';
import { PdfMetadataSanitizerModal } from '../../security/metadata/PdfMetadataSanitizerModal';
import { PdfRoundtripModal } from '../../testing/roundtrip/PdfRoundtripModal';
import { pdfWorkflowMessageKeys, pdfWorkflowText } from '../pdfWorkflowDialogsLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const pdfSource = {
  id: 'pdf-source', title: 'Authored PDF & source', kind: 'PdfStudio', created_at: 1, modified_at: 1, version: 1,
  theme_id: 'default', root_object_ids: [], objects: {}, pdfData: DEFAULT_PDF_MODEL,
} satisfies WorkspaceDocument;
const pdfTarget = {
  ...pdfSource, id: 'pdf-target', title: 'Authored comparison target',
  pdfData: {
    ...DEFAULT_PDF_MODEL,
    pages: DEFAULT_PDF_MODEL.pages.map((page, pageIndex) => pageIndex === 0
      ? { ...page, sections: page.sections.map((section, sectionIndex) => sectionIndex === 0 ? { ...section, content: 'Target authored heading' } : section) }
      : page),
  },
} satisfies WorkspaceDocument;
const editorData = {
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page, pageIndex) => pageIndex === 0 ? {
    ...page,
    images: [{ id: 'authored-image-id', mimeType: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AA==', widthPx: 1, heightPx: 1, bounds: { x: 1, y: 2, width: 3, height: 4 }, altText: 'Authored image description', crop: { left: 0.1, top: 0.2, right: 0.1, bottom: 0.2 }, rotation: 90 as const, zIndex: 2 }],
    vectors: [{ id: 'authored-vector-id', type: 'ellipse' as const, bounds: { x: 2, y: 3, width: 4, height: 5 }, strokeColor: '#123456', fillColor: '#654321', lineWidth: 2, zIndex: 3 }],
    links: [{ id: 'authored-link-id', bounds: { x: 1, y: 2, width: 3, height: 4 }, target: { kind: 'url' as const, url: 'https://example.test/path' } }],
  } : page),
} satisfies PdfDocumentModel;
const formData = {
  ...DEFAULT_PDF_MODEL,
  formFields: [{
    id: 'form-email', name: 'contact_email', type: 'text', page: 1,
    bounds: { x: 40, y: 80, width: 240, height: 24 }, label: 'Authored contact field',
    value: '', defaultValue: '', required: true, readOnly: false, tabOrder: 0,
  }],
} satisfies PdfDocumentModel;
const ocrData = {
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page, pageIndex) => pageIndex === 0 ? {
    ...page,
    ocrLayer: {
      engine: 'tesseract-local' as const,
      engineVersion: 'fixture-engine',
      language: 'eng',
      processedAt: 1,
      meanConfidence: 92,
      originalImagesPreserved: true as const,
      sourceImageIds: ['authored-scan-id'],
      lines: [{
        id: 'authored-ocr-line-id', text: 'Authored OCR content', confidence: 92,
        bounds: { x: 10, y: 20, width: 50, height: 10 },
        words: [{ id: 'authored-ocr-word-id', text: 'Authored', confidence: 92, bounds: { x: 10, y: 20, width: 20, height: 10 }, sourceImageId: 'authored-scan-id' }],
      }],
    },
  } : page),
} satisfies PdfDocumentModel;
const integrationDocuments = [
  { ...pdfSource, id: 'writer-source', kind: 'Writer', title: 'Authored Writer source' },
  { ...pdfSource, id: 'tasks-target', kind: 'Tasks', title: 'Authored Tasks target' },
  { ...pdfSource, id: 'vault-target', kind: 'Vault', title: 'Authored Vault target' },
] satisfies WorkspaceDocument[];
const roundtripWatermarkContext = {
  classification: 'standard', userName: 'Test User', documentId: pdfSource.id, timestampMs: 1,
} satisfies SecurityWatermarkContext;

const redactionProps = {
  isOpen: true,
  onClose: noop,
  onApply: () => ({ matchCount: 2, redactedCharacters: 18 }),
} satisfies ComponentProps<typeof PdfTrueRedactionModal>;
const visualSignatureProps = {
  isOpen: true, onClose: noop, currentPage: 2, onApplySignature: noop,
} satisfies ComponentProps<typeof PdfSignatureModal>;
const digitalSignatureProps = {
  isOpen: true, onClose: noop, documentTitle: 'Authored document title', currentPage: 2,
  getPdfBytes: () => new Uint8Array(),
} satisfies ComponentProps<typeof PdfDigitalSignatureModal>;
const formFillerProps = {
  isOpen: true, pdfData: formData, onClose: noop, onUpdatePdfData: noop,
} satisfies ComponentProps<typeof PdfFormFillerModal>;
const ocrProps = {
  isOpen: true, onClose: noop, pdfData: ocrData, onUpdatePdfData: noop,
} satisfies ComponentProps<typeof PdfOcrModal>;
const metadataSanitizerProps = {
  isOpen: true, onClose: noop, documentTitle: 'Authored document title', pdfData: DEFAULT_PDF_MODEL,
  onSanitize: noop,
  onExportSanitized: async () => { throw new Error('untrusted engine detail'); },
} satisfies ComponentProps<typeof PdfMetadataSanitizerModal>;

describe('PDF workflow dialog localization', () => {
  it('keeps the shared message catalog non-empty and interpolation complete in all locales', () => {
    const keys = pdfWorkflowMessageKeys();
    expect(keys.length).toBeGreaterThan(250);
    for (const locale of WORKSPACE_LOCALES) {
      for (const key of keys) {
        expect(pdfWorkflowText(locale, key).trim(), `${locale}.${key}`).not.toBe('');
      }
      expect(pdfWorkflowText(locale, 'redaction.applied', { matches: 2, characters: 18 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'form.counts', { fields: 1, issues: 1 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'form.status.submitted', { host: 'forms.example.test' })).toContain('forms.example.test');
      expect(pdfWorkflowText(locale, 'ocr.correctWord', { page: 2 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'compare.pageLabel', { page: 'Appendix A' })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'editor.pageTitle', { page: 2 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'conversion.status.created', { pages: 3, sources: 2, images: 1 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'assembler.insertBefore', { page: 4 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'integration.success.pages', { count: 3, kind: 'Present' })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'optimization.audit.references', { count: 2 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'optimization.status.preview', { objects: 4, bytes: 1200 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'password.success.export', { filename: 'Authored.pdf' })).toContain('Authored.pdf');
      expect(pdfWorkflowText(locale, 'roundtrip.issue.fontsWithCounts', { embedded: 0, total: 3 })).not.toContain('{{');
    }
  });

  it('renders all six workflow dialogs with localized controls and accessible names for each locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const redaction = renderToStaticMarkup(<PdfTrueRedactionModal {...redactionProps} />);
      const visual = renderToStaticMarkup(<PdfSignatureModal {...visualSignatureProps} />);
      const digital = renderToStaticMarkup(<PdfDigitalSignatureModal {...digitalSignatureProps} />);
      const form = renderToStaticMarkup(<PdfFormFillerModal {...formFillerProps} />);
      const ocr = renderToStaticMarkup(<PdfOcrModal {...ocrProps} />);
      const metadata = renderToStaticMarkup(<PdfMetadataSanitizerModal {...metadataSanitizerProps} />);

      expect(redaction).toContain(pdfWorkflowText(locale, 'redaction.title'));
      expect(redaction).toContain(`aria-label="${pdfWorkflowText(locale, 'redaction.patternMode')}"`);
      expect(redaction).toContain(pdfWorkflowText(locale, 'redaction.apply'));
      expect(redaction).toContain(`value="${pdfWorkflowText(locale, 'redaction.defaultReason')}"`);
      expect(visual).toContain(pdfWorkflowText(locale, 'visual.title'));
      expect(visual).toContain(`aria-label="${pdfWorkflowText(locale, 'visual.signerName')}"`);
      expect(visual).toContain(pdfWorkflowText(locale, 'visual.addSignature'));
      expect(visual).toContain('Dr. Elizabeth Vance');
      expect(digital).toContain(pdfWorkflowText(locale, 'digital.title'));
      expect(digital).toContain(`aria-label="${pdfWorkflowText(locale, 'digital.close')}"`);
      expect(digital).toContain(`value="${pdfWorkflowText(locale, 'digital.defaultReason')}"`);
      expect(digital).toContain(pdfWorkflowText(locale, 'digital.nativeChecking'));
      expect(digital).toContain('Authored document title');
      expect(form).toContain(pdfWorkflowText(locale, 'form.title'));
      expect(form).toContain(`aria-label="${pdfWorkflowText(locale, 'form.close')}"`);
      expect(form).toContain(pdfWorkflowText(locale, 'form.type.text'));
      expect(form).toContain(pdfWorkflowText(locale, 'form.issue.required'));
      expect(form).toContain(`aria-label="${pdfWorkflowText(locale, 'form.value')}"`);
      expect(form).toContain(`aria-label="${pdfWorkflowText(locale, 'form.bounds')}"`);
      for (const key of ['form.bounds.x', 'form.bounds.y', 'form.bounds.width', 'form.bounds.height'] as const) {
        expect(form).toContain(pdfWorkflowText(locale, key));
      }
      expect(form).toContain(`placeholder="${pdfWorkflowText(locale, 'form.calculationSourcesPlaceholder')}"`);
      expect(form).toContain(`aria-label="${pdfWorkflowText(locale, 'form.calculationSources')}"`);
      expect(form).toContain('Authored contact field');
      expect(form).toContain('contact_email');
      expect(ocr).toContain(pdfWorkflowText(locale, 'ocr.title').replace(/&/gu, '&amp;'));
      expect(ocr).toContain(`aria-label="${pdfWorkflowText(locale, 'ocr.close')}"`);
      expect(ocr).toContain(pdfWorkflowText(locale, 'ocr.languagePack'));
      expect(ocr).toContain(pdfWorkflowText(locale, 'ocr.run'));
      expect(ocr).toContain(pdfWorkflowText(locale, 'ocr.applied'));
      expect(ocr).toContain(pdfWorkflowText(locale, 'ocr.pageLabel', { page: 1 }));
      expect(ocr).toContain('value="Authored"');
      expect(metadata).toContain(pdfWorkflowText(locale, 'metadata.title'));
      expect(metadata).toContain(`aria-label="${pdfWorkflowText(locale, 'metadata.close')}"`);
      expect(metadata).toContain(pdfWorkflowText(locale, 'metadata.removeAnnotations'));
      expect(metadata).toContain(pdfWorkflowText(locale, 'metadata.buildVerify').replace(/&/gu, '&amp;'));
    }
  });

  it('keeps German and Russian dialogs scrollable and form controls responsive at narrow widths', () => {
    for (const locale of ['de-DE', 'ru-RU'] as const) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const rendered = [
        renderToStaticMarkup(<PdfTrueRedactionModal {...redactionProps} />),
        renderToStaticMarkup(<PdfSignatureModal {...visualSignatureProps} />),
        renderToStaticMarkup(<PdfDigitalSignatureModal {...digitalSignatureProps} />),
        renderToStaticMarkup(<PdfFormFillerModal {...formFillerProps} />),
        renderToStaticMarkup(<PdfOcrModal {...ocrProps} />),
        renderToStaticMarkup(<PdfMetadataSanitizerModal {...metadataSanitizerProps} />),
      ];
      for (const markup of rendered) {
        expect(markup, locale).toContain('vgt-dialog-scroll-surface');
        expect(markup, locale).toMatch(/max-h-\[(?:88|90|92)vh\]/u);
      }
      expect(rendered[3]).toContain('grid-cols-1 sm:grid-cols-[260px_1fr]');
      expect(rendered[3]).toContain('grid-cols-1 sm:grid-cols-2');
      expect(rendered[0]).toContain(pdfWorkflowText(locale, 'redaction.caution'));
      expect([
        pdfWorkflowText(locale, 'ocr.localUnavailable'),
        pdfWorkflowText(locale, 'ocr.localAvailable'),
      ].some((message) => rendered[4].includes(message))).toBe(true);
    }
  });

  it('renders Compare, Direct Editor, Conversion, and Assembler copy for all locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const compare = renderToStaticMarkup(<PdfCompareModal isOpen onClose={noop} source={pdfSource} workspaceDocuments={[pdfSource, pdfTarget]} />);
      const editor = renderToStaticMarkup(<PdfDirectContentEditorModal isOpen onClose={noop} pdfData={editorData} onUpdate={noop} currentPage={1} />);
      const conversion = renderToStaticMarkup(<PdfConversionModal isOpen onClose={noop} source={pdfSource} workspaceDocuments={[pdfSource]} />);
      const assembler = renderToStaticMarkup(<PdfDocumentAssemblerModal isOpen pdfData={DEFAULT_PDF_MODEL} onClose={noop} onUpdatePdfData={noop} currentDocumentId={pdfSource.id} workspaceDocuments={[pdfSource, pdfTarget]} />);

      expect(compare).toContain(pdfWorkflowText(locale, 'compare.title'));
      expect(compare).toContain(`aria-label="${pdfWorkflowText(locale, 'compare.close')}"`);
      expect(compare).toContain(pdfWorkflowText(locale, 'compare.category.redactions'));
      expect(compare).toContain(pdfWorkflowText(locale, 'compare.export.json'));
      expect(compare).toContain(pdfWorkflowText(locale, 'compare.change.changed'));
      expect(compare).toContain('Authored PDF &amp; source');
      expect(compare).toContain('Authored comparison target');
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.pageTitle', { page: 1 }));
      expect(editor).toContain(`aria-label="${pdfWorkflowText(locale, 'editor.close')}"`);
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.textBlocks'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.fidelity.exact'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.altText'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.vector.ellipse'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.strokeColor'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.link.http'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.cropLeft'));
      expect(editor).toContain('Authored image description');
      expect(editor).toContain('https://example.test/path');
      expect(editor).toContain('1. Executive Summary');
      expect(conversion).toContain(pdfWorkflowText(locale, 'conversion.title'));
      expect(conversion).toContain(`aria-label="${pdfWorkflowText(locale, 'conversion.close')}"`);
      expect(conversion).toContain(pdfWorkflowText(locale, 'conversion.createHeading'));
      expect(conversion).toContain(pdfWorkflowText(locale, 'conversion.formatNote.docx'));
      expect(conversion).toContain('Authored PDF &amp; source');
      expect(assembler).toContain(pdfWorkflowText(locale, 'assembler.title'));
      expect(assembler).toContain(`aria-label="${pdfWorkflowText(locale, 'assembler.close')}"`);
      expect(assembler).toContain(pdfWorkflowText(locale, 'assembler.header'));
      expect(assembler).toContain(pdfWorkflowText(locale, 'assembler.applyDecorations'));
      expect(assembler).toContain(pdfWorkflowText(locale, 'assembler.tab.boxes'));
      expect(assembler).toContain('vgt-dialog-scroll-surface');
    }
  });

  it('keeps the new PDF dialogs scrollable and their translated controls responsive in German and Russian', () => {
    for (const locale of ['de-DE', 'ru-RU'] as const) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const compare = renderToStaticMarkup(<PdfCompareModal isOpen onClose={noop} source={pdfSource} workspaceDocuments={[pdfSource, pdfTarget]} />);
      const editor = renderToStaticMarkup(<PdfDirectContentEditorModal isOpen onClose={noop} pdfData={editorData} onUpdate={noop} currentPage={1} />);
      const conversion = renderToStaticMarkup(<PdfConversionModal isOpen onClose={noop} source={pdfSource} workspaceDocuments={[pdfSource]} />);
      const assembler = renderToStaticMarkup(<PdfDocumentAssemblerModal isOpen pdfData={DEFAULT_PDF_MODEL} onClose={noop} onUpdatePdfData={noop} currentDocumentId={pdfSource.id} workspaceDocuments={[pdfSource, pdfTarget]} />);
      for (const markup of [compare, editor, conversion, assembler]) {
        expect(markup, locale).toContain('role="dialog"');
        expect(markup, locale).toContain('vgt-dialog-scroll-surface');
        expect(markup, locale).toContain('max-h-[92vh]');
      }
      expect(assembler).toContain('grid-cols-2 sm:grid-cols-4 xl:grid-cols-7');
      expect(assembler).toContain(pdfWorkflowText(locale, 'assembler.pageRange'));
      expect(editor).toContain(pdfWorkflowText(locale, 'editor.width'));
      expect(conversion).toContain(pdfWorkflowText(locale, 'conversion.rasterHeading'));
    }
  });

  it('renders Workspace Integration, Optimization, Password, Roundtrip, and foreign-page insert copy in all locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const integration = renderToStaticMarkup(<PdfWorkspaceIntegrationModal
        isOpen onClose={noop} source={pdfSource} workspaceDocuments={integrationDocuments}
        onCreatePdfFromSource={() => 'authored status'} onAnnotationsToTasks={() => 'authored status'}
        onPagesToWorkspace={() => 'authored status'} onProtectInVault={async () => 'authored status'}
      />);
      const optimization = renderToStaticMarkup(<PdfOptimizationModal isOpen onClose={noop} source={pdfSource} />);
      const password = renderToStaticMarkup(<PdfPasswordProtectionModal isOpen onClose={noop} documentTitle="Authored PDF title" pdfData={DEFAULT_PDF_MODEL} />);
      const roundtripSuite = renderToStaticMarkup(<PdfRoundtripModal isOpen onClose={noop} documentTitle="Authored PDF title" pdfData={DEFAULT_PDF_MODEL} securityWatermarkContext={roundtripWatermarkContext} />);
      const roundtripPreflight = renderToStaticMarkup(<PdfRoundtripModal isOpen initialTab="preflight" onClose={noop} documentTitle="Authored PDF title" pdfData={DEFAULT_PDF_MODEL} securityWatermarkContext={roundtripWatermarkContext} />);
      const roundtripArchive = renderToStaticMarkup(<PdfRoundtripModal isOpen initialTab="archive" onClose={noop} documentTitle="Authored PDF title" pdfData={DEFAULT_PDF_MODEL} securityWatermarkContext={roundtripWatermarkContext} />);
      const foreign = renderToStaticMarkup(<PdfForeignPageInsertPanel pdfData={DEFAULT_PDF_MODEL} onUpdatePdfData={noop} />);
      const foreignImages = renderToStaticMarkup(<PdfForeignPageInsertPanel initialMode="images" pdfData={DEFAULT_PDF_MODEL} onUpdatePdfData={noop} />);
      const foreignScanner = renderToStaticMarkup(<PdfForeignPageInsertPanel initialMode="scanner" pdfData={DEFAULT_PDF_MODEL} onUpdatePdfData={noop} />);

      expect(integration).toContain(`aria-label="${pdfWorkflowText(locale, 'integration.title')}"`);
      expect(integration).toContain(pdfWorkflowText(locale, 'integration.source.heading'));
      expect(integration).toContain(pdfWorkflowText(locale, 'integration.tasks.create'));
      expect(integration).toContain(`aria-label="${pdfWorkflowText(locale, 'integration.pages.input')}"`);
      expect(integration).toContain(pdfWorkflowText(locale, 'integration.vault.protect'));
      expect(integration).toContain('Authored Writer source');
      expect(optimization).toContain(`aria-label="${pdfWorkflowText(locale, 'optimization.title')}"`);
      expect(optimization).toContain(pdfWorkflowText(locale, 'optimization.description'));
      expect(optimization).toContain(pdfWorkflowText(locale, 'optimization.preset.screen'));
      expect(optimization).toContain(pdfWorkflowText(locale, 'optimization.preset.archive'));
      expect(optimization).toContain(`aria-label="${pdfWorkflowText(locale, 'optimization.maxDimension')}"`);
      expect(optimization).toContain(pdfWorkflowText(locale, 'optimization.fastView.checking'));
      expect(password).toContain(`aria-label="${pdfWorkflowText(locale, 'password.title')}"`);
      expect(password).toContain(`aria-label="${pdfWorkflowText(locale, 'password.user')}"`);
      expect(password).toContain(`aria-label="${pdfWorkflowText(locale, 'password.owner')}"`);
      expect(password).toContain(pdfWorkflowText(locale, 'password.policy'));
      expect(password).toContain(pdfWorkflowText(locale, 'password.vault.checking'));
      expect(roundtripSuite).toContain(pdfWorkflowText(locale, 'roundtrip.suite.description'));
      expect(roundtripSuite).toContain(`aria-label="${pdfWorkflowText(locale, 'roundtrip.close')}"`);
      expect(roundtripPreflight).toContain(pdfWorkflowText(locale, 'roundtrip.documentLanguage'));
      expect(roundtripPreflight).toContain(pdfWorkflowText(locale, 'roundtrip.proofDetails'));
      expect(roundtripArchive).toContain(pdfWorkflowText(locale, 'roundtrip.archive.description'));
      expect(roundtripArchive).toContain(pdfWorkflowText(locale, 'roundtrip.archiveDpi'));
      expect(foreign).toContain(pdfWorkflowText(locale, 'foreign.mode.images'));
      expect(foreign).toContain(pdfWorkflowText(locale, 'foreign.choosePdf'));
      expect(foreign).toContain(`aria-label="${pdfWorkflowText(locale, 'foreign.insertBefore')}"`);
      expect(foreign).toContain(pdfWorkflowText(locale, 'foreign.explanation'));
      expect(foreignImages).toContain(`aria-label="${pdfWorkflowText(locale, 'foreign.chooseImages')}"`);
      expect(foreignScanner).toContain(pdfWorkflowText(locale, 'foreign.startCamera'));
      expect(foreignScanner).toContain(`aria-label="${pdfWorkflowText(locale, 'foreign.stopCamera')}"`);
    }
  });

  it('keeps the additional PDF surfaces scrollable and maps status interpolation in German and Russian', () => {
    for (const locale of ['de-DE', 'ru-RU'] as const) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const rendered = [
        renderToStaticMarkup(<PdfWorkspaceIntegrationModal isOpen onClose={noop} source={pdfSource} workspaceDocuments={integrationDocuments} onCreatePdfFromSource={() => ''} onAnnotationsToTasks={() => ''} onPagesToWorkspace={() => ''} onProtectInVault={async () => ''} />),
        renderToStaticMarkup(<PdfOptimizationModal isOpen onClose={noop} source={pdfSource} />),
        renderToStaticMarkup(<PdfRoundtripModal isOpen onClose={noop} documentTitle="Authored PDF title" pdfData={DEFAULT_PDF_MODEL} securityWatermarkContext={roundtripWatermarkContext} />),
      ];
      for (const markup of rendered) {
        expect(markup, locale).toContain('role="dialog"');
        expect(markup, locale).toContain('vgt-dialog-scroll-surface');
      }
      expect(pdfWorkflowText(locale, 'integration.success.pages', { count: 3, kind: 'Present' })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'optimization.status.preview', { objects: 4, bytes: 1200 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'roundtrip.issue.fontsWithCounts', { embedded: 0, total: 3 })).not.toContain('{{');
      expect(pdfWorkflowText(locale, 'password.success.export', { filename: 'Authored.pdf' })).toContain('Authored.pdf');
    }
  });
});
