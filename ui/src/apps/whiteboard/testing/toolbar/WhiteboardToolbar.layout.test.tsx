import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WhiteboardToolbar } from '../../toolbar/WhiteboardToolbar';
import { WHITEBOARD_TOOLBAR_COPY } from '../../whiteboardToolbarLocale';
import { renderWithWhiteboardLocale } from '../support/whiteboardLocaleProbe';
import type { StickyColor, WhiteboardInteractionTool } from '../../types';

/** The toolbar's locale is pinned per render through the real provider (no shared module mock). */
const LOCALE = 'en-US' as const;

type ButtonElement = React.ReactElement<{
  'data-vgt-whiteboard-action'?: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
}>;

function collectButtons(node: React.ReactNode): ButtonElement[] {
  if (Array.isArray(node)) return node.flatMap(collectButtons);
  if (!React.isValidElement(node)) return [];

  const element = node as React.ReactElement<{ children?: React.ReactNode }>;
  if (element.type === 'button') return [element as ButtonElement];
  if (typeof element.type === 'function') {
    const renderComponent = element.type as unknown as (props: unknown) => React.ReactNode;
    return collectButtons(renderComponent(element.props));
  }

  return collectButtons(element.props.children);
}

function makeProps() {
  return {
    activeTool: 'select' as WhiteboardInteractionTool,
    setActiveTool: vi.fn<(tool: WhiteboardInteractionTool) => void>(),
    selectedStickyColor: 'yellow' as StickyColor,
    setSelectedStickyColor: vi.fn<(color: StickyColor) => void>(),
    selectedItemId: null,
    onDeleteSelected: vi.fn(),
    onExportPNG: vi.fn(),
    onRequestImage: vi.fn(),
    onOpenObjectPalette: vi.fn(),
    onExportToSlide: vi.fn(),
    onOpenInteropModal: vi.fn(),
    onOpenDrawModal: vi.fn(),
    canUndo: true,
    canRedo: true,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    setConnectorStartId: vi.fn<(id: string | null) => void>(),
    showToast: vi.fn<(message: string) => void>(),
  };
}

function invoke(button: ButtonElement): void {
  button.props.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
}

/**
 * Collects the toolbar buttons by instantiating the element tree **inside a React render**, so the
 * component's real hooks (`useContext` for the locale, `useState` for the More disclosure) have a
 * dispatcher. A bare `WhiteboardToolbar(props)` call outside a render cannot run hooks.
 */
function captureToolbarButtons(props: ReturnType<typeof makeProps>): ButtonElement[] {
  let captured: ButtonElement[] = [];
  const Capture: React.FC = () => {
    captured = collectButtons(WhiteboardToolbar(props) as React.ReactNode);
    return null;
  };
  renderWithWhiteboardLocale(<Capture />, LOCALE);
  return captured;
}

describe('Whiteboard toolbar stacked layout (Round 43)', () => {
  it('keeps every drawing, insert and export action in the primary and More rows', () => {
    const copy = WHITEBOARD_TOOLBAR_COPY[LOCALE];
    const markup = renderWithWhiteboardLocale(<WhiteboardToolbar {...makeProps()} />, LOCALE);

    for (const key of ['image', 'process', 'decision', 'terminal', 'drawStudio', 'interop', 'exportPng', 'exportSlide'] as const) {
      expect(markup, `${key} must stay present`).toContain(copy[key]);
    }
    for (const key of ['select', 'pan', 'sticky', 'text', 'ink', 'connect', 'undo', 'redo'] as const) {
      expect(markup, `${key} must stay in the primary row`).toContain(`>${copy[key]}<`);
    }
    expect(markup).toContain(copy.insertShapes);
    expect(markup).toContain(copy.toolsExport);
    expect(markup).toContain(copy.moreTools);
    expect(markup).toContain(copy.moreToolsTitle);
  });

  it('groups the primary row and exposes the More disclosure with ARIA state', () => {
    const copy = WHITEBOARD_TOOLBAR_COPY[LOCALE];
    const markup = renderWithWhiteboardLocale(<WhiteboardToolbar {...makeProps()} />, LOCALE);

    for (const key of ['historyTools', 'navigateTools', 'createTools', 'drawingTools'] as const) {
      expect(markup, `group ${key}`).toContain(`aria-label="${copy[key]}"`);
    }
    expect(markup, 'primary row carries the group role').toContain('role="toolbar"');
    expect(markup, 'More toggle starts collapsed').toContain('aria-expanded="false"');
    expect(markup, 'More toggle controls the secondary row').toContain('aria-controls=');
    expect(markup, 'More row marker').toContain('data-vgt-whiteboard-more="true"');
    expect(markup, 'More row is collapsed by default').toContain('data-open="false"');
    expect(markup, 'no floating <details> disclosure anymore').not.toContain('whiteboard-toolbar__disclosure');
    expect(markup, 'All actions stay in the DOM while collapsed').toContain('data-vgt-whiteboard-action="export-slide"');
  });

  it('preserves tool and action handlers in primary and More rows', () => {
    const copy = WHITEBOARD_TOOLBAR_COPY[LOCALE];
    const props = makeProps();
    const buttons = captureToolbarButtons(props);
    const forAction = (actionId: string) => buttons.filter(
      (button) => button.props['data-vgt-whiteboard-action'] === actionId,
    );

    for (const actionId of ['image', 'process', 'decision', 'terminal', 'draw-studio', 'interop', 'export-png', 'export-slide']) {
      expect(forAction(actionId), `${actionId} should exist exactly once`).toHaveLength(1);
    }

    invoke(forAction('image')[0]!);
    expect(props.onRequestImage).toHaveBeenCalledOnce();

    invoke(forAction('process')[0]!);
    expect(props.setActiveTool).toHaveBeenCalledWith('process');
    expect(props.setConnectorStartId).toHaveBeenCalledWith(null);

    invoke(forAction('connector')[0]!);
    expect(props.setActiveTool).toHaveBeenCalledWith('connector');
    expect(props.showToast).toHaveBeenCalledWith(copy.connectHint);

    invoke(forAction('undo')[0]!);
    invoke(forAction('redo')[0]!);
    expect(props.onUndo).toHaveBeenCalledOnce();
    expect(props.onRedo).toHaveBeenCalledOnce();

    invoke(forAction('draw-studio')[0]!);
    invoke(forAction('interop')[0]!);
    invoke(forAction('export-png')[0]!);
    invoke(forAction('export-slide')[0]!);
    expect(props.onOpenDrawModal).toHaveBeenCalledOnce();
    expect(props.onOpenInteropModal).toHaveBeenCalledOnce();
    expect(props.onExportPNG).toHaveBeenCalledOnce();
    expect(props.onExportToSlide).toHaveBeenCalledOnce();
  });
});
