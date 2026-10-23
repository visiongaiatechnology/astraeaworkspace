import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import { TabBar } from '../TabBar';

describe('Workspace document tab layout', () => {
  it('keeps each open document a fixed-width selectable tab without policy badges', () => {
    const document = {
      id: 'writer-strategy',
      kind: 'Writer',
      title: 'Strategy-2027',
    } as unknown as WorkspaceDocument;

    const html = renderToStaticMarkup(createElement(TabBar, {
      documents: [document],
      activeDocId: document.id,
      onSelectDoc: vi.fn(),
      onCloseDoc: vi.fn(),
      onCreateDoc: vi.fn(),
    }));

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-label="Strategy-2027, Writer document"');
    expect(html).toContain('w-[clamp(116px,8.5vw,148px)]');
    expect(html).toContain('min-[1700px]:block');
    expect(html).toContain('>Strategy-2027</span>');
    expect(html).not.toContain('Policy:');
    expect(html).not.toContain('Security policy:');
  });
});
