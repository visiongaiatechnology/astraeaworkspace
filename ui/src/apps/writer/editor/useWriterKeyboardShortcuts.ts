// STATUS: DIAMANT VGT SUPREME — Keyboard Shortcuts Hook for Astraea Writer
import { useEffect } from 'react';
import type { ViewMode } from '../types';
import {
  filterWriterShortcut,
  resolveWriterShortcut,
  type WriterShortcutTargetInfo,
} from './writerShortcuts';

/**
 * Element markers that make a target part of the document writing surface.
 *
 * The **root** matters most: in Chromium the focused `contenteditable` host is the
 * `keydown` target while typing, and the flow items are its *descendants* — so a
 * selector that only knew `[data-writer-flow-item]` answered "not the document" for
 * the one element that actually had the focus. Every editor shortcut (`Ctrl+Z`,
 * `Ctrl+Y`, `Ctrl+B`, `Ctrl+I`, `Ctrl+U`) was filtered out as if the user were
 * typing in a dialog, while the toolbar buttons worked (native M4 probe).
 */
/** Element markers that make a target part of the document writing surface. */
const DOCUMENT_SURFACE_SELECTOR =
  '[data-writer-rich-surface="true"], [data-writer-flow-item], [data-writer-surface-paragraph]';
const FORM_FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
/**
 * Separate focus areas: header/footer fields and any real control that sits inside
 * the editing host but belongs to neither a paragraph fragment nor a flow item.
 *
 * The paragraph `<textarea>` of the legacy (non-rich) mode is a form field *of the
 * document* — it lives inside a flow item and is therefore not foreign.
 */
const FOREIGN_FIELD_SELECTOR =
  '[data-writer-header-zone], [data-writer-footer-zone], input, textarea, select, [contenteditable="false"]';

/**
 * Reads the two facts the shortcut filter needs off the focused element. Kept
 * next to the hook because it is the only place that touches the DOM.
 */
function describeShortcutTarget(target: EventTarget | null): WriterShortcutTargetInfo {
  if (!(target instanceof HTMLElement)) return { isFormField: false, inDocumentSurface: false };
  const inHeaderFooter = target.closest('[data-writer-header-zone], [data-writer-footer-zone]') !== null;
  const inFragment = target.closest('[data-writer-surface-paragraph]') !== null;
  const inFlowItem = target.closest('[data-writer-flow-item]') !== null;
  const inSurfaceRoot = target.closest('[data-writer-rich-surface="true"]') !== null;
  // A control that is neither a fragment nor a flow item is a separate focus area.
  const foreignControl = !inFragment && !inFlowItem && target.closest(FOREIGN_FIELD_SELECTOR) !== null;
  const inDocumentSurface = !inHeaderFooter
    && !foreignControl
    && (inFragment || inFlowItem || inSurfaceRoot || target.closest(DOCUMENT_SURFACE_SELECTOR) !== null);
  return {
    isFormField: inDocumentSurface || target.closest(FORM_FIELD_SELECTOR) !== null,
    inDocumentSurface,
  };
}

export interface WriterShortcutActions {
  handleToggleSpan: (property: 'bold' | 'italic' | 'underline') => void;
  setIsFindReplaceOpen: (open: boolean) => void;
  /** WR-036: open the bar, optionally with the replace row visible (`Ctrl+H`). */
  openFindReplace?: (replace: boolean) => void;
  setIsExportOpen: (open: boolean) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  /** WR-035: Ctrl+K links the marked text. */
  handleInsertLink?: () => void;
  trackChangesActive: boolean;
  setTrackChangesActive: (active: boolean) => void;
  viewMode: ViewMode;
  exitFocusMode: () => void;
  handleUpdateAllFields?: () => void;
  /**
   * Insert an explicit flow break at the caret. `Ctrl+Enter` is the established
   * word-processor binding for a page break, `Ctrl+Shift+Enter` for a column
   * break; without them breaking a page was pointer-only.
   */
  handleInsertPageBreak?: () => void;
  handleInsertColumnBreak?: () => void;
}

export function useWriterKeyboardShortcuts(actions: WriterShortcutActions): void {
  const {
    exitFocusMode,
    handleRedo,
    handleInsertLink,
    handleToggleSpan,
    handleUndo,
    handleUpdateAllFields,
    setIsExportOpen,
    setIsFindReplaceOpen,
    openFindReplace,
    setTrackChangesActive,
    trackChangesActive,
    viewMode,
    handleInsertColumnBreak,
    handleInsertPageBreak,
  } = actions;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const command = filterWriterShortcut(resolveWriterShortcut(e), describeShortcutTarget(e.target));
      if (!command) return;
      switch (command.kind) {
        case 'toggle-span':
          e.preventDefault();
          handleToggleSpan(command.property);
          return;
        case 'find-replace':
          e.preventDefault();
          if (openFindReplace) openFindReplace(command.replace);
          else setIsFindReplaceOpen(true);
          return;
        case 'export':
          e.preventDefault();
          setIsExportOpen(true);
          return;
        case 'insert-link':
          e.preventDefault();
          handleInsertLink?.();
          return;
        case 'undo':
          e.preventDefault();
          handleUndo();
          return;
        case 'redo':
          e.preventDefault();
          handleRedo();
          return;
        case 'toggle-track-changes':
          e.preventDefault();
          setTrackChangesActive(!trackChangesActive);
          return;
        case 'insert-column-break':
          // Without a handler the key keeps its default behaviour.
          if (!handleInsertColumnBreak) return;
          e.preventDefault();
          handleInsertColumnBreak();
          return;
        case 'insert-page-break':
          if (!handleInsertPageBreak) return;
          e.preventDefault();
          handleInsertPageBreak();
          return;
        case 'update-fields':
          e.preventDefault();
          handleUpdateAllFields?.();
          return;
        case 'escape':
          setIsFindReplaceOpen(false);
          if (viewMode === 'focus') {
            e.preventDefault();
            exitFocusMode();
          }
          return;
        default: {
          // Exhaustiveness: a new command without a branch fails to compile here.
          const unreachable: never = command;
          void unreachable;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    exitFocusMode,
    handleInsertColumnBreak,
    handleInsertPageBreak,
    handleRedo,
    handleInsertLink,
    handleToggleSpan,
    handleUndo,
    handleUpdateAllFields,
    setIsExportOpen,
    setIsFindReplaceOpen,
    openFindReplace,
    setTrackChangesActive,
    trackChangesActive,
    viewMode,
  ]);
}
