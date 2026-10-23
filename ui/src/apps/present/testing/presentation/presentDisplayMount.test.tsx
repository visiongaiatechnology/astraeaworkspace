// @vitest-environment happy-dom
// STATUS: GOLD — Present Runde 42: the app boot branch renders only the display app for a display URL.
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { mountPresentDisplayIfRequested } from '../../presentation/display/mountPresentDisplay';
import {
  createDisplaySnapshot,
  createEditorPeer,
  createPresentSessionTestHub,
} from './presentSessionTestHub';

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

const SESSION = 'present-boot-session';

const roots: HTMLElement[] = [];

afterEach(() => {
  while (roots.length > 0) roots.pop()?.remove();
});

function attachRoot(): HTMLElement {
  const root = document.createElement('div');
  document.body.appendChild(root);
  roots.push(root);
  return root;
}

describe('Present display boot branch', () => {
  it('mounts only the display app for a display URL and answers the editor handshake', async () => {
    const hub = createPresentSessionTestHub();
    createEditorPeer(hub, SESSION, () => createDisplaySnapshot());
    const root = attachRoot();

    let result: ReturnType<typeof mountPresentDisplayIfRequested> | null = null;
    const holder: { readonly current: () => ReturnType<typeof mountPresentDisplayIfRequested> | null } = {
      current: () => result,
    };
    await act(async () => {
      result = mountPresentDisplayIfRequested({
        search: `?present_display=audience&session=${SESSION}`,
        root,
        channelFactory: hub.factory,
        locale: 'en-US',
        reducedMotionOverride: true,
      });
    });
    await act(async () => undefined);

    expect(holder.current()?.mounted).toBe(true);
    expect(holder.current()?.role).toBe('audience');
    expect(root.querySelector('[data-present-display-root="audience"]')).not.toBeNull();
    expect(root.querySelector('[data-vgt-present-root]')).toBeNull();
    expect(root.textContent).toContain('Opening');

    await act(async () => holder.current()?.unmount());
    expect(root.querySelector('[data-present-display-root]')).toBeNull();
  });

  it('leaves the normal boot path untouched when the URL is not a display URL', () => {
    const root = attachRoot();
    const result = mountPresentDisplayIfRequested({ search: '?document=deck-1', root });
    expect(result.mounted).toBe(false);
    expect(result.role).toBeNull();
    expect(root.childElementCount).toBe(0);
  });

  it('does not boot a display for a hostile or incomplete query', () => {
    const root = attachRoot();
    for (const search of ['?present_display=presenter', '?present_display=editor&session=' + SESSION, `?session=${SESSION}`]) {
      const result = mountPresentDisplayIfRequested({ search, root });
      expect(result.mounted).toBe(false);
    }
    expect(root.childElementCount).toBe(0);
  });
});
