// STATUS: PLATIN — WR-044: a recovery export must never dump protected content as plaintext
import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { isModuleRecoveryExportRedacted, moduleRecoveryPayload } from '../moduleRecoveryCore';

function document(overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument {
  return {
    id: 'doc-1',
    title: 'Quartalsplan',
    kind: 'Writer',
    created_at: 0,
    modified_at: 1,
    version: 3,
    schema_version: 2,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    ...overrides,
  } as WorkspaceDocument;
}

const SECRET_TEXT = 'Vertraulicher Absatz mit Zahlen 42';

function writerDataWithText() {
  return {
    pageSetup: {},
    tables: [],
    images: [],
    styles: [],
    sections: [],
    equations: [],
    shapes: [],
  } as unknown as WorkspaceDocument['writerData'];
}

describe('WR-044 — recovery export policy', () => {
  it('exports a standard document with its content', () => {
    const payload = moduleRecoveryPayload(document({ writerData: writerDataWithText() }), 1_000);
    expect(isModuleRecoveryExportRedacted(document())).toBe(false);
    expect(payload).toContain('"schema": "vgt.workspace.recovery/1"');
    expect(payload).toContain('"exportedAt": 1000');
    expect(payload).not.toContain('"redacted": true');
  });

  it.each(['PQC', 'VGT_TOP_SECRET'] as const)('redacts a %s document', (profile) => {
    const protectedDocument = document({ securityPolicy: { profile }, writerData: writerDataWithText() });
    expect(isModuleRecoveryExportRedacted(protectedDocument)).toBe(true);
    const payload = moduleRecoveryPayload(protectedDocument, 1_000);
    expect(payload).toContain('"redacted": true');
    expect(payload).toContain('"redactionReason": "protected-document"');
    // Nothing of the document body may survive the redaction.
    expect(payload).not.toContain('"writerData"');
    expect(payload).not.toContain(SECRET_TEXT);
    // It still names the document, its version and the classification for support.
    expect(payload).toContain('"id": "doc-1"');
    expect(payload).toContain('"version": 3');
    expect(payload).toContain(`"securityProfile": "${profile}"`);
  });

  it.each(['sensitive', 'confidential', 'restricted'] as const)('redacts a %s classification', (classification) => {
    const classified = document({
      protection: { version: 1, classification, locked: true, readOnly: true },
      writerData: writerDataWithText(),
    });
    expect(isModuleRecoveryExportRedacted(classified)).toBe(true);
    const payload = moduleRecoveryPayload(classified);
    expect(payload).toContain('"redacted": true');
    expect(payload).not.toContain('"writerData"');
  });

  it('keeps a standard classification exportable', () => {
    const standard = document({ protection: { version: 1, classification: 'standard', locked: false, readOnly: false } });
    expect(isModuleRecoveryExportRedacted(standard)).toBe(false);
  });
});
