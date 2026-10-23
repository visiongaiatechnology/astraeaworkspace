// STATUS: PLATIN — shell keyboard listener lifecycle and caller-owned command dispatch.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { WorkspaceDocument } from '../../shared/contracts/workspace';
import { queueTaskQuickAddDraft, taskCaptureInputFromSelection } from '../../apps/tasks/capture/taskCapture';
import { persistActiveDocId } from '../../platform/workspace/persistence/workspaceStorage';
import { shouldProcessWorkspaceShortcut } from '../../shared/accessibility/accessibilityPlatform';
import { shortcutMatches, type ShellShortcutMap } from '../platform/workspaceShellPlatform';

export interface WorkspaceShellShortcutLifecycleOptions {
  activeDocId: string;
  documents: Record<string, WorkspaceDocument>;
  shellShortcuts: ShellShortcutMap;
  setActiveDocId: Dispatch<SetStateAction<string>>;
  setIsCommandPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setIsStartCenterOpen: Dispatch<SetStateAction<boolean>>;
  setIsWorkspaceExplorerOpen: Dispatch<SetStateAction<boolean>>;
  handleOpenNewWindow: () => Promise<void>;
  handleSaveVwc: () => Promise<void> | void;
}

export function useWorkspaceShellShortcutLifecycle(options: WorkspaceShellShortcutLifecycleOptions): void {
  const { activeDocId, documents, shellShortcuts, setActiveDocId, setIsCommandPaletteOpen, setIsStartCenterOpen, setIsWorkspaceExplorerOpen, handleOpenNewWindow, handleSaveVwc } = options;
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldProcessWorkspaceShortcut(event)) return;
      if (shortcutMatches(event, shellShortcuts['quick-add-task'])) {
        event.preventDefault();
        const source = documents[activeDocId];
        const selectedText = window.getSelection()?.toString() ?? '';
        const captureKinds = new Set(['Writer', 'Notes', 'PdfStudio']);
        const sourceKind = source && captureKinds.has(source.kind)
          ? source.kind as 'Writer' | 'Notes' | 'PdfStudio'
          : 'Shell';
        const objectKind = sourceKind === 'Notes' ? 'block/selection'
          : sourceKind === 'PdfStudio' ? 'annotation/selection'
            : 'selection/active';
        queueTaskQuickAddDraft(
          source
            ? taskCaptureInputFromSelection(selectedText, sourceKind, source.id, objectKind)
            : { title: selectedText, sourceKind: 'Shell' },
        );
        const taskDocument = Object.values(documents).find((candidate) => candidate.kind === 'Tasks');
        if (taskDocument) {
          setActiveDocId(taskDocument.id);
          persistActiveDocId(taskDocument.id);
          setIsStartCenterOpen(false);
        }
        return;
      }
      if (shortcutMatches(event, shellShortcuts['command-palette'])) {
        /**
         * WR-017/WR-035 — a focused writing surface keeps its own `Strg+K`.
         *
         * In the Writer, `Strg+K` links the marked text. This listener runs on `window`
         * and used to open the command palette first, so the link dialog was
         * unreachable from the keyboard (native M7 probe). Inside the surface the event
         * is left alone; the palette stays reachable over the top-bar "Befehle" button
         * and everywhere outside the document.
         */
        const target = event.target;
        const insideWritingSurface = target instanceof Element
          && target.closest('[data-writer-rich-surface="true"]') !== null;
        if (insideWritingSurface) return;
        event.preventDefault();
        setIsCommandPaletteOpen((previous: boolean) => !previous);
        return;
      }
      if (shortcutMatches(event, shellShortcuts.save)) {
        event.preventDefault();
        void handleSaveVwc();
        return;
      }
      if (shortcutMatches(event, shellShortcuts['start-center'])) {
        event.preventDefault();
        setIsStartCenterOpen((previous: boolean) => !previous);
        return;
      }
      if (shortcutMatches(event, shellShortcuts['workspace-explorer'])) {
        event.preventDefault();
        setIsWorkspaceExplorerOpen((previous) => !previous);
        setIsStartCenterOpen(false);
        return;
      }
      if (shortcutMatches(event, shellShortcuts['new-window'])) {
        event.preventDefault();
        void handleOpenNewWindow();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeDocId, documents, handleOpenNewWindow, handleSaveVwc, setActiveDocId, setIsCommandPaletteOpen, setIsStartCenterOpen, setIsWorkspaceExplorerOpen, shellShortcuts]);
}
