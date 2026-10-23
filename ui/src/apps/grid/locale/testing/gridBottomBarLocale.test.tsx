// STATUS: PLATIN — rendered coverage for Grid sheet/status labels and dynamic collaboration copy.
import type { ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_LOCALES } from '../../../../shell/localization/workspaceLocaleTypes';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { GridBottomBar } from '../../toolbar/GridBottomBar';
import { GRID_BOTTOM_BAR_COPY } from '../gridBottomBarLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const noop = (): void => undefined;
const props = {
  sheets: [
    { id: 'visible', name: 'Plan', tableObjectId: 'table-visible', showGridlines: true, useVirtualCanvas: true, freezeRows: 1, freezeCols: 1 },
    { id: 'hidden', name: 'Archive', tableObjectId: 'table-hidden', hidden: true },
  ],
  activeSheetId: 'visible',
  onSelectSheet: noop,
  onAddSheet: noop,
  onRenameSheet: noop,
  onDuplicateSheet: noop,
  onDeleteSheet: noop,
  onReorderSheet: noop,
  onChangeTabColor: noop,
  onSetSheetVisibility: noop,
  onUpdateActiveSheet: noop,
  collaborationAvailable: true,
  collaborationEnabled: true,
  collaborationPeerCount: 2,
  collaborationConflictCount: 1,
} satisfies ComponentProps<typeof GridBottomBar>;

describe('Grid bottom bar localization', () => {
  it('keeps all locales complete and formats dynamic labels', () => {
    const expectedKeys = Object.keys(GRID_BOTTOM_BAR_COPY['en-US']).sort();
    for (const locale of WORKSPACE_LOCALES) {
      const copy = GRID_BOTTOM_BAR_COPY[locale];
      expect(Object.keys(copy).sort(), locale).toEqual(expectedKeys);
      expect(copy.setTabColor('#3b82f6'), `${locale}.setTabColor`).toContain('#3b82f6');
      expect(copy.hiddenCount(2), `${locale}.hiddenCount`).toContain('2');
      expect(copy.syncGraph(2), `${locale}.syncGraph`).toContain('2');
      expect(copy.conflicts(3), `${locale}.conflicts`).toContain('3');
    }
  });

  it('renders translated view controls, status, and collaboration fallback for every locale', () => {
    for (const locale of WORKSPACE_LOCALES) {
      vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
      const copy = GRID_BOTTOM_BAR_COPY[locale];
      const markup = renderToStaticMarkup(<GridBottomBar {...props} />);

      expect(markup).toContain(copy.addSheet);
      expect(markup).toContain(copy.gridlines);
      expect(markup).toContain(copy.frozenPanes);
      expect(markup).toContain(copy.canvasActive);
      expect(markup).toContain(copy.syncGraph(2));
      expect(markup).toContain(copy.conflicts(1));
      expect(markup).toContain(copy.engineActive);
      expect(markup).toContain('Plan');
    }
  });

  it('does not expose the native collaboration error string in a tooltip', () => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'de-DE', locale: 'de-DE', setPreference: noop });
    const markup = renderToStaticMarkup(<GridBottomBar {...props} collaborationError="internal native path and port details" />);
    expect(markup).toContain(GRID_BOTTOM_BAR_COPY['de-DE'].collaborationError);
    expect(markup).not.toContain('internal native path and port details');
  });
});
