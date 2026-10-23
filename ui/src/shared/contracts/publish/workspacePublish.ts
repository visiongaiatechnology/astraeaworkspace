// STATUS: DIAMANT VGT SUPREME — Astraea Publish canonical DTP workspace model

export type PublishUnit = 'mm';
export type PublishPageOrientation = 'portrait' | 'landscape';
export type PublishPageNumberFormat = 'arabic' | 'roman-upper' | 'roman-lower' | 'alpha-upper' | 'alpha-lower';
export type PublishFrameType = 'text' | 'image' | 'graphic' | 'unassigned' | 'table' | 'chart' | 'barcode';
export type PublishVerticalJustification = 'top' | 'center' | 'bottom' | 'justify';
export type PublishAutoSizeMode = 'none' | 'height' | 'width' | 'both';
export type PublishTextWrapMode = 'none' | 'bounding-box' | 'contour';
export type PublishFitMode = 'fit' | 'fill' | 'stretch' | 'actual-size';
export type PublishBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export type PublishColorSpace = 'RGB' | 'CMYK' | 'Gray' | 'Lab' | 'Spot';
export type PublishLinkStatus = 'ok' | 'missing' | 'modified' | 'embedded' | 'remote-blocked';
export type PublishAssetKind = 'image' | 'pdf' | 'svg' | 'logo' | 'profile' | 'font' | 'template';
export type PublishWorkspaceSourceKind = 'writer-story' | 'grid-range' | 'database-query' | 'insight-chart' | 'present-asset' | 'draw-asset' | 'whiteboard-asset' | 'vault-asset' | 'spaces-review';
export type PublishLinkMode = 'live' | 'frozen' | 'broken';
export type PublishReviewState = 'open' | 'resolved';
export type PublishStyleKind = 'paragraph' | 'character' | 'object' | 'table' | 'cell';
export type PublishExportPresetKind = 'pdfx' | 'tagged-pdf' | 'interactive-pdf' | 'html-reflow' | 'html-fixed' | 'epub-reflow' | 'epub-fixed' | 'png' | 'jpeg' | 'svg' | 'package';

export interface PublishInsetsMm { top:number; right:number; bottom:number; left:number; }
export interface PublishPointMm { x:number; y:number; }
export interface PublishRectMm extends PublishPointMm { width:number; height:number; }

export interface PublishPageGeometry {
  widthMm:number;
  heightMm:number;
  orientation:PublishPageOrientation;
  marginsMm:PublishInsetsMm;
  bleedMm:number;
  slugMm:number;
  columns:number;
  columnGutterMm:number;
  baselineGridMm:number;
  documentGridMm:number;
  safeAreaMm:number;
}

export interface PublishGuide {
  id:string;
  axis:'x'|'y';
  positionMm:number;
  locked:boolean;
  color:string;
}

export interface PublishMasterPage {
  id:string;
  name:string;
  parentMasterId?:string;
  headerText:string;
  footerText:string;
  showPageNumbers:boolean;
  frameIds:string[];
}

export interface PublishPage {
  id:string;
  name:string;
  geometry:PublishPageGeometry;
  rotationDeg:0|90|180|270;
  masterPageId?:string;
  masterOverrides:Record<string, boolean>;
  frameIds:string[];
  guides:PublishGuide[];
}

export interface PublishSection {
  id:string;
  name:string;
  startPageId:string;
  startNumber:number;
  prefix:string;
  numberFormat:PublishPageNumberFormat;
  includePrefix:boolean;
}

export interface PublishSmartGuideSettings {
  enabled:boolean;
  snapToGuides:boolean;
  snapToGrid:boolean;
  snapToFrames:boolean;
  toleranceMm:number;
}

export interface PublishTextFrameOptions {
  threadId?:string;
  nextFrameId?:string;
  previousFrameId?:string;
  overset:boolean;
  autoSize:PublishAutoSizeMode;
  insetsMm:PublishInsetsMm;
  columns:number;
  columnGutterMm:number;
  verticalJustification:PublishVerticalJustification;
  alignToBaselineGrid:boolean;
  textWrap:{mode:PublishTextWrapMode; offsetMm:number; contourThreshold:number};
}

export interface PublishResponsiveRule {
  id:string;
  name:string;
  enabled:boolean;
  minPageWidthMm?:number;
  maxPageWidthMm?:number;
  scaleMode:'none'|'proportional'|'fit-width'|'fit-height';
  anchorX:'left'|'center'|'right'|'stretch';
  anchorY:'top'|'center'|'bottom'|'stretch';
}

export interface PublishAnchor {
  kind:'page'|'frame'|'inline';
  targetFrameId?:string;
  offsetMm:PublishPointMm;
}

export interface PublishObjectConstraint {
  id:string;
  kind:'min-width'|'max-width'|'min-height'|'max-height'|'keep-inside-page'|'align-left'|'align-right'|'align-top'|'align-bottom';
  value?:number;
}

export interface PublishOpenTypeFeatures {
  ligatures:boolean;
  discretionaryLigatures:boolean;
  smallCaps:boolean;
  oldStyleFigures:boolean;
  tabularFigures:boolean;
  fractions:boolean;
  ordinals:boolean;
  stylisticSet?:number;
  variableAxes?:Record<string, number>;
}

export interface PublishKeepOptions {
  keepWithNext:number;
  keepLinesTogether:boolean;
  keepFirstLines:number;
  keepLastLines:number;
  widowLines:number;
  orphanLines:number;
}

export interface PublishTypography {
  fontFamily:string;
  fontSizePt:number;
  language:string;
  leadingPt:number;
  tracking:number;
  kerning:'metrics'|'optical'|'none';
  baselineShiftPt:number;
  horizontalScalePercent:number;
  verticalScalePercent:number;
  composer:'single-line'|'paragraph';
  hyphenation:boolean;
  justification:{minWord:number; desiredWord:number; maxWord:number; minLetter:number; desiredLetter:number; maxLetter:number};
  opticalMarginAlignment:boolean;
  keep:PublishKeepOptions;
  openType:PublishOpenTypeFeatures;
}

export interface PublishStyle {
  id:string;
  name:string;
  kind:PublishStyleKind;
  parentStyleId?:string;
  properties:Record<string,string|number|boolean>;
}

export interface PublishDeclarativeStyleRule {
  id:string;
  name:string;
  pattern:{kind:'literal'|'word'|'prefix'|'suffix'|'digits'|'email'|'url'; value?:string; caseSensitive?:boolean};
  characterStyleId:string;
}

export interface PublishNestedStyleRule {
  id:string;
  characterStyleId:string;
  through:'words'|'sentences'|'characters';
  count:number;
}

export interface PublishParagraphDecoration {
  ruleAbove?:{enabled:boolean; widthPt:number; color:string; offsetPt:number};
  ruleBelow?:{enabled:boolean; widthPt:number; color:string; offsetPt:number};
  dropCap?:{lines:number; characters:number};
}

export interface PublishFootnote { id:string; marker:string; text:string; frameId:string; storyOffset:number; }
export interface PublishEndnote { id:string; marker:string; text:string; frameId:string; storyOffset:number; }

export interface PublishFrame {
  id:string;
  pageIndex:number; // compatibility index; canonical ownership is page.frameIds
  pageId:string;
  type:PublishFrameType;
  name:string;
  xMm:number;
  yMm:number;
  widthMm:number;
  heightMm:number;
  rotationDeg:number;
  content:string;
  fontSizePt?:number;
  fontFamily?:string;
  lineHeight?:number;
  fillColor?:string;
  strokeColor?:string;
  strokeWidthPt?:number;
  columns?:number;
  opacity?:number;
  locked:boolean;
  hidden:boolean;
  text?:PublishTextFrameOptions;
  typography?:PublishTypography;
  paragraphStyleId?:string;
  characterStyleId?:string;
  objectStyleId?:string;
  nestedStyles?:PublishNestedStyleRule[];
  declarativeStyleRules?:PublishDeclarativeStyleRule[];
  decoration?:PublishParagraphDecoration;
  footnotes?:PublishFootnote[];
  endnotes?:PublishEndnote[];
  spanColumns?:number;
  splitColumns?:number;
  anchor?:PublishAnchor;
  constraints?:PublishObjectConstraint[];
  responsiveRules?:PublishResponsiveRule[];
  assetId?:string;
  fitMode?:PublishFitMode;
  focalPoint?:PublishPointMm;
  clippingPath?:PublishPointMm[];
  maskAssetId?:string;
  blendMode?:PublishBlendMode;
  effects?:{shadow?:{xMm:number;yMm:number;blurMm:number;opacity:number;color:string}; featherMm?:number};
  altText?:string;
  semanticRole?:'H1'|'H2'|'H3'|'P'|'Figure'|'Table'|'Artifact'|'Form'|'Link';
  workspaceReferenceId?:string;
  tableId?:string;
  chartReferenceId?:string;
  barcodeId?:string;
}

export interface PublishAsset {
  id:string;
  name:string;
  kind:PublishAssetKind;
  mimeType:string;
  byteLength:number;
  sha256:string;
  storage:'vault'|'embedded'|'local-link'|'remote-capability';
  canonicalUri:string;
  status:PublishLinkStatus;
  modifiedAt:number;
  expectedModifiedAt?:number;
  widthPx?:number;
  heightPx?:number;
  dpi?:number;
  colorSpace?:PublishColorSpace;
  profileId?:string;
  embeddedBytesBase64?:string;
  licenseAllowsPackaging:boolean;
}

export interface PublishBrandKit {
  id:string;
  name:string;
  version:number;
  swatchIds:string[];
  logoAssetIds:string[];
  styleIds:string[];
  templateIds:string[];
}

export interface PublishSwatch {
  id:string;
  name:string;
  space:PublishColorSpace;
  components:number[];
  tintPercent:number;
  spotName?:string;
  gradientStops?:Array<{offset:number; swatchId:string; tintPercent:number}>;
  mixedInkComponents?:Array<{swatchId:string; percent:number}>;
}

export interface PublishIccProfile {
  id:string;
  name:string;
  colorSpace:'RGB'|'CMYK'|'Gray'|'Lab';
  source:'builtin'|'vault';
  sha256:string;
  maxTicPercent:number;
}

export interface PublishPreflightProfile {
  id:string;
  name:string;
  minImageDpi:number;
  requireBleedMm:number;
  requireEmbeddedFonts:boolean;
  allowedColorSpaces:PublishColorSpace[];
  maxTicPercent:number;
  disallowTransparency:boolean;
  outputProfileId:string;
}

export interface PublishPreflightFinding {
  id:string;
  severity:'error'|'warning'|'info';
  category:'Bleed'|'Resolution'|'Color'|'Overflow'|'Font'|'Link'|'Transparency'|'Output'|'Accessibility';
  message:string;
  pageId?:string;
  pageIndex?:number;
  frameId?:string;
  assetId?:string;
  navigable:boolean;
}

export interface PublishBookEntry {
  id:string;
  documentId:string;
  canonicalUri:string;
  order:number;
  startOnOddPage:boolean;
  synchronizeStyles:boolean;
}
export interface PublishBook { id:string; name:string; entries:PublishBookEntry[]; numberingContinuous:boolean; styleSourceDocumentId?:string; }
export interface PublishTocEntry { id:string; label:string; pageId:string; pageLabel:string; level:number; sourceFrameId:string; }
export interface PublishIndexEntry { id:string; term:string; sortKey:string; pageId:string; frameId:string; }
export interface PublishCaption { id:string; frameId:string; label:string; sequence:number; text:string; }
export interface PublishCrossReference { id:string; sourceFrameId:string; targetFrameId:string; format:'page'|'caption'|'text'|'custom'; customText?:string; }
export interface PublishVariable { id:string; name:string; value:string; kind:'document'|'running-header'|'date'|'section-marker'; }
export interface PublishComment { id:string; frameId?:string; author?:string; text:string; createdAt:number; state:PublishReviewState; }
export interface PublishLayoutSnapshot { id:string; name:string; revision:number; createdAt:number; pageFingerprints:Record<string,string>; }
export interface PublishStoryAssignment { id:string; frameId:string; spaceId:string; assigneeId?:string; status:'assigned'|'editing'|'review'|'approved'; }
export interface PublishDataMergeField { name:string; value:string|number|boolean|null; }
export interface PublishDataMergeRecord { id:string; fields:PublishDataMergeField[]; }
export interface PublishDataMergeDefinition { id:string; name:string; sourceKind:'grid'|'database'|'csv'; sourceUri:string; records:PublishDataMergeRecord[]; templateFrameIds:string[]; }

export interface PublishTableCell { id:string; row:number; column:number; rowSpan:number; colSpan:number; content:string; cellStyleId?:string; }
export interface PublishTable {
  id:string; name:string; rows:number; columns:number; headerRows:number; footerRows:number; cells:PublishTableCell[]; tableStyleId?:string;
  insetsMm:PublishInsetsMm; alternatingPattern?:{axis:'rows'|'columns'; interval:number; swatchA:string; swatchB:string};
  link?:{sourceKind:'grid'|'database'; sourceUri:string; mode:PublishLinkMode; lastSourceVersion?:number};
}
export interface PublishChartObject { id:string; sourceUri:string; mode:PublishLinkMode; chartKind:string; snapshotHash?:string; }
export interface PublishBarcodeObject { id:string; symbology:'QR'|'Code128'|'EAN13'; payload:string; payloadPreview:string; modules:number[][]; }

export interface PublishWorkspaceReference {
  id:string;
  sourceKind:PublishWorkspaceSourceKind;
  canonicalUri:string;
  sourceDocumentId:string;
  selector?:string;
  mode:PublishLinkMode;
  lastSourceVersion?:number;
  frozenSnapshot?:Record<string,unknown>;
}

export interface PublishExportPreset {
  id:string;
  name:string;
  kind:PublishExportPresetKind;
  outputProfileId?:string;
  includeBleed:boolean;
  includeMarks:boolean;
  embedFonts:boolean;
  deterministic:boolean;
  accessible:boolean;
  allowInteractiveForms:boolean;
  javascriptAllowed:false;
}

export interface PublishDocumentModel {
  schemaVersion:1;
  revision:number;
  geometry:PublishPageGeometry; // compatibility/default geometry; active pages may override it
  pagesCount:number; // normalized mirror of pages.length for legacy UI compatibility
  activePageIndex:number;
  pages:PublishPage[];
  facingPages:boolean;
  startOnRight:boolean;
  masterPages:PublishMasterPage[];
  sections:PublishSection[];
  frames:PublishFrame[];
  selectedFrameId:string|null;
  smartGuides:PublishSmartGuideSettings;
  cmykSimulated:boolean;
  overprintPreview:boolean;
  showGuides:boolean;
  showBleed:boolean;
  showDocumentGrid:boolean;
  styles:PublishStyle[];
  assets:PublishAsset[];
  brandKits:PublishBrandKit[];
  swatches:PublishSwatch[];
  iccProfiles:PublishIccProfile[];
  preflightProfiles:PublishPreflightProfile[];
  books:PublishBook[];
  toc:PublishTocEntry[];
  indexEntries:PublishIndexEntry[];
  captions:PublishCaption[];
  crossReferences:PublishCrossReference[];
  variables:PublishVariable[];
  comments:PublishComment[];
  layoutSnapshots:PublishLayoutSnapshot[];
  storyAssignments:PublishStoryAssignment[];
  dataMerges:PublishDataMergeDefinition[];
  tables:PublishTable[];
  charts:PublishChartObject[];
  barcodes:PublishBarcodeObject[];
  workspaceReferences:PublishWorkspaceReference[];
  exportPresets:PublishExportPreset[];
}
