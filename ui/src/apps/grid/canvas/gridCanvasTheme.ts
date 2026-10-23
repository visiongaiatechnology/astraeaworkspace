// STATUS: GOLD — bounded visual tokens for Workspace-owned Grid chrome only.
export interface GridCanvasTheme {
  workbench: string;
  control: string;
  text: string;
  mutedText: string;
  border: string;
  selectionSurface: string;
  selectionBorder: string;
}

type CssVariableReader = Pick<CSSStyleDeclaration, 'getPropertyValue'>;

export function resolveGridCanvasTheme(style: CssVariableReader): GridCanvasTheme {
  const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
  return {
    workbench: read('--vgt-module-panel-surface', '#0a0d14'),
    control: read('--vgt-module-control-surface', '#0f172a'),
    text: read('--vgt-control-text', '#cbd5e1'),
    mutedText: read('--vgt-control-muted', '#94a3b8'),
    border: read('--vgt-control-border', 'rgba(255, 255, 255, 0.12)'),
    selectionSurface: read('--vgt-selection', 'rgba(59, 130, 246, 0.1)'),
    selectionBorder: read('--vgt-selection-border', '#3b82f6'),
  };
}
