// @vitest-environment happy-dom
// STATUS: PLATIN — WR-006/WR-034: the shell zoom must not resize the Writer's paper
//
// The slider at the very bottom writes `root.style.fontSize`, i.e. it scales the whole
// application chrome. With a Writer document open it competed with the Writer's own
// 50–200 % page zoom two rows above, and it never zoomed the sheet. A Writer document now
// gets a pointer to the control that really zooms the paper; every other app keeps the
// slider.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { shellChromeCopy } from '../../i18n/shellChromeLocale';
import { ShellStatusBar } from '../ShellStatusBar';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', () => ({
  useWorkspaceLocale: () => ({ locale: localeState.current }),
}));

const baseDocument = { id: 'shell-zoom', title: 'Quartalsplan' } as unknown as WorkspaceDocument;
const writerDocument = { ...baseDocument, kind: 'Writer' } as WorkspaceDocument;
const gridDocument = { ...baseDocument, kind: 'Grid' } as WorkspaceDocument;

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

function bar(document: WorkspaceDocument, onScaleChange?: (percent: number) => void): React.ReactElement {
  return (
    <ShellStatusBar
      document={document}
      save="saved"
      scalePercent={100}
      topSecretProviderReady={false}
      onScaleChange={onScaleChange}
    />
  );
}

describe('WR-006/WR-034 — Writer documents zoom the sheet, not the application', () => {
  it('replaces the shell slider with a pointer to the Writer page zoom', () => {
    const copy = shellChromeCopy(localeState.current).status;
    const markup = renderToStaticMarkup(bar(writerDocument));
    expect(markup).not.toContain('type="range"');
    expect(markup).toContain('data-shell-zoom-delegated="Writer"');
    expect(markup).toContain(copy.writerPageZoom);
    expect(markup).toContain(`title="${copy.writerPageZoomHint}"`);
  });

  it('keeps the workspace scale slider for every other app', () => {
    const copy = shellChromeCopy(localeState.current).status;
    const markup = renderToStaticMarkup(bar(gridDocument));
    expect(markup).toContain('type="range"');
    expect(markup).toContain(`aria-label="${copy.zoom}"`);
    expect(markup).not.toContain('data-shell-zoom-delegated');
  });

  it('does not offer a control that changes the scale while a Writer document is open', async () => {
    const onScaleChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(bar(writerDocument, onScaleChange)); });

    expect(container.querySelector('input[type="range"]')).toBeNull();
    // No hidden button may remain that still calls the shell scale handler.
    expect(container.querySelector('button[aria-label]')).toBeNull();
    expect(onScaleChange).not.toHaveBeenCalled();
  });

  it('still scales the shell for a non-Writer document', async () => {
    const onScaleChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => { root!.render(bar(gridDocument, onScaleChange)); });

    const plus = container.querySelector<HTMLButtonElement>('button[aria-label="Vergrößern"]');
    expect(plus).not.toBeNull();
    await act(async () => {
      plus!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onScaleChange).toHaveBeenCalledWith(125);
  });
});
