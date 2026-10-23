// STATUS: PLATIN â€” the canonical persistence boundary of PDF Studio, counter-checked against the real tree.
//
// Every claim here is measured against the modules that own the fact: the schema version comes from
// `platform/workspace/integrations/workspaceSchemaVersion.ts`, the stable-id rule from
// `platform/workspace/model/workspaceObjectModelPrimitives.ts`, the serializer from
// `platform/workspace/model/workspaceObjectModelDocumentPersistence.ts`, the bounds from this app's own
// limit constants. Nothing in this file restates a limit.
import { describe, expect, it } from 'vitest';
import { WOM_SCHEMA_VERSION } from '../../../shared/contracts/wom/workspaceWom';
import type { PdfDocumentModel, PdfNativeInspectionSnapshot, WorkspaceDocument } from '../../../shared/contracts/workspace';
import { DEFAULT_PDF_MODEL } from '../../../shared/seeds/pdfDefaults';
import { MAX_SERIALIZED_DOCUMENT_BYTES } from '../../../platform/workspace/model/workspaceObjectModelPrimitives';
import { INFINITY_PINNED_COMMIT, INFINITY_SUITE } from '../../../platform/security/securityProfiles';
import { WORKSPACE_SCHEMA_FIELD, stampWorkspaceDocumentSchema } from '../../../platform/workspace/integrations/workspaceDocumentStamp';
import { resolveWorkspaceDocumentRead } from '../../../platform/workspace/integrations/workspaceDocumentRead';
import { WORKSPACE_SCHEMA_VERSIONS } from '../../../platform/workspace/integrations/workspaceSchemaVersion';
import { PDF_WORKSPACE_IMPORT_LIMITS } from '../../../platform/interop/pdfWorkspaceImport';
import { PDF_REVIEW_LIMITS } from '../annotations/pdfReviewAnnotations';
import { PDF_FORM_LIMITS } from '../forms/model/pdfAcroFormModel';
import { MAX_PAGE_COUNT } from '../pages/pdfPageOps';
import { PDF_STUDIO_SCHEMA_FIELD, PDF_STUDIO_SCHEMA_VERSION, withPdfStudioSchema } from '../studio/state/pdfStudioSchema';
import {
  PdfStudioPersistenceError,
  assertPdfStudioPayload,
  assertPdfStudioSchemaReadable,
  assertPdfStudioSchemaStamped,
  assertPdfStudioRoundTrip,
  estimatePdfStudioPayloadJsonBytes,
  maxPersistableNativePdfBytes,
  readPdfStudioSchemaStamp,
  reopenPdfStudioDocument,
  savePdfStudioDocument,
  serializePdfStudioDocument,
  validatePdfStudioPayload,
} from './pdfStudioPersistence';

const pdfDocument = (overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument => ({
  schema_version: WOM_SCHEMA_VERSION,
  id: 'pdf-doc-1',
  title: 'Pruefbericht',
  kind: 'PdfStudio',
  created_at: 1_700_000_000_000,
  modified_at: 1_700_000_000_000,
  version: 3,
  theme_id: 'default',
  root_object_ids: [],
  objects: {},
  pdfData: DEFAULT_PDF_MODEL,
  ...overrides,
});

const model = (overrides: Partial<PdfDocumentModel> = {}): PdfDocumentModel => ({
  ...DEFAULT_PDF_MODEL,
  pages: DEFAULT_PDF_MODEL.pages.map((page) => ({ ...page, sections: page.sections.map((section) => ({ ...section })) })),
  annotations: DEFAULT_PDF_MODEL.annotations.map((annotation) => ({ ...annotation })),
  redactions: [],
  ...overrides,
});

const inspectionFor = (byteLength: number, sha256 = 'a'.repeat(64)): PdfNativeInspectionSnapshot => ({
  parser: 'vgt-native-pdf-boundary-v1',
  version: '1.7',
  byteLength,
  sha256,
  objectHeaders: 1,
  streamMarkers: 1,
  xrefMarkers: 1,
  estimatedPageObjects: 1,
  maxDeclaredStreamLength: 1,
  eofMarkerPresent: true,
  encrypted: false,
  tagged: false,
  hasOutlines: false,
  hasPageLabels: false,
  hasLinksOrDestinations: false,
  hasEmbeddedFiles: false,
  hasOptionalContentGroups: false,
  hasAcroForm: false,
  hasXfa: false,
  hasAnnotations: false,
  hasJavaScriptOrActions: false,
  externalUrlCount: 0,
  externalUrlHosts: [],
  actionTypes: [],
  hasSignatures: false,
  warnings: [],
});

const nativeModel = (bytes: number): PdfDocumentModel => ({
  ...model(),
  rawPdfDataUrl: 'data:application/pdf;base64,' + 'A'.repeat(Math.ceil(bytes / 3) * 4),
  rawPdfFileName: 'fremd.pdf',
  rawPdfByteLength: bytes,
  rawPdfInspection: inspectionFor(bytes),
});

describe('the schema contract is the platform one, not a second slot', () => {
  it('derives the version instead of writing a second number', () => {
    expect(PDF_STUDIO_SCHEMA_VERSION).toBe(WORKSPACE_SCHEMA_VERSIONS.PdfStudio);
    expect(PDF_STUDIO_SCHEMA_VERSION).toBe(1);
  });

  it('spells the field exactly as the platform stamp does', () => {
    expect(PDF_STUDIO_SCHEMA_FIELD).toBe(WORKSPACE_SCHEMA_FIELD);
    expect(PDF_STUDIO_SCHEMA_FIELD).toBe('schemaVersion');
  });

  it('does not keep a second storage slot for the version', () => {
    // Counter-check for the earlier draft of this batch: it stored the version in
    // `wom_extensions['vgt.pdf-studio:payload']` while the platform writes it into the document envelope.
    // Two slots for one fact is the failure this project keeps paying for, so the save path must not create
    // the namespace at all.
    const saved = savePdfStudioDocument(pdfDocument({ wom_extensions: { 'vgt.wom:identity': { tombstones: [] } } }), model(), 1_700_000_003_000);
    expect(Object.keys(saved.wom_extensions ?? {})).toEqual(['vgt.wom:identity']);
    expect(saved.wom_extensions?.['vgt.pdf-studio:payload']).toBeUndefined();
  });

  it('stamps through the application stamp on the live path and reads it back with the platform reader', () => {
    // The live sequence in `usePdfStudioState.persistPdfData`, in the same order: save, then the application
    // stamp. The platform stamp stays where the cross-app contract measures it (the shell pass), so this is
    // the composition the user actually triggers.
    const saved = withPdfStudioSchema(savePdfStudioDocument(pdfDocument(), model(), 1_700_000_001_000));
    expect(readPdfStudioSchemaStamp(saved)).toBe(PDF_STUDIO_SCHEMA_VERSION);
    expect(resolveWorkspaceDocumentRead(saved)).toEqual({ verdict: 'current', version: PDF_STUDIO_SCHEMA_VERSION });
    expect(() => assertPdfStudioSchemaStamped(saved)).not.toThrow();
    expect(saved.version).toBe(4);
    expect(saved.modified_at).toBe(1_700_000_001_000);
  });

  it('leaves save itself unstamped, so exactly one place writes the envelope stamp', () => {
    // The cross-app contract `integrationSchemaAdoption.contract.test.mjs` measures
    // `stampWorkspaceDocumentSchema` as having exactly one production caller. A stamp inside `apps/pdf` would
    // be a second mechanism, so `savePdfStudioDocument` must only *read* the stamp.
    const saved = savePdfStudioDocument(pdfDocument(), model(), 1_700_000_001_400);
    expect(readPdfStudioSchemaStamp(saved)).toBeUndefined();
    expect(resolveWorkspaceDocumentRead(saved)).toMatchObject({ verdict: 'legacy' });
    expect(() => assertPdfStudioSchemaStamped(saved)).toThrow(/document-schema-invalid at schemaVersion/u);
  });

  it('keeps an already-current stamp unchanged (the stamp is idempotent)', () => {
    const stamped = stampWorkspaceDocumentSchema(pdfDocument()).document;
    expect(stampWorkspaceDocumentSchema(stamped)).toMatchObject({ outcome: 'already-current' });
    const twice = withPdfStudioSchema(savePdfStudioDocument(withPdfStudioSchema(stamped), model(), 1_700_000_001_500));
    expect(readPdfStudioSchemaStamp(twice)).toBe(PDF_STUDIO_SCHEMA_VERSION);
    expect(assertPdfStudioRoundTrip(twice).byteIdentical).toBe(true);
  });

  it('refuses a newer schema version by name instead of reading it best-effort', () => {
    const future = { ...pdfDocument(), schemaVersion: PDF_STUDIO_SCHEMA_VERSION + 1 } as WorkspaceDocument;
    expect(() => assertPdfStudioSchemaReadable(future)).toThrow(PdfStudioPersistenceError);
    expect(() => assertPdfStudioSchemaReadable(future)).toThrow(/newer than the supported 1/u);
    expect(() => savePdfStudioDocument(future, model(), 1_700_000_002_000)).toThrow(/document-schema-newer at schemaVersion/u);
  });

  it('refuses an unusable schema value instead of assuming the current version', () => {
    const broken = { ...pdfDocument(), schemaVersion: 'eins' } as unknown as WorkspaceDocument;
    expect(() => assertPdfStudioSchemaReadable(broken)).toThrow(/document-schema-invalid at schemaVersion/u);
  });

  it('allows a pre-contract store as `legacy` and stamps it on the next save', () => {
    const legacy = pdfDocument();
    expect(resolveWorkspaceDocumentRead(legacy)).toMatchObject({ verdict: 'legacy' });
    expect(() => assertPdfStudioSchemaReadable(legacy)).not.toThrow();
    const live = withPdfStudioSchema(savePdfStudioDocument(legacy, model(), 1_700_000_002_200));
    expect(readPdfStudioSchemaStamp(live)).toBe(PDF_STUDIO_SCHEMA_VERSION);
    expect(assertPdfStudioRoundTrip(live).byteIdentical).toBe(true);
  });

  it('refuses a save timestamp before the document existed, by name', () => {
    expect(() => savePdfStudioDocument(pdfDocument(), model(), 1)).toThrow(/modified_at/u);
    expect(() => savePdfStudioDocument(pdfDocument(), model(), 1)).toThrow(/cannot be modified before it exists/u);
  });
});

describe('documented payload schema fields', () => {
  it('accepts the canonical demonstration model', () => {
    expect(validatePdfStudioPayload(model())).toEqual([]);
    expect(() => assertPdfStudioPayload(model())).not.toThrow();
  });

  it('rejects a page count above the bound that pages/pdfPageOps.ts owns', () => {
    const pages = Array.from({ length: MAX_PAGE_COUNT + 1 }, (_value, index) => ({ pageNumber: index + 1, title: 'p', sections: [] }));
    const issues = validatePdfStudioPayload(model({ numPages: MAX_PAGE_COUNT + 1, pages }));
    expect(issues.map((issue) => issue.code)).toContain('page-count-exceeded');
    expect(issues[0]?.detail).toContain(String(MAX_PAGE_COUNT));
  });

  it('rejects a numPages that disagrees with the page list', () => {
    const issues = validatePdfStudioPayload(model({ numPages: 9 }));
    expect(issues).toContainEqual(expect.objectContaining({ code: 'num-pages-mismatch', path: 'pdfData.numPages' }));
  });

  it('rejects page numbering that is not 1...n in order', () => {
    const pages = model().pages.map((page, index) => ({ ...page, pageNumber: index === 1 ? 7 : page.pageNumber }));
    expect(validatePdfStudioPayload(model({ pages })).map((issue) => issue.code)).toContain('page-numbering-invalid');
  });

  it('rejects a non-finite media box', () => {
    const pages = model().pages.map((page, index) => index === 0 ? { ...page, mediaBox: { x: 0, y: 0, width: Number.NaN, height: 10 } } : page);
    expect(validatePdfStudioPayload(model({ pages })).map((issue) => issue.code)).toContain('page-box-invalid');
  });

  it('rejects duplicate identities across collections, not only inside one', () => {
    const shared = 'anno-shared-identity';
    const withClash = model({
      annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], id: shared }],
      redactions: [{ id: shared, page: 1, x: 0, y: 0, width: 0, height: 0, reason: 'r', isApplied: true, timestamp: 1 }],
    });
    const issue = validatePdfStudioPayload(withClash).find((candidate) => candidate.code === 'duplicate-id');
    expect(issue?.detail).toContain(shared);
    expect(issue?.detail).toContain('unique across the document');
  });

  it('rejects an id the canonical WOM id rule cannot persist', () => {
    const withBadId = model({ annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], id: 'anno mit leerzeichen' }] });
    expect(validatePdfStudioPayload(withBadId).map((issue) => issue.code)).toContain('unstable-id');
  });

  it('rejects a section id the canonical WOM id rule cannot persist', () => {
    const pages = model().pages.map((page, index) => index === 0
      ? { ...page, sections: page.sections.map((section, sectionIndex) => sectionIndex === 0 ? { ...section, id: 'a+b' } : section) }
      : page);
    expect(validatePdfStudioPayload(model({ pages })).map((issue) => issue.code)).toContain('unstable-id');
  });

  it('rejects a dangling page reference', () => {
    const withDangling = model({ annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], page: 99 }] });
    expect(validatePdfStudioPayload(withDangling).map((issue) => issue.code)).toContain('dangling-page-reference');
  });

  it('rejects annotation, reply and ink counts above the review bounds', () => {
    const tooMany = model({ annotations: Array.from({ length: PDF_REVIEW_LIMITS.maxAnnotations + 1 }, (_value, index) => ({ ...DEFAULT_PDF_MODEL.annotations[0], id: `anno-${index}` })) });
    expect(validatePdfStudioPayload(tooMany).map((issue) => issue.code)).toContain('annotation-limit-exceeded');
    const longText = model({ annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], text: 'x'.repeat(PDF_REVIEW_LIMITS.maxTextChars + 1) }] });
    expect(validatePdfStudioPayload(longText).map((issue) => issue.code)).toContain('annotation-text-exceeds-limit');
    const manyReplies = model({ annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], replies: Array.from({ length: PDF_REVIEW_LIMITS.maxRepliesPerAnnotation + 1 }, (_value, index) => ({ id: `reply-${index}`, text: 't', author: 'a', createdAt: 1 })) }] });
    expect(validatePdfStudioPayload(manyReplies).map((issue) => issue.code)).toContain('annotation-reply-limit-exceeded');
    const manyPoints = model({ annotations: [{ ...DEFAULT_PDF_MODEL.annotations[0], type: 'ink', points: Array.from({ length: PDF_REVIEW_LIMITS.maxInkPoints + 1 }, () => ({ x: 0, y: 0 })) }] });
    expect(validatePdfStudioPayload(manyPoints).map((issue) => issue.code)).toContain('annotation-ink-points-exceeded');
  });

  it('rejects form fields beyond the form bounds that pdfAcroFormModel.ts owns', () => {
    const field = { id: 'field-1', name: 'field_1', type: 'text' as const, page: 1, bounds: { x: 1, y: 1, width: 10, height: 10 }, value: '', options: [], required: false, readOnly: false };
    expect(validatePdfStudioPayload(model({ formFields: [field] }))).toEqual([]);
    const tooMany = model({ formFields: Array.from({ length: PDF_FORM_LIMITS.maxFields + 1 }, (_value, index) => ({ ...field, id: `field-${index}`, name: `f${index}` })) });
    expect(validatePdfStudioPayload(tooMany).map((issue) => issue.code)).toContain('form-field-limit-exceeded');
    const longName = model({ formFields: [{ ...field, name: 'n'.repeat(PDF_FORM_LIMITS.maxName + 1) }] });
    expect(validatePdfStudioPayload(longName).map((issue) => issue.code)).toContain('form-field-name-invalid');
    const longValue = model({ formFields: [{ ...field, value: 'v'.repeat(PDF_FORM_LIMITS.maxValueLength + 1) }] });
    expect(validatePdfStudioPayload(longValue).map((issue) => issue.code)).toContain('form-field-value-exceeds-limit');
  });

  it('rejects a non-object payload with a named code', () => {
    expect(validatePdfStudioPayload(null)[0]).toMatchObject({ code: 'payload-not-an-object', path: 'pdfData' });
    expect(validatePdfStudioPayload('nope')[0]).toMatchObject({ code: 'payload-not-an-object' });
  });
});

describe('native byte payload: the derived persistability bound', () => {
  it('derives the bound from the two owners instead of writing a third number', () => {
    const derived = maxPersistableNativePdfBytes();
    const fromSerializer = Math.floor(((MAX_SERIALIZED_DOCUMENT_BYTES - 4 * 1024 * 1024) * 3) / 4);
    expect(derived).toBe(Math.min(fromSerializer, PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes));
    expect(derived).toBeLessThan(PDF_WORKSPACE_IMPORT_LIMITS.maxNativePdfBytes);
    expect(derived).toBeGreaterThan(60 * 1024 * 1024);
  });

  it('accepts a payload inside the bound and rejects one above it by name', () => {
    expect(validatePdfStudioPayload(nativeModel(maxPersistableNativePdfBytes()))).toEqual([]);
    const over = validatePdfStudioPayload(nativeModel(maxPersistableNativePdfBytes() + 3));
    expect(over.map((issue) => issue.code)).toContain('raw-payload-size-exceeded');
    expect(over[0]?.detail).toContain('persistability bound');
  });

  it('rejects native metadata without the byte payload and vice versa', () => {
    expect(validatePdfStudioPayload(model({ rawPdfFileName: 'fremd.pdf' })).map((issue) => issue.code)).toContain('raw-payload-metadata-inconsistent');
    const withoutManifest = { ...nativeModel(1024) } as Partial<PdfDocumentModel>;
    delete withoutManifest.rawPdfInspection;
    expect(validatePdfStudioPayload(withoutManifest).map((issue) => issue.code)).toContain('raw-payload-hash-missing');
    expect(validatePdfStudioPayload({ ...nativeModel(1024), rawPdfByteLength: 999 }).map((issue) => issue.code)).toContain('raw-payload-metadata-inconsistent');
    expect(validatePdfStudioPayload({ ...nativeModel(1024), rawPdfInspection: inspectionFor(1024, 'NOT-A-HASH') }).map((issue) => issue.code)).toContain('raw-payload-hash-missing');
  });

  it('reports the payload size it would serialize', () => {
    expect(estimatePdfStudioPayloadJsonBytes(model())).toBeGreaterThan(100);
    expect(estimatePdfStudioPayloadJsonBytes(nativeModel(3_000_000))).toBeGreaterThan(4_000_000);
  });
});

describe('Save -> Close -> Reopen over the canonical serializer', () => {
  it('returns a byte-identical document through serialize/deserialize', () => {
    const saved = withPdfStudioSchema(savePdfStudioDocument(pdfDocument(), model(), 1_700_000_002_000));
    const result = assertPdfStudioRoundTrip(saved);
    expect(result.byteIdentical).toBe(true);
    // The payload carries non-ASCII characters, so the byte length is at least the string length.
    expect(result.serializedBytes).toBeGreaterThanOrEqual(result.serialized.length);
    // The app payload is value-identical. The document *envelope* is not: the canonical boundary normalises it
    // (`normalizeProtection` adds the `standard` block). That is the boundary doing its job, so it is asserted
    // explicitly instead of being hidden behind a whole-document equality.
    expect(result.reopened.pdfData).toEqual(saved.pdfData);
    expect(saved.protection).toBeUndefined();
    expect(result.reopened.protection).toMatchObject({ version: 1, classification: 'standard', locked: false, readOnly: false });
    expect(result.reopened.version).toBe(saved.version);
    expect(result.reopened.modified_at).toBe(saved.modified_at);
    // The envelope stamp survives the canonical round trip — otherwise the next write would look `legacy`.
    expect(readPdfStudioSchemaStamp(result.reopened)).toBe(PDF_STUDIO_SCHEMA_VERSION);
  });

  it('carries annotations, replies, redactions and form values through unchanged', () => {
    const rich = model({
      annotations: [
        { ...DEFAULT_PDF_MODEL.annotations[0], id: 'anno-keep', status: 'accepted', replies: [{ id: 'reply-keep', text: 'Antwort', author: 'Reviewer', createdAt: 5 }] },
        { id: 'anno-ink', page: 2, type: 'ink', text: 'Freihand', color: '#38bdf8', author: 'Reviewer', createdAt: 6, points: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] },
      ],
      redactions: [{ id: 'redact-keep', page: 3, x: 1, y: 2, width: 3, height: 4, reason: 'DSGVO', isApplied: true, targetText: '[12 CHARACTERS REDACTED]', timestamp: 7 }],
      formFields: [{ id: 'field-keep', name: 'kunde_name', type: 'text', page: 1, bounds: { x: 54, y: 640, width: 220, height: 24 }, value: 'Meier GmbH', options: [], required: true, readOnly: false, tabOrder: 2 }],
    });
    const reopened = reopenPdfStudioDocument(serializePdfStudioDocument(savePdfStudioDocument(pdfDocument(), rich, 1_700_000_002_500)));
    expect(reopened.pdfData?.annotations.map((annotation) => annotation.id)).toEqual(['anno-keep', 'anno-ink']);
    expect(reopened.pdfData?.annotations[0].replies?.[0].text).toBe('Antwort');
    expect(reopened.pdfData?.annotations[1].points).toEqual([{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }]);
    expect(reopened.pdfData?.redactions[0]).toMatchObject({ id: 'redact-keep', reason: 'DSGVO' });
    expect(reopened.pdfData?.formFields?.[0]).toMatchObject({ name: 'kunde_name', value: 'Meier GmbH', tabOrder: 2 });
  });

  it('refuses to WRITE a document whose payload violates the schema, naming the field', () => {
    const saved = savePdfStudioDocument(pdfDocument(), model(), 1_700_000_004_000);
    const tampered = saved.pdfData as PdfDocumentModel;
    expect(() => serializePdfStudioDocument({ ...saved, pdfData: { ...tampered, numPages: tampered.numPages + 5 } }))
      .toThrow(/num-pages-mismatch at pdfData\.numPages/u);
  });

  it('refuses to READ a stored document whose payload was tampered with, naming the field', () => {
    // Byte surgery on the serialized string is the only honest way to reach the read path: the write path
    // already refuses the broken payload, so a tampered *store* is what a user could actually encounter.
    const saved = savePdfStudioDocument(pdfDocument(), model(), 1_700_000_004_500);
    const serialized = serializePdfStudioDocument(saved);
    const doctored = serialized.replace(`"numPages":${saved.pdfData?.numPages}`, `"numPages":${(saved.pdfData?.numPages ?? 0) + 5}`);
    expect(doctored).not.toBe(serialized);
    expect(() => reopenPdfStudioDocument(doctored)).toThrow(PdfStudioPersistenceError);
    expect(() => reopenPdfStudioDocument(doctored)).toThrow(/num-pages-mismatch at pdfData\.numPages/u);
  });

  it('refuses a serialized document that is not this application at all', () => {
    const serialized = serializePdfStudioDocument(pdfDocument({ kind: 'Writer' as WorkspaceDocument['kind'] }));
    expect(() => reopenPdfStudioDocument(serialized)).toThrow(/document-kind-invalid/u);
  });
});

describe('the save path protects the store contract', () => {
  it('refuses a document that is not a PDF Studio document', () => {
    expect(() => savePdfStudioDocument(pdfDocument({ kind: 'Grid' }), model())).toThrow(/document-kind-invalid at kind/u);
  });

  it('refuses an unstable document id by name', () => {
    expect(() => savePdfStudioDocument(pdfDocument({ id: 'doc mit leerzeichen' }), model())).toThrow(/document-id-invalid at id/u);
  });

  it('refuses an invalid document version by name', () => {
    expect(() => savePdfStudioDocument(pdfDocument({ version: 0 }), model())).toThrow(/document-invariant-violated at version/u);
  });

  it('never rewrites the protection metadata or the security policy', () => {
    // Both vocabularies are owned elsewhere: the classification by `normalizeProtection`, the Infinity
    // provenance by `securityProfiles`. The canonical constants are imported rather than guessed.
    const protectedDocument = pdfDocument({
      protection: { version: 1, classification: 'confidential', locked: true, readOnly: false },
      securityPolicy: { profile: 'VGT_TOP_SECRET', infinity_suite: INFINITY_SUITE, infinity_commit: INFINITY_PINNED_COMMIT },
    });
    const saved = savePdfStudioDocument(protectedDocument, model(), 1_700_000_009_000);
    expect(saved.protection).toEqual(protectedDocument.protection);
    expect(saved.securityPolicy).toEqual(protectedDocument.securityPolicy);
    const roundTrip = assertPdfStudioRoundTrip(saved);
    expect(roundTrip.byteIdentical).toBe(true);
    expect(roundTrip.reopened.protection?.classification).toBe('confidential');
    // The canonical migration block *normalises* the envelope: it fills `inherited_from_workspace` and
    // `downgrade_authorized` with their defaults. The classified values are what must survive, and they do.
    expect(roundTrip.reopened.securityPolicy).toMatchObject({
      profile: 'VGT_TOP_SECRET',
      infinity_suite: INFINITY_SUITE,
      infinity_commit: INFINITY_PINNED_COMMIT,
    });
    expect(roundTrip.reopened.protection).toMatchObject({ locked: true, readOnly: false });
  });

  it('fails closed before the serializer with a reason a user can act on, not a byte count from the shell', () => {
    expect(() => savePdfStudioDocument(pdfDocument(), nativeModel(maxPersistableNativePdfBytes() + 3))).toThrow(/raw-payload-size-exceeded/u);
  });
});
