// STATUS: DIAMANT VGT SUPREME — canonical cross-app render contracts

export type RenderSurfaceKind = 'view' | 'print' | 'export' | 'thumbnail';
export type RenderBackendKind = 'canvas2d' | 'webgl2' | 'svg' | 'dom';
export type RenderColorSpace = 'srgb';

export interface RenderMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface RenderPageGeometry {
  width: number;
  height: number;
  margins: RenderMargins;
  bodyWidth: number;
  bodyHeight: number;
  columns: {
    count: number;
    gap: number;
    widths: number[];
    offsets: number[];
  };
}

export interface RenderTextStyle {
  fontFamily: string;
  fontSizePx: number;
  fontWeight?: number;
  italic?: boolean;
  letterSpacingPx?: number;
  direction?: 'ltr' | 'rtl' | 'auto';
  locale?: string;
  fontFeatures?: Readonly<Record<string, boolean | number>>;
  fontVariations?: Readonly<Record<string, number>>;
}


export interface RenderAccessibilityNode {
  id: string;
  role: string;
  name?: string;
  description?: string;
  rowIndex?: number;
  columnIndex?: number;
  selected?: boolean;
  disabled?: boolean;
  readingOrder?: number;
  keyboardFocusable?: boolean;
  textRange?: { start: number; end: number; caret?: number };
  children?: RenderAccessibilityNode[];
}

export interface RenderSnapshotPrimitive {
  kind: 'text' | 'rect' | 'line' | 'image';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  font?: string;
  sourceId?: string;
}

export interface RenderSnapshotPage {
  geometry: RenderPageGeometry;
  primitives: RenderSnapshotPrimitive[];
}
