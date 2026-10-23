// STATUS: PLATIN — fail-closed Present integration ownership, request, and result contracts.
import { afterEach, expect, it, vi } from 'vitest';
import type { PresentWorkspaceSceneObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  createPresentWorkspaceIntegrationObject,
  PresentWorkspaceIntegrationHostUnavailableError,
  registerPresentWorkspaceIntegrationHost,
  type PresentWorkspaceIntegrationRequest,
} from '../../../../platform/workspace/integrations/presentWorkspaceIntegration';

const sourceDocument = { id: 'database-contract-source', title: 'Database', version: 4 } as WorkspaceDocument;

const request: PresentWorkspaceIntegrationRequest = {
  sourceDocument,
  integrationKind: 'database-chart',
  mode: 'Live',
  sourceSelector: 'view-primary',
};
const result: PresentWorkspaceSceneObject = {
  id: 'present-database-chart',
  kind: 'workspace',
  integrationKind: 'database-chart',
  mode: 'Live',
  sourceDocumentId: sourceDocument.id,
  sourceSelector: 'view-primary',
  sourceVersion: sourceDocument.version,
  uri: `vgt://workspace/document/${encodeURIComponent(sourceDocument.id)}/present-reference?kind=database-chart`,
  title: 'Database chart',
  snapshot: { type: 'summary', metrics: [], lines: [] },
  xPercent: 12,
  yPercent: 20,
  widthPercent: 76,
  heightPercent: 58,
  rotation: 0,
  opacity: 1,
  zIndex: 30,
};

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('fails closed until the Present-owned host is registered', () => {
  expect(() => createPresentWorkspaceIntegrationObject(request))
    .toThrow(PresentWorkspaceIntegrationHostUnavailableError);
});

it('forwards the bounded request and stable id to the registered host', () => {
  const createObject = vi.fn(() => result);
  release = registerPresentWorkspaceIntegrationHost({ createObject });

  expect(createPresentWorkspaceIntegrationObject(request, result.id)).toBe(result);
  expect(createObject).toHaveBeenCalledWith(request, result.id);
});

it('rejects invalid requests before host projection', () => {
  const createObject = vi.fn(() => result);
  release = registerPresentWorkspaceIntegrationHost({ createObject });

  expect(() => createPresentWorkspaceIntegrationObject({ ...request, mode: 'Snapshot' as 'Live' }))
    .toThrow('present_workspace_integration_request_invalid');
  expect(() => createPresentWorkspaceIntegrationObject({ ...request, sourceSelector: 'x'.repeat(513) }))
    .toThrow('present_workspace_integration_source_selector_invalid');
  expect(() => createPresentWorkspaceIntegrationObject(request, 'x'.repeat(193)))
    .toThrow('present_workspace_integration_id_invalid');
  expect(createObject).not.toHaveBeenCalled();
});

it('rejects a second host and releases only the registration owner', () => {
  const createObject = vi.fn(() => result);
  release = registerPresentWorkspaceIntegrationHost({ createObject });
  expect(() => registerPresentWorkspaceIntegrationHost({ createObject })).toThrow('already_registered');

  expect(createPresentWorkspaceIntegrationObject(request)).toBe(result);
  release();
  release = undefined;
  expect(() => createPresentWorkspaceIntegrationObject(request)).toThrow(PresentWorkspaceIntegrationHostUnavailableError);
});

it('rejects host output that changes requested identity or returns an unknown snapshot tag', () => {
  release = registerPresentWorkspaceIntegrationHost({
    createObject: () => ({ ...result, sourceSelector: 'other-view' }),
  });
  expect(() => createPresentWorkspaceIntegrationObject(request)).toThrow('result_invalid');
  release?.();
  release = registerPresentWorkspaceIntegrationHost({
    createObject: () => ({ ...result, snapshot: { type: 'unknown' } } as unknown as PresentWorkspaceSceneObject),
  });
  expect(() => createPresentWorkspaceIntegrationObject(request)).toThrow('result_invalid');
  release?.();
  release = registerPresentWorkspaceIntegrationHost({ createObject: () => ({ ...result, id: 'other-id' }) });
  expect(() => createPresentWorkspaceIntegrationObject(request, 'requested-id')).toThrow('result_invalid');
});
