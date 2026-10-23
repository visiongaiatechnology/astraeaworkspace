// AST-1001 (part 1) — the Tasks deep-link parser must accept every URI the workspace emits.
//
// MEASURED before this fix (repo HEAD 4d5ee24), by calling the three functions directly:
//
//   vgt://workspace/document/notes-doc-1/task/task-from-note-1   isWorkspaceDeepLink=false  kind=undefined  addKeeps=[]
//   vgt://workspace/document/notes-doc-1/notes/page/page-1       isWorkspaceDeepLink=false  kind=undefined  addKeeps=[]
//   vgt://workspace/document/notes-doc-1                          isWorkspaceDeepLink=true   kind=document
//   vgt://workspace/document/notes-doc-1/object/obj-1             isWorkspaceDeepLink=true   kind=object
//
// So Tasks REJECTED the two shapes its own workspace writes, and because `addWorkspaceDeepLink`
// silently drops what it cannot parse, editing a task would strip the cross-app link that the
// Notes bridge had just stored. These are the real producers:
//   notes/integrations/notesWorkspaceActions.ts:9    -> vgt://workspace/document/<doc>/notes/page/<page>
//   notes/integrations/notesWorkspaceActions.ts:108  -> vgt://workspace/document/<doc>/task/<task>
//   notes/model/notesTagsTasks.ts:143                -> vgt://workspace/document/<doc>/page/<page>
import { describe, expect, it } from 'vitest';
import {
  addWorkspaceDeepLink,
  isWorkspaceDeepLink,
  workspaceDeepLinkKind,
  WORKSPACE_DEEP_LINK_MAX_SEGMENTS,
} from '../../model/taskModel';

const PRODUCER_SHAPES = [
  ['plain document', 'vgt://workspace/document/doc-1', 'document'],
  ['workspace object', 'vgt://workspace/document/doc-1/object/obj-1', 'object'],
  ['task link (notesWorkspaceActions:108)', 'vgt://workspace/document/doc-1/task/task-from-note-1', 'task'],
  ['notes page link (notesWorkspaceActions:9)', 'vgt://workspace/document/doc-1/notes/page/page-1', 'page'],
  ['page link (notesTagsTasks:143)', 'vgt://workspace/document/doc-1/page/page-1', 'page'],
  ['annotation link', 'vgt://workspace/document/doc-1/annotation/anno-42', 'annotation'],
  ['range link', 'vgt://workspace/document/doc-1/range/r-1', 'range'],
  ['block link', 'vgt://workspace/document/doc-1/block/b-1', 'block'],
] as const;

describe('workspace deep link grammar', () => {
  it.each(PRODUCER_SHAPES)('accepts and classifies %s', (_label, uri, kind) => {
    expect(isWorkspaceDeepLink(uri)).toBe(true);
    expect(workspaceDeepLinkKind(uri)).toBe(kind);
  });

  it('keeps a task link instead of silently dropping it', () => {
    // The measured defect: this returned [] before the fix.
    expect(addWorkspaceDeepLink([], 'vgt://workspace/document/doc-1/task/task-from-note-1'))
      .toEqual(['vgt://workspace/document/doc-1/task/task-from-note-1']);
    expect(addWorkspaceDeepLink([], 'vgt://workspace/document/doc-1/notes/page/page-1'))
      .toEqual(['vgt://workspace/document/doc-1/notes/page/page-1']);
  });

  it('still fails closed on anything outside the workspace authority', () => {
    for (const bad of [
      'http://evil.example/phish',
      'https://workspace/document/doc-1',
      'vgt://workspace/document',
      'vgt://workspace/document/',
      'vgt://other/document/doc-1',
      'vgt://workspace/not-a-document/doc-1',
      'javascript:vgt://workspace/document/doc-1',
      'vgt://workspace/document/doc-1/../../etc/passwd',
      'file:///etc/passwd',
      '',
      'not a url',
    ]) {
      expect(isWorkspaceDeepLink(bad), bad).toBe(false);
      expect(workspaceDeepLinkKind(bad), bad).toBeUndefined();
      expect(addWorkspaceDeepLink([], bad), bad).toEqual([]);
    }
  });

  it('bounds the path so a link cannot grow without limit', () => {
    const overlong = `vgt://workspace/document/doc-1/${Array.from({ length: WORKSPACE_DEEP_LINK_MAX_SEGMENTS + 2 }, (_, index) => `seg${index}`).join('/')}`;
    expect(isWorkspaceDeepLink(overlong)).toBe(false);
    // At the bound it is still accepted.
    const atBound = `vgt://workspace/document/doc-1/${Array.from({ length: WORKSPACE_DEEP_LINK_MAX_SEGMENTS - 1 }, (_, index) => `seg${index}`).join('/')}`;
    expect(isWorkspaceDeepLink(atBound)).toBe(true);
  });

  it('deduplicates and preserves existing links', () => {
    const existing = ['vgt://workspace/document/doc-1/task/t1'];
    expect(addWorkspaceDeepLink(existing, 'vgt://workspace/document/doc-1/task/t1')).toEqual(existing);
    expect(addWorkspaceDeepLink(existing, 'vgt://workspace/document/doc-2')).toEqual([...existing, 'vgt://workspace/document/doc-2']);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(isWorkspaceDeepLink('  vgt://workspace/document/doc-1/task/t1  ')).toBe(true);
    expect(addWorkspaceDeepLink([], '  vgt://workspace/document/doc-1/task/t1  ')).toEqual(['vgt://workspace/document/doc-1/task/t1']);
  });

  it('reports an unknown object kind as an object rather than as a document', () => {
    // A future object kind must not be mistaken for the document itself.
    expect(workspaceDeepLinkKind('vgt://workspace/document/doc-1/future-kind/xyz')).toBe('object');
  });
});
