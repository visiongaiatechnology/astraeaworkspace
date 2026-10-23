// STATUS: PLATIN — mini-map durable state: the canonical, persisted board locations (AST-1088).
import { describe, expect, it } from 'vitest';
import { WhiteboardMiniMap } from '../../minimap/WhiteboardMiniMap';
import { WHITEBOARD_OBJECTS_COPY, whiteboardObjectsTemplate } from '../../whiteboardObjectsLocale';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';
import { normalizeWhiteboardViewConfig } from '../../viewport/whiteboardViewportEngine';

/** One locale per render, pinned through the real provider — no shared module mock. */
const LOCALE = 'en-US' as const;
const copy = WHITEBOARD_OBJECTS_COPY[LOCALE];
const noop = (): void => undefined;
const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

describe('Whiteboard mini-map saved locations', () => {
  it('renders the persisted board locations as keyboard reachable controls', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardMiniMap
        items={[]}
        viewportBounds={bounds}
        onNavigate={noop}
        bookmarks={[
          { id: 'loc-1', name: 'Kickoff', x: 120, y: 60, zoom: 0.5 },
          { id: 'loc-2', name: 'Architecture', x: 900, y: 400, zoom: 1 },
        ]}
        onSaveBookmark={noop}
        onNavigateBookmark={noop}
        onRemoveBookmark={noop}
      />,
      LOCALE,
    );
    expect(markup).toContain('data-vgt-whiteboard-minimap-bookmarks="true"');
    expect(markup).toContain(copy.mapBookmarks);
    expect(markup).toContain(copy.saveBookmark);
    expect(markup).toContain('Kickoff');
    expect(markup).toContain('Architecture');
    expect(markup).toContain(`aria-label="${whiteboardObjectsTemplate('gotoBookmark', LOCALE, { name: 'Kickoff' })}"`);
    expect(markup).toContain(`aria-label="${whiteboardObjectsTemplate('removeBookmark', LOCALE, { name: 'Architecture' })}"`);
    expect(markup).toContain('<button');
  });

  it('states the empty case instead of rendering nothing', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardMiniMap items={[]} viewportBounds={bounds} onNavigate={noop} bookmarks={[]} onSaveBookmark={noop} />,
      LOCALE,
    );
    expect(markup).toContain(copy.noBookmarks);
  });

  it('renders no bookmark section when the canvas does not offer the canonical actions', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardMiniMap items={[]} viewportBounds={bounds} onNavigate={noop} />,
      LOCALE,
    );
    expect(markup).not.toContain('data-vgt-whiteboard-minimap-bookmarks="true"');
  });

  it('survives the canonical view-config round trip, so the locations are really persisted (AST-1043)', () => {
    const view = normalizeWhiteboardViewConfig({
      bookmarks: [{ id: 'loc-1', name: 'Kickoff', x: 120, y: 60, zoom: 0.5 }],
    });
    const markup = renderWithWhiteboardLocale(
      <WhiteboardMiniMap items={[]} viewportBounds={bounds} onNavigate={noop} bookmarks={view.bookmarks} onSaveBookmark={noop} />,
      LOCALE,
    );
    expect(markup).toContain(view.bookmarks[0].name);
  });
});
