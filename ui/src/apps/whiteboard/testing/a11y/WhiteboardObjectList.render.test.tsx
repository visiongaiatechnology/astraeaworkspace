import { describe, expect, it } from 'vitest';
import { WHITEBOARD_OBJECTS_COPY } from '../../whiteboardObjectsLocale';
import { WhiteboardObjectList } from '../../a11y/WhiteboardObjectList';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';
import type { WhiteboardItem } from '../../types';

/** One locale per render, pinned through the real provider — no shared module mock. */
const LOCALE = 'en-US' as const;
const copy = WHITEBOARD_OBJECTS_COPY[LOCALE];
const noop = (): void => undefined;
const items: WhiteboardItem[] = [
  { id: 'frame-1', type: 'frame', x: 0, y: 0, width: 400, height: 300, text: 'Architecture', zIndex: 1 },
  { id: 'sticky-1', type: 'sticky', x: 20, y: 20, width: 180, height: 140, text: 'Workshop note', color: 'yellow', zIndex: 5 },
  { id: 'locked-1', type: 'process', x: 240, y: 40, width: 160, height: 80, text: 'Gateway', locked: true, zIndex: 4 },
];

describe('Whiteboard keyboard object list', () => {
  it('renders a keyboard listbox with one option per visible object in reverse paint order', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardObjectList items={items} selectedIds={['sticky-1']} onSelect={noop} onNavigate={noop} onClose={noop} />,
      LOCALE,
    );
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain(`aria-label="${copy.objectList}"`);
    expect(markup).toContain(copy.objectListHint);
    expect(markup).toContain('data-whiteboard-object="sticky-1"');
    expect(markup).toContain('data-whiteboard-object="locked-1"');
    expect(markup).toContain('data-whiteboard-object="frame-1"');
    // Topmost first: the selection is on the sticky, the locked process sits below it in paint order.
    expect(markup.indexOf('data-whiteboard-object="sticky-1"')).toBeLessThan(markup.indexOf('data-whiteboard-object="frame-1"'));
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('aria-selected="false"');
  });

  it('exposes the object description as the accessible name, including state words', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardObjectList items={items} selectedIds={[]} onSelect={noop} onNavigate={noop} onClose={noop} />,
      LOCALE,
    );
    expect(markup).toContain('Workshop note');
    expect(markup).toContain(copy.describeLocked);
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('tabindex="-1"');
  });

  it('states the empty board instead of rendering an empty list', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardObjectList items={[]} selectedIds={[]} onSelect={noop} onNavigate={noop} onClose={noop} />,
      LOCALE,
    );
    expect(markup).toContain(`${copy.objects}: 0`);
  });
});
