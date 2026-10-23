// STATUS: DIAMANT VGT SUPREME — Bring a freshly inserted image into view
/**
 * WR-033 (native M7 re-probe) — an inserted image has to be **seen**.
 *
 * Even with a correct anchor the picture could land below the fold: the user picks
 * "Bild einfügen", the dialog closes, and nothing changes on screen. The reveal scrolls
 * the image into the nearest scroll container and marks it for a moment, so the insert
 * is visibly confirmed. It never steals focus — the caret must stay in the text, or the
 * next keystroke would go nowhere.
 */

/** Exactly the attribute `WriterImageBlock` puts on its `<figure>`. */
export const WRITER_IMAGE_ELEMENT_SELECTOR = '[data-writer-image-id]';

export function findWriterImageElement(
  imageId: string,
  root: Document | undefined = typeof globalThis.document === 'undefined' ? undefined : globalThis.document,
): HTMLElement | null {
  if (!root) return null;
  return Array.from(root.querySelectorAll<HTMLElement>(WRITER_IMAGE_ELEMENT_SELECTOR))
    .find((candidate) => candidate.getAttribute('data-writer-image-id') === imageId) ?? null;
}

const HIGHLIGHT_ATTRIBUTE = 'data-writer-image-revealed';
const HIGHLIGHT_OUTLINE = '2px solid rgba(59,130,246,0.9)';
const HIGHLIGHT_DURATION_MS = 1_600;

/** Scrolls the image into view and highlights it; returns `false` when it is not rendered. */
export function revealWriterImage(imageId: string): boolean {
  const element = findWriterImageElement(imageId);
  if (!element) return false;
  const previousOutline = element.style.outline;
  const previousOutlineOffset = element.style.outlineOffset;
  element.setAttribute(HIGHLIGHT_ATTRIBUTE, 'true');
  element.style.outline = HIGHLIGHT_OUTLINE;
  element.style.outlineOffset = '2px';
  try {
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  } catch {
    // A scroll container that cannot animate must not turn the insert into a failure.
    element.scrollIntoView?.();
  }
  const restore = (): void => {
    if (!element.isConnected) return;
    element.removeAttribute(HIGHLIGHT_ATTRIBUTE);
    element.style.outline = previousOutline;
    element.style.outlineOffset = previousOutlineOffset;
  };
  if (typeof globalThis.setTimeout === 'function') globalThis.setTimeout(restore, HIGHLIGHT_DURATION_MS);
  return true;
}

/**
 * Waits two frames before revealing: the first one is still inside React's commit for the
 * new image, the second one is after the browser laid the page out. Without the second
 * frame the element is often not in the DOM yet and the reveal silently does nothing.
 */
export function scheduleWriterImageReveal(imageId: string): void {
  const frame = typeof globalThis.requestAnimationFrame === 'function'
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback: FrameRequestCallback) => globalThis.setTimeout(() => callback(Date.now()), 16);
  frame(() => {
    frame(() => {
      revealWriterImage(imageId);
    });
  });
}
