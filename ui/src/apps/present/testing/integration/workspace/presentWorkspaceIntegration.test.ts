// STATUS: PLATIN — Present live/frozen projections are routed through the neutral snapshot port.
import { afterEach, expect, it } from 'vitest';
import { registerWorkspaceSnapshotProvider } from '../../../../../platform/workspace/integrations/workspaceSnapshot';
import { initialDocs } from '../../../../../app/bootstrap/seedData';
import type { WriterWorkspaceEmbedSnapshot } from '../../../../../shared/contracts/workspace';
import { createPresentWorkspaceObject, refreshPresentWorkspaceObject } from '../../../integrations/presentWorkspaceIntegration';

const gridDocument = Object.values(initialDocs).find((document) => document.kind === 'Grid');
if (!gridDocument) throw new Error('Present snapshot test requires a canonical Grid source.');

const snapshot: WriterWorkspaceEmbedSnapshot = { type: 'summary', metrics: [], lines: ['host snapshot'] };
let release: (() => void) | undefined;

afterEach(() => {
  release?.();
  release = undefined;
});

it('creates and refreshes live Present objects through the neutral snapshot provider', () => {
  let receivedId: string | undefined;
  release = registerWorkspaceSnapshotProvider((document) => { receivedId = document.id; return snapshot; });
  const request = { sourceDocument: gridDocument, integrationKind: 'grid-range' as const, mode: 'Live' as const, sourceObjectId: 'sheet-main', sourceSelector: 'A1:B2' };

  const object = createPresentWorkspaceObject(request, 'present-fixed-id');
  expect(receivedId).toBe(gridDocument.id);
  expect(object.snapshot).toBe(snapshot);

  const newerSource = { ...gridDocument, version: gridDocument.version + 1 };
  const refreshed = refreshPresentWorkspaceObject(object, newerSource);
  expect(refreshed.sourceVersion).toBe(newerSource.version);
  expect(refreshed.snapshot).toBe(snapshot);
});

it('places inserted workspace references in separate available canvas slots', () => {
  release = registerWorkspaceSnapshotProvider(() => snapshot);
  const request = { sourceDocument: gridDocument, integrationKind: 'grid-range' as const, mode: 'Live' as const, sourceObjectId: 'sheet-main', sourceSelector: 'A1:B2' };
  const placed: ReturnType<typeof createPresentWorkspaceObject>[] = [];
  for (let index = 0; index < 3; index += 1) {
    placed.push(createPresentWorkspaceObject(request, `present-slot-${index}`, placed));
  }

  expect(new Set(placed.map(({ xPercent, yPercent }) => `${xPercent}:${yPercent}`)).size).toBe(placed.length);
  expect(placed.every((object) => object.xPercent >= 70 && object.xPercent + object.widthPercent <= 100 && object.heightPercent === 18)).toBe(true);
  expect(() => createPresentWorkspaceObject(request, 'present-slot-full', placed)).toThrow('No collision-free region');
});

