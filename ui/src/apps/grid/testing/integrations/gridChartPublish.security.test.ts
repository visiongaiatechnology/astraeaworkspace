import { describe, expect, it } from 'vitest';
import { createNewDocument } from '../../../../edition/contracts/documentFactory';
import { listGridChartPublishTargets, publishGridChartToWorkspaceTarget } from '../../integrations/gridChartPublish';
import type { ChartObject, WorkspaceDocument } from '../../../../shared/contracts/workspace';

let fixtureId = 0;

function sourceGrid(): WorkspaceDocument {
  const source = createNewDocument('Grid');
  source.id = 'source-grid';
  const chart: ChartObject = {
    id: 'chart-source',
    chart_type: 'column',
    title: 'Revenue',
    categories: ['Q1'],
    series: [{ name: 'Revenue', values: [10] }],
  };
  source.root_object_ids.push(chart.id);
  source.objects[chart.id] = { type: 'Chart', data: chart };
  return source;
}

function targetDocument(kind: 'Writer' | 'Present' | 'Spaces'): WorkspaceDocument {
  const target: WorkspaceDocument = kind === 'Spaces'
    ? { id: '', title: 'Unavailable Spaces target', kind: 'Spaces', created_at: 1, modified_at: 1, version: 1, theme_id: 'default', root_object_ids: [], objects: {} }
    : createNewDocument(kind);
  target.id = `${kind.toLowerCase()}-${++fixtureId}`;
  return target;
}

describe('Grid chart publish target authorization', () => {
  it.each([
    ['locked', { version: 1 as const, classification: 'standard' as const, locked: true, readOnly: false }],
    ['read-only', { version: 1 as const, classification: 'standard' as const, locked: false, readOnly: true }],
  ])('rejects a %s target before changing it', (_label, protection) => {
    const source = sourceGrid();
    const target = targetDocument('Writer');
    target.protection = protection;

    expect(() => publishGridChartToWorkspaceTarget(source, 'chart-source', target)).toThrow(
      'Chart publish target is unavailable for editing.',
    );
    expect(target.version).toBe(1);
    expect(target.writerData?.workspaceEmbeds).toBeUndefined();
  });

  it('fails closed when target permissions are defined but no authenticated principal is available', () => {
    const target = targetDocument('Present');
    target.permissions = {
      policyVersion: 1,
      ownerId: 'owner-1',
      grants: [{ principalId: 'editor-1', role: 'editor' }],
    };

    expect(() => publishGridChartToWorkspaceTarget(sourceGrid(), 'chart-source', target)).toThrow(
      'Chart publish target is unavailable for editing.',
    );
    expect(target.presentData?.slides[0]?.chartReferenceId).toBeUndefined();
  });

  it('rejects Writer app-level protected modes', () => {
    const target = targetDocument('Writer');
    if (!target.writerData) throw new Error('Writer fixture missing its document model.');
    target.writerData.protectionMode = 'read_only';

    expect(() => publishGridChartToWorkspaceTarget(sourceGrid(), 'chart-source', target)).toThrow(
      'Chart publish target is unavailable for editing.',
    );
    expect(target.writerData.workspaceEmbeds).toBeUndefined();
  });

  it('does not expose Spaces targets until publishing can use the guarded Spaces write path', () => {
    const source = sourceGrid();
    const spaces = targetDocument('Spaces');
    const writer = targetDocument('Writer');
    const present = targetDocument('Present');

    expect(listGridChartPublishTargets({ [spaces.id]: spaces, [writer.id]: writer, [present.id]: present }, source.id))
      .toEqual([
        { id: writer.id, title: writer.title, kind: 'Writer' },
        { id: present.id, title: present.title, kind: 'Present' },
      ]);
    expect(() => publishGridChartToWorkspaceTarget(source, 'chart-source', spaces)).toThrow(
      'chart_publish_target_unsupported',
    );
  });

  it('omits protected and permission-scoped documents from the target picker', () => {
    const source = sourceGrid();
    const openTarget = targetDocument('Writer');
    const lockedTarget = targetDocument('Writer');
    lockedTarget.id = 'locked-writer';
    lockedTarget.protection = { version: 1, classification: 'standard', locked: true, readOnly: false };
    const scopedTarget = targetDocument('Present');
    scopedTarget.id = 'scoped-present';
    scopedTarget.permissions = { policyVersion: 1, ownerId: 'owner-1', grants: [] };

    expect(listGridChartPublishTargets({
      [openTarget.id]: openTarget,
      [lockedTarget.id]: lockedTarget,
      [scopedTarget.id]: scopedTarget,
    }, source.id)).toEqual([{ id: openTarget.id, title: openTarget.title, kind: 'Writer' }]);
  });
});
