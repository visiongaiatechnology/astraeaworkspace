import { describe, expect, it } from 'vitest';
import { resolveGridCanvasTheme } from '../../canvas/gridCanvasTheme';

describe('Grid canvas theme bridge', () => {
  it('reads Workspace chrome tokens without reading or rewriting cell palette data', () => {
    const values = new Map<string, string>([
      ['--vgt-module-panel-surface', '#101820'],
      ['--vgt-module-control-surface', '#1b252f'],
      ['--vgt-control-text', '#f1f5f9'],
      ['--vgt-control-muted', '#b7c3cf'],
      ['--vgt-control-border', 'rgba(220, 230, 240, 0.2)'],
      ['--vgt-selection', 'rgba(140, 190, 240, 0.16)'],
      ['--vgt-selection-border', '#82b8f0'],
    ]);
    expect(resolveGridCanvasTheme({ getPropertyValue: (name) => values.get(name) ?? '' })).toEqual({
      workbench: '#101820',
      control: '#1b252f',
      text: '#f1f5f9',
      mutedText: '#b7c3cf',
      border: 'rgba(220, 230, 240, 0.2)',
      selectionSurface: 'rgba(140, 190, 240, 0.16)',
      selectionBorder: '#82b8f0',
    });
  });

  it('uses stable fallback tokens before Workspace appearance has been applied', () => {
    expect(resolveGridCanvasTheme({ getPropertyValue: () => '' })).toEqual({
      workbench: '#0a0d14',
      control: '#0f172a',
      text: '#cbd5e1',
      mutedText: '#94a3b8',
      border: 'rgba(255, 255, 255, 0.12)',
      selectionSurface: 'rgba(59, 130, 246, 0.1)',
      selectionBorder: '#3b82f6',
    });
  });
});
