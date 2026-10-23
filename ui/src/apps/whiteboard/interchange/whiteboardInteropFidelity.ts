// STATUS: DIAMANT VGT SUPREME
// Explicit Whiteboard interchange fidelity contract. Never silently destroy unsupported semantics.

export interface WhiteboardInteropFidelityEntry {
  format: string;
  fidelity: 'full' | 'visual' | 'semantic-subset';
  preserved: string;
  limitations: string;
}

export const WHITEBOARD_INTEROP_FIDELITY: readonly WhiteboardInteropFidelityEntry[] = Object.freeze([
  { format: '.vboard', fidelity: 'full', preserved: 'Canonical objects, IDs, links, live/frozen modes, view state and policies.', limitations: 'Native Astraea encrypted container; foreign applications do not edit this format.' },
  { format: 'SVG', fidelity: 'semantic-subset', preserved: 'Visible geometry, vector ink, routed connectors, labels, images and semantic cards.', limitations: 'Interactive live objects, media playback, votes/comments and editing behavior are represented visually, not as executable foreign semantics.' },
  { format: 'PNG', fidelity: 'visual', preserved: 'Bounded raster view produced from the canonical SVG projection.', limitations: 'Flattened image; object IDs, editability, links and interaction semantics are intentionally not represented.' },
  { format: 'PDF', fidelity: 'visual', preserved: 'Frame-paged visual projection with the same canonical SVG geometry.', limitations: 'Flattened pages; object editability, live bindings, collaboration and facilitation state are intentionally not represented.' },
  { format: 'Diagram SVG import', fidelity: 'semantic-subset', preserved: 'Supported rect/circle/ellipse/polygon/text/line primitives become native Whiteboard objects.', limitations: 'Unsupported or active SVG content is rejected rather than silently discarded.' },
  { format: 'PDF import', fidelity: 'visual', preserved: 'Local pages are rasterized into bounded native image objects.', limitations: 'Original PDF structure, scripts, forms and active content are deliberately flattened and are not editable as PDF objects in Whiteboard.' },
  { format: 'Frames → Present', fidelity: 'semantic-subset', preserved: 'Selected frame order and titles, plus up to nine visible contained-object summary cards per slide. Speaker notes disclose the source title, frame ID, and exact contained count unless the bounded scan budget is reached.', limitations: 'At most 256 slides and two million frame/object checks are processed. Connectors, hidden objects, invalid-geometry objects, additional cards, and Whiteboard positions/editing/collaboration semantics are omitted.' },
]);

export const whiteboardInteropFidelitySummary = () => WHITEBOARD_INTEROP_FIDELITY.map((entry) => `${entry.format}: ${entry.fidelity} — ${entry.limitations}`);
