// @vitest-environment happy-dom
// STATUS: PLATIN — Alpha 0.1: one visible way back from any document to the start page / overview.
//
// The user asked for an "Übersicht" button next to Settings that returns from an opened document to
// the Workspace start page. The header owns only the button; the shell owns the navigation state, so
// the callback is optional and the button disappears whenever no navigation target exists (Start
// Center open, first-run wizard above it). Locale copy must be real copy in every supported language.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES, type WorkspaceLocale } from '../../localization/workspaceLocaleTypes';
import { workspaceText } from '../../localization/workspaceLocale';
import { Header } from '../Header';

const localeState = vi.hoisted(() => ({ current: 'de-DE' as WorkspaceLocale }));
vi.mock('../../localization/workspaceLocale', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../localization/workspaceLocale')>();
  return { ...actual, useWorkspaceLocale: () => ({ locale: localeState.current }) };
});

const baseProps = {
  edition: 'open-core' as const,
  activeDoc: null,
  onRenameDoc: vi.fn(),
  onOpenSettings: vi.fn(),
  onOpenCommandPalette: vi.fn(),
  onOpenSearch: vi.fn(),
  onSaveVwc: vi.fn(),
  onOpenFile: vi.fn(),
};

let container: HTMLElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

afterEach(async () => {
  localeState.current = 'de-DE';
  if (root) {
    await act(async () => { root!.unmount(); });
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Header — Übersicht / Overview button', () => {
  it('renders the overview action next to settings when the shell provides a target', () => {
    const markup = renderToStaticMarkup(<Header {...baseProps} onOpenStartCenter={() => undefined} />);
    expect(markup).toContain('data-workspace-action="overview"');
    expect(markup).toContain(`aria-label="${workspaceText('header.overview', 'de-DE')}"`);
    // The overview return path sits directly beside settings, before it.
    const overviewIndex = markup.indexOf('data-workspace-action="overview"');
    const settingsIndex = markup.indexOf(`aria-label="${workspaceText('header.openSettings', 'de-DE')}"`);
    expect(overviewIndex).toBeGreaterThan(-1);
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(overviewIndex).toBeLessThan(settingsIndex);
  });

  it('stays absent when no navigation target exists (Start Center open / start page)', () => {
    const markup = renderToStaticMarkup(<Header {...baseProps} />);
    expect(markup).not.toContain('data-workspace-action="overview"');
  });

  it('is a keyboard-focusable button that invokes the shell callback', async () => {
    const onOpenStartCenter = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<Header {...baseProps} onOpenStartCenter={onOpenStartCenter} />);
    });

    const button = container.querySelector<HTMLButtonElement>('[data-workspace-action="overview"]');
    expect(button).not.toBeNull();
    expect(button!.tagName).toBe('BUTTON');
    expect(button!.getAttribute('type')).toBe('button');
    expect(button!.getAttribute('aria-label')).toBe(workspaceText('header.overview', 'de-DE'));

    await act(async () => { button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onOpenStartCenter).toHaveBeenCalledTimes(1);
  });

  it.each(WORKSPACE_LOCALES)('labels the overview in %s with real copy', (locale) => {
    localeState.current = locale;
    const markup = renderToStaticMarkup(<Header {...baseProps} onOpenStartCenter={() => undefined} />);
    const label = workspaceText('header.overview', locale);
    expect(label.length).toBeGreaterThan(0);
    expect(markup).toContain(`aria-label="${label}"`);
    if (locale === 'en-US') {
      expect(label).toBe('Overview');
      expect(markup).not.toContain('Übersicht');
    }
    if (locale === 'de-DE') expect(label).toBe('Übersicht');
  });
});
