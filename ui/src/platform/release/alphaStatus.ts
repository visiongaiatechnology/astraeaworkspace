// STATUS: PLATIN

export const ALPHA_VERSION = '0.1.0-alpha.1';

export interface AlphaKnownIssue {
  id: string;
  area: string;
  summary: string;
}

export const ALPHA_KNOWN_ISSUES: readonly AlphaKnownIssue[] = [
  { id: 'office-fidelity', area: 'Office interoperability', summary: 'DOCX/XLSX/PPTX support is a semantic alpha subset; advanced layout, macros and uncommon Office features may not round-trip exactly.' },
  { id: 'pdf-rewrite', area: 'PDF Studio', summary: 'Arbitrary third-party PDF content rewriting is not yet supported; imported standard PDFs use safe viewing/passthrough while structured Astraea PDFs are editable.' },
  { id: 'collaboration', area: 'Spaces / GaiaCom', summary: 'Native multi-device LAN, mDNS and BLE collaboration transports remain experimental; local Workspace collaboration models are available.' },
  { id: 'office-size', area: 'Large files', summary: 'Alpha import and native IPC enforce explicit resource ceilings; extremely large or hostile documents are rejected instead of risking unbounded memory use.' },
  { id: 'signing', area: 'Release signing', summary: 'Source alpha supports reproducible package hashing; public binary code-signing/notarization credentials must be supplied by the release owner in CI.' },
] as const;
