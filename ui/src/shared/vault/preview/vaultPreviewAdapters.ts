// STATUS: DIAMANT VGT SUPREME — Production adapters for sandboxed Office/PDF Vault inspection.
import { importOfficeDocument } from '../../../platform/interop/index';
import { openPdfDocumentForInspection } from '../../../platform/documents/pdfjs/pdfDocumentInspection';
import type { VaultPreviewParserAdapters } from './vaultPreviewQuarantineEngine';

export const vaultPreviewParserAdapters: VaultPreviewParserAdapters = {
  async inspectOffice(file) {
    const document = await importOfficeDocument(file);
    return { kind: document.kind, title: document.title };
  },
  async inspectPdf(bytes) {
    const document = await openPdfDocumentForInspection(bytes);
    try {
      const text = await document.getTextItems(1);
      const links = await document.getLinks(1);
      return {
        pageCount: document.snapshot.pageCount,
        hasJavaScriptActions: document.snapshot.hasJavaScriptActions,
        firstPageText: text.map((item) => item.str).join(' ').slice(0,48_000),
        externalLinkCount: links.filter((link) => typeof link.url === 'string' && /^https?:/i.test(link.url)).length,
      };
    } finally {
      await document.destroy();
    }
  },
};
