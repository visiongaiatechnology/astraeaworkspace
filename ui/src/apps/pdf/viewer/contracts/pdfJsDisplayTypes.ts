// STATUS: DIAMANT VGT SUPREME
// Astraea PDF Studio — narrow local types for the vendored PDF.js 6.3.289 display runtime.

export interface PdfJsViewport {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  transform: number[];
  rawDims: { pageWidth: number; pageHeight: number; pageX: number; pageY: number };
}

export interface PdfJsRenderTask {
  promise: Promise<void>;
  cancel(extraDelay?: number): void;
}

export interface PdfJsDisplayPage {
  pageNumber: number;
  rotate: number;
  view: number[];
  getViewport(options: { scale: number; rotation?: number; dontFlip?: boolean }): PdfJsViewport;
  render(options: {
    canvasContext: CanvasRenderingContext2D;
    canvas?: HTMLCanvasElement;
    viewport: PdfJsViewport;
    intent?: 'display' | 'print';
    annotationMode?: number;
    transform?: number[] | null;
    optionalContentConfigPromise?: Promise<PdfJsOptionalContentConfig>;
    background?: string | null;
    pageColors?: { background: string; foreground: string } | null;
  }): PdfJsRenderTask;
  streamTextContent(options?: { includeMarkedContent?: boolean; disableNormalization?: boolean }): ReadableStream<unknown>;
  getTextContent(options?: { includeMarkedContent?: boolean; disableNormalization?: boolean }): Promise<PdfJsTextContent>;
  getAnnotations(options?: { intent?: 'display' | 'print' }): Promise<unknown[]>;
  getStructTree(): Promise<unknown | null>;
  cleanup(resetStats?: boolean): boolean;
}

export interface PdfJsTextContent {
  items: unknown[];
  styles: Record<string, unknown>;
  lang?: string | null;
}

export interface PdfJsOptionalContentGroup {
  name?: string;
  visible: boolean;
}

export interface PdfJsOptionalContentConfig {
  getOrder(): unknown[] | null;
  getGroup(id: string): PdfJsOptionalContentGroup | null;
  setVisibility(id: string, visible?: boolean, preserveRB?: boolean): void;
  setOCGState(options: { state: unknown[]; preserveRB?: boolean }): void;
  getHash(): string;
  readonly hasInitialVisibility: boolean;
}

export interface PdfJsDisplayDocument {
  numPages: number;
  fingerprints: string[];
  annotationStorage: unknown;
  getPage(pageNumber: number): Promise<PdfJsDisplayPage>;
  getDestination(id: string): Promise<unknown>;
  getPageIndex(ref: unknown): Promise<number>;
  getOptionalContentConfig(options?: { intent?: 'display' | 'print' }): Promise<PdfJsOptionalContentConfig>;
  getFieldObjects(): Promise<Record<string, unknown[]> | null>;
  getJSActions(): Promise<unknown>;
  getAttachmentContent(id: string): Promise<Uint8Array | null>;
  cleanup(keepLoadedFonts?: boolean): Promise<void>;
}

export interface PdfJsLoadingTask {
  promise: Promise<PdfJsDisplayDocument>;
  destroy(): Promise<void>;
  onPassword: ((updatePassword: (password: string) => void, reason: number) => void) | null;
}

export interface PdfJsTextLayerInstance {
  render(): Promise<void>;
  cancel(): void;
  readonly textDivs: HTMLElement[];
  readonly textContentItemsStr: string[];
}

export interface PdfJsAnnotationLayerInstance {
  render(options: {
    annotations: unknown[];
    optionalContentConfig: PdfJsOptionalContentConfig;
    renderForms?: boolean;
    downloadManager?: unknown;
    imageResourcesPath?: string;
    enableScripting?: boolean;
    hasJSActions?: boolean;
    fieldObjects?: Record<string, unknown[]> | null;
  }): Promise<void>;
}

export interface PdfJsDisplayModule {
  version: string;
  build: string;
  AnnotationMode: { DISABLE: number; ENABLE: number; ENABLE_FORMS: number; ENABLE_STORAGE: number };
  GlobalWorkerOptions: { workerSrc: string; workerPort?: Worker | null };
  getDocument(options: Record<string, unknown>): PdfJsLoadingTask;
  TextLayer: new (options: {
    textContentSource: ReadableStream<unknown> | object;
    container: HTMLElement;
    viewport: PdfJsViewport;
    images?: unknown;
  }) => PdfJsTextLayerInstance;
  AnnotationLayer: new (options: {
    div: HTMLElement;
    page: PdfJsDisplayPage;
    viewport: PdfJsViewport;
    linkService: unknown;
    annotationStorage?: unknown;
    annotationCanvasMap?: Map<string, HTMLCanvasElement>;
    accessibilityManager?: unknown;
    annotationEditorUIManager?: unknown;
    structTreeLayer?: unknown;
    commentManager?: unknown;
  }) => PdfJsAnnotationLayerInstance;
}

export interface PdfJsOpenedDisplayDocument {
  module: PdfJsDisplayModule;
  loadingTask: PdfJsLoadingTask;
  document: PdfJsDisplayDocument;
}
