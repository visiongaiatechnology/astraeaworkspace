// STATUS: DIAMANT VGT SUPREME — Sovereign Page Renderer Modular Helpers
import type { WriterStyleCatalog } from '../../../../shared/contracts/workspace';
import type { TableBlockData } from '../../types';
import { WriterTableBlock } from '../../editor/blocks/tables/WriterTableBlock';
import type { FormattedNote } from '../../references/notes/writerNotesEngine';

export interface TableFragmentDescriptor {
  key: string;
  table: TableBlockData;
  startRowIndex: number;
  endRowIndex: number;
  repeatHeader?: boolean;
  tableId: string;
}

/**
 * Renders a sliced table fragment for paginated paper view.
 */
export const renderTableFragment = (
  tf: TableFragmentDescriptor,
  tables: TableBlockData[],
  styleCatalog: WriterStyleCatalog,
  onUpdateTable: (t: TableBlockData) => void,
  onDeleteTable: (id: string) => void,
  onOpenTableProperties?: (t: TableBlockData) => void,
  readOnly = false,
) => {
  const slicedTable: TableBlockData = {
    ...tf.table,
    rows: tf.table.rows.slice(tf.startRowIndex, tf.endRowIndex),
  };

  return (
    <div key={tf.key} className="my-2">
      {tf.startRowIndex > 0 && (
        <div className="text-[0.625rem] text-slate-400 font-mono mb-1 italic">
          Tabelle fortgeführt (Zeilen {tf.startRowIndex + 1}–{tf.endRowIndex})...
        </div>
      )}
      <WriterTableBlock
        tableData={slicedTable}
        styleCatalog={styleCatalog}
        repeatHeader={tf.repeatHeader}
        tableIndex={tables.findIndex((t) => t.id === tf.tableId)}
        onUpdateTable={onUpdateTable}
        onDeleteTable={() => onDeleteTable(tf.tableId)}
        onOpenProperties={() => onOpenTableProperties?.(tf.table)}
        readOnly={readOnly}
      />
    </div>
  );
};

/**
 * Renders bottom-of-page footnotes with separation line and jump links.
 */
export const renderPageFootnotes = (pageFootnotes: FormattedNote[]) => {
  if (pageFootnotes.length === 0) return null;

  return (
    <div className="relative z-10 mt-6 pt-3 border-t border-slate-300/60 dark:border-white/10 text-[0.6875rem] text-slate-600 dark:text-slate-400 space-y-1 select-text">
      {pageFootnotes.map((fn) => (
        <div key={fn.note.id} id={fn.anchorId} className="flex items-start gap-1.5">
          <a
            href={`#${fn.refAnchorId}`}
            className="font-bold text-blue-600 dark:text-blue-400 hover:underline text-[0.625rem] shrink-0"
            title="Zurück zum Verweis im Text springen"
          >
            {fn.displayNumber}.
          </a>
          <span>{fn.note.text}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Renders document-end endnotes.
 */
export const renderDocumentEndnotes = (endnotes: FormattedNote[]) => {
  if (endnotes.length === 0) return null;

  return (
    <div className="relative z-10 mt-8 pt-4 border-t-2 border-slate-300 dark:border-white/20 text-[0.6875rem] text-slate-700 dark:text-slate-300 space-y-2 select-text">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
        Endnoten
      </div>
      {endnotes.map((en) => (
        <div key={en.note.id} id={en.anchorId} className="flex items-start gap-2">
          <a
            href={`#${en.refAnchorId}`}
            className="font-bold text-blue-500 hover:underline text-[0.625rem] font-mono shrink-0"
            title="Zurück zum Verweis im Text springen"
          >
            {en.displayNumber}.
          </a>
          <span>{en.note.text}</span>
        </div>
      ))}
    </div>
  );
};
