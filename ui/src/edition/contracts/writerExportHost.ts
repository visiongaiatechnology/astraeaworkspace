import type { ReactNode } from 'react';

export interface WriterPdfSigningRequest {
  documentTitle: string;
  currentPage: number;
  getPdfBytes: () => Uint8Array;
  onSignedSuccess: (providerLabel: string) => void;
}

export interface WriterExportHost {
  sharingPanel: ReactNode;
  onRequestPdfSigning?: (request: WriterPdfSigningRequest) => void;
}
