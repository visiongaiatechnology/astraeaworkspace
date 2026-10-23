// STATUS: PLATIN — source contract for the two irreversible form controls (AST-0844).
//
// `pdfFormDestructiveGuard.test.ts` proves the *decision* is safe, but no test in this project can click a
// rendered button: `ui/package.json` has no jsdom, no happy-dom and no @testing-library, so
// `renderToStaticMarkup` yields markup without event handlers. The link that a click actually reaches the
// gate is therefore pinned where it broke — at the source, with comments removed so that prose about the
// guard cannot satisfy the assertions (the same guard the reachability contract needed).
//
// The defect this pins is an **inverted order**, not a single missing warning: the one confirmation the
// dialog had guarded `form.submit.confirm` (a reversible action), while the two controls that destroy data —
// `flattenPdfForm` and `resetPdfForm` — ran on one click with no question. Each `it` below fails
// independently if only its own control is reverted to the unguarded form:
//
//   * removing the flatten gate reintroduces the identifier `flattenPdfForm` on the surface -> red;
//   * removing the reset gate reintroduces `resetPdfForm` -> red, with the flatten assertions still green.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const readCode = (relative) => readFileSync(path.resolve(here, relative), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/^\s*\/\/.*$/gmu, '');

const modal = readCode('../PdfFormFillerModal.tsx');
const guard = readCode('../model/pdfFormDestructiveGuard.ts');

describe('the surface cannot reach an irreversible form action without the gate (AST-0844)', () => {
  it('holds no reference to the raw flatten action', () => {
    expect(modal).not.toContain('flattenPdfForm');
    // Asserted piecewise rather than as one import statement: the two controls share one import line, and a
    // single statement match made the flatten assertion fail whenever only the reset gate was removed.
    expect(modal).toContain('requestPdfFormFlatten');
    expect(modal).toContain("from './model/pdfFormDestructiveGuard'");
    expect(modal).toContain('onClick={requestFlatten}');
    expect(modal).toContain('requestPdfFormFlatten({');
    expect(modal).toContain('persist(decision.model, pdfWorkflowText(locale, \'form.status.flattened\', { fields: decision.affectedFields }));');
  });

  it('holds no reference to the raw reset action', () => {
    expect(modal).not.toContain('resetPdfForm');
    expect(modal).toContain('onClick={requestReset}');
    expect(modal).toContain('requestPdfFormReset({');
    expect(modal).toContain('persist(decision.model, pdfWorkflowText(locale, \'form.status.reset\', { fields: decision.affectedFields }));');
  });

  it('asks through the platform confirmation, not through a toast or a silent status', () => {
    // The file already used this instrument for the reversible submit; the irreversible actions now use it too.
    expect(modal.match(/confirm: \(message\) => window\.confirm\(message\)/gu) ?? []).toHaveLength(2);
    expect(modal).toContain("pdfWorkflowText(locale, 'form.flatten.confirm', { fields })");
    expect(modal).toContain("pdfWorkflowText(locale, 'form.reset.confirm', { fields })");
    // Every path of both controls reports in a live region.
    expect(modal).toContain('role="status" aria-live="polite"');
    expect(modal).toContain("'form.status.flattenCancelled'");
    expect(modal).toContain("'form.status.nothingToFlatten'");
    expect(modal).toContain("'form.status.resetCancelled'");
    expect(modal).toContain("'form.status.nothingToReset'");
  });
});

describe('the gate owns the decision and delegates the fact (one rule per fact)', () => {
  it('delegates both effects to the domain functions instead of re-implementing them', () => {
    expect(guard).toContain("import { flattenPdfForm, normalizePdfFormFields, resetPdfForm } from './pdfAcroFormModel';");
    expect(guard).toContain('flattenPdfForm)');
    expect(guard).toContain('resetPdfForm)');
    // A second flatten would have to clear the fields itself; a second default rule would rebuild the values.
    expect(guard).not.toContain('formFields: []');
    expect(guard).not.toContain('defaultValue');
  });

  it('asks before it applies, and refuses on anything but an explicit true', () => {
    const ask = guard.indexOf('confirm(message) !== true');
    const apply = guard.indexOf('apply(model)');
    expect(ask).toBeGreaterThan(-1);
    expect(apply).toBeGreaterThan(ask);
    // The empty case returns the untouched model before any question is asked.
    expect(guard).toContain('if (!(affectedFields > 0)) return { outcome: \'nothing-to-do\', model, message, affectedFields };');
  });
});
