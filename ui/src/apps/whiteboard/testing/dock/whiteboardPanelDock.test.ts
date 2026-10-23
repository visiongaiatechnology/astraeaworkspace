// STATUS: DIAMANT VGT SUPREME
//
// Ergänzung 7 §4 — „Whiteboard hat keine überlappenden oder unzugänglichen Werkzeugleisten."
//
// Der Zustandsvertrag des Docks: **höchstens ein Panel je Bereich**, erschöpfend über alle Teilmengen
// der neun Panels, mit Mutationskontrolle. Rein — kein React, kein DOM, kein Browser.
//
// ## Die ehrliche Grenze
//
// Dieser Test fängt Verstösse gegen das Slot-Modell. Er **beweist keine Überlappungsfreiheit**: ob zwei
// gerenderte Kästen sich wirklich berühren, entscheidet nur eine Layout-Engine. Die Umgebung hat keine
// (kein jsdom, kein happy-dom — belegt in `ui/vite.config.ts` und im Modul selbst). Was fehlt, steht in
// `testing/dock/whiteboardPanelDockReachability.test.ts` und im Bericht.

import { describe, expect, it } from 'vitest';
import {
  closeWhiteboardDockPanel,
  openWhiteboardDockPanel,
  toggleWhiteboardDockPanel,
  whiteboardDisplacedPanels,
  whiteboardDockFlags,
  whiteboardPanelsOfRegion,
  WHITEBOARD_DOCK_REGIONS,
  WHITEBOARD_PANEL_REGION,
  type WhiteboardDockPanelId,
} from '../../state/whiteboardPanelDock';

const PANELS = Object.keys(WHITEBOARD_PANEL_REGION) as WhiteboardDockPanelId[];

/** Every subset of the nine panels — 2⁹ = 512 states. */
function allSubsets(): ReadonlySet<WhiteboardDockPanelId>[] {
  const subsets: ReadonlySet<WhiteboardDockPanelId>[] = [];
  for (let mask = 0; mask < 2 ** PANELS.length; mask += 1) {
    const open = new Set<WhiteboardDockPanelId>();
    for (let index = 0; index < PANELS.length; index += 1) {
      if ((mask & (1 << index)) !== 0) open.add(PANELS[index]);
    }
    subsets.push(open);
  }
  return subsets;
}

const SUBSETS = allSubsets();

/** The property under test, stated independently of the implementation: at most one panel per area. */
function holdsContract(open: ReadonlySet<WhiteboardDockPanelId>): boolean {
  return WHITEBOARD_DOCK_REGIONS.every(
    (region) => whiteboardPanelsOfRegion(region).filter((id) => open.has(id)).length <= 1,
  );
}

/**
 * MUTATIONSKONTROLLE — the naive union. This is the implementation that was in the tree: nine
 * independent booleans, so opening a panel added it and closed nothing.
 */
function naiveUnion(
  open: ReadonlySet<WhiteboardDockPanelId>,
  id: WhiteboardDockPanelId,
): ReadonlySet<WhiteboardDockPanelId> {
  const next = new Set(open);
  next.add(id);
  return next;
}

describe('Whiteboard-Dock — der Zustandsvertrag', () => {
  it('covers all 2^9 subsets', () => {
    expect(PANELS.length).toBe(9);
    expect(SUBSETS.length).toBe(512);
  });

  it('opens into the contract from any state and any panel, and the check is not vacuous', () => {
    let evaluated = 0;
    let legalStatesPreserved = 0;
    let mutationViolations = 0;
    for (const open of SUBSETS) {
      for (const id of PANELS) {
        // Every case is looked at — a silently skipped case would make the counters below meaningless.
        evaluated += 1;
        const legalInput = holdsContract(open);
        if (legalInput && holdsContract(openWhiteboardDockPanel(open, id))) legalStatesPreserved += 1;
        // The oracle must be able to say no — otherwise the sweep above proves nothing.
        if (!holdsContract(naiveUnion(open, id))) mutationViolations += 1;
      }
    }
    expect(evaluated).toBe(SUBSETS.length * PANELS.length);
    // Legal states are preserved: 432 of the 4608 (subset, panel) cases start in a legal state, and
    // every one of them stays legal. The oracle discriminates — 432 < 4608 — so the sweep is not a
    // constant function, and 4408 (subset, panel) cases violate the naive union.
    expect(legalStatesPreserved).toBe(SUBSETS.filter(holdsContract).length * PANELS.length);
    expect(legalStatesPreserved).toBe(432);
    expect(legalStatesPreserved).toBeLessThan(evaluated);
    expect(mutationViolations).toBe(4408);
  });

  it('names every violated state of the naive union and none of the real contract', () => {
    // Derived per construction: the naive union violates the contract exactly when `open` already
    // holds a *different* panel of the same area.
    let expected = 0;
    let actual = 0;
    for (const open of SUBSETS) {
      for (const id of PANELS) {
        const region = WHITEBOARD_PANEL_REGION[id];
        const displaced = [...open].filter((candidate) => candidate !== id && WHITEBOARD_PANEL_REGION[candidate] === region);
        if (displaced.length > 0) {
          expected += 1;
          if (!holdsContract(naiveUnion(open, id))) actual += 1;
        }
      }
    }
    expect(actual).toBe(expected);
    expect(expected).toBeGreaterThan(0);
    // The real contract stays inside itself — in the same exhaustive sweep. The claim is deliberately
    // *contract-preserving*, not *contract-repairing*: states that already hold two panels of one area
    // are unreachable through this function (`openWhiteboardDockPanel` never adds a second one), so
    // asserting repair would claim more than the function does.
    for (const open of SUBSETS.filter(holdsContract)) {
      for (const id of PANELS) {
        expect(holdsContract(openWhiteboardDockPanel(open, id)), `${id} broke a legal state`).toBe(true);
      }
    }
  });

  it('MUTATIONSKONTROLLE: the naive union on empty state is exactly one panel too many', () => {
    const empty = new Set<WhiteboardDockPanelId>();
    const rightTop = whiteboardPanelsOfRegion('right-top');
    expect(rightTop.length).toBeGreaterThan(1);
    const both = naiveUnion(openWhiteboardDockPanel(empty, rightTop[0]), rightTop[1]);
    expect(holdsContract(both)).toBe(false);
    expect(holdsContract(openWhiteboardDockPanel(openWhiteboardDockPanel(empty, rightTop[0]), rightTop[1]))).toBe(true);
  });

  it('never puts two panels of one area in the same state — every state reachable by any click sequence', () => {
    // Reachability, not enumeration: from the empty board, follow every click sequence up to length 4
    // and assert the contract at every step.
    let visited = 0;
    const walk = (open: ReadonlySet<WhiteboardDockPanelId>, depth: number): void => {
      expect(holdsContract(open)).toBe(true);
      visited += 1;
      if (depth === 0) return;
      for (const id of PANELS) walk(toggleWhiteboardDockPanel(open, id), depth - 1);
    };
    walk(new Set<WhiteboardDockPanelId>(), 4);
    expect(visited).toBeGreaterThan(512);
  });

  it('closes within one area only, and leaves the other areas untouched', () => {
    for (const open of SUBSETS) {
      for (const id of PANELS) {
        const opened = openWhiteboardDockPanel(open, id);
        for (const other of PANELS) {
          if (other === id) continue;
          if (WHITEBOARD_PANEL_REGION[other] === WHITEBOARD_PANEL_REGION[id]) continue;
          expect(opened.has(other), `${id} must not touch ${other}`).toBe(open.has(other));
        }
      }
    }
  });

  it('toggles cleanly: open→close→open and close→open are exact inverses on the panel itself', () => {
    for (const open of SUBSETS) {
      for (const id of PANELS) {
        const closed = toggleWhiteboardDockPanel(open, id);
        expect(closed.has(id)).toBe(!open.has(id));
        const reopened = toggleWhiteboardDockPanel(closed, id);
        expect(reopened.has(id)).toBe(open.has(id));
      }
    }
  });

  it('returns the same instance for a no-op, so React does not re-render', () => {
    const open = openWhiteboardDockPanel(new Set<WhiteboardDockPanelId>(), 'navigator');
    expect(openWhiteboardDockPanel(open, 'navigator')).toBe(open);
    expect(closeWhiteboardDockPanel(open, 'object-list')).toBe(open);
    expect(toggleWhiteboardDockPanel(open, 'navigator').has('navigator')).toBe(false);
  });

  it('reports the displaced panels of the requested area, and only those', () => {
    const open = openWhiteboardDockPanel(openWhiteboardDockPanel(new Set<WhiteboardDockPanelId>(), 'navigator'), 'object-list');
    expect(whiteboardDisplacedPanels(open, 'live-objects')).toEqual(['navigator']);
    expect(whiteboardDisplacedPanels(open, 'navigator')).toEqual([]);
    expect(whiteboardDisplacedPanels(open, 'object-list')).toEqual([]);
    // A different area displaces nothing: object list + working panel stay usable simultaneously.
    expect(whiteboardDisplacedPanels(open, 'templates')).toEqual([]);
    expect(openWhiteboardDockPanel(open, 'templates').has('navigator')).toBe(true);
  });

  it('keeps the "save location" and "present frames" openings from silently losing the panel', () => {
    // `WhiteboardCanvas` announces a displacement instead of closing silently. The contract exposes it.
    const open = openWhiteboardDockPanel(new Set<WhiteboardDockPanelId>(), 'facilitation');
    const afterNavigate = openWhiteboardDockPanel(open, 'navigator');
    expect(whiteboardDisplacedPanels(open, 'navigator')).toEqual(['facilitation']);
    expect(afterNavigate.has('facilitation')).toBe(false);
    expect(afterNavigate.has('navigator')).toBe(true);
  });

  it('derives the nine flags from one set', () => {
    const open = openWhiteboardDockPanel(openWhiteboardDockPanel(new Set<WhiteboardDockPanelId>(), 'object-list'), 'templates');
    const flags = whiteboardDockFlags(open);
    expect(flags['object-list']).toBe(true);
    expect(flags.templates).toBe(true);
    expect(Object.keys(flags).sort()).toEqual([...PANELS].sort());
    expect(PANELS.filter((id) => flags[id])).toHaveLength(2);
  });

  it('closes a panel that is not open without inventing state', () => {
    const empty = new Set<WhiteboardDockPanelId>();
    expect(closeWhiteboardDockPanel(empty, 'object-list').size).toBe(0);
    expect(toggleWhiteboardDockPanel(empty, 'object-list').has('object-list')).toBe(true);
  });
});
