import type { NoteNotebook, NotePage, Paragraph } from '../../../shared/contracts/workspace';
import { createNoteEntityId } from './notesHierarchy';
export type NoteTemplateId = 'blank' | 'meeting' | 'research' | 'decision' | 'project' | 'daily';
export type { NotesSearchScope, NoteSearchResult } from '../search/notesSearchEngine';
export { searchNotesDetailed as searchNotes } from '../search/notesSearchEngine';

export interface NoteTemplateDefinition {
  id: NoteTemplateId;
  name: string;
  defaultTitle: string;
  content: (title: string, now: Date) => string;
  tags: string[];
}

export const NOTE_TEMPLATES: NoteTemplateDefinition[] = [
  {
    id: 'blank',
    name: 'Blank',
    defaultTitle: 'New Note',
    // AST-0641: a new note is genuinely empty. The former `# New Note\n\nStart writing...` scaffold
    // forced the user to delete placeholder text before the first real keystroke.
    content: () => '',
    tags: [],
  },
  {
    id: 'meeting',
    name: 'Meeting',
    defaultTitle: 'Meeting Notes',
    content: (title) => `# ${title}\n\n## Participants\n- \n\n## Agenda\n- \n\n## Decisions\n- \n\n## Action Items\n- [ ] `,
    tags: ['meeting'],
  },
  {
    id: 'research',
    name: 'Research',
    defaultTitle: 'Research Note',
    content: (title) => `# ${title}\n\n## Question\n\n## Sources\n- \n\n## Findings\n\n## Open Questions\n- `,
    tags: ['research'],
  },
  {
    id: 'decision',
    name: 'Decision Record',
    defaultTitle: 'Decision Record',
    content: (title) => `# ${title}\n\n## Context\n\n## Decision\n\n## Alternatives Considered\n- \n\n## Consequences\n`,
    tags: ['decision'],
  },
  {
    id: 'project',
    name: 'Project Journal',
    defaultTitle: 'Project Journal',
    content: (title) => `# ${title}\n\n## Current State\n\n## Progress\n- \n\n## Blockers\n- \n\n## Next Actions\n- [ ] `,
    tags: ['project'],
  },
  {
    id: 'daily',
    name: 'Daily Note',
    defaultTitle: 'Daily Note',
    content: (_title, now) => {
      const date = now.toISOString().slice(0, 10);
      return `# Daily Note: ${date}\n\n## Priorities\n- [ ] \n\n## Log\n- \n\n## Notes\n`;
    },
    tags: ['daily'],
  },
];

export function createNotePageFromTemplate(
  templateId: NoteTemplateId,
  nowMs: number = Date.now(),
  titleOverride?: string
): NotePage {
  const template = NOTE_TEMPLATES.find((item) => item.id === templateId) ?? NOTE_TEMPLATES[0];
  const now = new Date(nowMs);
  const date = now.toISOString().slice(0, 10);
  const defaultTitle = template.id === 'daily' ? `Daily Note: ${date}` : template.defaultTitle;
  const title = (titleOverride ?? defaultTitle).trim() || defaultTitle;
  return {
    id: createNoteEntityId(`page-${template.id}`),
    title,
    content: template.content(title, now),
    tags: [...template.tags],
    backlinks: [],
    created_at: nowMs,
    last_modified: nowMs,
    pinned: false,
    favorite: false,
    archived: false,
    trashedAt: null,
    parentPageId: null,
    properties: {},
    aliases: [],
    templateId: template.id,
    attachments: [],
    revisions: [],
  };
}

/**
 * AST-0711/AST-0715: the recurring daily note is looked up across the WHOLE notebook, not only in the
 * active section, so the same day cannot produce a second "Daily Note: <date>" page in another section.
 */
export function findDailyNotePage(
  notebook: Pick<NoteNotebook, 'sections'>,
  nowMs: number = Date.now(),
): NotePage | null {
  const title = dailyNoteTitle(nowMs);
  for (const section of notebook.sections) {
    if (section.trashedAt) continue;
    const match = section.pages.find((page) => !page.trashedAt && page.title === title);
    if (match) return match;
  }
  return null;
}

export function dailyNoteTitle(nowMs: number = Date.now()): string {
  return `Daily Note: ${new Date(nowMs).toISOString().slice(0, 10)}`;
}

/**
 * AST-0641/AST-0643: the canonical creation path for a note that is meant to be typed into at once.
 * The content is exactly the empty string — no placeholder heading, no "Start writing" filler — so the
 * caret sits at offset 0 and the very first keystroke is the first character of the note.
 */
export function createEmptyNotePage(nowMs: number = Date.now(), title = 'New Note'): NotePage {
  return createNotePageFromTemplate('blank', nowMs, title);
}

/**
 * **Die eine** Ableitung „Notes-Seite → Writer-Absätze".
 *
 * Sie stand bis hierher **privat** in `integrations/notesWorkspaceActions.ts` (`markdownParagraphs`) und wurde nur
 * vom Writer-Entwurf gelesen ✗. Seit der Objekt-Reparatur (**AST-0737-Abhängigkeit (4)**) braucht sie **zwei**
 * Leser: den Writer-Entwurf **und** das **Seitenobjekt** (`model/notesPageObjects.ts`). *Eine zweite Umsetzung
 * derselben Sache wäre die zweite Wahrheit, die dieses Projekt verbietet* ✓ — *deshalb steht sie hier, in der
 * Modell-Schicht, und wird von beiden gelesen, statt zweimal zu existieren.*
 *
 * Sie ist **rein** (kein DOM, kein Zustand) und **beschränkt** (20 000 Zeilen, wie zuvor).
 */
export function notePageParagraphs(page: NotePage): Paragraph[] {
  return page.content.split('\n').slice(0, 20_000).map((line, index) => {
    const heading = /^#\s+/.test(line) ? 1 : /^##\s+/.test(line) ? 2 : /^###\s+/.test(line) ? 3 : undefined;
    const text = line.replace(/^#{1,3}\s+/, '').replace(/^-\s+/, '• ').replace(/^- \[([ xX])\]\s+/, (_, checked: string) => checked.toLowerCase() === 'x' ? '☑ ' : '☐ ');
    return {
      id: `note-writer-${page.id}-${index}`,
      style: { heading_level: heading as 1 | 2 | 3 | undefined, alignment: 'left' as const, line_height: 1.5, space_before: heading ? 8 : 0, space_after: heading ? 5 : 4 },
      spans: [{ text, bold: Boolean(heading), font_size_pt: heading === 1 ? 20 : heading === 2 ? 16 : heading === 3 ? 13 : 10.5 }],
    };
  });
}

export function withPageUpdated(
  notebooks: NoteNotebook[],
  pageId: string,
  update: (page: NotePage) => NotePage
): NoteNotebook[] {
  return notebooks.map((notebook) => ({
    ...notebook,
    sections: notebook.sections.map((section) => ({
      ...section,
      pages: section.pages.map((page) => (page.id === pageId ? update(page) : page)),
    })),
  }));
}

// AST-0667: a second wiki-link parser used to live here (`extractWikiLinkTitles` / `resolveWikiLinkIds`)
// with a different normalisation (`.toLocaleLowerCase()` instead of NFKC + whitespace collapse) and no
// importers. Exactly one parser owns that rule: `parseWikiReferences` in
// `knowledge-graph/notesKnowledgeGraph.ts`. The duplicate was removed instead of being kept in sync.

