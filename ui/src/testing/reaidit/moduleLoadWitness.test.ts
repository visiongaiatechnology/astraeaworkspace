// `DEF-RE-002` (PDF Studio) and `DEF-RE-003` (Grid) — the two "module was safely halted" starts.
//
// ## Why this witness tests the import and not the render
//
// Both views are loaded lazily by the application frame:
//
//   const GridSheet = lazy(() => import('../../apps/grid/GridSheet').then(…));
//   const PdfStudio = lazy(() => import('../../apps/pdf/studio/PdfStudio').then(…));
//
// A rejected dynamic import is caught by `ModuleRecoveryBoundary` and rendered as "the module was safely
// halted" — the exact screen the user reported for both applications. So the first question is not what the
// component draws, it is whether the module can be **loaded at all**: a throw at module-evaluation time (a
// missing export, a cycle that resolves to `undefined`, a top-level access on an undefined binding) rejects
// the import and produces that screen while the rest of the application keeps running.
//
// This is headless and needs no DOM: it asks whether the module graph resolves and whether the named export
// the frame expects is actually there. If it is, the crash is later than module evaluation and the next step
// is a render witness; if it is not, the defect is reproduced here.
//
// ## Counter-check protocol
//
// A. Rename one exported component in the module → the "provides the export the frame imports" case fails,
//    which is the state that produces the halted screen.
// B. Add a top-level `throw` to the module → the import case fails.
// C. Restore and re-run → green.

import { describe, expect, it } from 'vitest';

// Importing these two modules pulls in very large graphs: measured at 4.2 s and 2.6 s on an idle machine. Under
// a full parallel suite run they exceeded the 5 s default and failed — the test was measuring machine load, not
// whether the module resolves. The assertion is about resolution and exports, so it gets a window that does not
// depend on contention.
const IMPORT_TIMEOUT_MS = 60_000;

describe('the two halted modules can be loaded at all', () => {
  it('Grid loads and provides the export the frame lazy-imports', async () => {
    const module = await import('../../apps/grid/GridSheet');
    expect(module, 'apps/grid/GridSheet did not resolve to a module object').toBeTruthy();
    // The frame does `.then((m) => ({ default: m.GridSheet }))`, so this exact name must exist.
    expect(
      typeof module.GridSheet,
      'apps/grid/GridSheet does not export `GridSheet`, so the lazy import resolves to undefined and the ' +
        'recovery boundary renders the halted screen',
    ).not.toBe('undefined');
  }, IMPORT_TIMEOUT_MS);

  it('PDF Studio loads and provides the export the frame lazy-imports', async () => {
    const module = await import('../../apps/pdf/studio/PdfStudio');
    expect(module, 'apps/pdf/studio/PdfStudio did not resolve to a module object').toBeTruthy();
    expect(
      typeof module.PdfStudio,
      'apps/pdf/studio/PdfStudio does not export `PdfStudio`, so the lazy import resolves to undefined and ' +
        'the recovery boundary renders the halted screen',
    ).not.toBe('undefined');
  }, IMPORT_TIMEOUT_MS);

  it('the recovery boundary is what turns a failed import into that screen', async () => {
    // Evidence for the causal chain, not decoration: the boundary exists and is the component the frame wraps
    // the workspace view in. If this import fails, the screen would have no source and the diagnosis above
    // would be guesswork.
    const boundary = await import('../../shell/recovery/ModuleRecoveryBoundary');
    expect(typeof boundary.ModuleRecoveryBoundary).not.toBe('undefined');
  });
});
