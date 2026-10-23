import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { GridDataValidationModal } from '../../validation/GridDataValidationModal';
import { GRID_DATA_VALIDATION_COPY } from '../../locale/gridDataValidationLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

describe('GridDataValidationModal accessible labels', () => {
  it('associates each visible default setting label with its form control', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({
      preference: 'de-DE',
      locale: 'de-DE',
      setPreference: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(GridDataValidationModal, {
      isOpen: true,
      onClose: vi.fn(),
      selectedRange: 'A1:A10',
      rules: [],
      onUpdateRules: vi.fn(),
      onToggleCircleInvalid: vi.fn(),
      isCirclingInvalid: false,
    }));

    const copy = GRID_DATA_VALIDATION_COPY['de-DE'];
    for (const labelText of [copy.range, copy.allowKind, copy.listOptions, copy.dynamicSource]) {
      const escaped = labelText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const label = html.match(new RegExp(`<label[^>]*for="([^"]+)"[^>]*>${escaped}<\\/label>`));
      expect(label, `missing control association for ${labelText}`).not.toBeNull();
      expect(html).toContain(`id="${label?.[1]}"`);
    }
  });
});
