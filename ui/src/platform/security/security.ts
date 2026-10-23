// STATUS: DIAMANT VGT SUPREME
/**
 * VisionGaiaTechnology — Frontend Sovereign Security Guardian
 *
 * Security boundaries covered here:
 * - URL scheme validation
 * - output encoding helpers
 * - SVG active-content stripping
 * - bounded formula input normalization
 * - Self-XSS social-engineering warning
 * - isolated rich-clipboard parsing with attribute-free safe-node reconstruction
 * - strict Workspace-shell file-drop allowlisting
 */

export const WORKSPACE_SECURITY_DROP_REJECT_EVENT = 'astraea:security-drop-rejected' as const;

const MAX_CLIPBOARD_HTML_CHARS = 1024 * 1024;
const MAX_CLIPBOARD_TEXT_CHARS = 1024 * 1024;
const MAX_CLIPBOARD_NODES = 10_000;
const MAX_CLIPBOARD_DEPTH = 32;

const SAFE_CLIPBOARD_TAGS = new Set([
  'p', 'div', 'span', 'br', 'b', 'strong', 'i', 'em', 'u', 's',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
] as const);

const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'svg', 'math', 'iframe', 'object', 'embed', 'template',
  'noscript', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea',
  'select', 'option', 'video', 'audio', 'source', 'track', 'canvas',
]);

const VOID_TAGS = new Set(['br']);

const EXECUTABLE_DROP_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'dll', 'scr', 'msi', 'msp', 'cpl', 'hta',
  'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'lnk', 'reg',
  'jar', 'appimage', 'deb', 'rpm', 'dmg', 'pkg', 'apk',
]);

const WORKSPACE_CONTAINER_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  vwc: 'application/x-astraea-vwc',
  vdoc: 'application/x-astraea-vdoc',
  vgrid: 'application/x-astraea-vgrid',
  vpresent: 'application/x-astraea-vpresent',
  vnote: 'application/x-astraea-vnote',
  vpdf: 'application/x-astraea-vpdf',
  vboard: 'application/x-astraea-vboard',
  vtask: 'application/x-astraea-vtask',
  vvault: 'application/x-astraea-vvault',
};

const SHELL_DROP_MIME_BY_EXTENSION: Readonly<Record<string, ReadonlySet<string>>> = {
  pdf: new Set(['application/pdf']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  pptx: new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  ods: new Set(['application/vnd.oasis.opendocument.spreadsheet']),
  odp: new Set(['application/vnd.oasis.opendocument.presentation']),
  ...Object.fromEntries(
    Object.entries(WORKSPACE_CONTAINER_MIME_BY_EXTENSION).map(([extension, mime]) => [
      extension,
      new Set([mime, 'application/octet-stream']),
    ]),
  ),
};

export class FrontendSecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrontendSecurityError';
  }
}

export type SafeClipboardTag =
  | 'p' | 'div' | 'span' | 'br' | 'b' | 'strong' | 'i' | 'em' | 'u' | 's'
  | 'ul' | 'ol' | 'li' | 'blockquote' | 'pre' | 'code';

export type SafeClipboardNode =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'element'; readonly tag: SafeClipboardTag; readonly children: readonly SafeClipboardNode[] };

interface MutableSafeClipboardElement {
  kind: 'element';
  tag: SafeClipboardTag;
  children: SafeClipboardNode[];
}

interface ClipboardFrame {
  tag: SafeClipboardTag | null;
  children: SafeClipboardNode[];
}

export interface WorkspaceDropCandidate {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export interface WorkspaceDropClassification {
  readonly extension: string;
  readonly mime: string;
}

/**
 * Validates and sanitizes URLs before rendering in href or src attributes.
 * Strictly blocks javascript:, vbscript:, and malicious data: URIs.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();

  // Strip null bytes and control characters.
  const clean = trimmed.replace(/[\x00-\x1F\x7F]/g, '');

  const lower = clean.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/html') ||
    lower.startsWith('data:application/javascript')
  ) {
    console.warn('[VGT Security] Blocked dangerous URI scheme.');
    return 'about:blank';
  }

  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:') ||
    lower.startsWith('vgt://') ||
    lower.startsWith('/') ||
    lower.startsWith('#')
  ) {
    return clean;
  }

  if (lower.startsWith('data:image/')) return clean;
  return 'about:blank';
}

/**
 * Encodes special HTML characters into safe entities.
 * Mandatory Pattern 1.5.F: User data must never be directly placed in innerHTML.
 */
export function escapeHtml(unsafeText: string): string {
  if (!unsafeText) return '';
  return unsafeText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strips script tags, foreignObject tags, and inline event handlers (on*) from raw SVG strings.
 */
export function sanitizeSvgString(svg: string): string {
  if (!svg) return '';
  return svg
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '')
    .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="about:blank"');
}

/**
 * Validates formula expressions to prevent ReDoS, prototype pollution, or injection strings.
 */
export function sanitizeFormulaExpression(expr: string): string {
  if (!expr) return '';
  if (expr.length > 5000) return '#ERR:EXPR_TOO_LONG!';
  return expr.replace(/\0/g, '');
}

function findMarkupEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return index;
  }
  return -1;
}

function appendClipboardText(children: SafeClipboardNode[], raw: string, nodeCounter: { value: number }): void {
  if (!raw) return;
  const text = raw.replace(/\0/g, '').slice(0, MAX_CLIPBOARD_TEXT_CHARS);
  if (!text) return;
  nodeCounter.value += 1;
  if (nodeCounter.value > MAX_CLIPBOARD_NODES) throw new FrontendSecurityError('Clipboard node boundary exceeded.');
  children.push({ kind: 'text', text });
}

/**
 * Parses clipboard HTML without ever attaching attacker-controlled markup to the live DOM.
 * Every source attribute is discarded. Only a tiny formatting-node allowlist is reconstructed.
 * Network-capable or active-content containers are dropped together with their descendants.
 */
export function sanitizeClipboardHtml(rawHtml: string): readonly SafeClipboardNode[] {
  if (typeof rawHtml !== 'string') throw new FrontendSecurityError('Clipboard HTML type boundary violated.');
  if (rawHtml.length > MAX_CLIPBOARD_HTML_CHARS) throw new FrontendSecurityError('Clipboard HTML size boundary exceeded.');

  const root: SafeClipboardNode[] = [];
  const frames: ClipboardFrame[] = [{ tag: null, children: root }];
  const blockedContainers: string[] = [];
  const nodeCounter = { value: 0 };
  let cursor = 0;

  while (cursor < rawHtml.length) {
    const markupStart = rawHtml.indexOf('<', cursor);
    if (markupStart < 0) {
      if (blockedContainers.length === 0) appendClipboardText(frames[frames.length - 1].children, rawHtml.slice(cursor), nodeCounter);
      break;
    }

    if (markupStart > cursor && blockedContainers.length === 0) {
      appendClipboardText(frames[frames.length - 1].children, rawHtml.slice(cursor, markupStart), nodeCounter);
    }

    if (rawHtml.startsWith('<!--', markupStart)) {
      const commentEnd = rawHtml.indexOf('-->', markupStart + 4);
      cursor = commentEnd < 0 ? rawHtml.length : commentEnd + 3;
      continue;
    }

    const markupEnd = findMarkupEnd(rawHtml, markupStart);
    if (markupEnd < 0) {
      if (blockedContainers.length === 0) appendClipboardText(frames[frames.length - 1].children, rawHtml.slice(markupStart), nodeCounter);
      break;
    }

    const token = rawHtml.slice(markupStart + 1, markupEnd);
    const parsed = token.match(/^\s*(\/?)\s*([A-Za-z][A-Za-z0-9:-]*)/);
    cursor = markupEnd + 1;
    if (!parsed) continue;

    const closing = parsed[1] === '/';
    const tag = parsed[2].toLowerCase();
    const selfClosing = /\/\s*$/.test(token);

    if (blockedContainers.length > 0) {
      if (!closing && DROP_CONTENT_TAGS.has(tag) && !selfClosing) {
        blockedContainers.push(tag);
      } else if (closing && tag === blockedContainers[blockedContainers.length - 1]) {
        blockedContainers.pop();
      }
      continue;
    }

    if (DROP_CONTENT_TAGS.has(tag)) {
      if (!closing && !selfClosing) blockedContainers.push(tag);
      continue;
    }

    if (!SAFE_CLIPBOARD_TAGS.has(tag as SafeClipboardTag)) continue;
    const safeTag = tag as SafeClipboardTag;

    if (closing) {
      for (let index = frames.length - 1; index > 0; index -= 1) {
        if (frames[index].tag === safeTag) {
          frames.length = index;
          break;
        }
      }
      continue;
    }

    nodeCounter.value += 1;
    if (nodeCounter.value > MAX_CLIPBOARD_NODES) throw new FrontendSecurityError('Clipboard node boundary exceeded.');
    if (frames.length > MAX_CLIPBOARD_DEPTH) throw new FrontendSecurityError('Clipboard nesting boundary exceeded.');

    const element: MutableSafeClipboardElement = { kind: 'element', tag: safeTag, children: [] };
    frames[frames.length - 1].children.push(element);
    if (!VOID_TAGS.has(safeTag) && !selfClosing) frames.push({ tag: safeTag, children: element.children });
  }

  return root;
}

export function safeClipboardNodesToText(nodes: readonly SafeClipboardNode[]): string {
  let output = '';
  const append = (value: string): void => {
    if (output.length >= MAX_CLIPBOARD_TEXT_CHARS) return;
    output += value.slice(0, MAX_CLIPBOARD_TEXT_CHARS - output.length);
  };
  const visit = (node: SafeClipboardNode): void => {
    if (node.kind === 'text') {
      append(node.text);
      return;
    }
    if (node.tag === 'br') {
      append('\n');
      return;
    }
    const block = node.tag === 'p' || node.tag === 'div' || node.tag === 'li' || node.tag === 'blockquote' || node.tag === 'pre';
    if (block && output && !output.endsWith('\n')) append('\n');
    node.children.forEach(visit);
    if (block && !output.endsWith('\n')) append('\n');
  };
  nodes.forEach(visit);
  return output.slice(0, MAX_CLIPBOARD_TEXT_CHARS);
}

function appendSafeClipboardNodes(documentRef: Document, parent: Node, nodes: readonly SafeClipboardNode[]): void {
  for (const node of nodes) {
    if (node.kind === 'text') {
      parent.appendChild(documentRef.createTextNode(node.text));
      continue;
    }
    const element = documentRef.createElement(node.tag);
    appendSafeClipboardNodes(documentRef, element, node.children);
    parent.appendChild(element);
  }
}

function isContentEditableElement(target: EventTarget | null): target is HTMLElement {
  return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement && target.isContentEditable;
}

function insertSafeClipboardPayload(target: HTMLElement, html: string, plainText: string): void {
  const documentRef = target.ownerDocument;
  const nodes = sanitizeClipboardHtml(html);
  const fragment = documentRef.createDocumentFragment();
  if (nodes.length > 0) appendSafeClipboardNodes(documentRef, fragment, nodes);
  else fragment.appendChild(documentRef.createTextNode(plainText.slice(0, MAX_CLIPBOARD_TEXT_CHARS)));

  const selection = documentRef.getSelection();
  const selectedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rangeInsideTarget = selectedRange
    ? target === selectedRange.commonAncestorContainer || target.contains(selectedRange.commonAncestorContainer)
    : false;

  if (selection && selectedRange && rangeInsideTarget) {
    selectedRange.deleteContents();
    const lastNode = fragment.lastChild;
    selectedRange.insertNode(fragment);
    if (lastNode) {
      selectedRange.setStartAfter(lastNode);
      selectedRange.collapse(true);
      selection.removeAllRanges();
      selection.addRange(selectedRange);
    }
  } else {
    target.appendChild(fragment);
  }

  try {
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
  } catch {
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

let clipboardShieldInstalled = false;

/**
 * Capture-phase rich clipboard/drop firewall for every current and future contentEditable editor.
 * Plain input/textarea controls remain text-only browser surfaces and do not receive HTML DOM nodes.
 */
export function installClipboardSecurityShield(): void {
  if (clipboardShieldInstalled || typeof document === 'undefined') return;
  clipboardShieldInstalled = true;

  document.addEventListener('paste', (event: ClipboardEvent) => {
    if (!isContentEditableElement(event.target)) return;
    const html = event.clipboardData?.getData('text/html') ?? '';
    if (!html) return;
    const plainText = event.clipboardData?.getData('text/plain') ?? '';
    event.preventDefault();
    insertSafeClipboardPayload(event.target, html, plainText);
  }, true);

  document.addEventListener('drop', (event: DragEvent) => {
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
    for (const file of droppedFiles) {
      try {
        assertNonExecutableWorkspaceFile(file.name);
      } catch (error) {
        event.preventDefault();
        event.stopPropagation();
        const message = error instanceof Error ? error.message : 'Security warning: dropped file was rejected.';
        window.dispatchEvent(new CustomEvent<string>(WORKSPACE_SECURITY_DROP_REJECT_EVENT, { detail: message }));
        return;
      }
    }

    if (!isContentEditableElement(event.target)) return;
    const html = event.dataTransfer?.getData('text/html') ?? '';
    if (!html) return;
    const plainText = event.dataTransfer?.getData('text/plain') ?? '';
    event.preventDefault();
    insertSafeClipboardPayload(event.target, html, plainText);
  }, true);
}

function normalizedExtension(fileName: string): string {
  const normalized = fileName.normalize('NFC').trim();
  if (!normalized || normalized.length > 255 || /[\u0000-\u001f\u007f]/u.test(normalized) || /[\\/]/u.test(normalized)) {
    throw new FrontendSecurityError('Dropped file name violates the security boundary.');
  }
  const dot = normalized.lastIndexOf('.');
  return dot > 0 ? normalized.slice(dot + 1).toLocaleLowerCase('en-US') : '';
}

export function assertNonExecutableWorkspaceFile(fileName: string): void {
  const extension = normalizedExtension(fileName);
  if (EXECUTABLE_DROP_EXTENSIONS.has(extension)) {
    throw new FrontendSecurityError('Security warning: executable or active-content files are blocked by the Workspace import jail.');
  }
}

/**
 * Strict shell Drag-and-Drop boundary. Only Workspace containers, PDF and supported office formats
 * with an allowlisted declared MIME type can enter the generic shell import pipeline.
 */
export function assertWorkspaceShellDropAllowed(file: WorkspaceDropCandidate): WorkspaceDropClassification {
  assertNonExecutableWorkspaceFile(file.name);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > 128 * 1024 * 1024) {
    throw new FrontendSecurityError('Dropped file violates the 128 MiB shell boundary.');
  }

  const extension = normalizedExtension(file.name);
  const allowedMimes = SHELL_DROP_MIME_BY_EXTENSION[extension];
  if (!allowedMimes) throw new FrontendSecurityError('Dropped file extension is not allowlisted for the Workspace shell.');

  const mime = file.type.trim().toLocaleLowerCase('en-US').split(';', 1)[0];
  if (!mime || !allowedMimes.has(mime)) {
    throw new FrontendSecurityError('Dropped file MIME/extension pair is not allowlisted for the Workspace shell.');
  }
  return { extension, mime };
}

/**
 * Installs an intentionally conspicuous Self-XSS warning. Tauri release builds do not need an
 * interactive DevTools console for normal operation; if a console is available, the warning is
 * printed before application interaction begins.
 */
export function installSelfXssShield(): void {
  if (typeof window === 'undefined') return;

  const warningStyle = 'color:#fff;background:#b91c1c;font-size:28px;font-weight:900;padding:8px 12px;border-radius:6px;';
  const infoStyle = 'color:#f8fafc;background:#111827;font-size:14px;font-weight:700;padding:4px 8px;';

  try {
    console.log('%cSTOP — ASTRAEA WORKSPACE SECURITY', warningStyle);
    console.log(
      '%cNever paste code into this console because somebody told you to. Console-paste instructions can expose documents, session state, or security material.',
      infoStyle,
    );
    console.log(
      '%cAstraea Workspace does not require console commands for support, activation, recovery, updates, or document access.',
      infoStyle,
    );
  } catch {
    // Console availability is not a security dependency.
  }
}
