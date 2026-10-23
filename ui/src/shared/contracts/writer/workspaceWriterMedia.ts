// STATUS: DIAMANT VGT SUPREME — Sovereign Media, Vector Shapes & Scientific Equations Typings

export type WriterTextWrapMode =
  | 'inline'
  | 'square'
  | 'tight'
  | 'through'
  | 'top-bottom'
  | 'behind-text'
  | 'in-front-of-text';

export type WriterAnchorTarget = 'page' | 'margin' | 'column' | 'paragraph' | 'character';

export interface WriterMediaCrop {
  topPercent: number;
  rightPercent: number;
  bottomPercent: number;
  leftPercent: number;
}

export interface WriterMediaAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: boolean;
  sepia: boolean;
  invert: boolean;
}


export type WriterMediaObjectKind = 'audio' | 'video';
export type WriterMediaObjectStorage = 'embedded' | 'linked';

export interface WriterMediaObjectData {
  id: string;
  kind: WriterMediaObjectKind;
  storage: WriterMediaObjectStorage;
  name: string;
  mimeType: string;
  sourceUrl?: string;
  embeddedDataUrl?: string;
  anchorParagraphId?: string;
  caption?: string;
  /** Plain-text transcript kept local with the document; bounded during normalization. */
  transcript?: string;
  createdAt: number;
}

export type WriterShapeKind =
  | 'rectangle'
  | 'rounded-rectangle'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'callout'
  | 'textbox';

export interface WriterShapeBlockData {
  id: string;
  shapeKind: WriterShapeKind;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  rotationDeg?: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWidthPx?: number;
  strokeDashStyle?: 'solid' | 'dashed' | 'dotted';
  text?: string;
  calloutTailXMm?: number;
  calloutTailYMm?: number;
  arrowStartHead?: boolean;
  arrowEndHead?: boolean;
  groupId?: string;
  zIndex?: number;
  anchorParagraphId?: string;
  wrapMode?: WriterTextWrapMode;
  caption?: string;
}

export interface WriterImageBlockData {
  id: string;
  name: string;
  dataUrl: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  widthPercent: number;
  alignment: 'left' | 'center' | 'right';
  altText?: string;
  caption?: string;
  captionPosition?: 'above' | 'below';
  anchorParagraphId?: string;
  placement?: 'block' | 'float-left' | 'float-right';
  wrapMode?: WriterTextWrapMode;
  wrapDistanceTopMm?: number;
  wrapDistanceBottomMm?: number;
  wrapDistanceLeftMm?: number;
  wrapDistanceRightMm?: number;
  anchorTarget?: WriterAnchorTarget;
  anchorPageIndex?: number;
  anchorColumnIndex?: number;
  anchorCharacterOffset?: number;
  horizontalOffsetMm?: number;
  verticalOffsetMm?: number;
  moveWithText?: boolean;
  fixPositionOnPage?: boolean;
  crop?: WriterMediaCrop;
  rotationDeg?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  opacity?: number;
  adjustments?: WriterMediaAdjustments;
}

export interface WriterEquationBlockData {
  id: string;
  latex: string;
  caption?: string;
  displayMode?: boolean;
  anchorParagraphId?: string;
  mathml?: string;
  fontSizePt?: number;
}

export interface WriterFigureIndexItem {
  id: string;
  label: string;
  caption: string;
  pageNumber: number;
}
