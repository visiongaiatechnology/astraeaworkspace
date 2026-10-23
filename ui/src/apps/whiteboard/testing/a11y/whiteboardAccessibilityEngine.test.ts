import { describe, expect, it } from 'vitest';
import { WHITEBOARD_OBJECTS_COPY } from '../../whiteboardObjectsLocale';
import {
  describeWhiteboardItem,
  stepWhiteboardKeyboardOrder,
  summarizeWhiteboardSelection,
  whiteboardItemDisplayText,
  whiteboardItemTypeLabel,
  whiteboardKeyboardOrder,
} from '../../a11y/whiteboardAccessibilityEngine';
import type { WhiteboardItem } from '../../types';

const sticky = (overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id: 'sticky-1',
  type: 'sticky',
  x: 120,
  y: 260,
  width: 180,
  height: 140,
  text: 'Local first',
  color: 'cyan',
  ...overrides,
});

describe('Whiteboard accessibility descriptions', () => {
  it('describes type, geometry and every state in words rather than colour', () => {
    const description = describeWhiteboardItem(sticky({ locked: true, hidden: true, groupId: 'g1' }), 'en-US', { selected: true });
    expect(description).toContain(WHITEBOARD_OBJECTS_COPY['en-US'].describeSelected);
    expect(description).toContain(WHITEBOARD_OBJECTS_COPY['en-US'].describeLocked);
    expect(description).toContain(WHITEBOARD_OBJECTS_COPY['en-US'].describeHidden);
    expect(description).toContain(WHITEBOARD_OBJECTS_COPY['en-US'].describeGrouped);
    expect(description).toContain('120');
    expect(description).toContain('180');
    expect(description).toContain('Local first');
    expect(description).not.toContain('#');
  });

  it('localizes the description for every supported locale', () => {
    for (const locale of ['en-US', 'de-DE', 'ja-JP', 'zh-CN'] as const) {
      const description = describeWhiteboardItem(sticky({ locked: true }), locale);
      expect(description, locale).toContain(WHITEBOARD_OBJECTS_COPY[locale].describeLocked);
      expect(description.length, locale).toBeGreaterThan(0);
    }
  });

  it('names connectors by their endpoints and strips control characters', () => {
    const connector: WhiteboardItem = {
      id: 'edge', type: 'connector', x: 0, y: 0, width: 1, height: 1, text: '',
      fromId: 'a', toId: 'b', lineLabel: 'Flow\u0000',
    };
    const description = describeWhiteboardItem(connector, 'en-US');
    expect(description).toContain('a → b');
    expect(description).not.toContain('\u0000');
    expect(whiteboardItemTypeLabel(connector, 'en-US')).toBe(WHITEBOARD_OBJECTS_COPY['en-US'].objectConnector);
  });

  it('falls back through text, rich payload and label fields', () => {
    expect(whiteboardItemDisplayText(sticky())).toBe('Local first');
    expect(whiteboardItemDisplayText({ id: 'c', type: 'card', x: 0, y: 0, width: 10, height: 10, text: '', card: { cardKind: 'task', title: 'Sprint card' } })).toBe('Sprint card');
    expect(whiteboardItemDisplayText({ id: 'd', type: 'chart', x: 0, y: 0, width: 10, height: 10, text: '', chart: { chartKind: 'bar', labels: [], values: [], title: 'Revenue' } })).toBe('Revenue');
  });
});

describe('Whiteboard keyboard object order', () => {
  const items: WhiteboardItem[] = [
    sticky({ id: 'bottom', zIndex: 1 }),
    sticky({ id: 'top', zIndex: 9 }),
    sticky({ id: 'hidden', hidden: true }),
    sticky({ id: 'tie-a', zIndex: 5 }),
    sticky({ id: 'tie-b', zIndex: 5 }),
  ];

  it('lists topmost objects first and never lists hidden ones', () => {
    expect(whiteboardKeyboardOrder(items).map((entry) => entry.id)).toEqual(['top', 'tie-a', 'tie-b', 'bottom']);
  });

  it('steps through the list and stops at both ends', () => {
    const order = whiteboardKeyboardOrder(items);
    expect(stepWhiteboardKeyboardOrder(order, null, 1)?.id).toBe('top');
    expect(stepWhiteboardKeyboardOrder(order, null, -1)?.id).toBe('bottom');
    expect(stepWhiteboardKeyboardOrder(order, 'top', -1)).toBeNull();
    expect(stepWhiteboardKeyboardOrder(order, 'bottom', 1)).toBeNull();
    expect(stepWhiteboardKeyboardOrder(order, 'top', 1)?.id).toBe('tie-a');
    expect(stepWhiteboardKeyboardOrder([], 'top', 1)).toBeNull();
  });

  it('summarizes the current selection for a live region', () => {
    const summary = summarizeWhiteboardSelection(items, ['top', 'bottom'], 'en-US');
    expect(summary).toContain('Local first');
    expect(summarizeWhiteboardSelection(items, [], 'en-US')).toBe('');
  });
});
