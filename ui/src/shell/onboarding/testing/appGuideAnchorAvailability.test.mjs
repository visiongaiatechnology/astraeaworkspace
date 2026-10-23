// STATUS: GOLD — rejects hidden and disabled anchors before guide progression.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAppGuideAnchorAvailable } from '../appGuideAnchorAvailability.ts';

const sourceRoot = new URL('../../../', import.meta.url);
const available = {
  hasLayout: true,
  visible: true,
  enabled: true,
  exposed: true,
};

describe('interactive guide anchor availability', () => {
  it('requires a rendered, visible, enabled, accessible target', () => {
    expect(isAppGuideAnchorAvailable(available)).toBe(true);
    expect(isAppGuideAnchorAvailable({ ...available, hasLayout: false })).toBe(false);
    expect(isAppGuideAnchorAvailable({ ...available, visible: false })).toBe(false);
    expect(isAppGuideAnchorAvailable({ ...available, enabled: false })).toBe(false);
    expect(isAppGuideAnchorAvailable({ ...available, exposed: false })).toBe(false);
  });

  it('covers the fresh Tasks guide target, whose add action starts disabled', () => {
    const tasksSource = readFileSync(new URL('apps/tasks/views/TasksView.tsx', sourceRoot), 'utf8');
    const popoverSource = readFileSync(new URL('../AppGuidePopover.tsx', import.meta.url), 'utf8');
    expect(tasksSource).toMatch(/const \[newTaskTitle, setNewTaskTitle\] = useState\(''\)/u);
    expect(tasksSource).toContain('disabled={!newTaskTitle.trim()} data-vgt-app-guide-anchor="Tasks:second"');
    expect(popoverSource).toContain("!element.matches(':disabled')");
    expect(popoverSource).toContain("element.getAttribute('aria-disabled') !== 'true'");
  });
});
