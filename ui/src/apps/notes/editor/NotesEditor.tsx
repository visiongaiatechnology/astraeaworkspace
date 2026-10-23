import React from 'react';
import type { NotesEditorProps } from '../contracts/notesEditor';
import '../../../design-system/styles/AppToolbarBand.css';
import '../../../design-system/styles/AppThemeSelection.css';
import './markdown/NotesMarkdownPreview.css';
import '../theme/NotesThemeChrome.css';
import { NotesEditorBody } from './NotesEditorBody';
import { NotesEditorNavigation } from '../navigation/NotesEditorNavigation';
import { NotesEditorOverlays } from './NotesEditorOverlays';
import { useNotesEditorController } from './useNotesEditorController';
import { useNotesWorkspaceDropZone } from '../drop-zone/useNotesWorkspaceDropZone';

export const NotesEditor: React.FC<NotesEditorProps> = (props) => {
  const editor = useNotesEditorController(props);
  /**
   * **Paket 12:** die Ablagezone der Notes-Oberfläche — **eine** Maschine für die **zwei** benannten Flächen
   * (Leinwand und Seitenliste). Das Zieldokument ist **dieses** Dokument; die Zielkennung und die eigene Anwendung
   * werden nicht geraten, sondern aus `document.id` / `document.kind` gereicht. Die Autorität bleibt die
   * versiegelte Matrix der Shell (`FABRIC_WORKSPACE_DROP_REGISTRY`, Paket 4) — hier entsteht **keine** zweite.
   */
  const workspaceDropZone = useNotesWorkspaceDropZone({
    targetDocument: editor.document,
    documents: editor.workspaceDocuments,
  });


  return (
    <div
      className="flex-1 flex h-full bg-[#0a0d14] text-slate-100 overflow-hidden"
      data-vgt-notes-root="true"
      data-vgt-app-theme-root="notes"
      role="region"
      aria-label="Astraea Notes editor"
      onKeyDown={editor.handleEditorKeyDown}
      onClick={() => props.onSelectSelectionType('text')}
    >
      <NotesEditorNavigation editor={editor} dropZone={workspaceDropZone} />

      {/* 3. RICH NOTE EDITOR & PREVIEW (Main Right Pane) */}
      <NotesEditorBody editor={editor} dropZone={workspaceDropZone} />

      <NotesEditorOverlays editor={editor} />
    </div>
  );
};

export default NotesEditor;
