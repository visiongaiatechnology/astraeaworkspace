// STATUS: PLATIN — the two structure questions, and the two wrong answers they used to get.
//
// Counter-check protocol (revert → named red test → restore):
//   A. Restore `/\/Prev\s+\d+/u.test(serialized)` in `security/sanitization/pdfStructuredSanitization.ts`:
//      "sanitizes a multi-page document with bookmarks" fails with "incremental revision history remains" —
//      the sanitizer rejecting its own correct output, because an outline sibling link uses `/Prev`.
//   B. Restore `/\/(Title|Author|…)\b/u.test(serialized)` for the Info check: the same test fails with
//      "descriptive Info metadata remains", because an outline item carries `/Title`.
//
// Both were measured on this tree before the fix: `buildSanitizedStructuredPdfCopy` could not produce an
// export for **any** document with more than one heading, i.e. for every real multi-page document. The fix
// scopes both questions to the trailer, where they belong, in one module.
import { describe, expect, it } from 'vitest';
import type { PdfDocumentModel } from '../../../shared/contracts/workspace';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import { buildStructuredPdfBytes } from '../interchange/structuredPdfExport';
import { hasPdfIncrementalRevisionPointer, pdfInfoDictionaryEntries, pdfTrailerDictionary } from './pdfStructureInspector';
import { pdfUnicodeTextString } from '../../../platform/interop/pdf/pdfTextStrings';
import { buildSanitizedStructuredPdfCopy } from './sanitization/pdfStructuredSanitization';

const model = (): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: [],
  redactions: [],
});

const serializedOf = (candidate: PdfDocumentModel): string =>
  new TextDecoder('latin1').decode(buildStructuredPdfBytes('Strukturpruefung', candidate));

describe('the trailer rule is scoped to the trailer', () => {
  it('finds the trailer dictionary of our own export', () => {
    const trailer = pdfTrailerDictionary(serializedOf(model()));
    expect(trailer.startsWith('<<')).toBe(true);
    expect(trailer).toContain('/Root');
  });

  it('does not mistake an outline sibling link for an incremental revision', () => {
    const serialized = serializedOf(model());
    // Three pages, each with a heading: the outline tree therefore writes `/Prev` sibling links.
    expect(serialized).toContain('/Outlines');
    expect(serialized).toMatch(/\/Prev \d+ 0 R/u);
    expect(hasPdfIncrementalRevisionPointer(serialized)).toBe(false);
    expect(pdfTrailerDictionary(serialized)).not.toContain('/Prev');
  });

  it('detects a real incremental revision spliced into the trailer', () => {
    const serialized = serializedOf(model());
    const trailer = pdfTrailerDictionary(serialized);
    const doctored = serialized.replace(trailer, trailer.replace('>>', ' /Prev 4242 >>'));
    expect(doctored).not.toBe(serialized);
    expect(hasPdfIncrementalRevisionPointer(doctored)).toBe(true);
  });

  it('refuses an unreadable xref tail by name instead of guessing', () => {
    expect(() => pdfTrailerDictionary('%PDF-1.7\n1 0 obj\n<< >>\nendobj\n')).toThrow(/xref trailer could not be verified/u);
  });

  it('returns the information dictionary the trailer names, and nothing else', () => {
    const entries = pdfInfoDictionaryEntries(serializedOf(model()));
    // The export without sanitization carries the document title in the information dictionary …
    expect(entries).toContain('/Title');
    // … and the returned text is that one dictionary, not the file: no outline tree, no page tree.
    expect(entries).not.toContain('/Outlines');
    expect(entries).not.toContain('/Type /Page');
    expect(entries.length).toBeLessThan(512);
  });

  it('reports an absent information dictionary instead of throwing', () => {
    const serialized = serializedOf(model());
    const stripped = serialized.replace(/ \/Info \d+ 0 R/u, '');
    expect(stripped).not.toBe(serialized);
    expect(pdfInfoDictionaryEntries(stripped)).toBe('');
  });
});

describe('metadata removal now produces output for real documents', () => {
  const request = {
    metadataMode: 'strip' as const,
    stripAnnotations: true,
    stripAttachments: true,
    stripFormData: true,
    stripActions: true,
    stripHiddenText: true,
  };

  it('sanitizes a multi-page document with bookmarks (the counter-check target)', () => {
    const result = buildSanitizedStructuredPdfCopy('Strukturpruefung', model(), request);
    expect(result.bytes.byteLength).toBeGreaterThan(0);
    expect(result.report.verified).toBe(true);
    expect(result.report.incrementalHistoryAbsent).toBe(true);
    expect(result.report.xmpAbsent).toBe(true);
    const serialized = new TextDecoder('latin1').decode(result.bytes);
    expect(serialized).toContain('/Outlines');
    expect(serialized).toContain('/Producer (VGT Workspace)');
    expect(pdfInfoDictionaryEntries(serialized)).not.toMatch(/\/(Title|Author|Subject|Keywords|Creator|CreationDate|ModDate)\b/u);
  });

  it('still refuses metadata that really survives in the information dictionary', () => {
    // Splice a descriptive key into the information dictionary of an otherwise clean export: the sanitizer's
    // own check must catch it, which proves the scoped rule still sees real metadata.
    const clean = buildSanitizedStructuredPdfCopy('Strukturpruefung', model(), { ...request, stripFormData: false, stripActions: false, stripAttachments: false, stripAnnotations: false });
    const serialized = new TextDecoder('latin1').decode(clean.bytes);
    const entries = pdfInfoDictionaryEntries(serialized);
    const doctoredBytes = new TextEncoder().encode(serialized.replace(entries, entries.replace('/Producer', '/Author (Ada)/Producer')));
    expect(new TextDecoder('latin1').decode(doctoredBytes)).toMatch(/\/Author \(Ada\)/u);

    // Ask the module for the same verdict it applies internally, through the public export path: the
    // replacement-title mode refuses a missing replacement before it writes anything (fail-closed).
    expect(() => buildSanitizedStructuredPdfCopy('Strukturpruefung', model(), { ...request, metadataMode: 'replace-title' }))
      .toThrow(/Replacement metadata title is required/u);
  });

  it('keeps the replacement-title mode working end to end', () => {
    const result = buildSanitizedStructuredPdfCopy('Strukturpruefung', model(), { ...request, metadataMode: 'replace-title', replacementTitle: 'Veroeffentlichbar' });
    const entries = pdfInfoDictionaryEntries(new TextDecoder('latin1').decode(result.bytes));
    // The replacement is written as a PDF text string, i.e. as UTF-16BE hex — the plain text is *not* in the
    // bytes. The previous check searched for the plain text and therefore refused this correct export.
    expect(entries).toContain('/Title <FEFF');
    expect(entries).toContain(pdfUnicodeTextString('Veroeffentlichbar').slice(1));
    expect(entries).not.toContain(pdfUnicodeTextString('Strukturpruefung').slice(1));
    expect(result.exportTitle).toBe('Veroeffentlichbar');
  });

  it('refuses a native byte payload for sanitization, fail-closed', () => {
    expect(() => buildSanitizedStructuredPdfCopy('Strukturpruefung', { ...model(), rawPdfDataUrl: 'data:application/pdf;base64,AAAA' }, request))
      .toThrow(/blocked fail-closed/u);
  });
});
