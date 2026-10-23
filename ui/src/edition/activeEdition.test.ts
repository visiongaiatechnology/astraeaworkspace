import { describe, expect, it } from 'vitest';
import type { WorkspaceDocument } from '../shared/contracts/workspace';
import { filterDocumentsForEdition, resolveAstraeaEdition } from './activeEdition';
import { createEditionRegistry } from './registry';

const documents: Record<string, WorkspaceDocument> = {
  writer: {
    id: 'writer', title: 'Writer', kind: 'Writer', created_at: 1, modified_at: 1,
    version: 1, theme_id: 'default', root_object_ids: [], objects: {},
  },
  projects: {
    id: 'projects', title: 'Projects', kind: 'Projects', created_at: 1, modified_at: 1,
    version: 1, theme_id: 'default', root_object_ids: [], objects: {},
  },
};

describe('active Astraea edition boundary', () => {
  it('accepts only explicit edition names and keeps missing build config dev-only', () => {
    expect(resolveAstraeaEdition('open-core', false)).toBe('open-core');
    expect(resolveAstraeaEdition('premium', false)).toBe('premium');
    expect(resolveAstraeaEdition(undefined, true)).toBe('premium');
    expect(() => resolveAstraeaEdition(undefined, false)).toThrow(/edition is not configured/u);
    expect(() => resolveAstraeaEdition('enterprise', true)).toThrow(/edition is not configured/u);
  });

  it('filters premium document data before it reaches Open Core shell state', () => {
    expect(Object.keys(filterDocumentsForEdition(documents, createEditionRegistry('open-core')))).toEqual(['writer']);
    expect(Object.keys(filterDocumentsForEdition(documents, createEditionRegistry('premium')))).toEqual(['writer', 'projects']);
  });
});
