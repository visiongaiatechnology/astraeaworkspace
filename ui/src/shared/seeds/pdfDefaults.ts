// STATUS: PLATIN — edition-neutral PDF starter model shared by Workspace seed factories.
import type { PdfDocumentModel, PdfPageModel } from '../contracts/workspace';

export const DEFAULT_PDF_PAGES: PdfPageModel[] = [
  {
    pageNumber: 1,
    title: 'Sample Review Document',
    subtitle: 'Structured PDF Studio demonstration document',
    sections: [
      { id: 'sec-p1-1', type: 'header', content: '1. Executive Summary' },
      {
        id: 'sec-p1-2',
        type: 'paragraph',
        content: 'This sample document exists to exercise editing, annotations, page operations, metadata settings and structured redaction. It is not a security attestation.',
      },
      {
        id: 'sec-p1-3',
        type: 'callout',
        content: 'DEMO DATA ONLY · Values in this file are synthetic and are safe to edit or redact during testing.',
      },
      {
        id: 'sec-p1-4',
        type: 'paragraph',
        content: 'Example confidential phrase for redaction testing: DEMO-SECRET-ALPHA-2026. The phrase has no operational meaning.',
      },
    ],
  },
  {
    pageNumber: 2,
    title: '2. Review Notes',
    subtitle: 'Annotation and page-operation test content',
    sections: [
      { id: 'sec-p2-1', type: 'header', content: '2.1 Editing Checklist' },
      {
        id: 'sec-p2-2',
        type: 'paragraph',
        content: 'Select a phrase to highlight, underline or strike it. Double-click a structured text block to edit the underlying model.',
      },
      {
        id: 'sec-p2-3',
        type: 'paragraph',
        content: 'Page thumbnails can be reordered, duplicated, rotated or deleted. Annotation and redaction page references must follow those operations.',
      },
    ],
  },
  {
    pageNumber: 3,
    title: '3. Redaction Scope',
    subtitle: 'What the structured editor can and cannot claim',
    sections: [
      { id: 'sec-p3-1', type: 'header', content: '3.1 Structured Model Redaction' },
      {
        id: 'sec-p3-2',
        type: 'paragraph',
        content: 'A structured redaction removes selected content from the active Workspace model and from newly generated structured PDF exports.',
      },
      {
        id: 'sec-p3-3',
        type: 'paragraph',
        content: 'Previously exported files, backups and arbitrary imported PDFs are separate artifacts and require their own verified rewrite workflow.',
      },
    ],
  },
];

export const DEFAULT_PDF_MODEL: PdfDocumentModel = {
  numPages: DEFAULT_PDF_PAGES.length,
  pages: DEFAULT_PDF_PAGES,
  annotations: [
    {
      id: 'anno-1',
      page: 1,
      sectionId: 'sec-p1-2',
      type: 'highlight',
      text: 'editing, annotations, page operations, metadata settings and structured redaction',
      color: '#f59e0b',
      author: 'Local Reviewer',
      createdAt: Date.now() - 3600000,
    },
    {
      id: 'anno-2',
      page: 2,
      sectionId: 'sec-p2-3',
      type: 'comment',
      text: 'Verify page-reference remapping after every page operation.',
      color: '#3b82f6',
      author: 'Local Reviewer',
      createdAt: Date.now() - 7200000,
    },
  ],
  redactions: [],
};
