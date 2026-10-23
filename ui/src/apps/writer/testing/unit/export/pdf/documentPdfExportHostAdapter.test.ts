// STATUS: PLATIN — real Writer-to-platform export host integration contract.
import { afterEach, describe, expect, it } from 'vitest';
import { buildDocumentPdf } from '../../../../../../platform/rendering/documentPdfExport';
import { installWriterDocumentPdfExportHost } from '../../../../interchange/export/pdf/documentPdfExportHostAdapter';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Writer document PDF host adapter', () => {
  it('renders a canonical PDF through the neutral platform port', () => {
    release = installWriterDocumentPdfExportHost();
    const bytes = buildDocumentPdf({
      title: 'Platform handoff',
      paragraphs: [],
      config: {
        paperSize: 'A4', orientation: 'portrait', margins: 'normal', paperColor: 'white',
        showPageNumbers: false, headerText: '', footerText: '',
      },
    });

    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe('%PDF-1.4');
  });
});
