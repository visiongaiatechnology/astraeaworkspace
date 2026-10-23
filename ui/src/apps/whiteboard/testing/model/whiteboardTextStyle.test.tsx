// STATUS: PLATIN — the typography contract: bounded values, one formatter, and a caller in every renderer.
import { describe, expect, it } from 'vitest';
import {
  WHITEBOARD_TEXT_ALIGNS,
  WHITEBOARD_TEXT_FAMILIES,
  WHITEBOARD_TEXT_SIZE_MAX,
  WHITEBOARD_TEXT_SIZE_MIN,
  WHITEBOARD_TEXT_WEIGHTS,
  WHITEBOARD_TEXT_STYLE_DEFAULTS,
  normalizeWhiteboardTextStyle,
  setWhiteboardTextStyle,
  whiteboardItemSupportsTextStyle,
  whiteboardTextRenderParams,
  whiteboardTextStyleForItem,
} from '../../model/whiteboardTextStyleEngine';
import { normalizeWhiteboardRichObject } from '../../model/whiteboardObjectEngine';
import { WhiteboardTextToolbar } from '../../toolbar/WhiteboardTextToolbar';
import { WhiteboardItemsRenderer } from '../../objects/WhiteboardItemsRenderer';
import { renderWhiteboardProjectionToSvg } from '../../interchange/whiteboardSvgRenderProjection';
import { WHITEBOARD_OBJECTS_COPY } from '../../whiteboardObjectsLocale';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';
import type { WhiteboardItem } from '../../types';

const noop = (): void => undefined;
/** One locale per render, pinned through the real provider — no shared module mock. */
const LOCALE = 'en-US' as const;

const sticky = (overrides: Partial<WhiteboardItem> = {}): WhiteboardItem => ({
  id: 'sticky-1', type: 'sticky', x: 0, y: 0, width: 180, height: 140, text: 'Note', color: 'yellow', ...overrides,
});

describe('Whiteboard text style contract', () => {
  it('documents exactly one list of allowed values', () => {
    expect(WHITEBOARD_TEXT_WEIGHTS).toEqual(['normal', 'bold']);
    expect(WHITEBOARD_TEXT_FAMILIES).toEqual(['sans', 'serif', 'mono']);
    expect(WHITEBOARD_TEXT_ALIGNS).toEqual(['left', 'center', 'right']);
    expect(WHITEBOARD_TEXT_STYLE_DEFAULTS).toEqual({ fontSize: 14, fontWeight: 'normal', fontFamily: 'sans', align: 'left' });
  });

  it('clamps the size and replaces unknown values with the documented defaults', () => {
    expect(normalizeWhiteboardTextStyle({ fontSize: 5 }).fontSize).toBe(WHITEBOARD_TEXT_SIZE_MIN);
    expect(normalizeWhiteboardTextStyle({ fontSize: 10_000 }).fontSize).toBe(WHITEBOARD_TEXT_SIZE_MAX);
    expect(normalizeWhiteboardTextStyle({ fontSize: 18.26 }).fontSize).toBe(18.3);
    expect(normalizeWhiteboardTextStyle({ fontWeight: 'heavy' as 'bold' }).fontWeight).toBe('normal');
    expect(normalizeWhiteboardTextStyle({ fontFamily: 'comic' as 'sans' }).fontFamily).toBe('sans');
    expect(normalizeWhiteboardTextStyle({ align: 'justify' as 'left' }).align).toBe('left');
    expect(normalizeWhiteboardTextStyle(undefined)).toEqual(WHITEBOARD_TEXT_STYLE_DEFAULTS);
    expect(normalizeWhiteboardTextStyle({ fontSize: Number.NaN }).fontSize).toBe(WHITEBOARD_TEXT_STYLE_DEFAULTS.fontSize);
  });

  it('applies a patch only to supported, unlocked, selected objects and bounds the selection', () => {
    const items: WhiteboardItem[] = [
      sticky(),
      sticky({ id: 'locked-1', locked: true }),
      { id: 'ink-1', type: 'ink', x: 0, y: 0, width: 10, height: 10, text: '', ink: { preset: 'pen', inputType: 'pen', color: '#fff', width: 1, opacity: 1, points: [] } },
      { id: 'other-1', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'x' },
    ];
    const patch = { fontSize: 28, fontWeight: 'bold' as const };
    const styled = setWhiteboardTextStyle(items, new Set(['sticky-1', 'locked-1', 'ink-1']), patch);
    expect(styled[0].textStyle).toEqual({ ...WHITEBOARD_TEXT_STYLE_DEFAULTS, ...patch });
    expect(styled[1].textStyle).toBeUndefined();
    expect(styled[2].textStyle).toBeUndefined();
    expect(styled[3]).toBe(items[3]);
    // An empty or unbounded selection is rejected, not truncated silently.
    expect(setWhiteboardTextStyle(items, new Set(), patch)).toBe(items);
    expect(setWhiteboardTextStyle(items, new Set(Array.from({ length: 5_000 }, (_v, i) => `id-${i}`)), patch)).toBe(items);
  });

  it('strips a style from an object kind that cannot paint text', () => {
    const ink = { id: 'ink-1', type: 'ink', x: 0, y: 0, width: 10, height: 10, text: '', textStyle: { fontSize: 20, fontWeight: 'bold', fontFamily: 'sans', align: 'left' } } as WhiteboardItem;
    expect(whiteboardItemSupportsTextStyle(ink)).toBe(false);
    expect(normalizeWhiteboardRichObject(ink).textStyle).toBeUndefined();
    expect(whiteboardTextStyleForItem(ink)).toEqual(WHITEBOARD_TEXT_STYLE_DEFAULTS);
  });

  it('formats every renderer input from one place', () => {
    const params = whiteboardTextRenderParams({ fontSize: 20, fontWeight: 'bold', fontFamily: 'mono', align: 'right' });
    expect(params.canvasFont).toBe('bold 20px ui-monospace, "Cascadia Mono", monospace');
    expect(params.svgFontWeight).toBe('700');
    expect(params.svgTextAnchor).toBe('end');
    expect(whiteboardTextRenderParams(undefined).canvasFont).toBe('14px system-ui, sans-serif');
  });
});

describe('Whiteboard text style surface', () => {
  it('renders the typography toolbar with every control and a localized label', () => {
    const markup = renderWithWhiteboardLocale(
      <WhiteboardTextToolbar selection={[sticky({ textStyle: { fontSize: 20, fontWeight: 'bold', fontFamily: 'serif', align: 'center' } })]} onSetTextStyle={noop} />,
      LOCALE,
    );
    const copy = WHITEBOARD_OBJECTS_COPY[LOCALE];
    expect(markup).toContain('data-vgt-whiteboard-text-toolbar="true"');
    expect(markup).toContain(`aria-label="${copy.textStyle}"`);
    expect(markup).toContain(`aria-label="${copy.fontSize}"`);
    expect(markup).toContain(`aria-label="${copy.fontFamily}"`);
    expect(markup).toContain(`aria-label="${copy.textAlign}"`);
    expect(markup).toContain('value="20"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain(copy.textStyleHint);
  });

  it('renders nothing without a selection', () => {
    expect(renderWithWhiteboardLocale(<WhiteboardTextToolbar selection={[]} onSetTextStyle={noop} />, LOCALE)).toBe('');
  });

  it('applies the stored style to the DOM label and leaves unstyled objects untouched', () => {
    const props = {
      selectedItemId: null,
      setSelectedItemId: noop,
      editingItemId: null,
      setEditingItemId: noop,
      connectorStartId: null,
      handleItemMouseDown: noop,
      updateItems: noop,
      handleChangeStickyColor: noop,
      zoom: 1,
    };
    const styled = renderWithWhiteboardLocale(
      <WhiteboardItemsRenderer {...props} items={[sticky({ textStyle: { fontSize: 20, fontWeight: 'bold', fontFamily: 'serif', align: 'center' } })]} />,
      LOCALE,
    );
    expect(styled).toContain('font-size:20px');
    expect(styled).toContain('font-weight:bold');
    expect(styled).toContain('text-align:center');

    const plain = renderWithWhiteboardLocale(<WhiteboardItemsRenderer {...props} items={[sticky()]} />, LOCALE);
    expect(plain).not.toContain('font-size:20px');
  });

  it('writes the same style into the SVG export', () => {
    const svg = renderWhiteboardProjectionToSvg('Styled board', [
      { id: 'text-1', type: 'text', x: 0, y: 0, width: 240, height: 60, text: 'Headline', textStyle: { fontSize: 40, fontWeight: 'bold', fontFamily: 'mono', align: 'center' } },
      { id: 'text-2', type: 'text', x: 300, y: 0, width: 240, height: 60, text: 'Plain' },
    ]);
    expect(svg).toContain('font-size="40"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('ui-monospace');
    // The unstyled object keeps the historical font, so existing boards are not restyled.
    expect(svg).toContain('font-size="16"');
  });
});
