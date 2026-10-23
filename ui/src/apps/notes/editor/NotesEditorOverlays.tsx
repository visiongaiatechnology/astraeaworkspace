// STATUS: PLATIN — Notes editor modal composition; protected-content gating and document commits stay with the controller.
import React from 'react';
import type { NoteInkDocument, NoteNotebook } from '../../../shared/contracts/workspace';
import { addCanvasBlock, blockFromMediaMemo, blockFromWorkspaceEmbed, createCanvasBlock, normalizeNoteCanvas, updateCanvasBlock } from '../canvas/notesCanvasModel';
import { imageOcrFromResult, normalizeNoteImageBlock } from '../media/notesImageModel';
import { NotesCollaborationModal } from '../collaboration/NotesCollaborationModal';
import { NotesCrossAppModal } from '../integrations/NotesCrossAppModal';
import { NotesEditorModals } from './modals/NotesEditorModals';
import { NotesImportExportModal } from '../interchange/NotesImportExportModal';
import { NotesSecurityModal } from '../security/NotesSecurityModal';
import { NotesTemplatesModal } from '../templates/NotesTemplatesModal';
import { NotesWorkspaceEmbedModal } from '../integrations/NotesWorkspaceEmbedModal';
import type { NotesEditorController } from './useNotesEditorController';

interface NotesEditorOverlaysProps {
  editor: NotesEditorController;
}

export const NotesEditorOverlays: React.FC<NotesEditorOverlaysProps> = ({ editor }) => {
  const {
    document,
    notebooks,
    activeNotebook,
    activeSection,
    activePage,
    activePageLocked,
    editingInkBlockId,
    setEditingInkBlockId,
    collaboration,
    workspaceIntegration,
    workspaceDocuments,
    isWorkspaceEmbedOpen,
    setIsWorkspaceEmbedOpen,
    isKnowledgeGraphOpen,
    setIsKnowledgeGraphOpen,
    isInkOpen,
    setIsInkOpen,
    isAudioOpen,
    setIsAudioOpen,
    isFindReplaceOpen,
    setIsFindReplaceOpen,
    isHistoryOpen,
    setIsHistoryOpen,
    isOcrOpen,
    setIsOcrOpen,
    isRoundtripOpen,
    setIsRoundtripOpen,
    isTemplatesOpen,
    setIsTemplatesOpen,
    isCrossAppOpen,
    setIsCrossAppOpen,
    isImportExportOpen,
    setIsImportExportOpen,
    isSecurityOpen,
    setIsSecurityOpen,
    isCollaborationOpen,
    setIsCollaborationOpen,
    handleUpdateCurrentPage,
    navigateToPage,
    noteSecurity,
    saveTemplate,
    instantiateTemplate,
    deleteTemplate,
    handleToggleAuthorAttribution,
    handleAddComment,
    handleResolveComment,
    handleCreateNamedSnapshot,
    handleRestoreRevision,
    readBodySelection,
  } = editor;

  return (
    <>
      <NotesWorkspaceEmbedModal
        isOpen={isWorkspaceEmbedOpen && !activePageLocked}
        currentDocumentId={document.id}
        workspaceDocuments={workspaceDocuments}
        onClose={() => setIsWorkspaceEmbedOpen(false)}
        onInsert={(embed) => {
          if (!activePage) return;
          let canvas = normalizeNoteCanvas(activePage.canvas);
          if (!activePage.canvas && activePage.content.trim()) {
            const textBlock = { ...createCanvasBlock('text', 56, 56), kind: 'text' as const, text: activePage.content };
            canvas = addCanvasBlock(canvas, textBlock);
          }
          handleUpdateCurrentPage({ canvas: addCanvasBlock(canvas, blockFromWorkspaceEmbed(embed, 96, 96)), editorMode: 'freeform' });
        }}
      />

      <NotesEditorModals
        activePage={activePage}
        activeNotebook={activeNotebook}
        notebooks={notebooks}
        onNavigateToPage={navigateToPage}
        onUpdateCurrentPage={handleUpdateCurrentPage}
        onRestoreVersion={handleRestoreRevision}
        initialInkDocument={((): NoteInkDocument | undefined => {
          if (!activePage || !editingInkBlockId) return undefined;
          const block = activePage.canvas?.blocks.find((candidate) => candidate.id === editingInkBlockId);
          return block?.kind === 'ink' ? block.ink : undefined;
        })()}
        onInsertInkDrawing={(payload) => {
          if (!activePage) return;
          if (activePage.editorMode === 'freeform') {
            if (editingInkBlockId) {
              handleUpdateCurrentPage({ canvas: updateCanvasBlock(activePage.canvas, editingInkBlockId, { ink: payload.ink, svg: payload.svg, recognizedText: payload.recognizedText }), editorMode: 'freeform' });
            } else {
              const block = { ...createCanvasBlock('ink', 72, 72), kind: 'ink' as const, ink: payload.ink, svg: payload.svg, recognizedText: payload.recognizedText };
              handleUpdateCurrentPage({ canvas: addCanvasBlock(activePage.canvas, block), editorMode: 'freeform' });
            }
          } else {
            const serialized = JSON.stringify(payload.ink);
            handleUpdateCurrentPage({ content: `${activePage.content}

\`\`\`astraea-ink
${serialized}
\`\`\`

\`\`\`xml
${payload.svg}
\`\`\`
` });
          }
          setEditingInkBlockId(null);
        }}
        onInsertMedia={(memo) => {
          if (!activePage) return;
          let canvas = normalizeNoteCanvas(activePage.canvas);
          if (!activePage.canvas && activePage.content.trim()) {
            const textBlock = { ...createCanvasBlock('text', 56, 56), kind: 'text' as const, text: activePage.content };
            canvas = addCanvasBlock(canvas, textBlock);
          }
          handleUpdateCurrentPage({ canvas: addCanvasBlock(canvas, blockFromMediaMemo(memo, 96, 96)), editorMode: 'freeform' });
        }}
        onInsertOcrImage={(payload) => {
          if (!activePage) return;
          let canvas = normalizeNoteCanvas(activePage.canvas);
          if (!activePage.canvas && activePage.content.trim()) {
            const textBlock = { ...createCanvasBlock('text', 56, 56), kind: 'text' as const, text: activePage.content };
            canvas = addCanvasBlock(canvas, textBlock);
          }
          const imageBlock = normalizeNoteImageBlock({
            ...createCanvasBlock('image', 96, 96),
            kind: 'image' as const,
            src: payload.dataUrl,
            mimeType: payload.mimeType,
            altText: payload.result.fullText.slice(0, 240),
            crop: { x: 0, y: 0, width: 1, height: 1 },
            rotation: 0 as const,
            ocr: imageOcrFromResult(payload.result),
            annotations: [],
          });
          handleUpdateCurrentPage({ canvas: addCanvasBlock(canvas, imageBlock), editorMode: 'freeform' });
        }}
        onImportNotebook={(notebook: NoteNotebook) => {
          collaboration.commitDocument({
            ...document,
            modified_at: Date.now(),
            version: document.version + 1,
            notebooks: [...notebooks, notebook],
          });
        }}
        isKnowledgeGraphOpen={isKnowledgeGraphOpen && !activePageLocked}
        onCloseKnowledgeGraph={() => setIsKnowledgeGraphOpen(false)}
        isInkOpen={isInkOpen && !activePageLocked}
        onCloseInk={() => { setIsInkOpen(false); setEditingInkBlockId(null); }}
        isAudioOpen={isAudioOpen && !activePageLocked}
        onCloseAudio={() => setIsAudioOpen(false)}
        isFindReplaceOpen={isFindReplaceOpen && !activePageLocked}
        onCloseFindReplace={() => setIsFindReplaceOpen(false)}
        isHistoryOpen={isHistoryOpen && !activePageLocked}
        onCloseHistory={() => setIsHistoryOpen(false)}
        isOcrOpen={isOcrOpen && !activePageLocked}
        onCloseOcr={() => setIsOcrOpen(false)}
        isRoundtripOpen={isRoundtripOpen && !activePageLocked}
        onCloseRoundtrip={() => setIsRoundtripOpen(false)}
      />
      {activeNotebook && (
        <NotesTemplatesModal
          isOpen={isTemplatesOpen && !activePageLocked}
          notebook={activeNotebook}
          onClose={() => setIsTemplatesOpen(false)}
          onSaveTemplate={saveTemplate}
          onInstantiateTemplate={(template) => { instantiateTemplate(template); setIsTemplatesOpen(false); }}
          onDeleteTemplate={deleteTemplate}
        />
      )}
      {activePage && (
        <NotesCrossAppModal
          isOpen={isCrossAppOpen && !activePageLocked}
          page={activePage}
          workspaceDocuments={workspaceDocuments}
          selectionText={readBodySelection}
          onClose={() => setIsCrossAppOpen(false)}
          onCreateWriterDraft={workspaceIntegration.createWriterDraft}
          onConvertTasks={workspaceIntegration.convertTasks}
          onSendVault={workspaceIntegration.sendVault}
        />
      )}
      <NotesImportExportModal
        isOpen={isImportExportOpen && !activePageLocked}
        notebook={activeNotebook}
        section={activeSection}
        page={activePage}
        onImportNotebook={(imported) => collaboration.commitDocument({
          ...document,
          modified_at: Date.now(),
          version: document.version + 1,
          notebooks: [...notebooks, imported],
        })}
        onClose={() => setIsImportExportOpen(false)}
      />
      <NotesSecurityModal
        isOpen={isSecurityOpen}
        notebook={activeNotebook}
        section={activeSection}
        page={activePage}
        isLocked={activePageLocked}
        onSetPolicy={noteSecurity.setPolicy}
        onUnlock={noteSecurity.unlock}
        onLockAll={noteSecurity.lockAll}
        onToggleSensitive={noteSecurity.toggleSensitive}
        onClose={() => setIsSecurityOpen(false)}
      />
      <NotesCollaborationModal
        isOpen={isCollaborationOpen && !activePageLocked}
        page={activePage}
        authorId={collaboration.authorId}
        displayName={collaboration.displayName}
        onDisplayNameChange={collaboration.setDisplayName}
        supported={collaboration.supported}
        enabled={collaboration.enabled}
        onEnabledChange={collaboration.setEnabled}
        peers={collaboration.peers}
        conflictCount={collaboration.conflictCount}
        lastError={collaboration.lastError}
        authorAttributionEnabled={Boolean(activeNotebook?.authorAttributionEnabled)}
        onAuthorAttributionChange={handleToggleAuthorAttribution}
        onAddComment={handleAddComment}
        onResolveComment={handleResolveComment}
        onCreateSnapshot={handleCreateNamedSnapshot}
        selectionText={readBodySelection}
        onClose={() => setIsCollaborationOpen(false)}
      />
    </>
  );
};
