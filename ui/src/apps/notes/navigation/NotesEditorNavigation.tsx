// STATUS: PLATIN — Notes notebook/page navigation surface; all document changes remain supplied by the editor controller.
import React from 'react';
import { NotesPagesList } from './NotesPagesList';
import { NotesSidebar } from './NotesSidebar';
import { NotesWorkspaceDropZoneSurface } from '../drop-zone/NotesWorkspaceDropZoneSurface';
import type { NotesWorkspaceDropZoneBindings } from '../drop-zone/useNotesWorkspaceDropZone';
import type { NotesEditorController } from '../editor/useNotesEditorController';

interface NotesEditorNavigationProps {
  editor: NotesEditorController;
  /**
   * **Paket 12:** die Bindung der Ablagezone. Sie wird **um** die Seitenliste gelegt (Geschwister der Liste, nicht
   * in ihr): *der geprüfte Baumvertrag der Seitenliste bleibt damit unverändert, und die Zone steht dort, wo sie
   * hingehört — daneben.* Fehlt sie, rendert die Navigation **unverändert**.
   */
  dropZone?: NotesWorkspaceDropZoneBindings;
}

export const NotesEditorNavigation: React.FC<NotesEditorNavigationProps> = ({ editor, dropZone }) => {
  const {
    isFocusMode,
    notebooks,
    activeNotebook,
    activeSection,
    selectedPageId,
    setSelectedNotebookId,
    setSelectedSectionId,
    handleCreateNotebook,
    handleDeleteNotebook,
    handleCreateSection,
    handleCreateSectionGroup,
    handleMoveSectionToGroup,
    handleDeleteSection,
    handleRestoreSection,
    allTagsInNotebook,
    tagDefinitions,
    tagSummary,
    selectedTagFilter,
    setSelectedTagFilter,
    smartCollections,
    selectedSmartCollectionId,
    setSelectedSmartCollectionId,
    handleCreateSmartCollection,
    handleDeleteSmartCollection,
    handleUpsertCustomTag,
    handleDeleteCustomTag,
    filteredPages,
    searchQuery,
    setSearchQuery,
    searchScope,
    setSearchScope,
    showArchived,
    setShowArchived,
    favoritesOnly,
    setFavoritesOnly,
    searchDateFrom,
    setSearchDateFrom,
    searchDateTo,
    setSearchDateTo,
    searchResultsByPageId,
    savedSearches,
    selectedSavedSearchId,
    applySavedSearch,
    saveCurrentSearch,
    deleteSavedSearch,
    searchScanTruncated,
    searchScannedPages,
    searchIndexBoundary,
    pageCollection,
    setPageCollection,
    navigateToPage,
    handleCreatePage,
    handleCreateDailyNote,
    handleDeletePage,
    handleRestorePage,
    handleSetPageParent,
    formatTime,
  } = editor;

  if (isFocusMode) return null;

  return (
    <>
      <NotesSidebar
        notebooks={notebooks}
        activeNotebook={activeNotebook}
        activeSection={activeSection}
        onSelectNotebook={setSelectedNotebookId}
        onSelectSection={setSelectedSectionId}
        onCreateNotebook={handleCreateNotebook}
        onDeleteNotebook={handleDeleteNotebook}
        onCreateSection={handleCreateSection}
        onCreateSectionGroup={handleCreateSectionGroup}
        onMoveSectionToGroup={handleMoveSectionToGroup}
        onDeleteSection={handleDeleteSection}
        onRestoreSection={handleRestoreSection}
        allTagsInNotebook={allTagsInNotebook}
        tagDefinitions={tagDefinitions}
        tagSummary={tagSummary}
        selectedTagFilter={selectedTagFilter}
        onSelectTagFilter={setSelectedTagFilter}
        onUpsertCustomTag={handleUpsertCustomTag}
        onDeleteCustomTag={handleDeleteCustomTag}
        smartCollections={smartCollections}
        selectedSmartCollectionId={selectedSmartCollectionId}
        onSelectSmartCollection={setSelectedSmartCollectionId}
        onCreateSmartCollection={handleCreateSmartCollection}
        onDeleteSmartCollection={handleDeleteSmartCollection}
      />
      <NotesWorkspaceDropZoneSurface surface="page-list" zone={dropZone} className="flex shrink-0">
        <NotesPagesList
        activeSection={activeSection}
        activePageId={selectedPageId}
        filteredPages={filteredPages}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchScope={searchScope}
        onSearchScopeChange={setSearchScope}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        favoritesOnly={favoritesOnly}
        onFavoritesOnlyChange={setFavoritesOnly}
        searchDateFrom={searchDateFrom}
        onSearchDateFromChange={setSearchDateFrom}
        searchDateTo={searchDateTo}
        onSearchDateToChange={setSearchDateTo}
        searchResultsByPageId={searchResultsByPageId}
        searchScanTruncated={searchScanTruncated}
        searchScannedPages={searchScannedPages}
        searchIndexBoundary={searchIndexBoundary}
        savedSearches={savedSearches}
        selectedSavedSearchId={selectedSavedSearchId}
        onApplySavedSearch={applySavedSearch}
        onSaveSearch={saveCurrentSearch}
        onDeleteSavedSearch={deleteSavedSearch}
        pageCollection={pageCollection}
        onPageCollectionChange={setPageCollection}
        onSelectPage={navigateToPage}
        onCreatePage={handleCreatePage}
        onCreateDailyNote={handleCreateDailyNote}
        onDeletePage={handleDeletePage}
        onRestorePage={handleRestorePage}
        onSetPageParent={handleSetPageParent}
        customPageTemplates={(activeNotebook?.templates ?? []).filter((template) => template.scope === 'page').map((template) => ({ id: template.id, name: template.name }))}
        formatTime={formatTime}
        />
      </NotesWorkspaceDropZoneSurface>
    </>
  );
};
