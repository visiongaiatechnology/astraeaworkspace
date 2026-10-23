// STATUS: DIAMANT VGT SUPREME — Fail-Closed Reversible Writer Revision Engine
import type {
  Paragraph,
  WriterPageSetupConfig,
  WriterSectionDefinition,
  WriterStyleCatalog,
} from '../../../../shared/contracts/workspace';
import type { TableBlockData, TrackChangeRevision } from '../../types';

export interface WriterRevisionDocumentState {
  paragraphs: Paragraph[];
  tables: TableBlockData[];
  pageSetup: WriterPageSetupConfig;
  sections: WriterSectionDefinition[];
  styleCatalog: WriterStyleCatalog;
  currentTheme?: string;
}

export interface WriterRevisionRevertSuccess {
  ok: true;
  state: WriterRevisionDocumentState;
}

export interface WriterRevisionRevertConflict {
  ok: false;
  reason: string;
}

export type WriterRevisionRevertResult = WriterRevisionRevertSuccess | WriterRevisionRevertConflict;

function stableJson(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function cloneParagraph(paragraph: Paragraph): Paragraph {
  return structuredClone(paragraph);
}

function paragraphText(paragraph: Paragraph): string {
  return paragraph.spans.map((span) => span.text).join('');
}

function replaceParagraphText(paragraph: Paragraph, text: string): Paragraph {
  const first = paragraph.spans[0];
  return {
    ...paragraph,
    spans: [{ ...(first ?? {}), text }],
  };
}

function restoreParagraphOrder(paragraphs: readonly Paragraph[], order: readonly string[]): Paragraph[] | null {
  if (paragraphs.length !== order.length) return null;
  const byId = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph]));
  if (byId.size !== order.length) return null;
  const restored: Paragraph[] = [];
  for (const paragraphId of order) {
    const paragraph = byId.get(paragraphId);
    if (!paragraph) return null;
    restored.push(paragraph);
  }
  return restored;
}

function currentOrder(paragraphs: readonly Paragraph[]): string[] {
  return paragraphs.map((paragraph) => paragraph.id);
}

export function revertWriterRevision(
  state: WriterRevisionDocumentState,
  revision: TrackChangeRevision,
): WriterRevisionRevertResult {
  if (revision.status !== 'pending') {
    return { ok: false, reason: 'Nur offene Revisionen können abgelehnt werden.' };
  }

  const payload = revision.payload;
  if (!payload) {
    if (revision.originalText === undefined) {
      return { ok: false, reason: 'Revision besitzt keinen reversiblen Payload.' };
    }
    const paragraphIndex = state.paragraphs.findIndex((paragraph) => paragraph.id === revision.paragraphId);
    if (paragraphIndex < 0) return { ok: false, reason: 'Zielabsatz existiert nicht mehr.' };
    const paragraph = state.paragraphs[paragraphIndex];
    if (revision.newText !== undefined && paragraphText(paragraph) !== revision.newText) {
      return { ok: false, reason: 'Zielabsatz wurde nach der Revision weiter verändert.' };
    }
    const paragraphs = [...state.paragraphs];
    paragraphs[paragraphIndex] = replaceParagraphText(paragraph, revision.originalText);
    return { ok: true, state: { ...state, paragraphs } };
  }

  switch (payload.kind) {
    case 'text': {
      const paragraphIndex = state.paragraphs.findIndex((paragraph) => paragraph.id === revision.paragraphId);
      if (paragraphIndex < 0) return { ok: false, reason: 'Zielabsatz existiert nicht mehr.' };
      const paragraph = state.paragraphs[paragraphIndex];
      const paragraphs = [...state.paragraphs];
      if (payload.beforeParagraph && payload.afterParagraph) {
        if (!sameValue(paragraph, payload.afterParagraph)) {
          return { ok: false, reason: 'Absatz wurde nach der Textrevision weiter verändert.' };
        }
        paragraphs[paragraphIndex] = cloneParagraph(payload.beforeParagraph);
      } else {
        if (paragraphText(paragraph) !== payload.afterText) {
          return { ok: false, reason: 'Text wurde nach der Revision weiter verändert.' };
        }
        paragraphs[paragraphIndex] = replaceParagraphText(paragraph, payload.beforeText);
      }
      return { ok: true, state: { ...state, paragraphs } };
    }

    case 'paragraph-insert': {
      const paragraphIndex = state.paragraphs.findIndex((paragraph) => paragraph.id === payload.paragraph.id);
      if (paragraphIndex < 0) return { ok: false, reason: 'Eingefügter Absatz existiert nicht mehr.' };
      if (paragraphIndex !== payload.index || !sameValue(state.paragraphs[paragraphIndex], payload.paragraph)) {
        return { ok: false, reason: 'Eingefügter Absatz wurde verschoben oder verändert.' };
      }
      const paragraphs = state.paragraphs.filter((paragraph) => paragraph.id !== payload.paragraph.id);
      return { ok: true, state: { ...state, paragraphs } };
    }

    case 'paragraph-delete': {
      if (state.paragraphs.some((paragraph) => paragraph.id === payload.paragraph.id)) {
        return { ok: false, reason: 'Gelöschter Absatz ist bereits wieder vorhanden.' };
      }
      const previousId = state.paragraphs[payload.index - 1]?.id;
      const nextId = state.paragraphs[payload.index]?.id;
      if ((payload.previousParagraphId && previousId !== payload.previousParagraphId)
        || (payload.nextParagraphId && nextId !== payload.nextParagraphId)) {
        return { ok: false, reason: 'Absatzumgebung hat sich seit der Löschung verändert.' };
      }
      const paragraphs = [...state.paragraphs];
      paragraphs.splice(Math.min(payload.index, paragraphs.length), 0, cloneParagraph(payload.paragraph));
      return { ok: true, state: { ...state, paragraphs } };
    }

    case 'move': {
      if (!sameValue(currentOrder(state.paragraphs), payload.afterOrder)) {
        return { ok: false, reason: 'Absatzreihenfolge wurde nach der Verschiebung verändert.' };
      }
      const paragraphs = restoreParagraphOrder(state.paragraphs, payload.beforeOrder);
      if (!paragraphs) return { ok: false, reason: 'Ursprüngliche Absatzreihenfolge kann nicht wiederhergestellt werden.' };
      return { ok: true, state: { ...state, paragraphs } };
    }

    case 'format': {
      const paragraphIndex = state.paragraphs.findIndex((paragraph) => paragraph.id === payload.afterParagraph.id);
      if (paragraphIndex < 0) return { ok: false, reason: 'Formatierter Absatz existiert nicht mehr.' };
      if (!sameValue(state.paragraphs[paragraphIndex], payload.afterParagraph)) {
        return { ok: false, reason: 'Absatz wurde nach der Formatrevision weiter verändert.' };
      }
      const paragraphs = [...state.paragraphs];
      paragraphs[paragraphIndex] = cloneParagraph(payload.beforeParagraph);
      return { ok: true, state: { ...state, paragraphs } };
    }

    case 'structural-break': {
      const head = state.paragraphs[payload.index];
      const tail = state.paragraphs[payload.index + 1];
      if (!head || !tail
        || !sameValue(head, payload.afterHead)
        || !sameValue(tail, payload.insertedTail)) {
        return { ok: false, reason: 'Struktureller Umbruch wurde nach der Revision verändert oder verschoben.' };
      }
      if (payload.afterSections && !sameValue(state.sections, payload.afterSections)) {
        return { ok: false, reason: 'Abschnittsstruktur wurde nach dem Umbruch weiter verändert.' };
      }
      const paragraphs = [...state.paragraphs];
      paragraphs.splice(payload.index, 2, cloneParagraph(payload.beforeParagraph));
      return {
        ok: true,
        state: {
          ...state,
          paragraphs,
          sections: payload.beforeSections ? structuredClone(payload.beforeSections) : state.sections,
        },
      };
    }

    case 'table': {
      const currentIndex = state.tables.findIndex((table) => table.id === payload.tableId);
      const currentTable = currentIndex >= 0 ? state.tables[currentIndex] : undefined;
      if (!sameValue(currentTable, payload.afterTable)) {
        return { ok: false, reason: 'Tabelle wurde nach der Revision weiter verändert.' };
      }
      const tables = state.tables.filter((table) => table.id !== payload.tableId);
      if (payload.beforeTable) {
        const insertAt = Math.min(payload.beforeIndex ?? tables.length, tables.length);
        tables.splice(insertAt, 0, structuredClone(payload.beforeTable));
      }
      return { ok: true, state: { ...state, tables } };
    }

    case 'property': {
      switch (payload.property) {
        case 'pageSetup':
          if (!sameValue(state.pageSetup, payload.afterValue)) return { ok: false, reason: 'Seiteneinstellungen wurden nach der Revision verändert.' };
          return { ok: true, state: { ...state, pageSetup: structuredClone(payload.beforeValue) } };
        case 'sections':
          if (!sameValue(state.sections, payload.afterValue)) return { ok: false, reason: 'Abschnittseinstellungen wurden nach der Revision verändert.' };
          return { ok: true, state: { ...state, sections: structuredClone(payload.beforeValue) } };
        case 'styleCatalog':
          if (!sameValue(state.styleCatalog, payload.afterValue)) return { ok: false, reason: 'Formatvorlagen wurden nach der Revision verändert.' };
          return { ok: true, state: { ...state, styleCatalog: structuredClone(payload.beforeValue) } };
        case 'currentTheme':
          if (state.currentTheme !== payload.afterValue) return { ok: false, reason: 'Dokumenttheme wurde nach der Revision verändert.' };
          return { ok: true, state: { ...state, currentTheme: payload.beforeValue } };
      }
    }
  }
}
