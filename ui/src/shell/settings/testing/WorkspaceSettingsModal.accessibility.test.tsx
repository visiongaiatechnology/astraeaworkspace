import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceSettingsModal } from '../WorkspaceSettingsModal';
import { DEFAULT_SHELL_APPEARANCE, DEFAULT_SHELL_SHORTCUTS } from '../../platform/workspaceShellPlatform';

describe('Workspace Settings surface', () => {
  it('exposes global sections in a labelled modal and presents the actual shell preferences', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceSettingsModal, {
      isOpen: true,
      onClose: vi.fn(),
      appearance: DEFAULT_SHELL_APPEARANCE,
      shortcuts: DEFAULT_SHELL_SHORTCUTS,
      onAppearanceChange: vi.fn(),
      onShortcutChange: vi.fn(),
    }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('workspace-settings-dialog');
    expect(html).toContain('workspace-settings-sidebar');
    expect(html).not.toContain('bg-[#090711]');
    expect(html).toContain('id="workspace-settings-title"');
    expect(html).toContain('Appearance');
    expect(html).toContain('Language');
    expect(html).toContain('Astraea Connect');
    expect(html).toContain('Shortcuts');
    expect(html).toContain('id="workspace-theme-presets"');
    expect(html).toContain('Cosmic Obsidian');
    expect(html).toContain('Arctic Daylight');
    expect(html).toContain('id="workspace-scale"');
  });

  it('exposes the General sidebar preference as a labelled persistent switch', () => {
    const html = renderToStaticMarkup(createElement(WorkspaceSettingsModal, {
      isOpen: true,
      initialSection: 'general',
      onClose: vi.fn(),
      appearance: DEFAULT_SHELL_APPEARANCE,
      shortcuts: DEFAULT_SHELL_SHORTCUTS,
      onAppearanceChange: vi.fn(),
      onShortcutChange: vi.fn(),
    }));

    expect(html).toContain('data-settings-control-region="general"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('aria-labelledby="workspace-start-sidebar-label"');
    expect(html).toContain('aria-describedby="workspace-start-sidebar-description"');
    expect(html).toContain('data-setting-binding="general.start-center-sidebar-collapsed"');
    expect(html).toContain('Start Center navigation');
  });
});
