// STATUS: DIAMANT VGT SUPREME — Reversible Table Mutation Orchestrator
import { useCallback } from 'react';
import type { TableBlockData, TrackChangeRevision, WriterDocumentData, WriterProtectionMode } from '../../types';
import { createTableRevision } from '../../review/revisions/track-changes/writerTrackChangesEngine';
import { canEditText } from '../../security/protection/writerProtectionEngine';

interface UseWriterTrackedTableOperationsProps {
  tables: TableBlockData[];
  revisions: TrackChangeRevision[];
  trackChangesActive: boolean;
  activeParagraphId?: string;
  protectionMode?: WriterProtectionMode;
  persistWriterData: (patch: Partial<WriterDocumentData>) => void;
}

export function useWriterTrackedTableOperations({
  tables,
  revisions,
  trackChangesActive,
  activeParagraphId,
  protectionMode = 'none',
  persistWriterData,
}: UseWriterTrackedTableOperationsProps) {
  const persistTables = useCallback((nextTables: TableBlockData[], revision?: TrackChangeRevision) => {
    persistWriterData({
      tables: nextTables,
      revisions: revision ? [...revisions, revision] : revisions,
    });
  }, [persistWriterData, revisions]);

  const insertTable = useCallback((table: TableBlockData) => {
    if (!canEditText(protectionMode)) return;
    const index = tables.length;
    const revision = trackChangesActive
      ? createTableRevision(table.id, undefined, table, undefined, index, activeParagraphId, 'You', 'Tabelle eingefügt')
      : undefined;
    persistTables([...tables, table], revision);
  }, [activeParagraphId, persistTables, protectionMode, tables, trackChangesActive]);

  const updateTable = useCallback((table: TableBlockData) => {
    if (!canEditText(protectionMode)) return;
    const index = tables.findIndex((candidate) => candidate.id === table.id);
    if (index < 0) return;
    const before = tables[index];
    if (JSON.stringify(before) === JSON.stringify(table)) return;
    const next = [...tables];
    next[index] = table;
    const revision = trackChangesActive
      ? createTableRevision(table.id, before, table, index, index, activeParagraphId, 'You', 'Tabelle geändert')
      : undefined;
    persistTables(next, revision);
  }, [activeParagraphId, persistTables, protectionMode, tables, trackChangesActive]);

  const deleteTable = useCallback((tableId: string) => {
    if (!canEditText(protectionMode)) return;
    const index = tables.findIndex((candidate) => candidate.id === tableId);
    if (index < 0) return;
    const before = tables[index];
    const next = tables.filter((candidate) => candidate.id !== tableId);
    const revision = trackChangesActive
      ? createTableRevision(tableId, before, undefined, index, undefined, activeParagraphId, 'You', 'Tabelle gelöscht')
      : undefined;
    persistTables(next, revision);
  }, [activeParagraphId, persistTables, protectionMode, tables, trackChangesActive]);

  const splitTable = useCallback((top: TableBlockData, bottom: TableBlockData) => {
    if (!canEditText(protectionMode)) return;
    const index = tables.findIndex((candidate) => candidate.id === top.id);
    if (index < 0) return;
    const before = tables[index];
    const next = [...tables];
    next.splice(index, 1, top, bottom);
    const generated = trackChangesActive ? [
      createTableRevision(top.id, before, top, index, index, activeParagraphId, 'You', 'Tabelle geteilt: oberer Teil'),
      createTableRevision(bottom.id, undefined, bottom, undefined, index + 1, activeParagraphId, 'You', 'Tabelle geteilt: unterer Teil'),
    ] : [];
    persistWriterData({ tables: next, revisions: [...revisions, ...generated] });
  }, [activeParagraphId, persistWriterData, protectionMode, revisions, tables, trackChangesActive]);

  return { insertTable, updateTable, deleteTable, splitTable };
}
