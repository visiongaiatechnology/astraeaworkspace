// STATUS: DIAMANT VGT SUPREME — canonical Notes hierarchy and page-state orchestrator

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNotesSearch } from '../search/useNotesSearch';
import { measureNotesSearchIndexBoundary } from '../security/notesSecurity';
import { useNotesSecurity } from '../security/useNotesSecurity';
import type {
  NoteAttachment,
  NoteNotebook,
  NotePage,
  NotePageRevision,
  NotePropertyValue,
  NoteSection,
  NoteTemplateRecord,
  NoteSmartCollectionQuery,
  TaskItem,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import { DEFAULT_NOTEBOOKS, type NotesPageCollection, type PageFlatItem } from '../contracts/notesEditor';
import { createNotePageFromTemplate, findDailyNotePage, type NoteTemplateId } from '../model/noteModel';
import {
  appendPageRevision,
  createNoteEntityId,
  describeNoteParentRejection,
  MAX_NOTE_REVISIONS,
  normalizeNoteNotebook,
  recordPageVisit,
  restorePage,
  sanitizeNoteTitle,
  setPageParent,
  softDeletePage,
  type NoteParentRejection,
} from '../model/notesHierarchy';
import { planRevisionRestore } from '../history/notesRevisionRestore';
import { appendNoteAttachment, applyPagePatch, removeNoteAttachment, type NotePagePatch } from '../model/notesPageMutations';
import { buildSelectionCommentBody } from '../collaboration/notesCommentAnchor';
import {
  buildKnowledgeIndex,
  collectKnowledgePages,
  findPageByKnowledgeLabel,
  reconcileKnowledgeNotebooks,
  resolveParsedKnowledgeReference,
  sanitizeNoteAliases,
  suggestRelatedNotes,
  type ParsedWikiReference,
} from '../knowledge-graph/notesKnowledgeGraph';
import {
  allNoteTagDefinitions,
  convertChecklistToCanonicalTask,
  createSmartCollection,
  deleteCustomNoteTag,
  noteTagKey,
  synchronizeCanonicalTasksFromNotebooks,
  synchronizeNotebooksFromCanonicalTasks,
  upsertCustomNoteTag,
  validateNoteTagInput,
} from '../model/notesTagsTasks';
import { createNotesCollaborationActions } from '../collaboration/notesCollaborationActions';
import {
  createTemplateFromNotebook,
  createTemplateFromPage,
  createTemplateFromSection,
  instantiateNotebookTemplate,
  instantiatePageTemplate,
  instantiateSectionTemplate,
} from '../templates/notesTemplates';

export type { NotesPageCollection };

/**
 * AST-0664/AST-0679: one typed outcome for every Notes mutation that used to fail silently, so the UI can
 * always name what happened instead of leaving the user with an unchanged screen.
 */
export interface NoteMutationOutcome {
  ok: boolean;
  message: string;
  taskId?: string;
}

export function useNotesManager(
  document: WorkspaceDocument,
  onUpdateDocument: (doc: WorkspaceDocument) => void
) {
  const canonicalTasks = useMemo<TaskItem[]>(() => (document.workManagementData ?? document.workData)?.tasks ?? [], [document.workManagementData, document.workData]);
  const notebooks = useMemo<NoteNotebook[]>(() => {
    const source = document.notebooks && document.notebooks.length > 0 ? document.notebooks : DEFAULT_NOTEBOOKS;
    const normalized = source.map((notebook) => normalizeNoteNotebook(notebook));
    return synchronizeNotebooksFromCanonicalTasks(normalized, canonicalTasks);
  }, [document.notebooks, canonicalTasks]);

  const [selectedNotebookId, setSelectedNotebookId] = useState(notebooks[0]?.id ?? '');
  const [selectedSectionId, setSelectedSectionId] = useState(notebooks[0]?.sections[0]?.id ?? '');
  const [selectedPageId, setSelectedPageId] = useState(notebooks[0]?.sections[0]?.pages[0]?.id ?? '');
  const [pageCollection, setPageCollection] = useState<NotesPageCollection>('pages');
  const [selectedSmartCollectionId, setSelectedSmartCollectionId] = useState<string | null>(null);

  const activeNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === selectedNotebookId) ?? notebooks[0] ?? null,
    [notebooks, selectedNotebookId]
  );
  const activeSection = useMemo(() => {
    if (!activeNotebook) return null;
    return activeNotebook.sections.find((section) => section.id === selectedSectionId && !section.trashedAt)
      ?? activeNotebook.sections.find((section) => !section.trashedAt)
      ?? null;
  }, [activeNotebook, selectedSectionId]);
  const activePage = useMemo(() => {
    if (!activeSection) return null;
    return activeSection.pages.find((page) => page.id === selectedPageId)
      ?? activeSection.pages.find((page) => !page.trashedAt)
      ?? activeSection.pages[0]
      ?? null;
  }, [activeSection, selectedPageId]);

  /**
   * W-397: the mutation layer must accumulate, not clobber. `notebooksRef` is advanced *synchronously* by
   * `persistNotebooks`, so two mutations issued in the same tick both see the first one's result instead of
   * both starting from the render-time snapshot. Without this, a two-file drop kept only the last file and
   * two comments in one instance lost the first.
   */
  const notebooksRef = useRef<NoteNotebook[]>(notebooks);
  notebooksRef.current = notebooks;

  const persistNotebooks = (updatedNotebooks: NoteNotebook[], tasksOverride?: TaskItem[]) => {
    const now = Date.now();
    const normalized = updatedNotebooks.map((notebook) => normalizeNoteNotebook(notebook));
    const knowledgeBound = reconcileKnowledgeNotebooks(normalized, now);
    const sourceTasks = tasksOverride ?? canonicalTasks;
    const syncedTasks = synchronizeCanonicalTasksFromNotebooks(knowledgeBound, sourceTasks);
    const existingWork = document.workManagementData ?? document.workData;
    const shouldPersistWork = tasksOverride !== undefined || Boolean(existingWork && sourceTasks.length);
    const workPayload = shouldPersistWork ? {
      ...(existingWork ?? { cards: [], milestones: [] }),
      tasks: syncedTasks,
      cards: existingWork?.cards ?? [],
      milestones: existingWork?.milestones ?? [],
    } : undefined;
    // Advance the live reference before the host call, so a second mutation in the same tick chains on it.
    notebooksRef.current = knowledgeBound;
    onUpdateDocument({
      ...document,
      modified_at: now,
      version: document.version + 1,
      notebooks: knowledgeBound,
      ...(workPayload ? { workManagementData: workPayload, ...(document.workData ? { workData: workPayload } : {}) } : {}),
    });
  };

  const replaceNotebook = (notebookId: string, update: (notebook: NoteNotebook) => NoteNotebook) => {
    persistNotebooks(notebooksRef.current.map((notebook) => notebook.id === notebookId ? update(notebook) : notebook));
  };
  const noteSecurity = useNotesSecurity(notebooks, replaceNotebook);

  useEffect(() => {
    if (!activeNotebook) return;
    if (!activeNotebook.sections.some((section) => section.id === selectedSectionId && !section.trashedAt)) {
      const nextSection = activeNotebook.sections.find((section) => !section.trashedAt);
      setSelectedSectionId(nextSection?.id ?? '');
      setSelectedPageId(nextSection?.pages.find((page) => !page.trashedAt)?.id ?? '');
    }
  }, [activeNotebook, selectedSectionId]);

  useEffect(() => {
    if (!activeSection) return;
    if (!activeSection.pages.some((page) => page.id === selectedPageId)) {
      setSelectedPageId(activeSection.pages.find((page) => !page.trashedAt)?.id ?? activeSection.pages[0]?.id ?? '');
    }
  }, [activeSection, selectedPageId]);

  const allPagesList = useMemo<PageFlatItem[]>(() => notebooks.flatMap((notebook) =>
    notebook.sections.flatMap((section) => section.pages.map((page) => ({
      id: page.id,
      title: page.title,
      notebookId: notebook.id,
      notebookTitle: notebook.title,
      sectionId: section.id,
      sectionTitle: section.title,
      parentPageId: page.parentPageId ?? null,
      trashed: Boolean(page.trashedAt),
    })))
  ), [notebooks]);

  const navigateToPage = (targetTitleOrId: string) => {
    const knowledgePages = collectKnowledgePages(notebooks);
    const resolved = findPageByKnowledgeLabel(knowledgePages, targetTitleOrId);
    const target = resolved
      ? allPagesList.find((page) => page.id === resolved.page.id)
      : allPagesList.find((page) => page.id === targetTitleOrId);
    if (!target || target.trashed) return;
    const now = Date.now();
    persistNotebooks(notebooks.map((notebook) => notebook.id === target.notebookId ? recordPageVisit(notebook, target.id, now) : notebook));
    setSelectedNotebookId(target.notebookId);
    setSelectedSectionId(target.sectionId);
    setSelectedPageId(target.id);
  };

  const handleCreateNotebook = (title: string, templateId?: string) => {
    const template = activeNotebook?.templates?.find((candidate) => candidate.id === templateId && candidate.scope === 'notebook');
    const fromTemplate = template ? instantiateNotebookTemplate(template) : null;
    const now = Date.now();
    const initialPage = createNotePageFromTemplate('blank', now, 'Untitled Note');
    const notebook: NoteNotebook = fromTemplate ?? {
      id: createNoteEntityId('nb'),
      title: sanitizeNoteTitle(title, 'Untitled Notebook'),
      sections: [{
        id: createNoteEntityId('sec'),
        title: 'General',
        pages: [initialPage],
        groupId: null,
        createdAt: now,
        updatedAt: now,
        trashedAt: null,
      }],
      sectionGroups: [],
      templates: [],
      recentPageIds: [],
      navigationHistory: [],
      properties: {},
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    };
    notebook.title = sanitizeNoteTitle(title || notebook.title, notebook.title);
    const next = [...notebooks, notebook];
    persistNotebooks(next);
    setSelectedNotebookId(notebook.id);
    setSelectedSectionId(notebook.sections[0]?.id ?? '');
    setSelectedPageId(notebook.sections[0]?.pages[0]?.id ?? '');
  };

  const handleDeleteNotebook = (notebookId: string) => {
    if (notebooks.filter((notebook) => !notebook.trashedAt).length <= 1) return;
    const now = Date.now();
    const next = notebooks.map((notebook) => notebook.id === notebookId ? { ...notebook, trashedAt: now, updatedAt: now } : notebook);
    persistNotebooks(next);
    if (selectedNotebookId === notebookId) {
      const fallback = next.find((notebook) => !notebook.trashedAt);
      setSelectedNotebookId(fallback?.id ?? '');
      setSelectedSectionId(fallback?.sections.find((section) => !section.trashedAt)?.id ?? '');
      setSelectedPageId(fallback?.sections.flatMap((section) => section.pages).find((page) => !page.trashedAt)?.id ?? '');
    }
  };

  const handleCreateSectionGroup = (title: string, parentGroupId: string | null = null) => {
    if (!activeNotebook) return;
    const now = Date.now();
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      updatedAt: now,
      sectionGroups: [...(notebook.sectionGroups ?? []), {
        id: createNoteEntityId('group'),
        title: sanitizeNoteTitle(title, 'Section Group'),
        parentGroupId,
        createdAt: now,
        updatedAt: now,
      }],
    }));
  };

  const handleCreateSection = (title: string, groupId: string | null = null, templateId?: string) => {
    if (!activeNotebook) return;
    const template = activeNotebook.templates?.find((candidate) => candidate.id === templateId && candidate.scope === 'section');
    const section = template ? instantiateSectionTemplate(template) : null;
    const now = Date.now();
    const newSection: NoteSection = section ?? {
      id: createNoteEntityId('sec'),
      title: sanitizeNoteTitle(title, 'Untitled Section'),
      pages: [createNotePageFromTemplate('blank', now, 'Untitled Note')],
      groupId,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    };
    newSection.title = sanitizeNoteTitle(title || newSection.title, newSection.title);
    newSection.groupId = groupId;
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, updatedAt: now, sections: [...notebook.sections, newSection] }));
    setSelectedSectionId(newSection.id);
    setSelectedPageId(newSection.pages[0]?.id ?? '');
  };

  const handleMoveSectionToGroup = (sectionId: string, groupId: string | null) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      updatedAt: Date.now(),
      sections: notebook.sections.map((section) => section.id === sectionId ? { ...section, groupId, updatedAt: Date.now() } : section),
    }));
  };

  const handleDeleteSection = (sectionId: string) => {
    if (!activeNotebook || activeNotebook.sections.filter((section) => !section.trashedAt).length <= 1) return;
    const now = Date.now();
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      updatedAt: now,
      sections: notebook.sections.map((section) => section.id === sectionId ? { ...section, trashedAt: now, updatedAt: now } : section),
    }));
  };

  const handleRestoreSection = (sectionId: string) => {
    if (!activeNotebook) return;
    const now = Date.now();
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook, updatedAt: now, sections: notebook.sections.map((section) => section.id === sectionId ? { ...section, trashedAt: null, updatedAt: now } : section),
    }));
    setSelectedSectionId(sectionId);
    const restored = activeNotebook.sections.find((section) => section.id === sectionId);
    setSelectedPageId(restored?.pages.find((page) => !page.trashedAt)?.id ?? restored?.pages[0]?.id ?? '');
  };

  const handleCreatePage = (templateId: NoteTemplateId | string = 'blank'): NotePage | null => {
    if (!activeNotebook || !activeSection) return null;
    const custom = activeNotebook.templates?.find((candidate) => candidate.id === templateId && candidate.scope === 'page');
    const page = custom ? instantiatePageTemplate(custom) : createNotePageFromTemplate(templateId as NoteTemplateId);
    if (!page) return null;
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      sections: notebook.sections.map((section) => section.id === activeSection.id ? { ...section, pages: [page, ...section.pages], updatedAt: Date.now() } : section),
    }));
    setSelectedPageId(page.id);
    return page;
  };

  /**
   * AST-0711/AST-0715 (DEF-NOTES-005): the daily note is looked up across the whole notebook, and reaching
   * an existing day is also a request to type in it — so the handler returns the page in both cases and the
   * controller can move the caret into it.
   */
  const handleCreateDailyNote = (): NotePage | null => {
    if (!activeNotebook || !activeSection) return null;
    const existing = findDailyNotePage(activeNotebook);
    if (existing) {
      navigateToPage(existing.id);
      return existing;
    }
    const page = createNotePageFromTemplate('daily');
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      sections: notebook.sections.map((section) => section.id === activeSection.id ? { ...section, pages: [page, ...section.pages], updatedAt: Date.now() } : section),
    }));
    setSelectedPageId(page.id);
    return page;
  };

  const handleDeletePage = (pageId: string) => {
    if (!activeNotebook || !activeSection) return;
    const liveCount = activeSection.pages.filter((page) => !page.trashedAt).length;
    if (liveCount <= 1) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      sections: notebook.sections.map((section) => section.id === activeSection.id ? softDeletePage(section, pageId) : section),
    }));
    if (selectedPageId === pageId) setSelectedPageId(activeSection.pages.find((page) => page.id !== pageId && !page.trashedAt)?.id ?? '');
  };

  const handleRestorePage = (pageId: string) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      sections: notebook.sections.map((section) => section.pages.some((page) => page.id === pageId) ? restorePage(section, pageId) : section),
    }));
  };

  /**
   * AST-0654: a rejected re-parenting is reported with its concrete reason instead of silently keeping
   * the previous parent. The hierarchy rule itself stays in `notesHierarchy` — not duplicated here.
   *
   * W-397, the outcome half: the OUTCOME and the WRITE are decided against **one** snapshot, the live one.
   * The rejection used to be computed from the render-time `activeSection` memo while `replaceNotebook`
   * writes through `notebooksRef.current`, whose `setPageParent` re-checks the rule against the live section.
   * Two hierarchy changes in one tick therefore let the second be reported as accepted — `null` is what makes
   * `NotesPagesList.applyParentChange` clear its hierarchy notice — and then refused by the live write. The
   * user saw no message and nothing moved. Measured, both directions, in
   * `testing/hierarchy/notesSetPageParentOutcomeMatchesWrite.test.tsx`.
   * Now: `null` means the move is written, and a rejection means nothing is persisted at all.
   */
  const handleSetPageParent = (pageId: string, parentPageId: string | null): NoteParentRejection | null => {
    if (!activeNotebook || !activeSection) return { pageId, parentPageId, reason: 'missing', message: 'No section is selected.' };
    // The section the write will actually be applied to. `persistNotebooks` advances this ref synchronously
    // before the host call, so it is the live truth even inside a single render.
    const liveNotebook = notebooksRef.current.find((candidate) => candidate.id === activeNotebook.id);
    const liveSection = liveNotebook?.sections.find((candidate) => candidate.id === activeSection.id);
    // Not reachable while the ref and the memo share their notebook ids; kept because it is the only state in
    // which the write below would silently match nothing, and that must be reported, not assumed away.
    if (!liveSection) return { pageId, parentPageId, reason: 'missing', message: 'That page is no longer part of this section.' };
    const rejection = describeNoteParentRejection(liveSection, pageId, parentPageId);
    if (rejection) return rejection;
    // `setPageParent` re-checks the rule on the very instance that was just validated, so a `null` report can
    // no longer be followed by a fail-closed write.
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      sections: notebook.sections.map((section) => section.id === liveSection.id ? setPageParent(section, pageId, parentPageId) : section),
    }));
    return null;
  };

  /**
   * W-397: accepts a plain patch **or** a function of the live page. The merge is delegated to the pure
   * `applyPagePatch`, which resolves the function form against the page as it exists *at that moment*, so two
   * edits in the same tick accumulate instead of the second one overwriting the first.
   */
  const handleUpdateCurrentPage = (partial: NotePagePatch) => {
    if (!activeNotebook || !activeSection || !activePage || noteSecurity.isPageLocked(activeNotebook, activeSection, activePage)) return;
    const now = Date.now();
    replaceNotebook(activeNotebook.id, (notebook) => {
      const section = notebook.sections.find((candidate) => candidate.id === activeSection.id);
      const live = section?.pages.find((candidate) => candidate.id === activePage.id);
      if (!section || !live) return notebook;
      const updatedPage = applyPagePatch(live, partial, now);
      return {
        ...notebook,
        sections: notebook.sections.map((candidate) => candidate.id === activeSection.id ? {
          ...candidate,
          updatedAt: now,
          pages: candidate.pages.map((page) => page.id === activePage.id ? updatedPage : page),
        } : candidate),
      };
    });
  };

  const collaborationActions = createNotesCollaborationActions({
    activeNotebook, activeSection, activePage, replaceNotebook, updateCurrentPage: handleUpdateCurrentPage,
  });

  const handleSetProperty = (key: string, value: NotePropertyValue) => {
    if (!activePage) return;
    // W-397: functional, so two properties set in one tick both survive.
    handleUpdateCurrentPage((page) => ({ properties: { ...(page.properties ?? {}), [key]: value } }));
  };
  const handleRemoveProperty = (key: string) => {
    if (!activePage) return;
    handleUpdateCurrentPage((page) => {
      const properties = { ...(page.properties ?? {}) };
      delete properties[key];
      return { properties };
    });
  };

  const saveTemplate = (scope: 'page' | 'section' | 'notebook', name: string) => {
    if (!activeNotebook || !activeSection || !activePage) return;
    const template = scope === 'page'
      ? createTemplateFromPage(activePage, name)
      : scope === 'section'
        ? createTemplateFromSection(activeSection, name)
        : createTemplateFromNotebook(activeNotebook, name);
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, templates: [...(notebook.templates ?? []), template].slice(-128) }));
  };
  const deleteTemplate = (templateId: string) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, templates: (notebook.templates ?? []).filter((template) => template.id !== templateId) }));
  };
  const instantiateTemplate = (template: NoteTemplateRecord) => {
    if (template.scope === 'page') return handleCreatePage(template.id);
    if (template.scope === 'section') return handleCreateSection(template.section?.title ?? template.name, null, template.id);
    const notebook = instantiateNotebookTemplate(template);
    if (!notebook) return;
    persistNotebooks([...notebooks, notebook]);
    setSelectedNotebookId(notebook.id);
    setSelectedSectionId(notebook.sections[0]?.id ?? '');
    setSelectedPageId(notebook.sections[0]?.pages[0]?.id ?? '');
  };

  const knowledgeIndex = useMemo(() => buildKnowledgeIndex(notebooks), [notebooks]);
  const linkedMentions = useMemo(() => activePage
    ? (knowledgeIndex.incoming.get(activePage.id) ?? []).map((id) => allPagesList.find((item) => item.id === id)).filter((item): item is PageFlatItem => Boolean(item))
    : [], [activePage, knowledgeIndex, allPagesList]);
  const outgoingLinks = useMemo(() => activePage
    ? (knowledgeIndex.outgoing.get(activePage.id) ?? []).map((id) => allPagesList.find((item) => item.id === id)).filter((item): item is PageFlatItem => Boolean(item))
    : [], [activePage, knowledgeIndex, allPagesList]);
  const unlinkedMentions = useMemo(() => activePage
    ? knowledgeIndex.unlinkedMentions.filter((mention) => mention.targetPageId === activePage.id)
    : [], [activePage, knowledgeIndex]);
  const brokenLinks = useMemo(() => activePage
    ? knowledgeIndex.broken.filter((link) => link.sourcePageId === activePage.id)
    : [], [activePage, knowledgeIndex]);
  const relatedNotes = useMemo(() => activePage ? suggestRelatedNotes(activePage.id, notebooks) : [], [activePage, notebooks]);
  const referenceCount = activePage ? knowledgeIndex.referenceCounts.get(activePage.id) ?? { incoming: 0, outgoing: 0, mentions: 0 } : { incoming: 0, outgoing: 0, mentions: 0 };
  const resolveKnowledgeReference = (reference: Pick<ParsedWikiReference, 'targetLabel' | 'anchor' | 'transclusion'>) =>
    activePage ? resolveParsedKnowledgeReference(activePage, reference, notebooks) : null;
  const handleAddAlias = (alias: string) => {
    if (!activePage) return;
    handleUpdateCurrentPage((page) => ({ aliases: sanitizeNoteAliases([...(page.aliases ?? []), alias]) }));
  };
  const handleRemoveAlias = (alias: string) => {
    if (!activePage) return;
    const key = alias.normalize('NFKC').trim().toLocaleLowerCase();
    handleUpdateCurrentPage((page) => ({ aliases: (page.aliases ?? []).filter((entry) => entry.normalize('NFKC').trim().toLocaleLowerCase() !== key) }));
  };
  const tagDefinitions = useMemo(() => activeNotebook ? allNoteTagDefinitions(activeNotebook) : [], [activeNotebook]);
  const allTagsInNotebook = useMemo(() => Array.from(new Set([
    ...tagDefinitions.map((tag) => tag.name),
    ...(activeNotebook?.sections.flatMap((section) => section.pages.flatMap((page) => page.tags)) ?? []),
  ])).sort((a, b) => a.localeCompare(b)), [activeNotebook, tagDefinitions]);
  const tagSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const section of activeNotebook?.sections ?? []) for (const page of section.pages) if (!page.trashedAt) for (const tag of page.tags) {
      const key = tag.normalize('NFKC').trim().toLocaleLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [activeNotebook]);
  const smartCollections = activeNotebook?.smartCollections ?? [];
  const activeSmartCollection = smartCollections.find((collection) => collection.id === selectedSmartCollectionId) ?? null;
  const {
    searchQuery, setSearchQuery, selectedTagFilter, setSelectedTagFilter, searchScope, setSearchScope,
    showArchived, setShowArchived, favoritesOnly, setFavoritesOnly, searchDateFrom, setSearchDateFrom,
    searchDateTo, setSearchDateTo, filteredPages, searchResultsByPageId, savedSearches, selectedSavedSearchId,
    applySavedSearch, saveCurrentSearch, deleteSavedSearch, searchScanTruncated, searchScannedPages,
  } = useNotesSearch({ notebooks: noteSecurity.searchableNotebooks, activeNotebook, activeSectionId: activeSection?.id ?? '', activePageId: activePage?.id ?? '', pageCollection, activeSmartCollection, replaceNotebook });
  /**
   * AST-0751/AST-0754: the search index boundary is measured against the *raw* documents, so the UI can say
   * how many locked notes were withheld instead of leaving an invisible gap.
   */
  const searchIndexBoundary = useMemo(
    () => measureNotesSearchIndexBoundary(notebooks, noteSecurity.searchableNotebooks),
    [notebooks, noteSecurity.searchableNotebooks]
  );


  const handleUpsertCustomTag = (input: { id?: string; name: string; icon: string; color: string }) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => upsertCustomNoteTag(notebook, input));
  };
  const handleDeleteCustomTag = (tagId: string) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => deleteCustomNoteTag(notebook, tagId));
  };
  const handleCreateSmartCollection = (name: string, query: NoteSmartCollectionQuery) => {
    if (!activeNotebook) return;
    const collection = createSmartCollection(name, query);
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, smartCollections: [...(notebook.smartCollections ?? []), collection].slice(-128) }));
    setSelectedSmartCollectionId(collection.id);
  };
  const handleDeleteSmartCollection = (collectionId: string) => {
    if (!activeNotebook) return;
    replaceNotebook(activeNotebook.id, (notebook) => ({ ...notebook, smartCollections: (notebook.smartCollections ?? []).filter((collection) => collection.id !== collectionId) }));
    if (selectedSmartCollectionId === collectionId) setSelectedSmartCollectionId(null);
  };
  /**
   * AST-0664: converting a checklist line used to be a silent no-op when the line was not a checklist item
   * (or was already linked). The outcome is now reported so the UI can say what happened.
   */
  /**
   * AST-0716 (DEF-NOTES-004): restoring a revision keeps the newer text as a named safety revision and
   * restores the editor mode and canvas as well, instead of silently emptying a freeform page.
   */
  const handleRestoreRevision = (revision: NotePageRevision): NoteMutationOutcome => {
    if (!activeNotebook || !activeSection || !activePage) return { ok: false, message: 'No note is selected.' };
    const plan = planRevisionRestore(activePage, revision);
    if (!plan) return { ok: false, message: 'That revision is identical to the current note, so nothing was restored.' };
    replaceNotebook(activeNotebook.id, (notebook) => ({
      ...notebook,
      updatedAt: Date.now(),
      sections: notebook.sections.map((section) => section.id === activeSection.id ? {
        ...section,
        updatedAt: Date.now(),
        pages: section.pages.map((page) => {
          if (page.id !== activePage.id) return page;
          const safety: NotePageRevision = { ...plan.safetyRevision, id: createNoteEntityId('rev') };
          const next: NotePage = { ...page, ...plan.patch, last_modified: Date.now() };
          return { ...next, revisions: [...(page.revisions ?? []), safety].slice(-MAX_NOTE_REVISIONS) };
        }),
      } : section),
    }));
    return { ok: true, message: plan.summary };
  };

  const handleAddComment = (input: { selection: string | null; body: string }, authorId: string, authorName: string, parentId?: string | null): NoteMutationOutcome => {
    if (!activePage) return { ok: false, message: 'No note is selected.' };
    const anchored = buildSelectionCommentBody(input.selection, input.body);
    if (!anchored.body) return { ok: false, message: 'Comment text is required.' };
    try {
      collaborationActions.addComment(anchored.body, authorId, authorName, parentId);
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'The comment could not be stored.' };
    }
    return {
      ok: true,
      message: anchored.selection ? `Comment anchored to “${anchored.selection.slice(0, 60)}”.` : 'Comment added.',
    };
  };

  const handleConvertChecklistToTask = (lineIndex: number): NoteMutationOutcome => {
    if (!activeNotebook || !activeSection || !activePage) return { ok: false, message: 'No note is selected.' };
    const conversion = convertChecklistToCanonicalTask(activePage, lineIndex, document.id, canonicalTasks);
    if (!conversion) return { ok: false, message: `Line ${lineIndex + 1} is not a checklist item, so no task was created.` };
    if (conversion.page === activePage && canonicalTasks.some((task) => task.id === conversion.task.id)) {
      return { ok: true, message: 'That checklist item is already linked to a canonical task.' };
    }
    const now = Date.now();
    const nextPage = appendPageRevision(activePage, conversion.page, now);
    const nextNotebooks = notebooks.map((notebook) => notebook.id === activeNotebook.id ? {
      ...notebook,
      sections: notebook.sections.map((section) => section.id === activeSection.id ? { ...section, updatedAt: now, pages: section.pages.map((page) => page.id === activePage.id ? nextPage : page) } : section),
    } : notebook);
    const nextTasks = canonicalTasks.some((task) => task.id === conversion.task.id) ? canonicalTasks : [conversion.task, ...canonicalTasks];
    persistNotebooks(nextNotebooks, nextTasks);
    return { ok: true, message: `Created canonical task “${conversion.task.title}”.`, taskId: conversion.task.id };
  };

  /**
   * AST-0679: tag edits are validated with the canonical tag key (`noteTagKey`) instead of a raw
   * `toLocaleLowerCase()` comparison, so `" Research "` no longer becomes a second tag next to `"research"`,
   * and every refusal is named.
   */
  const handleAddTag = (tag: string): NoteMutationOutcome => {
    const live = notebooksRef.current
      .find((notebook) => notebook.id === activeNotebook?.id)?.sections
      .find((section) => section.id === activeSection?.id)?.pages
      .find((page) => page.id === activePage?.id) ?? activePage;
    if (!activePage || !live) return { ok: false, message: 'No note is selected.' };
    const validation = validateNoteTagInput(live, tag);
    if (!validation.ok) return { ok: false, message: validation.message };
    // W-397: expressed against the live page, so two tags added in one tick both survive.
    handleUpdateCurrentPage((page) => ({ tags: [...page.tags, validation.tag] }));
    return { ok: true, message: `Added tag “${validation.tag}”.` };
  };
  const handleRemoveTag = (tag: string): NoteMutationOutcome => {
    if (!activePage) return { ok: false, message: 'No note is selected.' };
    const key = noteTagKey(tag);
    if (!activePage.tags.some((entry) => noteTagKey(entry) === key)) return { ok: false, message: `“${tag}” is not on this note.` };
    handleUpdateCurrentPage((page) => ({ tags: page.tags.filter((entry) => noteTagKey(entry) !== key) }));
    return { ok: true, message: `Removed tag “${tag}”.` };
  };
  const togglePinned = () => activePage && handleUpdateCurrentPage((page) => ({ pinned: !page.pinned }));
  const toggleFavorite = () => activePage && handleUpdateCurrentPage((page) => ({ favorite: !page.favorite }));
  const toggleArchived = () => activePage && handleUpdateCurrentPage((page) => ({ archived: !page.archived }));
  // W-397: a multi-file drop calls this once per file in the same tick; the list must accumulate.
  const addAttachment = (attachment: NoteAttachment) => activePage
    && handleUpdateCurrentPage((page) => appendNoteAttachment(page, attachment) === page ? {} : { attachments: [...(page.attachments ?? []), attachment] });
  const removeAttachment = (attachmentId: string) => activePage
    && handleUpdateCurrentPage((page) => ({ attachments: removeNoteAttachment(page, attachmentId).attachments }));

  return {
    notebooks, selectedNotebookId, setSelectedNotebookId, selectedSectionId, setSelectedSectionId, selectedPageId, setSelectedPageId,
    searchQuery, setSearchQuery, selectedTagFilter, setSelectedTagFilter, searchScope, setSearchScope, showArchived, setShowArchived,
    favoritesOnly, setFavoritesOnly, searchDateFrom, setSearchDateFrom, searchDateTo, setSearchDateTo, pageCollection, setPageCollection, activeNotebook, activeSection, activePage, filteredPages, searchResultsByPageId,
    savedSearches, selectedSavedSearchId, applySavedSearch, saveCurrentSearch, deleteSavedSearch,
    searchScanTruncated, searchScannedPages, searchIndexBoundary,
    allTagsInNotebook, tagDefinitions, tagSummary, smartCollections, selectedSmartCollectionId, setSelectedSmartCollectionId, allPagesList,
    linkedMentions, outgoingLinks, knowledgeIndex, unlinkedMentions, brokenLinks, relatedNotes, referenceCount, resolveKnowledgeReference,
    handleAddAlias, handleRemoveAlias, handleUpsertCustomTag, handleDeleteCustomTag, handleCreateSmartCollection, handleDeleteSmartCollection, handleConvertChecklistToTask,
    handleCreateNotebook, handleDeleteNotebook, handleCreateSectionGroup,
    handleCreateSection, handleMoveSectionToGroup, handleDeleteSection, handleRestoreSection, handleCreatePage, handleCreateDailyNote, handleDeletePage,
    handleRestorePage, handleAddComment, handleResolveComment: collaborationActions.resolveComment, handleCreateNamedSnapshot: collaborationActions.createNamedSnapshot, handleToggleAuthorAttribution: collaborationActions.toggleAuthorAttribution, handleSetPageParent, handleUpdateCurrentPage, handleSetProperty, handleRemoveProperty, navigateToPage,
    handleRestoreRevision,
    handleAddTag, handleRemoveTag, togglePinned, toggleFavorite, toggleArchived, addAttachment, removeAttachment,
    saveTemplate, deleteTemplate, instantiateTemplate, noteSecurity,
  };
}
