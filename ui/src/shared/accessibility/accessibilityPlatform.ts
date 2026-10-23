// STATUS: DIAMANT VGT SUPREME — shared Workspace accessibility policy and document audit core.
import type { WorkspaceDocument } from '../contracts/workspace';

export type AccessibilityDirection = 'auto' | 'ltr' | 'rtl';
export type AccessibilityIssueSeverity = 'error' | 'warning' | 'info';

export interface AccessibilityIssue {
  code: string;
  severity: AccessibilityIssueSeverity;
  message: string;
  documentId: string;
  objectId?: string;
  pageOrSlide?: number;
}

export interface AccessibilityReport {
  documentId: string;
  kind: WorkspaceDocument['kind'];
  checkedAt: number;
  errors: number;
  warnings: number;
  issues: AccessibilityIssue[];
  passed: boolean;
}

export interface ShortcutCompositionState {
  isComposing?: boolean;
  keyCode?: number;
  key?: string;
}

const MAX_A11Y_ISSUES = 500;
const MAX_TEXT_LENGTH = 50_000;
const RTL_LOCALE_PREFIXES = new Set(['ar', 'arc', 'dv', 'fa', 'ha', 'he', 'khw', 'ks', 'ku', 'ps', 'sd', 'ur', 'yi']);
const RTL_STRONG = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/u;
const LTR_STRONG = /[A-Za-z\u00c0-\u02af\u0370-\u058f]/u;

function boundedText(value: unknown, max = 2_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function addIssue(issues: AccessibilityIssue[], issue: AccessibilityIssue): void {
  if (issues.length < MAX_A11Y_ISSUES) issues.push(issue);
}

export function normalizeAccessibilityDirection(value: unknown): AccessibilityDirection {
  return value === 'rtl' || value === 'ltr' ? value : 'auto';
}

export function directionForLocale(locale: string | undefined): 'ltr' | 'rtl' {
  const primary = boundedText(locale, 64).toLocaleLowerCase('en-US').split(/[-_]/u)[0];
  return RTL_LOCALE_PREFIXES.has(primary) ? 'rtl' : 'ltr';
}

export function inferTextDirection(value: string): 'ltr' | 'rtl' | 'auto' {
  const sample = value.slice(0, MAX_TEXT_LENGTH);
  const rtl = sample.search(RTL_STRONG);
  const ltr = sample.search(LTR_STRONG);
  if (rtl < 0 && ltr < 0) return 'auto';
  if (rtl < 0) return 'ltr';
  if (ltr < 0) return 'rtl';
  return rtl < ltr ? 'rtl' : 'ltr';
}

export function resolveAccessibilityDirection(
  preference: AccessibilityDirection,
  locale?: string,
): 'ltr' | 'rtl' {
  const normalized = normalizeAccessibilityDirection(preference);
  return normalized === 'auto' ? directionForLocale(locale) : normalized;
}

/**
 * Whether a key event belongs to an **input method editor** rather than to the document.
 *
 * During a composition the browser fires keydown for keys the IME owns: `Enter` commits the candidate,
 * `Escape` cancels it, arrows move through the candidate list, and every character key carries
 * `isComposing` with the legacy `keyCode 229`. A handler that acts on those keys fights the IME.
 *
 * The rule already existed here for workspace shortcuts and, in three other shapes, elsewhere in the
 * codebase (W-279). It has one definition now; the remaining copies are recorded for the findings pass.
 */
export function isImeCompositionEvent(event: ShortcutCompositionState): boolean {
  if (event.isComposing) return true;
  if (event.keyCode === 229) return true;
  return event.key === 'Process' || event.key === 'Dead';
}

export function shouldProcessWorkspaceShortcut(event: ShortcutCompositionState): boolean {
  return !isImeCompositionEvent(event);
}

export function normalizeUiScalePercent(value: unknown): number {
  const numeric = Number(value);
  return Math.max(100, Math.min(300, Math.round(Number.isFinite(numeric) ? numeric : 100)));
}

export interface AccessibleStatusPresentation {
  text: string;
  symbol: string;
  ariaLabel: string;
}

export function accessibleStatusPresentation(status: 'ok' | 'warning' | 'error' | 'info', text: string): AccessibleStatusPresentation {
  const normalized = boundedText(text, 240) || 'Status';
  const symbol = status === 'ok' ? '✓' : status === 'warning' ? '!' : status === 'error' ? '×' : 'i';
  const prefix = status === 'ok' ? 'Success' : status === 'warning' ? 'Warning' : status === 'error' ? 'Error' : 'Information';
  return { text: normalized, symbol, ariaLabel: `${prefix}: ${normalized}` };
}

function writerAccessibilityIssues(document: WorkspaceDocument, issues: AccessibilityIssue[]): void {
  const data = document.writerData;
  if (!data) {
    addIssue(issues, { code: 'writer.model.missing', severity: 'error', message: 'Writer accessibility model is unavailable.', documentId: document.id });
    return;
  }
  for (const image of data.images ?? []) {
    if (!boundedText(image.altText)) addIssue(issues, { code: 'writer.image.alt', severity: 'error', message: `Image “${boundedText(image.name, 120) || image.id}” needs alternative text.`, documentId: document.id, objectId: image.id });
  }
  for (const media of data.mediaObjects ?? []) {
    const transcript = boundedText(media.transcript, MAX_TEXT_LENGTH);
    const caption = boundedText(media.caption, 4_000);
    if (!transcript) addIssue(issues, { code: 'writer.media.transcript', severity: 'warning', message: `${media.kind === 'video' ? 'Video' : 'Audio'} “${boundedText(media.name, 120) || media.id}” needs a transcript.`, documentId: document.id, objectId: media.id });
    if (media.kind === 'video' && !caption && !transcript) addIssue(issues, { code: 'writer.video.caption', severity: 'warning', message: `Video “${boundedText(media.name, 120) || media.id}” needs captions or an equivalent text alternative.`, documentId: document.id, objectId: media.id });
  }
  const textBlocks = Object.values(document.objects).filter((object) => object.type === 'TextBlock');
  let previousHeading = 0;
  for (const object of textBlocks) {
    for (const paragraph of object.data.paragraphs) {
      const level = paragraph.style.heading_level;
      if (!level) continue;
      if (previousHeading > 0 && level > previousHeading + 1) addIssue(issues, { code: 'writer.heading.jump', severity: 'warning', message: `Heading level jumps from H${previousHeading} to H${level}.`, documentId: document.id, objectId: paragraph.id });
      previousHeading = level;
    }
  }
}

function presentAccessibilityIssues(document: WorkspaceDocument, issues: AccessibilityIssue[]): void {
  const data = document.presentData;
  if (!data) {
    addIssue(issues, { code: 'present.model.missing', severity: 'error', message: 'Present accessibility model is unavailable.', documentId: document.id });
    return;
  }
  data.slides.forEach((slide, index) => {
    if (!boundedText(slide.title)) addIssue(issues, { code: 'present.slide.title', severity: 'error', message: `Slide ${index + 1} needs a meaningful title.`, documentId: document.id, objectId: slide.id, pageOrSlide: index + 1 });
    for (const image of slide.images ?? []) {
      if (!boundedText(image.altText)) addIssue(issues, { code: 'present.image.alt', severity: 'error', message: `Image “${boundedText(image.name, 120) || image.id}” on slide ${index + 1} needs alternative text.`, documentId: document.id, objectId: image.id, pageOrSlide: index + 1 });
    }
    const hasMedia = Boolean(slide.audioMedia || slide.videoMedia || slide.audioUrl || slide.videoUrl);
    if (hasMedia) {
      const activeTake = slide.recording?.takes.find((take) => take.id === slide.recording?.activeTakeId) ?? slide.recording?.takes[0];
      const transcript = boundedText(activeTake?.transcript, MAX_TEXT_LENGTH);
      const captions = activeTake?.captions ?? [];
      if (!transcript && captions.length === 0 && !boundedText(slide.speakerNotes, MAX_TEXT_LENGTH)) {
        addIssue(issues, { code: 'present.media.alternative', severity: 'warning', message: `Media on slide ${index + 1} needs captions, transcript, or an equivalent text description.`, documentId: document.id, objectId: slide.id, pageOrSlide: index + 1 });
      }
    }
  });
}

function pdfAccessibilityIssues(document: WorkspaceDocument, issues: AccessibilityIssue[]): void {
  const data = document.pdfData;
  if (!data) {
    addIssue(issues, { code: 'pdf.model.missing', severity: 'error', message: 'PDF accessibility model is unavailable.', documentId: document.id });
    return;
  }
  for (const page of data.pages) {
    for (const image of page.images ?? []) {
      if (!boundedText(image.altText)) addIssue(issues, { code: 'pdf.image.alt', severity: 'error', message: `Image ${image.id} on page ${page.pageNumber} needs alternative text.`, documentId: document.id, objectId: image.id, pageOrSlide: page.pageNumber });
    }
  }
  for (const field of data.formFields ?? []) {
    if (!boundedText(field.label) && !boundedText(field.tooltip) && !boundedText(field.name)) addIssue(issues, { code: 'pdf.form.name', severity: 'error', message: `Form field ${field.id} on page ${field.page} has no accessible name.`, documentId: document.id, objectId: field.id, pageOrSlide: field.page });
  }
  if (data.rawPdfInspection && !data.rawPdfInspection.tagged) addIssue(issues, { code: 'pdf.tags.missing', severity: 'warning', message: 'Imported PDF is not tagged; semantic reading order cannot be assumed.', documentId: document.id });
}

export function checkDocumentAccessibility(document: WorkspaceDocument, now = Date.now()): AccessibilityReport {
  const issues: AccessibilityIssue[] = [];
  if (!boundedText(document.title)) addIssue(issues, { code: 'document.title', severity: 'error', message: 'Document needs a meaningful title.', documentId: document.id });
  if (document.kind === 'Writer') writerAccessibilityIssues(document, issues);
  if (document.kind === 'Present') presentAccessibilityIssues(document, issues);
  if (document.kind === 'PdfStudio') pdfAccessibilityIssues(document, issues);
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.filter((issue) => issue.severity === 'warning').length;
  return { documentId: document.id, kind: document.kind, checkedAt: now, errors, warnings, issues, passed: errors === 0 };
}

export function checkWorkspaceAccessibility(documents: Readonly<Record<string, WorkspaceDocument>>, now = Date.now()): AccessibilityReport[] {
  return Object.values(documents)
    .filter((document) => document.kind === 'Writer' || document.kind === 'Present' || document.kind === 'PdfStudio')
    .slice(0, 1_000)
    .map((document) => checkDocumentAccessibility(document, now));
}

const FOCUSABLE_SELECTOR = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])', 'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]', '[role="button"][tabindex]', '[role="link"][tabindex]',
].join(',');

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false;
    const style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });
}

export function installLogicalDialogFocusManager(root: HTMLElement): () => void {
  let activeDialog: HTMLElement | null = null;
  let returnFocus: HTMLElement | null = null;
  const hiddenSiblings = new Map<HTMLElement, { inert: boolean; ariaHidden: string | null }>();

  const restoreSiblings = () => {
    for (const [element, previous] of hiddenSiblings) {
      element.inert = previous.inert;
      if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', previous.ariaHidden);
    }
    hiddenSiblings.clear();
  };

  const isolateDialog = (dialog: HTMLElement) => {
    restoreSiblings();
    const branch = Array.from(root.children).find((child) => child === dialog || child.contains(dialog));
    for (const child of Array.from(root.children)) {
      if (!(child instanceof HTMLElement) || child === branch) continue;
      hiddenSiblings.set(child, { inert: child.inert, ariaHidden: child.getAttribute('aria-hidden') });
      child.inert = true;
      child.setAttribute('aria-hidden', 'true');
    }
  };

  const sync = () => {
    const dialogs = Array.from(root.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
      .filter((dialog) => dialog.getAttribute('aria-hidden') !== 'true' && !dialog.closest('[inert]'));
    const next = dialogs.at(-1) ?? null;
    if (next === activeDialog) return;
    if (!next) {
      restoreSiblings();
      const target = returnFocus;
      activeDialog = null;
      returnFocus = null;
      if (target?.isConnected) queueMicrotask(() => target.focus({ preventScroll: true }));
      return;
    }
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!activeDialog && focused && root.contains(focused)) returnFocus = focused;
    activeDialog = next;
    isolateDialog(next);
    queueMicrotask(() => {
      if (activeDialog !== next) return;
      const target = next.querySelector<HTMLElement>('[autofocus], [data-vgt-initial-focus="true"]') ?? focusableElements(next)[0] ?? next;
      if (!target.hasAttribute('tabindex') && target === next) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    });
  };

  const handleFocusIn = (event: FocusEvent) => {
    if (!activeDialog) return;
    const target = event.target instanceof Node ? event.target : null;
    if (target && activeDialog.contains(target)) return;
    const first = focusableElements(activeDialog)[0] ?? activeDialog;
    if (!first.hasAttribute('tabindex') && first === activeDialog) first.tabIndex = -1;
    first.focus({ preventScroll: true });
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!activeDialog || event.key !== 'Tab' || event.isComposing) return;
    const focusable = focusableElements(activeDialog);
    if (focusable.length === 0) { event.preventDefault(); activeDialog.focus({ preventScroll: true }); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !activeDialog.contains(current))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (current === last || !activeDialog.contains(current))) { event.preventDefault(); first.focus(); }
  };

  const observer = new MutationObserver(sync);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'aria-modal', 'role', 'hidden'] });
  root.addEventListener('keydown', handleKeyDown);
  root.addEventListener('focusin', handleFocusIn);
  sync();
  return () => {
    observer.disconnect();
    root.removeEventListener('keydown', handleKeyDown);
    root.removeEventListener('focusin', handleFocusIn);
    restoreSiblings();
  };
}
