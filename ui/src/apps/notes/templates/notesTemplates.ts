// STATUS: DIAMANT VGT SUPREME — bounded persistent Notes templates

import type {
  NoteNotebook,
  NotePage,
  NoteSection,
  NoteTemplateRecord,
  NoteTemplateScope,
} from '../../../shared/contracts/workspace';
import { createNoteEntityId, sanitizeNoteProperties, sanitizeNoteTitle } from '../model/notesHierarchy';

const MAX_TEMPLATE_PAGES = 64;
const MAX_TEMPLATE_SECTIONS = 32;
const MAX_TEMPLATE_CONTENT_CHARS = 1_000_000;

function pageSnapshot(page: NotePage) {
  return {
    title: sanitizeNoteTitle(page.title, 'Untitled Note'),
    content: page.content.slice(0, MAX_TEMPLATE_CONTENT_CHARS),
    tags: [...page.tags].slice(0, 64),
    properties: sanitizeNoteProperties(page.properties),
  };
}

export function createTemplateFromPage(page: NotePage, name: string, now = Date.now()): NoteTemplateRecord {
  return {
    id: createNoteEntityId('tpl-page'),
    name: sanitizeNoteTitle(name, `${page.title} Template`),
    scope: 'page',
    createdAt: now,
    updatedAt: now,
    page: pageSnapshot(page),
  };
}

export function createTemplateFromSection(section: NoteSection, name: string, now = Date.now()): NoteTemplateRecord {
  return {
    id: createNoteEntityId('tpl-section'),
    name: sanitizeNoteTitle(name, `${section.title} Template`),
    scope: 'section',
    createdAt: now,
    updatedAt: now,
    section: {
      title: sanitizeNoteTitle(section.title, 'Untitled Section'),
      pages: section.pages.filter((page) => !page.trashedAt).slice(0, MAX_TEMPLATE_PAGES).map(pageSnapshot),
    },
  };
}

export function createTemplateFromNotebook(notebook: NoteNotebook, name: string, now = Date.now()): NoteTemplateRecord {
  return {
    id: createNoteEntityId('tpl-notebook'),
    name: sanitizeNoteTitle(name, `${notebook.title} Template`),
    scope: 'notebook',
    createdAt: now,
    updatedAt: now,
    notebook: {
      title: sanitizeNoteTitle(notebook.title, 'Untitled Notebook'),
      sections: notebook.sections.filter((section) => !section.trashedAt).slice(0, MAX_TEMPLATE_SECTIONS).map((section) => ({
        title: sanitizeNoteTitle(section.title, 'Untitled Section'),
        pages: section.pages.filter((page) => !page.trashedAt).slice(0, MAX_TEMPLATE_PAGES).map(pageSnapshot),
      })),
    },
  };
}

function instantiatePageSnapshot(snapshot: NonNullable<NoteTemplateRecord['page']>, now: number, templateId?: string): NotePage {
  return {
    id: createNoteEntityId('page'),
    title: sanitizeNoteTitle(snapshot.title, 'Untitled Note'),
    content: snapshot.content.slice(0, MAX_TEMPLATE_CONTENT_CHARS),
    tags: [...snapshot.tags].slice(0, 64),
    backlinks: [],
    properties: sanitizeNoteProperties(snapshot.properties),
    created_at: now,
    last_modified: now,
    parentPageId: null,
    trashedAt: null,
    templateId,
    attachments: [],
    revisions: [],
  };
}

export function instantiatePageTemplate(template: NoteTemplateRecord, now = Date.now()): NotePage | null {
  if (template.scope !== 'page' || !template.page) return null;
  return instantiatePageSnapshot(template.page, now, template.id);
}

export function instantiateSectionTemplate(template: NoteTemplateRecord, now = Date.now()): NoteSection | null {
  if (template.scope !== 'section' || !template.section) return null;
  return {
    id: createNoteEntityId('sec'),
    title: sanitizeNoteTitle(template.section.title, 'Untitled Section'),
    pages: template.section.pages.slice(0, MAX_TEMPLATE_PAGES).map((page) => instantiatePageSnapshot(page, now, template.id)),
    groupId: null,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
}

export function instantiateNotebookTemplate(template: NoteTemplateRecord, now = Date.now()): NoteNotebook | null {
  if (template.scope !== 'notebook' || !template.notebook) return null;
  const sections = template.notebook.sections.slice(0, MAX_TEMPLATE_SECTIONS).map((section) => ({
    id: createNoteEntityId('sec'),
    title: sanitizeNoteTitle(section.title, 'Untitled Section'),
    pages: section.pages.slice(0, MAX_TEMPLATE_PAGES).map((page) => instantiatePageSnapshot(page, now, template.id)),
    groupId: null,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  }));
  return {
    id: createNoteEntityId('nb'),
    title: sanitizeNoteTitle(template.notebook.title, 'Untitled Notebook'),
    sections: sections.length > 0 ? sections : [{
      id: createNoteEntityId('sec'),
      title: 'General',
      pages: [instantiatePageSnapshot({ title: 'Untitled Note', content: '# Untitled Note\n\n', tags: [] }, now, template.id)],
      groupId: null,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
    }],
    sectionGroups: [],
    templates: [],
    recentPageIds: [],
    navigationHistory: [],
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
  };
}

export function templatesByScope(templates: NoteTemplateRecord[] | undefined, scope: NoteTemplateScope): NoteTemplateRecord[] {
  return (templates ?? []).filter((template) => template.scope === scope).slice(0, 128);
}
