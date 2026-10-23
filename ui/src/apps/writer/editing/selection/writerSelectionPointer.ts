// STATUS: DIAMANT VGT SUPREME — Pointer-to-selection-point resolution for Writer drag selection
/**
 * Measuring the pointer is the renderer's job; deciding which paragraph and
 * which offset the pointer means is this module's job, so the decision stays
 * unit-testable without a layout engine.
 *
 * Granularity: inside the origin paragraph the browser's own textarea selection
 * is used and stays character-exact. For a pointer that has left the origin
 * textarea, the offset is derived from the paragraph box — the upper half means
 * "start of this paragraph", the lower half means "end of it". A character-exact
 * hit test across textareas would need text metrics and is deliberately not
 * guessed here.
 */

export interface WriterParagraphPointerBox {
  readonly paragraphId: string;
  readonly top: number;
  readonly bottom: number;
  readonly textLength: number;
}

export interface WriterPointerSelectionPoint {
  readonly paragraphId: string;
  readonly offset: number;
}

function contains(box: WriterParagraphPointerBox, clientY: number): boolean {
  return clientY >= box.top && clientY <= box.bottom;
}

function verticalDistance(box: WriterParagraphPointerBox, clientY: number): number {
  if (contains(box, clientY)) return 0;
  return clientY < box.top ? box.top - clientY : clientY - box.bottom;
}

/**
 * Resolves the paragraph and offset a pointer position refers to. The origin
 * paragraph is skipped because its own textarea already tracks a character-exact
 * selection. Returns `null` when no usable box exists.
 */
export function resolveWriterPointerSelectionPoint(
  boxes: readonly WriterParagraphPointerBox[],
  clientY: number,
  excludeParagraphId?: string,
): WriterPointerSelectionPoint | null {
  if (!Number.isFinite(clientY)) return null;
  // While the pointer is still inside the origin paragraph its own textarea owns
  // the character-exact selection; the range must not jump to a neighbour yet.
  if (
    excludeParagraphId !== undefined
    && boxes.some((box) => box.paragraphId === excludeParagraphId && contains(box, clientY))
  ) {
    return null;
  }
  const candidates = boxes.filter((box) => (
    box.paragraphId.length > 0
    && box.paragraphId !== excludeParagraphId
    && Number.isFinite(box.top)
    && Number.isFinite(box.bottom)
    && box.bottom >= box.top
  ));
  if (candidates.length === 0) return null;

  const inside = candidates.find((box) => contains(box, clientY));
  if (inside) {
    const midpoint = inside.top + (inside.bottom - inside.top) / 2;
    return {
      paragraphId: inside.paragraphId,
      offset: clientY < midpoint ? 0 : Math.max(0, Math.trunc(inside.textLength)),
    };
  }

  let nearest = candidates[0];
  if (!nearest) return null;
  let nearestDistance = verticalDistance(nearest, clientY);
  for (const box of candidates) {
    const distance = verticalDistance(box, clientY);
    if (distance < nearestDistance) {
      nearest = box;
      nearestDistance = distance;
    }
  }
  return {
    paragraphId: nearest.paragraphId,
    offset: clientY < nearest.top ? 0 : Math.max(0, Math.trunc(nearest.textLength)),
  };
}
