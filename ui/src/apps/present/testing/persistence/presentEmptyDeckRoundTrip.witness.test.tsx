// WITNESS — `AST-0478` / `AST-0479`, P0, "ohne Seed-Zwang": an **authored empty deck** must survive
// the whole Save → Close → Reopen chain *as an empty deck*, and the reopen must not put the three
// built-in demo slides on screen.
//
// ## Why this witness exists next to `presentDeckPersistence.test.ts`
//
// That file already asserts the reopened *payload* is empty and (since the earlier repair) that the
// reopened *render* is empty too. This witness is deliberately the stricter, narrower statement, and
// it differs in two ways that matter:
//
//   1. It measures the **chain**, not a stage. A document is created empty → written with the
//      shipping canonical writer → read back with the shipping canonical reader → run through the
//      app's own reopen read (`ensurePresentDesign`) → **rendered**. The claim of the audit is about
//      the *reopen*, and only the chained measurement can catch a seed reintroduced at any single
//      stage of it. A test that stops at the serializer is green while the deck on screen is not the
//      deck that was saved — that is exactly the class the audit named.
//   2. The demo-slide markers are read out of `DEFAULT_PRESENT_SLIDES` itself, so changing the seed
//      cannot make the assertion vacuous. `NOT_TESTED` is not claimed as covered anywhere here.
//
// The two "empty" states are distinguished on purpose, because they are not the same thing:
//   * `ensurePresentDesign({ slides: [] })` — a deck with **nought** slides (the reopened empty deck);
//   * `createEmptyPresentDeck(...)`        — the "ohne Seed-Zwang" start: **one** blank slide, no
//     seeded content. Its `title`/`subtitle` are empty by construction, so it also renders no demo
//     slide — but it *has* a slide, and the two cases must not be conflated.
//
// ## Oracle, and what it cannot do
//
// `renderToStaticMarkup` (no jsdom / happy-dom / @testing-library exists in this repository) proves
// what the reopen *puts on screen*. It cannot dispatch a click and cannot prove that a click
// persists anything: **"gerendert ist nicht bedient"**. No acceptance verdict is claimed.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PresentDocumentModel, WorkspaceDocument } from '../../../../shared/contracts/workspace';
import {
  deserializeWorkspaceDocumentCanonical,
  serializeWorkspaceDocumentCanonical,
} from '../../../../platform/workspace/model/workspaceObjectModelDocumentPersistence';
import { ensurePresentDesign } from '../../design/presentDesign';
import { createEmptyPresentDeck } from '../../contracts/presentDeckFactory';
import { DEFAULT_PRESENT_SLIDES } from '../../contracts/types';
import { PresentCanvas } from '../../PresentCanvas';

/** The exact envelope the shell hands the app on reopen. */
const envelope = (presentData: PresentDocumentModel, id = 'present-empty-deck-witness'): WorkspaceDocument => ({
  schema_version: 2,
  id,
  title: 'Authored empty deck',
  kind: 'Present',
  created_at: 1_700_000_000_000,
  modified_at: 1_700_000_000_000,
  version: 1,
  theme_id: 'midnight',
  root_object_ids: [],
  objects: {},
  presentData,
});

/**
 * Save → Close → Reopen through the **shipping** boundary: the platform's own canonical writer and
 * reader, then the app's own reopen read. No second serializer is written for this witness.
 */
function closeAndReopen(model: PresentDocumentModel): PresentDocumentModel {
  const serialized = serializeWorkspaceDocumentCanonical(envelope(model));
  const parsed = deserializeWorkspaceDocumentCanonical(serialized);
  return ensurePresentDesign(parsed.presentData as PresentDocumentModel);
}

/** What the reopen actually puts on screen. */
function renderReopened(model: PresentDocumentModel): string {
  return renderToStaticMarkup(
    createElement(PresentCanvas, {
      document: envelope(model),
      onUpdateDocument: vi.fn(),
      onSelectSelectionType: vi.fn(),
      workspaceDocuments: {},
      networkCapability: 'offline',
      keyVaultUnlocked: false,
    } as never),
  );
}

/** The titles of the built-in demo deck, taken from the seed itself so this cannot go vacuous. */
const DEMO_DECK_TITLES: readonly string[] = DEFAULT_PRESENT_SLIDES.map((slide) => slide.title);

function expectNoDemoSlide(html: string, label: string): void {
  for (const title of DEMO_DECK_TITLES) {
    expect(html, `${label} must not render the built-in demo slide "${title}"`).not.toContain(title);
  }
}

describe('AST-0478/0479 · a reopened EMPTY deck stays empty and is not silently seeded', () => {
  it('a deck with nought slides comes back from Save → Close → Reopen as a deck with nought slides', () => {
    // "An authored empty deck" — nought slides stored in the document.
    const saved = ensurePresentDesign({ slides: [], themes: [], masters: [] });
    expect(saved.slides).toEqual([]);

    const reopened = closeAndReopen(saved);

    // (1) The payload: no demo slide was invented on the way back.
    expect(reopened.slides).toEqual([]);
    expect(reopened).toEqual(saved);

    // (2) The screen: the reopen renders an empty deck, not the three-slide demo deck. This is the
    // claim a serializer-only test cannot make.
    const html = renderReopened(reopened);
    expectNoDemoSlide(html, 'the reopened empty deck');
    expect(html).toContain('data-present-empty-deck="true"');

    // (3) The reopen render agrees with the reopen payload, which is the property the audit asked
    // for: the deck on screen is the deck that was saved.
    const htmlDirect = renderReopened(saved);
    expect(html, 'the render must depend on the reopened payload, not on a seed').toEqual(htmlDirect);
  });

  it('the "ohne Seed-Zwang" start has one blank slide and still no demo content', () => {
    // `createEmptyPresentDeck` is the documented seed-free start: exactly one slide, no content. It is
    // NOT the same state as the nought-slide deck above, and it must not be conflated with it.
    const started = ensurePresentDesign(createEmptyPresentDeck({ slideId: 'blank-start' }));
    expect(started.slides).toHaveLength(1);
    expect(started.slides[0].id).toBe('blank-start');

    const reopened = closeAndReopen(started);
    expect(reopened.slides).toHaveLength(1);
    expect(reopened).toEqual(started);

    const html = renderReopened(reopened);
    expectNoDemoSlide(html, 'the seeded-free blank start');
    // It has a slide, so it must NOT take the nought-slide empty surface.
    expect(html).not.toContain('data-present-empty-deck="true"');
  });

  it('the demo deck is reachable only as an explicit choice, never as a reopen default', () => {
    // The seed itself is legitimate (bootstrap). What is forbidden is reaching it *implicitly* by
    // reopening. Authoring it explicitly must still render it — otherwise the witness above could be
    // satisfied by a renderer that never draws slides at all, which would prove nothing.
    const authored = ensurePresentDesign({ slides: DEFAULT_PRESENT_SLIDES, themes: [], masters: [] });
    const reopened = closeAndReopen(authored);
    expect(reopened.slides).toHaveLength(DEFAULT_PRESENT_SLIDES.length);

    const html = renderReopened(reopened);
    expect(html, 'an explicitly authored demo deck must still be rendered').toContain(DEMO_DECK_TITLES[0]);
    expect(html).not.toContain('data-present-empty-deck="true"');
  });
});
