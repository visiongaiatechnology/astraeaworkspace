// STATUS: DIAMANT VGT SUPREME — Writer Layout and style schema contracts

export type WriterLanguageTag = 'de-DE' | 'en-US' | 'en-GB' | 'fr-FR';

export type WriterPaperSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'B4' | 'B5' | 'Letter' | 'Legal' | 'Executive' | 'Custom';

export type WriterPageOrientation = 'portrait' | 'landscape';

export type WriterMarginPreset = 'normal' | 'narrow' | 'wide' | 'mirrored' | 'custom';

export type WriterPaperColor = 'white' | 'cream' | 'dark';

export type WriterHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type WriterParagraphStyleName =
  | 'normal' | 'title' | 'subtitle' | 'quote' | 'caption'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6' | 'heading7' | 'heading8' | 'heading9'
  | 'toc1' | 'toc2' | 'toc3' | 'toc4' | 'toc5' | 'toc6' | 'toc7' | 'toc8' | 'toc9';

export type WriterTextAlignment = 'left' | 'center' | 'right' | 'justify' | 'distributed';

export type WriterTextEffect = 'none' | 'subtle-shadow' | 'strong-shadow';

export type WriterParagraphBorderStyle = 'solid' | 'dashed' | 'dotted' | 'double';

export interface WriterParagraphBorder {
  style: WriterParagraphBorderStyle;
  widthPt: number;
  color: string;
  spacingPt: number;
}

export interface WriterParagraphBorders {
  top?: WriterParagraphBorder;
  right?: WriterParagraphBorder;
  bottom?: WriterParagraphBorder;
  left?: WriterParagraphBorder;
}

export interface WriterParagraphShading {
  fillColor: string;
  opacityPercent: number;
}

export type WriterTabAlignment = 'left' | 'right' | 'center' | 'decimal';

export type WriterTabLeader = 'none' | 'dots' | 'dashes' | 'underline';

export type WriterParagraphDirection = 'auto' | 'ltr' | 'rtl';

export type WriterLineBreakMode = 'normal' | 'break-word' | 'anywhere' | 'keep-all';

export type WriterHyphenationMode = 'none' | 'manual' | 'auto';

export interface WriterTabStop {
  id: string;
  positionMm: number;
  alignment: WriterTabAlignment;
  leader: WriterTabLeader;
  decimalCharacter?: '.' | ',';
}

export interface WriterStyleDefinition {
  name: WriterParagraphStyleName;
  label: string;
  fontSizePt: number;
  bold: boolean;
  italic?: boolean;
  textColor?: string;
  fontFamily?: string;
  alignment?: WriterTextAlignment;
  lineHeight: number;
  spaceBefore: number;
  spaceAfter: number;
  basedOn?: WriterParagraphStyleName | string;
  nextStyle?: WriterParagraphStyleName | string;
  autoUpdate?: boolean;
  textEffect?: WriterTextEffect;
  firstLineIndentMm?: number;
  hangingIndentMm?: number;
  keepWithNext?: boolean;
  keepLinesTogether?: boolean;
  widowOrphanControl?: boolean;
  pageBreakBefore?: boolean;
  borders?: WriterParagraphBorders;
  shading?: WriterParagraphShading;
  tabStops?: WriterTabStop[];
  borderTop?: string;
  borderBottom?: string;
  backgroundColor?: string;
}

export interface WriterPageBorders {
  style: 'solid' | 'dashed' | 'dotted' | 'double';
  widthPt: number;
  color: string;
  paddingMm: number;
}

export type WriterPageNumberFormat =
  | 'arabic'
  | 'roman'
  | 'roman-upper'
  | 'roman-lower'
  | 'alpha'
  | 'alpha-upper'
  | 'alpha-lower';

export interface WriterPageSetupConfig {
  paperSize: WriterPaperSize;
  customWidthMm?: number;
  customHeightMm?: number;
  orientation: WriterPageOrientation;
  margins: WriterMarginPreset;
  customMargins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    gutter?: number;
  };
  columns?: 1 | 2 | 3 | 4;
  columnGapMm?: number;
  columnWidthsMm?: number[];
  paperColor: WriterPaperColor;
  backgroundColor?: string;
  showPageNumbers: boolean;
  pageNumberFormat?: WriterPageNumberFormat;
  pageNumberPosition?: 'footer-right' | 'footer-center' | 'footer-left' | 'header-right' | 'header-center' | 'header-left';
  pageNumberStart?: number;
  chapterNumbering?: boolean;
  headerText: string;
  footerText: string;
  firstPageDifferent?: boolean;
  oddEvenDifferent?: boolean;
  firstPageHeaderText?: string;
  firstPageFooterText?: string;
  evenPageHeaderText?: string;
  evenPageFooterText?: string;
  linkToPreviousHeader?: boolean;
  linkToPreviousFooter?: boolean;
  mirroredMargins?: boolean;
  watermark?: {
    enabled: boolean;
    text: string;
    opacity: number;
    rotationDeg: number;
    color: string;
  };
  pageBorders?: WriterPageBorders;
}

export interface WriterCharacterStyleDefinition {
  id: string;
  label: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  fontFamily?: string;
  fontSizePt?: number;
  textColor?: string;
  highlightColor?: string;
}

export interface WriterListStyleDefinition {
  id: string;
  label: string;
  listStyle: 'bullet' | 'number' | 'checklist';
  leftIndentMm: number;
  hangingIndentMm: number;
}

export interface WriterTableStyleDefinition {
  id: string;
  label: string;
  headerBackground: string;
  rowBackground: string;
  alternateRowBackground: string;
  borderColor: string;
  textColor: string;
}

export interface WriterLinkedStyleDefinition {
  id: string;
  label: string;
  paragraphStyleName: WriterParagraphStyleName;
  characterStyleId: string;
}

export interface WriterStyleCatalog {
  paragraphStyles: WriterStyleDefinition[];
  characterStyles: WriterCharacterStyleDefinition[];
  listStyles: WriterListStyleDefinition[];
  tableStyles: WriterTableStyleDefinition[];
  linkedStyles: WriterLinkedStyleDefinition[];
}

export interface WriterStyleSet {
  schemaVersion: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  catalog: WriterStyleCatalog;
}

export interface WriterSectionDefinition {
  id: string;
  startParagraphId: string;
  pageSetup: WriterPageSetupConfig;
  breakType?: WriterSectionBreakType;
  restartPageNumberAt?: number;
}

export type WriterSectionBreakType = 'next-page' | 'continuous' | 'even-page' | 'odd-page';
