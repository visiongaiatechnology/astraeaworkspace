// STATUS: PLATIN — verifies App-installed Present projection remains the only implementation provider.
import { afterEach, expect, it, vi } from 'vitest';
import type { PresentWorkspaceSceneObject } from '../../../../../shared/contracts/workspace';
import {
  createPresentWorkspaceIntegrationObject,
  type PresentWorkspaceIntegrationRequest,
} from '../../../../../platform/workspace/integrations/presentWorkspaceIntegration';
import { installPresentWorkspaceIntegrationHost } from '../../../integrations/presentWorkspaceIntegrationHostAdapter';

let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('routes the neutral caller through the injected Present-owned implementation', () => {
  const object = {
    id: 'present-db-host',
    kind: 'workspace',
    integrationKind: 'database-chart',
    mode: 'Live',
    sourceDocumentId: 'database-1',
    sourceVersion: 3,
    uri: 'vgt://workspace/document/database-1/present-reference?kind=database-chart',
    title: 'Database chart',
    snapshot: { type: 'chart', title: 'Chart', categories: [], series: [] },
    xPercent: 12,
    yPercent: 20,
    widthPercent: 76,
    heightPercent: 58,
    rotation: 0,
    opacity: 1,
    zIndex: 30,
  } as PresentWorkspaceSceneObject;
  const createObject = vi.fn(() => object);
  release = installPresentWorkspaceIntegrationHost(createObject);
  const request = {
    sourceDocument: { id: 'database-1', version: 3, title: 'Database' } as PresentWorkspaceIntegrationRequest['sourceDocument'],
    integrationKind: 'database-chart',
    mode: 'Live',
  } satisfies PresentWorkspaceIntegrationRequest;

  expect(createPresentWorkspaceIntegrationObject(request, 'present-db-host')).toBe(object);
  expect(createObject).toHaveBeenCalledWith(request, 'present-db-host');
});
