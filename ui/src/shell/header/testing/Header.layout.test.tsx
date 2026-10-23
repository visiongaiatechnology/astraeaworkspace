import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Header } from '../Header';

describe('Workspace header layout', () => {
  it('keeps core actions in a responsive, token-themed shell header', () => {
    const html = renderToStaticMarkup(createElement(Header, {
      edition: 'open-core',
      activeDoc: null,
      onRenameDoc: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenCommandPalette: vi.fn(),
      onOpenSearch: vi.fn(),
      onSaveVwc: vi.fn(),
      onOpenFile: vi.fn(),
    }));

    expect(html).toContain('data-workspace-header-layout="responsive"');
    expect(html).toContain('class="workspace-header__inner"');
    expect(html).toContain('OPEN CORE');
    expect(html).toContain('aria-label="Astraea Workspace, Edition: Open Core"');
    expect(html).toContain('aria-label="Open Workspace Settings"');
    expect(html).toContain('aria-label="Search Workspace"');
    expect(html).toContain('aria-label="Open Command Palette (Ctrl+K)"');
    expect(html).toContain('aria-label="File: Open file…"');
    expect(html).toContain('aria-label="Save native Astraea container"');
    expect(html).not.toContain('min-h-12');
    expect(html).not.toContain('bg-[#0a0714]/95');
    expect(html).not.toContain('text-purple-400');
    expect(html.indexOf('aria-label="Open Workspace Settings"')).toBeLessThan(html.indexOf('aria-label="Search Workspace"'));
  });
});
