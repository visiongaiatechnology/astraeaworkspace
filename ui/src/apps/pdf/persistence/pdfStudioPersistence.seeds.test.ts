// STATUS: PLATIN — probe, not trust in green.
//
// The persistence contract added in this batch validates every PDF Studio payload before it is written. A new
// gate that rejects payloads the application itself creates would be a regression, not a fix — so this suite
// runs the gate over the **real** seed documents and over a fresh document from the real factory
// (`app/bootstrap/seedData.ts`, `app/bootstrap/seedDocDefaultsOpenCore.ts`), not over a fixture written to
// match the gate.
import { describe, expect, it } from 'vitest';
import { initialDocs } from '../../../app/bootstrap/seedData';
import { createNewDocument } from '../../../app/bootstrap/seedDocDefaultsOpenCore';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import {
  assertPdfStudioRoundTrip,
  savePdfStudioDocument,
  validatePdfStudioPayload,
} from './pdfStudioPersistence';

const pdfSeeds = Object.values(initialDocs).filter((document) => document.kind === 'PdfStudio');

describe('the new persistence gate accepts what the application itself creates', () => {
  it('has at least one seeded PDF Studio document to probe', () => {
    expect(pdfSeeds.length).toBeGreaterThan(0);
  });

  it('validates every seeded PDF Studio payload without an issue', () => {
    for (const document of pdfSeeds) {
      expect(validatePdfStudioPayload(document.pdfData), `seed ${document.id}`).toEqual([]);
    }
  });

  it('saves and reopens every seeded PDF Studio document byte-identically', () => {
    for (const document of pdfSeeds) {
      const saved = savePdfStudioDocument(document, document.pdfData ?? DEFAULT_PDF_MODEL, document.modified_at + 1);
      const roundTrip = assertPdfStudioRoundTrip(saved);
      expect(roundTrip.byteIdentical, `seed ${document.id}`).toBe(true);
      expect(roundTrip.reopened.pdfData?.pages.length).toBe(document.pdfData?.pages.length);
    }
  });

  it('accepts the document the real factory produces, including its empty annotation list', () => {
    const fresh = createNewDocument('PdfStudio');
    expect(fresh.pdfData).toBeDefined();
    expect(validatePdfStudioPayload(fresh.pdfData)).toEqual([]);
    const saved = savePdfStudioDocument(fresh, fresh.pdfData ?? DEFAULT_PDF_MODEL, fresh.created_at + 1);
    expect(assertPdfStudioRoundTrip(saved).byteIdentical).toBe(true);
  });
});
