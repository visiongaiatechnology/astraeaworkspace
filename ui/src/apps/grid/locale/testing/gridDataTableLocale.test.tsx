import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import type { WorkspaceLocale } from '../../../../shell/localization/workspaceLocaleTypes';
import { GridDataTableModal } from '../../what-if/GridDataTableModal';
import { GRID_DATA_TABLE_COPY, gridDataTableFailureCopy } from '../gridDataTableLocale';

vi.mock('../../../../shell/localization/workspaceLocale', () => ({ useWorkspaceLocale: vi.fn() }));

const locales: WorkspaceLocale[] = ['en-US', 'de-DE', 'ru-RU', 'it-IT', 'es-ES', 'ja-JP', 'zh-CN'];
const noop = () => undefined;

describe('Grid What-If Data Table locale copy', () => {
  beforeEach(() => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: 'en-US', locale: 'en-US', setPreference: noop });
  });

  it.each(locales)('renders localized controls and accessible dialog in %s', (locale) => {
    vi.mocked(useWorkspaceLocale).mockReturnValue({ preference: locale, locale, setPreference: noop });
    const markup = renderToStaticMarkup(<GridDataTableModal isOpen cells={{}} selectedCell="C2" onClose={noop} onApplyTableOutput={() => true} />);
    const copy = GRID_DATA_TABLE_COPY[locale];

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain(`aria-label="${copy.close}"`);
    expect(markup).toContain(copy.title);
    expect(markup).toContain(copy.oneVariable);
    expect(markup).toContain(copy.twoVariable);
    expect(markup).toContain(copy.formulaCell);
    expect(markup).toContain(copy.calculate);
    expect(markup).toContain('max-h-[92vh]');
    expect(markup).toContain('grid-cols-1 sm:grid-cols-2');
    expect(markup).toContain('value="C2"');
  });

  it('keeps count/cell interpolation and replaces engine diagnostics with localized fallback copy', () => {
    for (const locale of locales) {
      const copy = GRID_DATA_TABLE_COPY[locale];
      expect(copy.calculatedMatrix(4)).toContain('4');
      expect(copy.applyTo('E9')).toContain('E9');
      expect(gridDataTableFailureCopy(locale, 'calculate')).toBe(copy.calculationFailed);
      expect(gridDataTableFailureCopy(locale, 'apply')).toBe(copy.notApplied);
      expect(gridDataTableFailureCopy(locale, 'commit')).toBe(copy.commitFailed);
      expect(gridDataTableFailureCopy(locale, 'calculate')).not.toContain('secret engine diagnostic');
    }
  });
});
