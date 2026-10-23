// STATUS: PLATIN — verifies localized command descriptors and rendered palette controls.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../localization/workspaceLocaleTypes';
import { COMMAND_PALETTE_COPY, localizeCommandPaletteDescriptor, type CommandPaletteCopy } from '../commandPaletteLocale';
import type { ShellCommandDescriptor } from '../../home/workspaceShellHomeCore';

vi.mock('../../localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

import { useWorkspaceLocale } from '../../localization/workspaceLocale';
import { CommandPalette } from '../components/CommandPalette';

const paletteProps = {
  isOpen: true,
  onClose: () => undefined,
  onExecuteCommand: () => undefined,
  activeDocument: null,
  documents: {},
  vaultAvailable: false,
};

describe('command palette locale coverage', () => {
  it('provides structurally complete non-empty copy for every supported locale', () => {
    const expectedKeys = Object.keys(COMMAND_PALETTE_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = COMMAND_PALETTE_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(Object.keys(copy.categories).sort(), `${locale}.categories`).toEqual(['create', 'fabric', 'file', 'insert', 'navigate', 'privacy', 'recent', 'security']);
      for (const key of Object.keys(copy) as (keyof CommandPaletteCopy)[]) {
        if (key === 'categories') {
          for (const [category, label] of Object.entries(copy.categories)) expect(label.trim(), `${locale}.${key}.${category}`).not.toBe('');
        } else {
          expect(copy[key].trim(), `${locale}.${key}`).not.toBe('');
        }
      }
    }
  });

  it('localizes command names, categories, descriptions, and disabled reasons without changing actions', () => {
    const descriptor: ShellCommandDescriptor = {
      id: 'save-vwc', title: 'Save encrypted container', description: 'Persist document.', category: 'File',
      scope: 'document', shortcut: 'Ctrl+S', enabled: false, disabledReason: 'No active document.',
    };
    for (const locale of WORKSPACE_LOCALES) {
      const localized = localizeCommandPaletteDescriptor(descriptor, locale);
      expect(localized.id).toBe(descriptor.id);
      expect(localized.shortcut).toBe(descriptor.shortcut);
      expect(localized.enabled).toBe(false);
      expect(localized.title).toBe(COMMAND_PALETTE_COPY[locale].saveTitle);
      expect(localized.category).toBe(COMMAND_PALETTE_COPY[locale].categories.file);
      expect(localized.disabledReason).toBe(COMMAND_PALETTE_COPY[locale].saveDisabled);
    }
  });

  it('renders palette controls and commands in all seven locales', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: () => undefined });
      const copy = COMMAND_PALETTE_COPY[locale];
      const markup = renderToStaticMarkup(<CommandPalette {...paletteProps} />);
      expect(markup).toContain(`aria-label="${copy.paletteLabel}"`);
      expect(markup).toContain(`aria-label="${copy.searchLabel}"`);
      expect(markup).toContain(`placeholder="${copy.searchPlaceholder}"`);
      expect(markup).toContain(`aria-label="${copy.commandsLabel}"`);
      expect(markup).toContain(copy.categories.create);
      expect(markup).toContain(copy.categories.security);
      expect(markup).toContain(copy.openPdfTitle);
      expect(markup).toContain(copy.vaultDisabled);
      expect(markup).toContain(copy.insertChartDisabled);
    }
  });
});
