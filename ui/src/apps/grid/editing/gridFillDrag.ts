// STATUS: DIAMANT VGT SUPREME
// Astraea Grid fill-handle drop decision. The visible handle must either run the
// series engine, move/copy the block, or report a visible rejection - never fail
// silently.

import { coordInGridRange, parseGridRange } from '../compat/gridProfessional';

export type GridFillDropResolution =
  | { readonly kind: 'fill'; readonly targetCoord: string }
  | { readonly kind: 'transfer'; readonly targetCoord: string; readonly mode: 'move' | 'copy' }
  | { readonly kind: 'rejected'; readonly reason: string };

export interface GridFillDropInput {
  /** Coordinate the drag started on (active cell), null when no drag is in flight. */
  readonly dragCoord: string | null;
  /** true when the drag started on the selection fill handle. */
  readonly dragAsFill: boolean;
  readonly targetCoord: string;
  /** Current selection, i.e. the fill source range. */
  readonly sourceRange: string;
  readonly copyModifier: boolean;
}

export function resolveGridFillDrop(input: GridFillDropInput): GridFillDropResolution {
  const targetCoord = input.targetCoord.toUpperCase();
  if (!input.dragCoord) return { kind: 'rejected', reason: 'Es wurde keine Zelle oder kein Füllgriff gezogen.' };
  const dragCoord = input.dragCoord.toUpperCase();
  if (dragCoord === targetCoord) return { kind: 'rejected', reason: 'Quelle und Ziel sind identisch.' };

  if (input.dragAsFill) {
    const bounds = parseGridRange(input.sourceRange.toUpperCase());
    if (!bounds) return { kind: 'rejected', reason: `Auswahl ${input.sourceRange} ist kein gültiger Ausfüllbereich.` };
    if (coordInGridRange(targetCoord, input.sourceRange.toUpperCase())) {
      return { kind: 'rejected', reason: 'Der Füllgriff muss über den Rand der Auswahl hinaus gezogen werden.' };
    }
    return { kind: 'fill', targetCoord };
  }

  return { kind: 'transfer', targetCoord, mode: input.copyModifier ? 'copy' : 'move' };
}
