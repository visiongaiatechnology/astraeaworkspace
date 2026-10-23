// STATUS: PLATIN — verifies fail-closed ownership, bounded inputs, and typed PDF import delegation.
import { afterEach, describe, expect, it } from 'vitest';
import type { PdfDocumentModel, PdfNativeInspectionSnapshot, PdfNormalizedJpegSource } from '../../../shared/contracts/notes-pdf/pdf/workspacePdf';
import {
  createPdfModelFromNormalizedJpegs,
  flattenForeignPdfBytes,
  inspectNativePdfBytes,
  PDF_WORKSPACE_IMPORT_LIMITS,
  PdfWorkspaceImportHostUnavailableError,
  registerPdfWorkspaceImportHost,
} from '../../../platform/interop/pdfWorkspaceImport';

const bytes = new TextEncoder().encode('%PDF-1.7\n%%EOF');
const image: PdfNormalizedJpegSource = {
  name: 'local.jpg',
  dataUrl: `data:image/jpeg;base64,${'A'.repeat(44)}`,
  widthPx: 800,
  heightPx: 600,
};
const inspection: PdfNativeInspectionSnapshot = {
  parser: 'vgt-native-pdf-boundary-v1', version: '1.7', byteLength: bytes.byteLength, sha256: 'a'.repeat(64),
  objectHeaders: 0, streamMarkers: 0, xrefMarkers: 0, estimatedPageObjects: 0, maxDeclaredStreamLength: 0,
  eofMarkerPresent: true, encrypted: false, tagged: false, hasOutlines: false, hasPageLabels: false,
  hasLinksOrDestinations: false, hasEmbeddedFiles: false, hasOptionalContentGroups: false, hasAcroForm: false,
  hasXfa: false, hasAnnotations: false, hasJavaScriptOrActions: false, externalUrlCount: 0,
  externalUrlHosts: [], actionTypes: [], hasSignatures: false, warnings: [],
};
const model: PdfDocumentModel = { numPages: 1, pages: [], annotations: [], redactions: [] };
let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

describe('Core PDF Workspace import host port', () => {
  it('fails closed when PDF Studio has not installed a trusted import host', async () => {
    await expect(inspectNativePdfBytes(bytes)).rejects.toThrow(PdfWorkspaceImportHostUnavailableError);
    await expect(flattenForeignPdfBytes(bytes, 'source.pdf')).rejects.toThrow(PdfWorkspaceImportHostUnavailableError);
    expect(() => createPdfModelFromNormalizedJpegs([image])).toThrow(PdfWorkspaceImportHostUnavailableError);
  });

  it('routes the original bytes and normalized model through the single registered host', async () => {
    const observed: { inspected?: Uint8Array; flattened?: Uint8Array; sourceName?: string; sources?: readonly PdfNormalizedJpegSource[] } = {};
    release = registerPdfWorkspaceImportHost({
      inspectNativePdfBytes: async (value) => { observed.inspected = value; return inspection; },
      flattenForeignPdfBytes: async (value, sourceName) => { observed.flattened = value; observed.sourceName = sourceName; return [image]; },
      createPdfModelFromNormalizedJpegs: (sources) => { observed.sources = sources; return model; },
    });

    await expect(inspectNativePdfBytes(bytes)).resolves.toBe(inspection);
    await expect(flattenForeignPdfBytes(bytes, 'foreign.pdf')).resolves.toEqual([image]);
    expect(createPdfModelFromNormalizedJpegs([image])).toBe(model);
    expect(observed).toEqual({ inspected: bytes, flattened: bytes, sourceName: 'foreign.pdf', sources: [image] });
  });

  it('rejects malformed inputs and keeps one provider owner', async () => {
    release = registerPdfWorkspaceImportHost({
      inspectNativePdfBytes: async () => inspection,
      flattenForeignPdfBytes: async () => [image],
      createPdfModelFromNormalizedJpegs: () => model,
    });

    await expect(inspectNativePdfBytes(new Uint8Array())).rejects.toThrow('pdf_workspace_import_bytes_invalid');
    await expect(flattenForeignPdfBytes(bytes, '')).rejects.toThrow('pdf_workspace_import_name_invalid');
    expect(() => createPdfModelFromNormalizedJpegs([])).toThrow('pdf_workspace_import_images_invalid');
    expect(() => registerPdfWorkspaceImportHost({
      inspectNativePdfBytes: async () => inspection,
      flattenForeignPdfBytes: async () => [image],
      createPdfModelFromNormalizedJpegs: () => model,
    })).toThrow('pdf_workspace_import_host_already_registered');
    expect(PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes).toBe(96 * 1024 * 1024);
  });
});
