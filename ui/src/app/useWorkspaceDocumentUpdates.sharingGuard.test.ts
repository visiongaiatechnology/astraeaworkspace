import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

// The wiring of the `sharing.write` boundary — the one part of rounds 176-178 that had no test.
//
// ## Why this test reads source instead of driving the hook
//
// `useWorkspaceDocumentUpdates` returns a `useCallback`; calling it needs a React render with a hook
// dispatcher, and this environment has no jsdom (round 159 measured that directly: `WriterEditor` has hooks
// and `Cannot read properties of null (reading 'useState')`). The same constraint is why the DEF-RE-005
// regression test reads class names rather than rendering the toolbar.
//
// **What this test can prove is exactly what was in doubt:** whether the decision happens *before*
// `setDocuments`, and whether both writer-link propagations are actually gated. **A guard that exists but is
// called after the propagation, or a propagation that ignores its result, is a decoration** — and both are
// visible in the source.
//
// **Mutation-proven:** removing either `sharing.allowed &&` or the `if (sharing.allowed)` block makes this red.

const SOURCE = path.resolve(__dirname, 'useWorkspaceDocumentUpdates.ts');
const source = fs.readFileSync(SOURCE, 'utf8');

/** Index of a needle, asserting it exists — a missing anchor is a failed test, not a silent pass. */
function at(needle: string): number {
  const index = source.indexOf(needle);
  expect(index, `expected to find ${JSON.stringify(needle)} in the source`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('sharing.write is enforced in the propagation path', () => {
  it('asks for the decision before opening the state updater', () => {
    // React requires a state updater to be pure and synchronous, so the decision cannot be inside it. If
    // `mayPropagateSharing()` ever moves below `setDocuments(`, the decision would be taken while the state
    // is already being recomputed - and the propagation it guards would already be under way.
    const decision = at('mayPropagateSharing()');
    const updater = at('setDocuments(');
    expect(decision, 'the decision must precede the state updater').toBeLessThan(updater);
  });

  it('gates the Grid link propagation on the decision', () => {
    // `refreshWriterGridLinks` is the `sharing.write` operation measured in round 174.
    expect(source, 'the grid-link propagation must be gated').toContain(
      "if (sharing.allowed && object.type === 'Table' && updatedDoc.kind === 'Grid')",
    );
  });

  it('gates the workspace-embed propagation on the decision', () => {
    // `refreshWriterWorkspaceEmbeds` is the second writer-link propagation in the same updater.
    expect(source, 'the embed propagation must be gated').toContain('if (sharing.allowed) {');
    const gate = at('if (sharing.allowed) {');
    const embed = at('refreshWriterWorkspaceEmbeds(');
    expect(gate, 'the gate must precede the embed propagation').toBeLessThan(embed);
  });

  it('does not gate the fabric propagation - that was never measured as sharing.write', () => {
    // `propagateFabricUpdates` handles Chart/Table objects. It was not measured as a sharing operation, and
    // gating it would be a guess. If someone later decides it is one, they must change this test too - which
    // is the point: the decision gets recorded instead of happening silently.
    expect(source).toContain('propagateFabricUpdates(');
    const fabric = at('propagateFabricUpdates(');
    const firstGate = at('sharing.allowed');
    expect(fabric, 'the fabric propagation must stay ungated').toBeLessThan(firstGate);
  });

  it('imports the guard from the cache, not from the decision module directly', () => {
    // The decision module is pure and takes an answer; the cache is what supplies one synchronously. Importing
    // `decideSharingPropagation` here would mean the caller has an answer to pass - and there is none in a
    // state updater.
    expect(source).toContain("import { mayPropagateSharing } from './liveLinkSharingCache';");
    expect(source, 'the pure decision must not be imported into the hook').not.toContain(
      "from './liveLinkSharingPolicy'",
    );
  });
});
