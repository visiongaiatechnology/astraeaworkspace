// STATUS: DIAMANT VGT SUPREME
//
// Ergänzung 7 §4 — „Whiteboard hat keine überlappenden oder unzugänglichen Werkzeugleisten."
//
// ## Was hier entschieden wird
//
// Die neun schwebenden Whiteboard-Panels hingen an neun **unabhängigen** `useState`-Booleans. Sie waren
// gleichzeitig montierbar, und mehrere trugen denselben Anker (`right-5 top-20`) mit derselben z-Zahl —
// dann entschied allein die JSX-Reihenfolge, welches Panel sichtbar blieb. Diese Datei zieht die
// Entscheidung aus dem Markup heraus:
//
//   1. **Drei Dock-Bereiche** (`left-top`, `right-top`, `bottom-right`). Je Bereich ist **höchstens ein**
//      Panel offen — die Ausschliessung liegt in `openWhiteboardDockPanel` / `toggleWhiteboardDockPanel`
//      und ist eine reine Funktion: kein React, kein DOM, in Node erschöpfend prüfbar.
//   2. **Je Bereich ein Anker.** Panels desselben Bereichs teilen den Anker, tragen aber **verschiedene**
//      z-Zahlen — kein Bereich verlässt sich mehr auf die DOM-Reihenfolge.
//   3. **Die Anker stehen als Klassenzahlen** (`top-20`, `right-4`, `z-50`) in den Panel-Wurzeln, damit
//      der Anker-/z-Vertrag aus dem Quelltext lesbar bleibt (`whiteboardPanelDockReachability.test.ts`).
//
// ## Warum diese Aufteilung und nicht „alle neun nebeneinander"
//
// Bei 1280 px Breite summieren sich die rechten Panels auf 360 + 320 + 340 + 360 + 430 = 1810 px, und
// zwei Maximalhöhen (LiveObjects 72vh, Collaboration calc(100% - 6rem)) überschreiten 720 px. Volle
// Überlappungsfreiheit für *gleichzeitig* montierte Panels ist dort geometrisch unerreichbar. Bereichsweise
// Ausschliessung nimmt nur Kombinationen weg, die im selben Bereich ohnehin nicht darstellbar waren —
// nutzbare Kombinationen über **verschiedene** Bereiche bleiben möglich (Objektliste + Navigator,
// Organisation + Collaboration, …).

/** Every togglable whiteboard panel. The nine `show*` booleans in `WhiteboardCanvas` derive from this. */
export type WhiteboardDockPanelId =
  | 'object-palette'
  | 'templates'
  | 'organization'
  | 'navigator'
  | 'diagram'
  | 'facilitation'
  | 'live-objects'
  | 'collaboration'
  | 'object-list';

/** The three dock areas. At most one panel of each area is open at any time. */
export type WhiteboardDockRegion = 'left-top' | 'right-top' | 'bottom-right';

export interface WhiteboardDockRegionRule {
  /** The `top-*` anchor class every panel of this area carries. */
  readonly anchor: string;
  /**
   * The z-index of the panels of this area, per panel id. Distinct on purpose: two panels of the same
   * area share the anchor, so a shared z-index would put the stacking order back into the hands of the
   * JSX order. Partial by type — which panel belongs to which area is `WHITEBOARD_PANEL_REGION`.
   */
  readonly z: Readonly<Partial<Record<WhiteboardDockPanelId, number>>>;
}

/** The three dock areas, in table order. */
export const WHITEBOARD_DOCK_REGIONS = Object.freeze([
  'left-top',
  'right-top',
  'bottom-right',
] as const satisfies readonly WhiteboardDockRegion[]);

/**
 * The dock table. `left-top` = the board's authoring panels, `right-top` = the working panels,
 * `bottom-right` = the object list (which sits above the viewport controls, not on top of them).
 */
export const WHITEBOARD_DOCK_RULES: Readonly<Record<WhiteboardDockRegion, WhiteboardDockRegionRule>> = Object.freeze({
  'left-top': Object.freeze({
    anchor: 'top-20',
    // The exclusion makes these three mutually exclusive, so the order is not a visual layer: it is the
    // ranking inside a slot, and it is distinct on purpose. No two panels reach for the same slot with
    // the same z-index, so nothing here depends on the JSX order any more.
    z: Object.freeze({ 'object-palette': 30, templates: 28, organization: 26 }),
  }),
  'right-top': Object.freeze({
    anchor: 'top-20',
    z: Object.freeze({ navigator: 30, diagram: 31, facilitation: 32, 'live-objects': 45, collaboration: 50 }),
  }),
  'bottom-right': Object.freeze({
    anchor: 'bottom-6',
    z: Object.freeze({ 'object-list': 40 }),
  }),
});

/** Which dock area a panel belongs to. */
export const WHITEBOARD_PANEL_REGION: Readonly<Record<WhiteboardDockPanelId, WhiteboardDockRegion>> = Object.freeze({
  'object-palette': 'left-top',
  templates: 'left-top',
  organization: 'left-top',
  navigator: 'right-top',
  diagram: 'right-top',
  facilitation: 'right-top',
  'live-objects': 'right-top',
  collaboration: 'right-top',
  'object-list': 'bottom-right',
});

const Z_FALLBACK = 30;

/** The z-index the dock table prescribes for a panel. */
export function whiteboardPanelZ(id: WhiteboardDockPanelId): number {
  const region = WHITEBOARD_PANEL_REGION[id];
  return WHITEBOARD_DOCK_RULES[region].z[id] ?? Z_FALLBACK;
}

/** The anchor class the dock table prescribes for a panel. */
export function whiteboardPanelAnchor(id: WhiteboardDockPanelId): string {
  return WHITEBOARD_DOCK_RULES[WHITEBOARD_PANEL_REGION[id]].anchor;
}

/** The panel ids of one dock area, in table order. */
export function whiteboardPanelsOfRegion(region: WhiteboardDockRegion): readonly WhiteboardDockPanelId[] {
  return (Object.keys(WHITEBOARD_PANEL_REGION) as WhiteboardDockPanelId[]).filter(
    (id) => WHITEBOARD_PANEL_REGION[id] === region,
  );
}

/**
 * Opens a panel. **Exclusive within its dock area:** opening a panel of `region R` closes every other
 * open panel of `region R`, and leaves panels of the other regions untouched.
 *
 * Contract-preserving: a state with at most one panel per area stays that way. (A state that already
 * holds two panels of one area is not repaired — it is not reachable through this function.)
 *
 * Returns the *same* set instance when nothing would change, so a React state setter fed with the
 * result does not re-render for a no-op.
 */
export function openWhiteboardDockPanel(
  open: ReadonlySet<WhiteboardDockPanelId>,
  id: WhiteboardDockPanelId,
): ReadonlySet<WhiteboardDockPanelId> {
  const region = WHITEBOARD_PANEL_REGION[id];
  if (open.has(id) && !whiteboardDisplacedPanels(open, id).length) return open;
  const next = new Set<WhiteboardDockPanelId>();
  for (const candidate of open) {
    if (WHITEBOARD_PANEL_REGION[candidate] !== region) next.add(candidate);
  }
  next.add(id);
  return next;
}

/** Closes a panel; returns the same instance when nothing changes. */
export function closeWhiteboardDockPanel(
  open: ReadonlySet<WhiteboardDockPanelId>,
  id: WhiteboardDockPanelId,
): ReadonlySet<WhiteboardDockPanelId> {
  if (!open.has(id)) return open;
  const next = new Set(open);
  next.delete(id);
  return next;
}

/** Flips a panel: closes it when open, otherwise opens it exclusively within its dock area. */
export function toggleWhiteboardDockPanel(
  open: ReadonlySet<WhiteboardDockPanelId>,
  id: WhiteboardDockPanelId,
): ReadonlySet<WhiteboardDockPanelId> {
  return open.has(id) ? closeWhiteboardDockPanel(open, id) : openWhiteboardDockPanel(open, id);
}

/**
 * The panels that a requested opening would displace, in table order. Empty when the request is
 * compatible with the current state. The caller can announce the displaced panels instead of closing
 * them silently.
 */
export function whiteboardDisplacedPanels(
  open: ReadonlySet<WhiteboardDockPanelId>,
  id: WhiteboardDockPanelId,
): readonly WhiteboardDockPanelId[] {
  if (open.has(id)) return [];
  const region = WHITEBOARD_PANEL_REGION[id];
  return whiteboardPanelsOfRegion(region).filter((candidate) => candidate !== id && open.has(candidate));
}

/** The nine open flags, derived from one set — the shape `WhiteboardCanvas` renders against. */
export function whiteboardDockFlags(
  open: ReadonlySet<WhiteboardDockPanelId>,
): Readonly<Record<WhiteboardDockPanelId, boolean>> {
  const flags = {} as Record<WhiteboardDockPanelId, boolean>;
  for (const id of Object.keys(WHITEBOARD_PANEL_REGION) as WhiteboardDockPanelId[]) flags[id] = open.has(id);
  return flags;
}
