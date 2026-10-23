import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { normalizeWhiteboardFacilitationState } from '../../model/whiteboardFacilitationEngine';
import { WhiteboardFacilitationPanel } from '../../tools/WhiteboardFacilitationPanel';
import type { WhiteboardItem } from '../../types';

function item(id: string): WhiteboardItem {
  return { id, type: 'sticky', x: 0, y: 0, width: 100, height: 80, text: id };
}

function renderPanel(items: WhiteboardItem[], selectedIds: readonly string[], state = normalizeWhiteboardFacilitationState()): string {
  return renderToStaticMarkup(
    <WhiteboardFacilitationPanel
      items={items}
      selectedIds={selectedIds}
      state={state}
      presenterViewport={{ x: 0, y: 0, zoom: 1 }}
      voterId="session-1"
      voterName="Ada"
      updateState={() => undefined}
      updateItemsAndState={() => false}
      addReaction={() => undefined}
      onClose={() => undefined}
      showToast={() => undefined}
    />,
  );
}

describe('Whiteboard facilitation panel render contract', () => {
  it('exposes a named responsive region and labelled timer and prompt controls', () => {
    const markup = renderPanel([], []);
    expect(markup).toContain('role="region" aria-labelledby="whiteboard-facilitation-title"');
    expect(markup).toContain('id="whiteboard-facilitation-title"');
    expect(markup).toContain('w-[calc(100vw-2.5rem)]');
    expect(markup).toContain('id="whiteboard-facilitation-timer-minutes"');
    expect(markup).toContain('for="whiteboard-facilitation-timer-minutes"');
    expect(markup).toContain('id="whiteboard-facilitation-voting-prompt"');
    expect(markup).toContain('for="whiteboard-facilitation-voting-prompt"');
    expect(markup).not.toContain('role="dialog"');
  });

  it('disables selection actions when no non-connector options exist', () => {
    const markup = renderPanel([], []);
    expect(markup).toMatch(/disabled=""[^>]*>\s*Start vote from selection \(0\)/u);
    const lockLabel = markup.indexOf('Lock background');
    expect(markup.slice(markup.lastIndexOf('<button', lockLabel), lockLabel)).toContain('disabled=""');
    expect(markup).toContain('Select one or more non-connector objects on the canvas');
  });

  it('blocks action selections above the documented model limits', () => {
    const voteItems = Array.from({ length: 129 }, (_, index) => item(`vote-${index}`));
    const voteMarkup = renderPanel(voteItems, voteItems.map(({ id }) => id));
    expect(voteMarkup).toContain('A vote can include up to 128 options.');
    expect(voteMarkup).toMatch(/disabled=""[^>]*>\s*Start vote from selection \(129\)/u);

    const workshopItems = Array.from({ length: 2_001 }, (_, index) => item(`workshop-${index}`));
    const workshopMarkup = renderPanel(workshopItems, workshopItems.map(({ id }) => id));
    expect(workshopMarkup).toContain('Workshop object actions support up to 2000 selected objects.');
    const lockLabel = workshopMarkup.indexOf('Lock background');
    expect(workshopMarkup.slice(workshopMarkup.lastIndexOf('<button', lockLabel), lockLabel)).toContain('disabled=""');
  });

  it('renders object labels as escaped React text and marks the local vote state', () => {
    const item: WhiteboardItem = { id: 'option-1', type: 'sticky', x: 0, y: 0, width: 100, height: 80, text: '<img src=x onerror=alert(1)>' };
    const state = normalizeWhiteboardFacilitationState({
      voting: {
        id: 'vote-1', prompt: 'Choose', targetIds: ['option-1'], anonymous: false, status: 'open', startedAt: 1,
        ballots: [{ id: 'session-1', targetId: 'option-1', actorLabel: 'Ada' }],
      },
    });
    const markup = renderPanel([item], ['option-1'], state);
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img src=x');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('Your vote can be changed while the poll is open.');
  });
});
