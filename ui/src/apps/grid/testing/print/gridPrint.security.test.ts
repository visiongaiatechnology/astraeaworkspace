import { describe, expect, it } from 'vitest';
import type { GridCell, GridPrintSettings } from '../../../../shared/contracts/workspace';
import { buildGridPrintableHtml } from '../../print/gridPrint';

const safeSettings: GridPrintSettings = {
  paperSize: 'A4',
  orientation: 'portrait',
  margins: 'normal',
  fitToWidth: true,
  showGridlines: true,
  repeatHeaderRow: true,
};

describe('Grid print HTML trust boundary', () => {
  it('rejects hostile persisted page size and orientation before CSS generation', () => {
    const hostilePaper = { ...safeSettings, paperSize: 'A4;}</style><script>globalThis.pwned=1</script><style>' } as unknown as GridPrintSettings;
    const hostileOrientation = { ...safeSettings, orientation: 'portrait}</style><script>globalThis.pwned=1</script><style>' } as unknown as GridPrintSettings;
    expect(() => buildGridPrintableHtml('Report', 'Sheet', {}, [0], 1, hostilePaper)).toThrow('grid_print_settings_invalid');
    expect(() => buildGridPrintableHtml('Report', 'Sheet', {}, [0], 1, hostileOrientation)).toThrow('grid_print_settings_invalid');
  });

  it('omits hostile cell CSS while preserving encoded cell text', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: '<img src=x onerror=alert(1)>', background: 'red" onmouseover="alert(1)', text_color: 'url(https://attacker.invalid/x)' },
    };
    const html = buildGridPrintableHtml('Report', 'Sheet', cells, [0], 1, safeSettings);
    expect(html).not.toContain('onmouseover');
    expect(html).not.toContain('attacker.invalid');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('preserves supported bounded hex and rgba cell colors', () => {
    const cells: Record<string, GridCell> = {
      A1: { value: 'safe', background: '#123abc', text_color: 'rgba(1, 2, 3, 0.5)' },
    };
    const html = buildGridPrintableHtml('Report', 'Sheet', cells, [0], 1, safeSettings);
    expect(html).toContain('style="background:#123abc;color:rgba(1, 2, 3, 0.5)"');
  });
});
