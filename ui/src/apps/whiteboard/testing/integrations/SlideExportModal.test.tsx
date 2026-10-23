import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SlideExportModal } from '../../integrations/SlideExportModal';
import type { WhiteboardItem } from '../../types';

describe('SlideExportModal disclosure', () => {
  it('describes the multi-frame deck and the handoff omissions accurately', () => {
    const items: WhiteboardItem[] = [
      { id: 'frame-1', type: 'frame', x: 0, y: 0, width: 300, height: 200, text: 'Frame' },
      { id: 'shape-1', type: 'shape', x: 10, y: 10, width: 20, height: 20, text: 'Visible object' },
      { id: 'hidden-1', type: 'sticky', x: 30, y: 10, width: 20, height: 20, text: 'Hidden object', hidden: true },
      { id: 'connector-1', type: 'connector', x: 10, y: 10, width: 20, height: 20, text: 'Connection' },
    ];

    const markup = renderToStaticMarkup(createElement(SlideExportModal, {
      isOpen: true,
      onClose: vi.fn(),
      documentTitle: 'Planning board',
      items,
      onConfirm: vi.fn(),
    }));

    expect(markup).toContain('Present deck from visible frames');
    expect(markup).toContain('Up to 256 frames');
    expect(markup).toContain('nine cards per frame are exported');
    expect(markup).toContain('hidden objects and connectors are omitted');
    expect(markup).toContain('Planning board-Presentation');
    expect(markup).toContain('Visible frames:');
    expect(markup).toContain('Visible board objects:');
    expect(markup).toContain('Omitted connectors:');
    expect(markup).toContain('Create Present Deck');
  });
});
