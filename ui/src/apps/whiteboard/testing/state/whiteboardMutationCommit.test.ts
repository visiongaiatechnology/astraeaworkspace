import { describe, expect, it, vi } from 'vitest';
import type { WhiteboardItem } from '../../types';
import { commitWhiteboardItemMutation } from '../../state/whiteboardMutationCommit';

describe('Whiteboard mutation feedback gate', () => {
  it('suppresses selection, tool, and success follow-up when canonical update rejects', () => {
    const updateItems = vi.fn(() => false);
    const afterAccepted = vi.fn();
    const update: (previous: WhiteboardItem[]) => WhiteboardItem[] = (previous) => previous;

    expect(commitWhiteboardItemMutation(updateItems, update, afterAccepted)).toBe(false);
    expect(updateItems).toHaveBeenCalledOnce();
    expect(afterAccepted).not.toHaveBeenCalled();
  });

  it('runs follow-up exactly once after an accepted canonical update', () => {
    const updateItems = vi.fn(() => true);
    const afterAccepted = vi.fn();

    expect(commitWhiteboardItemMutation(updateItems, [], afterAccepted)).toBe(true);
    expect(updateItems).toHaveBeenCalledOnce();
    expect(afterAccepted).toHaveBeenCalledOnce();
  });
});
