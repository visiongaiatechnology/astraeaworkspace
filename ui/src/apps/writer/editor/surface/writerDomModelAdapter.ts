// STATUS: PLATIN — DOM↔Model adapter for the single Writer rich-text edit surface
//
// The Writer document is one logical text space (`Paragraph[]` with ordered
// `spans[]`). The browser, however, needs DOM nodes: the paginator splits a long
// paragraph into one *fragment* per page it reaches, so one model paragraph can
// appear as several DOM elements.
//
// Everything in this module exists so that exactly one rule holds:
//
//   every DOM position inside the surface can be expressed as
//   `{ paragraphId, offset }` in model coordinates, and every model position
//   can be projected back onto a DOM position.
//
// The functions are deliberately free of React and of `Selection` objects.
// Offsets are computed by walking text nodes and summing their lengths, which is
// deterministic in a browser, in `happy-dom` and in a plain Node DOM stub.
// The caller keeps the `Selection` object.
import type { Paragraph, TextSpan } from '../../../../shared/contracts/workspace';
import type { WriterSelectionPoint, WriterSelectionRange } from '../../editing/selection/writerSelectionRange';

/** Marks the one editable root of the document body. */
export const WRITER_SURFACE_ROOT_ATTR = 'data-writer-rich-surface';
/** Marks one rendered fragment of a paragraph; the value is the paragraph id. */
export const WRITER_SURFACE_FRAGMENT_ATTR = 'data-writer-surface-paragraph';
/** First model offset this fragment renders (inclusive). */
export const WRITER_SURFACE_FRAGMENT_START_ATTR = 'data-writer-surface-start';
/** Last model offset this fragment renders (exclusive). */
export const WRITER_SURFACE_FRAGMENT_END_ATTR = 'data-writer-surface-end';
/** Marks one rendered inline run so a witness can count real inline styles. */
export const WRITER_SURFACE_SPAN_ATTR = 'data-writer-surface-span';
/** The run's model formatting, so a round-trip can be compared without layout. */
export const WRITER_SURFACE_SPAN_KEY_ATTR = 'data-writer-span-key';
/**
 * The caret anchor of an empty paragraph.
 *
 * Chromium draws no caret inside a block that has no rendered content, and it
 * "fixes" that by inserting its own `<br>` — a node React does not know about.
 * The projection therefore ships a managed run with exactly this `<br>` inside,
 * so the browser has a legal caret target and never invents one of its own.
 */
export const WRITER_SURFACE_EMPTY_BREAK_ATTR = 'data-writer-empty-break';
/** Marks the managed anchor run of an empty paragraph (ignored by the signature). */
export const WRITER_SURFACE_EMPTY_RUN_ATTR = 'data-writer-empty-run';

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/** The slice of a paragraph one DOM fragment renders. */
export interface WriterSurfaceFragmentBox {
  readonly paragraphId: string;
  readonly start: number;
  readonly end: number;
}

function finiteInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.trunc(value);
}

function readAttribute(node: Node | null, name: string): string | null {
  if (!node || node.nodeType !== ELEMENT_NODE) return null;
  const candidate = node as Element;
  if (typeof candidate.getAttribute !== 'function') return null;
  return candidate.getAttribute(name);
}

/**
 * The comparable formatting key of one inline run.
 *
 * One single function builds it for the projection, for the model signature and
 * for the read-back, so the three can never drift apart — the drift would show up
 * as a surface that re-projects on every keystroke.
 */
export function writerSurfaceSpanKey(span: Pick<TextSpan, 'bold' | 'italic' | 'underline' | 'strikethrough'> & {
  readonly font_family?: string;
  readonly font_size_pt?: number;
}): string {
  return [
    span.bold ? 'b' : '',
    span.italic ? 'i' : '',
    span.underline ? 'u' : '',
    span.strikethrough ? 's' : '',
    (span.font_family ?? '').replace(/["']/gu, ''),
    span.font_size_pt === undefined ? '' : String(span.font_size_pt),
  ].join('|');
}

/**
 * Reads the model box a fragment element renders. Returns `null` for anything
 * that is not a well-formed fragment, so a hostile or half-rendered DOM cannot
 * invent a paragraph id or a nonsense offset.
 */
export function readWriterSurfaceFragmentBox(element: Node | null): WriterSurfaceFragmentBox | null {
  if (!element || element.nodeType !== ELEMENT_NODE) return null;
  const paragraphId = readAttribute(element, WRITER_SURFACE_FRAGMENT_ATTR);
  if (paragraphId === null || paragraphId.length === 0) return null;
  const rawStart = readAttribute(element, WRITER_SURFACE_FRAGMENT_START_ATTR);
  const rawEnd = readAttribute(element, WRITER_SURFACE_FRAGMENT_END_ATTR);
  const start = Math.max(0, finiteInt(Number(rawStart)));
  const end = Math.max(start, finiteInt(Number(rawEnd), start));
  return { paragraphId, start, end };
}

/** Nearest fragment element at or above `node`, or `null` outside the surface. */
export function findWriterSurfaceFragment(node: Node | null): Element | null {
  let current: Node | null = node;
  while (current) {
    if (current.nodeType === ELEMENT_NODE && readAttribute(current, WRITER_SURFACE_FRAGMENT_ATTR) !== null) {
      return current as Element;
    }
    current = current.parentNode;
  }
  return null;
}

/** All fragments of the surface, in DOM (= reading) order. */
export function collectWriterSurfaceFragments(root: Element): Element[] {
  if (typeof root.querySelectorAll !== 'function') return [];
  return Array.from(root.querySelectorAll<Element>(`[${WRITER_SURFACE_FRAGMENT_ATTR}]`));
}

/** True when `node` is `container` or below it. */
export function writerSurfaceContains(container: Node, node: Node | null): boolean {
  let current: Node | null = node;
  while (current) {
    if (current === container) return true;
    current = current.parentNode;
  }
  return false;
}

/**
 * Character length of a DOM subtree as the model would count it.
 *
 * `contenteditable="false"` islands are skipped: header fields, table grids and
 * drag handles live inside the same editable root but are not document text, and
 * counting them would shift every offset behind them.
 */
export function writerSurfaceTextLength(node: Node | null): number {
  if (!node) return 0;
  if (node.nodeType === TEXT_NODE) return (node.textContent ?? '').length;
  if (node.nodeType !== ELEMENT_NODE) return 0;
  if (readAttribute(node, 'contenteditable') === 'false') return 0;
  let total = 0;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    total += writerSurfaceTextLength(child);
  }
  return total;
}

/** The plain text of a DOM subtree, ignoring non-editable islands. */
export function writerSurfaceTextOf(node: Node | null): string {
  if (!node) return '';
  if (node.nodeType === TEXT_NODE) return node.textContent ?? '';
  if (node.nodeType !== ELEMENT_NODE) return '';
  if (readAttribute(node, 'contenteditable') === 'false') return '';
  let text = '';
  for (let child = node.firstChild; child; child = child.nextSibling) {
    text += writerSurfaceTextOf(child);
  }
  return text;
}

/** Text nodes of a subtree in reading order, skipping non-editable islands. */
export function collectWriterSurfaceTextNodes(container: Node): Node[] {
  const collected: Node[] = [];
  const visit = (node: Node): void => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === TEXT_NODE) {
        collected.push(child);
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      if (readAttribute(child, 'contenteditable') === 'false') continue;
      visit(child);
    }
  };
  visit(container);
  return collected;
}

/**
 * Model offset of a DOM boundary inside `container`, counted in characters.
 *
 * DOM boundaries address element nodes by *child index* and text nodes by
 * *character index*. Both are accepted, because a browser reports the two
 * interchangeably depending on where a click landed.
 */
export function resolveWriterSurfaceLocalOffset(
  container: Node,
  node: Node | null,
  offset: number,
): number | null {
  if (!node) return null;
  if (!writerSurfaceContains(container, node)) return null;

  if (node.nodeType === TEXT_NODE) {
    let cursor = 0;
    for (const textNode of collectWriterSurfaceTextNodes(container)) {
      const length = (textNode.textContent ?? '').length;
      if (textNode === node) {
        return cursor + Math.max(0, Math.min(finiteInt(offset), length));
      }
      cursor += length;
    }
    return null;
  }

  if (node.nodeType !== ELEMENT_NODE) return null;

  let before = 0;
  let current: Node | null = node;
  while (current && current !== container) {
    let sibling = current.previousSibling;
    while (sibling) {
      before += writerSurfaceTextLength(sibling);
      sibling = sibling.previousSibling;
    }
    current = current.parentNode;
  }

  const element = node as Element;
  const wanted = Math.max(0, finiteInt(offset));
  let inside = 0;
  let index = 0;
  for (let child = element.firstChild; child && index < wanted; child = child.nextSibling) {
    inside += writerSurfaceTextLength(child);
    index += 1;
  }
  return before + inside;
}

/** `{ node, offset }` for a character offset inside a fragment. */
export function resolveWriterSurfaceTextPoint(
  fragment: Node,
  localOffset: number,
): { node: Node; offset: number } {
  let remaining = Math.max(0, finiteInt(localOffset));
  let last: Node | null = null;
  for (const textNode of collectWriterSurfaceTextNodes(fragment)) {
    const length = (textNode.textContent ?? '').length;
    if (remaining <= length) return { node: textNode, offset: remaining };
    remaining -= length;
    last = textNode;
  }
  if (last) return { node: last, offset: (last.textContent ?? '').length };
  // An empty paragraph still has to be a caret target. Prefer the managed anchor
  // run, so the caret lands *inside* the element that carries the `<br>` and
  // Chromium renders it instead of "repairing" the block on its own.
  const firstChild = fragment.firstChild;
  if (firstChild && firstChild.nodeType === ELEMENT_NODE) {
    return { node: firstChild, offset: 0 };
  }
  return { node: fragment, offset: 0 };
}

/**
 * Model point for a DOM boundary.
 *
 * A boundary that sits *between* two fragments of the same paragraph resolves to
 * the end of the earlier one, so typing at a page break continues the paragraph
 * instead of starting at an offset that belongs to the following page.
 */
export function resolveWriterSurfacePointFromDom(
  node: Node | null,
  offset: number,
): WriterSelectionPoint | null {
  const fragment = findWriterSurfaceFragment(node);
  if (!fragment) return null;
  const box = readWriterSurfaceFragmentBox(fragment);
  if (!box) return null;
  const local = resolveWriterSurfaceLocalOffset(fragment, node, offset);
  if (local === null) return null;
  return { paragraphId: box.paragraphId, offset: box.start + local };
}

/**
 * DOM position for a model point.
 *
 * A paragraph that is paginated appears as several fragments; the one that owns
 * the offset takes the caret. The very end of the paragraph belongs to the last
 * fragment, which is where a user expects the caret after typing the last word.
 */
export function resolveWriterSurfaceDomPoint(
  root: Element,
  point: WriterSelectionPoint,
): { node: Node; offset: number } | null {
  const owned: { element: Element; box: WriterSurfaceFragmentBox }[] = [];
  for (const element of collectWriterSurfaceFragments(root)) {
    const box = readWriterSurfaceFragmentBox(element);
    if (!box || box.paragraphId !== point.paragraphId) continue;
    owned.push({ element, box });
  }
  if (owned.length === 0) return null;
  const wanted = Math.max(0, finiteInt(point.offset));
  const owner = owned.find((entry) => wanted >= entry.box.start && wanted < entry.box.end)
    ?? owned[owned.length - 1];
  if (!owner) return null;
  const local = Math.max(0, Math.min(owner.box.end - owner.box.start, wanted - owner.box.start));
  return resolveWriterSurfaceTextPoint(owner.element, local);
}

/** The surface's current DOM selection as model points, or `null` outside it. */
export function readWriterSurfaceSelection(
  root: Element,
  getSelection?: () => Selection | null,
): WriterSelectionRange | null {
  const selection = (getSelection ?? defaultGetSelection)();
  if (!selection) return null;
  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;
  if (!anchorNode || !focusNode) return null;
  if (!writerSurfaceContains(root, anchorNode) || !writerSurfaceContains(root, focusNode)) return null;
  const anchor = resolveWriterSurfacePointFromDom(anchorNode, selection.anchorOffset);
  const focus = resolveWriterSurfacePointFromDom(focusNode, selection.focusOffset);
  if (!anchor || !focus) return null;
  return { anchor, focus };
}

function defaultGetSelection(): Selection | null {
  if (typeof window === 'undefined') return null;
  return typeof window.getSelection === 'function' ? window.getSelection() : null;
}

/** True when both ends of the range are the same model position. */
export function writerSurfaceRangeIsCollapsed(range: WriterSelectionRange | null): boolean {
  if (!range) return true;
  return range.anchor.paragraphId === range.focus.paragraphId
    && range.anchor.offset === range.focus.offset;
}

/** True when both model ranges address the same two positions. */
export function writerSurfaceRangesEqual(
  left: WriterSelectionRange | null,
  right: WriterSelectionRange | null,
): boolean {
  if (!left || !right) return left === right;
  return left.anchor.paragraphId === right.anchor.paragraphId
    && left.anchor.offset === right.anchor.offset
    && left.focus.paragraphId === right.focus.paragraphId
    && left.focus.offset === right.focus.offset;
}

/**
 * Moves the DOM selection to a model range.
 *
 * Returns `false` when the requested position cannot be projected — for example
 * because the target paragraph is not rendered — so the caller can decide
 * whether a deferred retry is worth it instead of silently believing the caret
 * moved.
 */
export function writeWriterSurfaceSelection(
  root: Element,
  range: WriterSelectionRange,
  focusSurface = true,
): boolean {
  const doc = root.ownerDocument;
  if (!doc) return false;
  /**
   * Focus first, selection second.
   *
   * The caret only becomes *visible* when the editable host has focus, so a
   * failure to project the range must not cost the user their caret. (A browser
   * that refuses `addRange` is a real case, and the previous textarea path simply
   * called `focus()` first.)
   */
  if (focusSurface && root.nodeType === ELEMENT_NODE) {
    // Deliberately **not** guarded by `document.hasFocus()`: that reports `false`
    // in a background tab and in every non-browser DOM, which would silently skip
    // the focus and leave the caret invisible after a page click.
    const host = root as HTMLElement;
    if (typeof host.focus === 'function' && doc.activeElement !== host) {
      try {
        host.focus({ preventScroll: true });
      } catch {
        host.focus();
      }
    }
  }
  const anchor = resolveWriterSurfaceDomPoint(root, range.anchor);
  const focusPoint = resolveWriterSurfaceDomPoint(root, range.focus);
  if (!anchor || !focusPoint) return false;
  const selection = typeof doc.getSelection === 'function' ? doc.getSelection() : null;
  if (!selection) return false;
  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focusPoint.node, focusPoint.offset);
    return true;
  }
  const created = typeof doc.createRange === 'function' ? doc.createRange() : null;
  if (!created) return false;
  created.setStart(anchor.node, anchor.offset);
  created.setEnd(focusPoint.node, focusPoint.offset);
  selection.removeAllRanges();
  selection.addRange(created);
  return true;
}

/**
 * The model text a paragraph currently shows in the DOM, or `null` when the
 * paragraph is not rendered at all. All fragments are concatenated in DOM order,
 * which is the order the paginator emitted them in.
 */
export function readWriterSurfaceParagraphText(root: Element, paragraphId: string): string | null {
  let found = false;
  let text = '';
  for (const element of collectWriterSurfaceFragments(root)) {
    const box = readWriterSurfaceFragmentBox(element);
    if (!box || box.paragraphId !== paragraphId) continue;
    found = true;
    text += writerSurfaceTextOf(element);
  }
  return found ? text : null;
}

/** Text of one paragraph in the model, spans joined. */
export function writerSurfaceParagraphText(paragraph: Paragraph | undefined): string {
  if (!paragraph) return '';
  return paragraph.spans.map((span) => span.text).join('');
}

/**
 * What the DOM *should* show for a visible slice of one paragraph.
 *
 * The surface compares this with the live DOM after an input event. A mismatch
 * means the browser created structure the model never agreed to (a stray `<br>`
 * in an empty paragraph, a split text node, a dropped run) and the surface
 * re-projects from the model, so the DOM can never drift into being the data
 * authority.
 */
export function resolveWriterSurfaceParagraphSignature(
  paragraph: Paragraph,
  start: number,
  end: number,
): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const span of paragraph.spans) {
    const spanStart = cursor;
    const spanEnd = cursor + span.text.length;
    cursor = spanEnd;
    const from = Math.max(spanStart, start);
    const to = Math.min(spanEnd, end);
    if (to <= from) continue;
    parts.push(`${writerSurfaceSpanKey(span)}=${span.text.slice(from - spanStart, to - spanStart)}`);
  }
  return parts.join('\u0000');
}

/** Live signature of one fragment element, for the repair check. */
export function readWriterSurfaceFragmentSignature(element: Element): string {
  const parts: string[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      const loose = child.textContent ?? '';
      if (loose.length > 0) parts.push(`loose=${loose}`);
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    // The managed caret anchor of an empty paragraph carries no model text by
    // definition; counting it would make every empty paragraph look "diverged".
    if (readAttribute(child, WRITER_SURFACE_EMPTY_RUN_ATTR) !== null) continue;
    const key = readAttribute(child, WRITER_SURFACE_SPAN_KEY_ATTR) ?? '';
    parts.push(`${key}=${writerSurfaceTextOf(child)}`);
  }
  return parts.join('\u0000');
}

/**
 * True when the fragment contains only nodes the projection owns.
 *
 * A text node or `<br>` sitting directly under `[data-writer-surface-paragraph]`
 * is the signature of the browser having edited the block itself — the state in
 * which React's virtual DOM and the real DOM silently disagree. Nothing may be
 * reconciled from such a fragment.
 */
export function writerSurfaceFragmentIsClean(element: Element): boolean {
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      if ((child.textContent ?? '').length > 0) return false;
      continue;
    }
    if (child.nodeType !== ELEMENT_NODE) continue;
    if (readAttribute(child, WRITER_SURFACE_SPAN_ATTR) === null && readAttribute(child, 'contenteditable') !== 'false') {
      return false;
    }
  }
  return true;
}

/** True when every rendered fragment of the document is clean. */
export function writerSurfaceDomIsClean(root: Element): boolean {
  return collectWriterSurfaceFragments(root).every(writerSurfaceFragmentIsClean);
}

/**
 * Removes every node the projection does not own from the fragments.
 *
 * Used as the last resort before a hard re-projection: it makes the live DOM safe
 * immediately (no ghost characters can be read, selected or deleted), and the
 * following model-driven re-mount rebuilds the structure properly.
 */
export function scrubWriterSurfaceDom(root: Element): number {
  let removed = 0;
  for (const fragment of collectWriterSurfaceFragments(root)) {
    for (const child of Array.from(fragment.childNodes)) {
      if (child.nodeType === TEXT_NODE) {
        if ((child.textContent ?? '').length > 0) {
          fragment.removeChild(child);
          removed += 1;
        }
        continue;
      }
      if (child.nodeType !== ELEMENT_NODE) continue;
      if (readAttribute(child, WRITER_SURFACE_SPAN_ATTR) !== null) continue;
      if (readAttribute(child, 'contenteditable') === 'false') continue;
      fragment.removeChild(child);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Compares the live DOM of one paragraph against what the model says it renders.
 *
 * `null` means the paragraph has no fragment in the DOM at all (it is not on the
 * current page), which is not a deviation. `false` means the browser produced
 * structure the model never agreed to — a stray `<br>`, a dropped run, a text
 * node outside every run — and the surface has to re-project before the DOM can
 * be mistaken for the data authority.
 */
export function writerSurfaceMatchesModel(root: Element, paragraph: Paragraph): boolean | null {
  let found = false;
  for (const element of collectWriterSurfaceFragments(root)) {
    const box = readWriterSurfaceFragmentBox(element);
    if (!box || box.paragraphId !== paragraph.id) continue;
    found = true;
    if (resolveWriterSurfaceParagraphSignature(paragraph, box.start, box.end) !== readWriterSurfaceFragmentSignature(element)) {
      return false;
    }
  }
  return found ? true : null;
}
