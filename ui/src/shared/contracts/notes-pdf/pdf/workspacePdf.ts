// --- Astraea PDF Studio Types ---
export type PdfAnnotationType =
  | 'highlight'
  | 'comment'
  | 'strike'
  | 'underline'
  | 'text-insert'
  | 'text-replace'
  | 'ink'
  | 'shape'
  | 'text-box'
  | 'callout'
  | 'stamp'
  | 'file-attachment'
  | 'measurement';

export type PdfAnnotationReviewStatus = 'open' | 'accepted' | 'rejected' | 'completed' | 'cancelled';

export interface PdfAnnotationPoint {
  x: number;
  y: number;
  pressure?: number;
}

export interface PdfAnnotationReply {
  id: string;
  text: string;
  author: string;
  createdAt: number;
}

export interface PdfAnnotationAttachment {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  /** Present only when the attachment payload is locally available. Annotation summaries intentionally omit it. */
  dataUrl?: string;
}

export interface PdfAnnotationMeasurement {
  value: number;
  unit: 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'pt';
  scaleLabel?: string;
}

export interface PdfAnnotation {
  id: string;
  page: number;
  type: PdfAnnotationType;
  text: string;
  color: string;
  author?: string;
  createdAt?: number;
  modifiedAt?: number;
  sectionId?: string;
  status?: PdfAnnotationReviewStatus;
  targetText?: string;
  replacementText?: string;
  replies?: PdfAnnotationReply[];
  points?: PdfAnnotationPoint[];
  shapeKind?: 'rectangle' | 'ellipse' | 'line' | 'arrow';
  bounds?: { x: number; y: number; width: number; height: number };
  stampLabel?: string;
  attachment?: PdfAnnotationAttachment;
  measurement?: PdfAnnotationMeasurement;
}

export interface PdfRedaction {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reason: string;
  isApplied: boolean;
  targetKind?: 'text' | 'image' | 'rectangle';
  imageId?: string;
  targetText?: string;
  timestamp?: number;
}

export type PdfBase14Font = 'Helvetica' | 'Helvetica-Bold' | 'Times-Roman' | 'Courier';

export interface PdfTextStyle {
  /** User-requested font family. Unsupported fonts are resolved to a Base-14 fallback and reported explicitly. */
  requestedFont?: string;
  resolvedFont?: PdfBase14Font;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
}

export interface PdfSectionModel {
  id: string;
  type: 'header' | 'paragraph' | 'callout' | 'table' | 'key-value';
  content: string;
  /** Optional positioned-edit box in PDF points. Unset sections remain in document flow. */
  bounds?: PdfPageBox;
  style?: PdfTextStyle;
  zIndex?: number;
  isRedacted?: boolean;
  isMarkedForRedaction?: boolean;
  originalContent?: string;
  redactionReason?: string;
}

export interface PdfPageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageDecorations {
  headerText?: string;
  footerText?: string;
  batesLabel?: string;
  watermarkText?: string;
  backgroundColor?: string;
}

export interface PdfImageCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PdfPageImage {
  id: string;
  /** Image payloads are normalized locally to baseline JPEG before entering the structured PDF model. */
  mimeType: 'image/jpeg';
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  bounds: PdfPageBox;
  altText?: string;
  crop?: PdfImageCrop;
  rotation?: 0 | 90 | 180 | 270;
  zIndex?: number;
}

export interface PdfNormalizedJpegSource {
  name: string;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
  altText?: string;
  pageWidthPt?: number;
  pageHeightPt?: number;
}

export type PdfVectorObjectType = 'rectangle' | 'ellipse' | 'line';

export interface PdfVectorObject {
  id: string;
  type: PdfVectorObjectType;
  bounds: PdfPageBox;
  strokeColor: string;
  fillColor?: string;
  lineWidth?: number;
  zIndex?: number;
}

export interface PdfLinkObject {
  id: string;
  bounds: PdfPageBox;
  target: { kind: 'url'; url: string } | { kind: 'page'; pageNumber: number };
}


export interface PdfOcrWordModel {
  id: string;
  text: string;
  confidence: number;
  /** Bounding box in PDF page coordinates (bottom-left origin, points). */
  bounds: PdfPageBox;
  sourceImageId: string;
}

export interface PdfOcrLineModel {
  id: string;
  text: string;
  confidence: number;
  bounds: PdfPageBox;
  words: PdfOcrWordModel[];
}

export interface PdfOcrLayerModel {
  engine: 'tesseract-local';
  engineVersion: string;
  language: string;
  processedAt: number;
  meanConfidence: number;
  originalImagesPreserved: true;
  sourceImageIds: string[];
  lines: PdfOcrLineModel[];
}

export interface PdfPageModel {
  pageNumber: number;
  title: string;
  subtitle?: string;
  rotation?: 0 | 90 | 180 | 270;
  pageLabel?: string;
  mediaBox?: PdfPageBox;
  cropBox?: PdfPageBox;
  trimBox?: PdfPageBox;
  bleedBox?: PdfPageBox;
  artBox?: PdfPageBox;
  decorations?: PdfPageDecorations;
  images?: PdfPageImage[];
  vectors?: PdfVectorObject[];
  links?: PdfLinkObject[];
  /** Optional local OCR text layer. Original scan images remain canonical and untouched. */
  ocrLayer?: PdfOcrLayerModel;
  sections: PdfSectionModel[];
}


export type PdfFormFieldType = 'text' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'button' | 'signature';
export type PdfFormFieldValue = string | boolean | string[];

export interface PdfFormFieldValidation {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

export interface PdfFormFieldCalculation {
  kind: 'sum' | 'average' | 'concat';
  sourceFieldNames: string[];
  separator?: string;
}

export interface PdfFormField {
  id: string;
  name: string;
  type: PdfFormFieldType;
  page: number;
  bounds: { x: number; y: number; width: number; height: number };
  label?: string;
  tooltip?: string;
  value: PdfFormFieldValue;
  defaultValue?: PdfFormFieldValue;
  options?: string[];
  required?: boolean;
  readOnly?: boolean;
  tabOrder?: number;
  validation?: PdfFormFieldValidation;
  calculation?: PdfFormFieldCalculation;
  /** HTTPS endpoint only. Submission remains default-deny and must be routed through Workspace NetGate. */
  submitUrl?: string;
}

export interface PdfNativeInspectionSnapshot {
  parser: 'vgt-native-pdf-boundary-v1';
  version: string;
  byteLength: number;
  sha256: string;
  objectHeaders: number;
  streamMarkers: number;
  xrefMarkers: number;
  estimatedPageObjects: number;
  maxDeclaredStreamLength: number;
  eofMarkerPresent: boolean;
  encrypted: boolean;
  tagged: boolean;
  hasOutlines: boolean;
  hasPageLabels: boolean;
  hasLinksOrDestinations: boolean;
  hasEmbeddedFiles: boolean;
  hasOptionalContentGroups: boolean;
  hasAcroForm: boolean;
  hasXfa: boolean;
  hasAnnotations: boolean;
  hasJavaScriptOrActions: boolean;
  externalUrlCount: number;
  externalUrlHosts: string[];
  actionTypes: string[];
  hasSignatures: boolean;
  warnings: string[];
}

export interface PdfDocumentModel {
  numPages: number;
  pages: PdfPageModel[];
  annotations: PdfAnnotation[];
  redactions: PdfRedaction[];
  formFields?: PdfFormField[];
  rawPdfDataUrl?: string;
  rawPdfFileName?: string;
  rawPdfByteLength?: number;
  rawPdfInspection?: PdfNativeInspectionSnapshot;
  metadataSanitized?: boolean;
}
