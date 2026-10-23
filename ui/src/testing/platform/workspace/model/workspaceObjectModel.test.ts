import { describe, expect, it } from 'vitest';
import { WOM_SCHEMA_VERSION, type WorkspaceChangeOperation, type WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { initialDocs } from '../../../../app/bootstrap/seedData';
import {
  applyWorkspaceChangeOperation,
  migrateWorkspaceDocument,
  validateWorkspaceDocumentInvariants,
  WorkspaceMalformedInputError,
} from '../../../../platform/workspace/model/workspaceObjectModel';

function documentWithWriterData(writerData: unknown): WorkspaceDocument {
  return {
    schema_version: WOM_SCHEMA_VERSION,
    id: 'writer-alias-regression',
    title: 'Writer alias regression',
    kind: 'Writer',
    created_at: 1,
    modified_at: 1,
    version: 1,
    theme_id: 'default',
    root_object_ids: [],
    objects: {},
    writerData: writerData as WorkspaceDocument['writerData'],
  };
}

describe('workspace document cycle validation', () => {
  it('accepts shared Writer catalog arrays that are not cyclic', () => {
    const sharedParagraphStyles: unknown[] = [];
    const document = documentWithWriterData({
      styles: sharedParagraphStyles,
      styleCatalog: { paragraphStyles: sharedParagraphStyles },
    });

    expect(() => validateWorkspaceDocumentInvariants(document)).not.toThrow();
  });

  it('rejects a true object cycle', () => {
    const cyclicWriterData: Record<string, unknown> = {};
    cyclicWriterData.self = cyclicWriterData;

    expect(() => validateWorkspaceDocumentInvariants(documentWithWriterData(cyclicWriterData)))
      .toThrow('Cyclic values cannot be persisted in WOM');
  });
});

describe('canonical Open-Core seed documents', () => {
  it('satisfy current WOM invariants before the first user mutation', () => {
    for (const document of Object.values(initialDocs)) {
      expect(() => validateWorkspaceDocumentInvariants(document), document.id).not.toThrow();
    }
  });
});

describe('Workspace permission expiry validation', () => {
  const grant = (expiresAt: unknown): Record<string, unknown> => ({
    principalId: 'principal-1',
    role: 'viewer',
    expiresAt,
  });

  it.each(['tomorrow', null, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects malformed current-schema permission expiry %s',
    (expiresAt) => {
      const document = {
        ...documentWithWriterData({}),
        permissions: { policyVersion: 1, grants: [grant(expiresAt)] },
      } as unknown as WorkspaceDocument;

      expect(() => validateWorkspaceDocumentInvariants(document)).toThrow(WorkspaceMalformedInputError);
      expect(() => migrateWorkspaceDocument(document)).toThrow(WorkspaceMalformedInputError);
    },
  );

  it('stores the normalized permission contract for current-schema migration without mutating input', () => {
    const permissions = {
      policyVersion: 7,
      ownerId: ' owner-1 ',
      grants: [{
        principalId: ' principal-1 ',
        role: 'viewer',
        deviceIds: [' device-1 ', 'device-1', 'device-2'],
        expiresAt: 1_800_000_000_000,
      }],
    };
    const document = {
      ...documentWithWriterData({}),
      permissions,
    } as unknown as WorkspaceDocument;

    const migrated = migrateWorkspaceDocument(document);

    expect(migrated.permissions).toEqual({
      policyVersion: 1,
      ownerId: 'owner-1',
      grants: [{
        principalId: 'principal-1',
        role: 'viewer',
        deviceIds: ['device-1', 'device-2'],
        expiresAt: 1_800_000_000_000,
      }],
    });
    expect((document as unknown as { permissions: unknown }).permissions).toEqual(permissions);
  });

  it('rejects malformed permissions in set-permissions operations', () => {
    const document = migrateWorkspaceDocument(documentWithWriterData({}));
    const operation = {
      operationId: 'permission-expiry-operation',
      at: 2,
      kind: 'set_permissions',
      permissions: { policyVersion: 1, grants: [grant('never')] },
    } as unknown as WorkspaceChangeOperation;

    expect(() => applyWorkspaceChangeOperation(document, operation)).toThrow(WorkspaceMalformedInputError);
  });

  it('preserves future-schema permission payloads without applying current expiry semantics', () => {
    const futurePermissions = { policyVersion: 3, grants: [grant('vendor-defined')] };
    const futureDocument = {
      ...documentWithWriterData({}),
      schema_version: WOM_SCHEMA_VERSION + 1,
      permissions: futurePermissions,
    } as unknown as WorkspaceDocument;

    expect(migrateWorkspaceDocument(futureDocument).permissions).toEqual(futurePermissions);
  });
});
