// STATUS: DIAMANT VGT SUPREME — Astraea Notes Modals Orchestrator
import React from 'react';
import { NoteInkDocument, NoteMediaMemo, NoteNotebook, NotePage, NotePageRevision } from '../../../../shared/contracts/workspace';
import { KnowledgeGraphModal } from '../../knowledge-graph/KnowledgeGraphModal';
import { NotesInkCanvasModal, NotesInkInsertPayload } from '../../canvas/ink/NotesInkCanvasModal';
import { NotesAudioMemoModal } from '../../media/audio/NotesAudioMemoModal';
import { NotesFindReplaceModal } from '../../search/NotesFindReplaceModal';
import { NotesVersionHistoryModal } from '../../history/NotesVersionHistoryModal';
import { NotesOcrModal, type NotesOcrInsertPayload } from '../../media/ocr/NotesOcrModal';
import { NotesRoundtripModal } from '../../interchange/testing/NotesRoundtripModal';

export interface NotesEditorModalsProps {
  activePage: NotePage | null;
  activeNotebook: NoteNotebook | null;
  notebooks: NoteNotebook[];
  onNavigateToPage: (pageId: string) => void;
  onUpdateCurrentPage: (patch: Partial<NotePage>) => void;
  /** AST-0716: the restore goes through the safety-revision plan, never a raw overwrite. */
  onRestoreVersion?: (revision: NotePageRevision) => void;
  onImportNotebook: (nb: NoteNotebook) => void;
  onInsertInkDrawing?: (payload: NotesInkInsertPayload) => void;
  onInsertOcrImage?: (payload: NotesOcrInsertPayload) => void;
  onInsertMedia?: (memo: NoteMediaMemo) => void;
  initialInkDocument?: NoteInkDocument;

  isKnowledgeGraphOpen: boolean;
  onCloseKnowledgeGraph: () => void;

  isInkOpen: boolean;
  onCloseInk: () => void;

  isAudioOpen: boolean;
  onCloseAudio: () => void;

  isFindReplaceOpen: boolean;
  onCloseFindReplace: () => void;

  isHistoryOpen: boolean;
  onCloseHistory: () => void;


  isOcrOpen: boolean;
  onCloseOcr: () => void;

  isRoundtripOpen: boolean;
  onCloseRoundtrip: () => void;
}

export const NotesEditorModals: React.FC<NotesEditorModalsProps> = ({
  activePage,
  activeNotebook,
  notebooks,
  onNavigateToPage,
  onUpdateCurrentPage,
  onRestoreVersion,
  onImportNotebook,
  onInsertInkDrawing,
  onInsertOcrImage,
  onInsertMedia,
  initialInkDocument,
  isKnowledgeGraphOpen,
  onCloseKnowledgeGraph,
  isInkOpen,
  onCloseInk,
  isAudioOpen,
  onCloseAudio,
  isFindReplaceOpen,
  onCloseFindReplace,
  isHistoryOpen,
  onCloseHistory,
  isOcrOpen,
  onCloseOcr,
  isRoundtripOpen,
  onCloseRoundtrip,
}) => {
  return (
    <>
      {/* 1. Sovereign Knowledge Graph Modal */}
      <KnowledgeGraphModal
        isOpen={isKnowledgeGraphOpen}
        onClose={onCloseKnowledgeGraph}
        activePageId={activePage?.id || ''}
        activeNotebookId={activeNotebook?.id || ''}
        notebooks={notebooks}
        onNavigateToPage={onNavigateToPage}
      />

      {/* 2. Ink & Sketch Modal */}
      <NotesInkCanvasModal
        isOpen={isInkOpen}
        onClose={onCloseInk}
        initialDocument={initialInkDocument}
        onInsertDrawing={(payload) => {
          if (onInsertInkDrawing) { onInsertInkDrawing(payload); return; }
          if (activePage) {
            const serialized = JSON.stringify(payload.ink);
            onUpdateCurrentPage({ content: `${activePage.content}\n\n\`\`\`astraea-ink\n${serialized}\n\`\`\`\n\n\`\`\`xml\n${payload.svg}\n\`\`\`\n` });
          }
        }}
      />

      {/* 3. Voice Memo Modal */}
      <NotesAudioMemoModal
        isOpen={isAudioOpen}
        onClose={onCloseAudio}
        onInsertMedia={(memo) => {
          if (onInsertMedia) { onInsertMedia(memo); return; }
          if (activePage) onUpdateCurrentPage({ content: `${activePage.content}\n\n> Media note: ${memo.title} (${memo.kind}, ${Math.round(memo.durationSeconds)}s)` });
        }}
      />

      {/* 4. Find & Replace Modal */}
      <NotesFindReplaceModal
        isOpen={isFindReplaceOpen}
        content={activePage?.content || ''}
        onClose={onCloseFindReplace}
        onUpdateContent={(newContent) => {
          if (activePage) onUpdateCurrentPage({ content: newContent });
        }}
      />

      {/* 5. Version History Modal */}
      {activePage && (
        <NotesVersionHistoryModal
          isOpen={isHistoryOpen}
          page={activePage}
          onClose={onCloseHistory}
          onRestoreVersion={onRestoreVersion ?? ((revision) => onUpdateCurrentPage({ title: revision.title, content: revision.content, tags: revision.tags, properties: revision.properties }))}
        />
      )}

      {/* 7. Local OCR & Scan Modal */}
      <NotesOcrModal
        isOpen={isOcrOpen}
        onClose={onCloseOcr}
        onInsertOcrText={(ocrMd) => {
          if (activePage) onUpdateCurrentPage({ content: activePage.content + '\n\n' + ocrMd });
        }}
        onInsertOcrImage={onInsertOcrImage}
      />

      {/* 8. Universal OneNote / Evernote Roundtrip Modal */}
      <NotesRoundtripModal
        isOpen={isRoundtripOpen}
        onClose={onCloseRoundtrip}
        activeNotebook={activeNotebook}
        onImportNotebook={onImportNotebook}
      />
    </>
  );
};
