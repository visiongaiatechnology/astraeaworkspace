// STATUS: DIAMANT VGT SUPREME — canonical list/board/calendar/timeline views
import React, { useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  Columns3,
  Flag,
  LayoutList,
  Rows3,
  Search,
  SlidersHorizontal,
  TimerReset,
} from 'lucide-react';
import type {
  TaskFilterDefinition,
  TaskItem,
  TaskStatusDefinition,
  TaskViewPreferences,
} from '../../../shared/contracts/workspace';
import {
  boardTaskColumns,
  calendarTaskBuckets,
  groupTaskView,
  projectTaskView,
  timelineTaskItems,
} from './taskViews';
import { taskListPresentationRow } from '../task-list/taskListPresentation';
import {
  taskBoardColumnIds,
  taskBoardKeyboardTargets,
  taskBoardMovePatch,
} from './taskBoardMove';

interface TaskViewsPanelProps {
  tasks: TaskItem[];
  preferences: TaskViewPreferences;
  statusDefinitions: TaskStatusDefinition[];
  externalFilter?: TaskFilterDefinition;
  onChangePreferences: (preferences: TaskViewPreferences) => void;
  onToggleTask: (id: string) => void;
  onOpenTask: (id: string) => void;
  onBulkEdit: (taskIds: string[], patch: Partial<TaskItem>) => string | undefined;
  /** Board-only: persist a legal column move (drag or keyboard). Returns an error message, if any. */
  onMoveTaskToColumn?: (taskId: string, columnId: string) => string | undefined;
  /** Board-only: toggle completion with the board grouping's own semantics. */
  onToggleBoardTask?: (id: string) => void;
}

function csvValues(value: string): string[] | undefined {
  const values = value.split(',').map((item: string) => item.trim()).filter(Boolean);
  return values.length ? values : undefined;
}

function priorityClass(priority: TaskItem['priority']): string {
  return priority === 'high'
    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    : priority === 'medium'
      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
      : 'bg-blue-500/15 text-blue-300 border-blue-500/30';
}

const TaskRow: React.FC<{
  task: TaskItem;
  compact?: boolean;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  /** Present only in board mode: the id of the column this card currently sits in. */
  boardColumnId?: string;
  onBoardDragStart?: (taskId: string, columnId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onBoardDragEnd?: () => void;
  /** Legal columns this card can be moved to without a pointer. */
  keyboardTargets?: string[];
  onBoardKeyMove?: (taskId: string, columnId: string) => void;
  targetLabelFor?: (columnId: string) => string;
}> = ({ task, compact, selected, onSelect, onToggle, onOpen, boardColumnId, onBoardDragStart, onBoardDragEnd, keyboardTargets, onBoardKeyMove, targetLabelFor }) => {
  const row = taskListPresentationRow(task);
  const draggable = Boolean(boardColumnId && onBoardDragStart);
  const targets = keyboardTargets ?? [];
  // Arrow keys move the card between columns; the select below is the same decision exposed as a
  // visible control, so the move is never pointer- or key-only.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!boardColumnId || !targets.length || !onBoardKeyMove) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const columns = [boardColumnId, ...targets];
    const currentIndex = Math.max(0, columns.indexOf(boardColumnId));
    const nextIndex = event.key === 'ArrowRight'
      ? (currentIndex + 1) % columns.length
      : (currentIndex - 1 + columns.length) % columns.length;
    const next = columns[nextIndex];
    if (!next || next === boardColumnId) return;
    event.preventDefault();
    onBoardKeyMove(row.id, next);
  };
  return (
    <div
      data-task-board-card={boardColumnId ? row.id : undefined}
      data-task-board-column={boardColumnId}
      draggable={draggable || undefined}
      onDragStart={draggable ? (event) => onBoardDragStart!(row.id, boardColumnId!, event) : undefined}
      onDragEnd={draggable ? onBoardDragEnd : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={boardColumnId ? 0 : undefined}
      className={`group flex items-center gap-3 rounded-xl border border-white/[0.08] bg-slate-900/60 ${compact ? 'px-3 py-2' : 'px-3.5 py-3.5'}`}
    >
      <input aria-label={`Select ${row.title}`} type="checkbox" checked={selected} onChange={(event) => onSelect(row.id, event.target.checked)} className="accent-blue-500" />
      <button type="button" onClick={() => onToggle(row.id)} className="shrink-0" aria-label={row.completed ? 'Mark incomplete' : 'Mark complete'}>
        {row.completed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Circle className="w-4 h-4 text-slate-500" />}
      </button>
      <button type="button" onClick={() => onOpen(row.id)} className={`min-w-0 flex-1 truncate text-left ${compact ? 'text-[0.6875rem]' : 'text-xs'} ${row.completed ? 'line-through text-slate-500' : 'text-slate-200 hover:text-blue-300'}`}>{row.title}</button>
      <span className={`text-[0.625rem] px-2 py-0.5 rounded-full border ${priorityClass(row.priority)}`}><Flag className="w-2.5 h-2.5 inline mr-1" />{row.priority}</span>
      {row.due && <span className="hidden md:inline text-[0.625rem] text-slate-500 font-mono">{row.due.slice(0, 16)}</span>}
      {targets.length > 0 && onBoardKeyMove && (
        <label className="shrink-0 text-[0.625rem] text-slate-500">
          <span className="sr-only">{`Move ${row.title} to another column`}</span>
          <select
            aria-label={`Move ${row.title} to another column`}
            value=""
            onChange={(event) => { if (event.target.value) onBoardKeyMove(row.id, event.target.value); }}
            className="bg-slate-950/80 border border-white/10 rounded-md px-1.5 py-1 text-[0.625rem] text-slate-300"
          >
            <option value="">Move to…</option>
            {targets.map((target) => (
              <option key={target} value={target}>{targetLabelFor ? targetLabelFor(target) : target}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export const TaskViewsPanel: React.FC<TaskViewsPanelProps> = ({
  tasks,
  preferences,
  statusDefinitions,
  externalFilter = {},
  onChangePreferences,
  onToggleTask,
  onOpenTask,
  onBulkEdit,
  onMoveTaskToColumn,
  onToggleBoardTask,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkPriority, setBulkPriority] = useState<TaskItem['priority']>('medium');
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkError, setBulkError] = useState<string | undefined>(undefined);
  const [draggedTaskId, setDraggedTaskId] = useState<string | undefined>(undefined);
  const [dropColumnId, setDropColumnId] = useState<string | undefined>(undefined);
  const [boardMessage, setBoardMessage] = useState<string>('');

  const visible = useMemo(
    () => projectTaskView(tasks, preferences, externalFilter, statusDefinitions),
    [tasks, preferences, externalFilter, statusDefinitions],
  );
  const visibleIds = new Set(visible.map((task) => task.id));
  const selectedVisible = selectedIds.filter((id) => visibleIds.has(id));

  const patchPreferences = (patch: Partial<TaskViewPreferences>) => onChangePreferences({ ...preferences, ...patch });
  const patchFilter = (patch: Partial<TaskFilterDefinition>) => patchPreferences({ filter: { ...preferences.filter, ...patch } });
  const setSelected = (id: string, selected: boolean) => setSelectedIds((current) => selected ? Array.from(new Set([...current, id])) : current.filter((candidate) => candidate !== id));

  const applyBulk = (patch: Partial<TaskItem>) => {
    const error = onBulkEdit(selectedVisible, patch);
    setBulkError(error ?? undefined);
    if (!error) setSelectedIds([]);
  };

  const rows = (items: TaskItem[], compact = preferences.mode === 'compact') => items.map((task) => (
    <TaskRow key={task.id} task={task} compact={compact} selected={selectedIds.includes(task.id)} onSelect={setSelected} onToggle={onToggleTask} onOpen={onOpenTask} />
  ));

  const boardBy = preferences.boardBy;
  const boardColumnLabel = (columnId: string): string => {
    const separator = columnId.indexOf(':');
    const axis = separator > 0 ? columnId.slice(0, separator) : '';
    const value = separator > 0 ? columnId.slice(separator + 1) : columnId;
    if (axis === 'status') return statusDefinitions.find((definition) => definition.id === value)?.label ?? value;
    if (axis === 'priority') return `${value[0]?.toUpperCase() ?? ''}${value.slice(1)} priority`;
    return value;
  };

  /**
   * One entry point for a board move, shared by the drop handler and the keyboard handler.
   * Validation lives in the pure core so an illegal target is rejected with a visible reason.
   */
  const moveTaskToColumn = (taskId: string, columnId: string) => {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) return;
    if (!onMoveTaskToColumn) {
      setBoardMessage('Moving cards on this board is not available.');
      return;
    }
    const error = onMoveTaskToColumn(taskId, columnId);
    setBoardMessage(error ?? `Moved "${task.title}" to ${boardColumnLabel(columnId)}.`);
  };

  const boardRows = (items: TaskItem[], columnId: string) => items.map((task) => (
    <TaskRow
      key={task.id}
      task={task}
      compact
      selected={selectedIds.includes(task.id)}
      onSelect={setSelected}
      onToggle={onToggleBoardTask ?? onToggleTask}
      onOpen={onOpenTask}
      boardColumnId={columnId}
      onBoardDragStart={(id, _from, event) => {
        setDraggedTaskId(id);
        event.dataTransfer.effectAllowed = 'move';
        // A private type carries the id; text/plain keeps the drag usable for other drop targets.
        try { event.dataTransfer.setData('application/x-astraea-task', id); } catch { /* older engines */ }
        try { event.dataTransfer.setData('text/plain', id); } catch { /* older engines */ }
      }}
      onBoardDragEnd={() => { setDraggedTaskId(undefined); setDropColumnId(undefined); }}
      keyboardTargets={onMoveTaskToColumn ? taskBoardKeyboardTargets(task, boardBy, statusDefinitions) : []}
      onBoardKeyMove={onMoveTaskToColumn ? moveTaskToColumn : undefined}
      targetLabelFor={boardColumnLabel}
    />
  ));

  const renderContent = () => {
    if (!visible.length) return <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-white/10 rounded-2xl">No tasks match this view.</div>;
    if (preferences.mode === 'board') {
      const columns = boardTaskColumns(visible, boardBy, statusDefinitions);
      // An empty column is still a legal drop target, so the board always shows every reachable
      // column instead of only the ones that currently hold a card.
      const emptyColumns = taskBoardColumnIds(visible, boardBy, statusDefinitions)
        .filter((columnId) => !columns.some((column) => column.id === columnId))
        .map((columnId) => ({ id: columnId, label: boardColumnLabel(columnId), tasks: [] as TaskItem[] }));
      return <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">{columns.concat(emptyColumns).map((group) => {
        const isDropTarget = dropColumnId === group.id;
        const draggedTask = draggedTaskId ? visible.find((task) => task.id === draggedTaskId) : undefined;
        const isValidDrop = draggedTask
          ? !('error' in taskBoardMovePatch(draggedTask, group.id, boardBy, statusDefinitions))
          : false;
        return (
          <section
            key={group.id}
            data-task-board-column-target={group.id}
            aria-label={`${group.label} column`}
            onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropColumnId(group.id); }}
            onDragLeave={() => setDropColumnId((current) => (current === group.id ? undefined : current))}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData('application/x-astraea-task') || event.dataTransfer.getData('text/plain') || draggedTaskId;
              setDropColumnId(undefined);
              setDraggedTaskId(undefined);
              if (id) moveTaskToColumn(id, group.id);
            }}
            className={`rounded-xl border p-3 min-w-0 ${isDropTarget && isValidDrop ? 'border-indigo-500/60 bg-indigo-500/[0.06]' : isDropTarget ? 'border-rose-500/50 bg-rose-500/[0.05]' : 'border-white/[0.08] bg-slate-950/30'}`}
          >
            <div className="flex items-center justify-between mb-3"><h3 className="text-[0.6875rem] font-semibold text-slate-300 truncate">{group.label}</h3><span className="text-[0.625rem] text-slate-600">{group.tasks.length}</span></div>
            <div className="space-y-2">{boardRows(group.tasks, group.id)}</div>
          </section>
        );
      })}</div>;
    }
    if (preferences.mode === 'calendar') {
      return <div className="space-y-3">{calendarTaskBuckets(visible).map((bucket) => (
        <section key={bucket.date} className="rounded-xl border border-white/[0.08] bg-slate-950/30 p-3">
          <h3 className="text-[0.6875rem] font-mono text-cyan-300 mb-2">{bucket.date}</h3><div className="space-y-2">{rows(bucket.tasks, true)}</div>
        </section>
      ))}</div>;
    }
    if (preferences.mode === 'timeline') {
      return <div className="space-y-2">{timelineTaskItems(visible).map((item) => (
        <div key={item.task.id} className="grid grid-cols-[150px_1fr] gap-3 items-center">
          <div className="text-[0.625rem] text-slate-500 font-mono">{item.start ?? '…'} → {item.end ?? '…'}</div>
          <TaskRow task={item.task} compact selected={selectedIds.includes(item.task.id)} onSelect={setSelected} onToggle={onToggleTask} onOpen={onOpenTask} />
        </div>
      ))}</div>;
    }
    if (preferences.groupBy !== 'none') {
      return <div className="space-y-4">{groupTaskView(visible, preferences.groupBy, statusDefinitions).map((group) => (
        <section key={group.id}><div className="flex items-center gap-2 mb-2"><h3 className="text-[0.6875rem] font-semibold text-slate-400">{group.label}</h3><span className="text-[0.625rem] text-slate-600">{group.tasks.length}</span></div><div className="space-y-2">{rows(group.tasks)}</div></section>
      ))}</div>;
    }
    return <div className={preferences.mode === 'compact' ? 'space-y-1' : 'space-y-2'}>{rows(visible)}</div>;
  };

  return <div className="space-y-3">
    <div className="rounded-2xl border border-white/[0.08] bg-slate-900/40 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ['list', LayoutList, 'List'], ['compact', Rows3, 'Compact'], ['board', Columns3, 'Board'], ['calendar', CalendarDays, 'Calendar'], ['timeline', TimerReset, 'Timeline'],
        ] as const).map(([mode, Icon, label]) => <button key={mode} type="button" onClick={() => patchPreferences({ mode })} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[0.6875rem] border ${preferences.mode === mode ? 'bg-blue-500/15 text-blue-300 border-blue-500/30' : 'text-slate-400 border-white/10 hover:text-slate-200'}`}><Icon className="w-3.5 h-3.5" />{label}</button>)}
        {preferences.mode === 'board' && <select value={preferences.boardBy} onChange={(event) => patchPreferences({ boardBy: event.target.value as TaskViewPreferences['boardBy'] })} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300"><option value="status">Board: status</option><option value="priority">Board: priority</option><option value="tag">Board: tag</option><option value="project">Board: project</option></select>}
        {(preferences.mode === 'list' || preferences.mode === 'compact') && <select value={preferences.groupBy} onChange={(event) => patchPreferences({ groupBy: event.target.value as TaskViewPreferences['groupBy'] })} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300"><option value="none">No grouping</option><option value="project">Group: project</option><option value="list">Group: list</option><option value="assignee">Group: assignee</option><option value="tag">Group: tag</option><option value="status">Group: status</option></select>}
        <select value={preferences.sortBy} onChange={(event) => patchPreferences({ sortBy: event.target.value as TaskViewPreferences['sortBy'] })} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300"><option value="due">Sort: due</option><option value="priority">Sort: priority</option><option value="created">Sort: created</option><option value="updated">Sort: updated</option><option value="manual">Sort: manual</option></select>
        <button type="button" onClick={() => patchPreferences({ sortDirection: preferences.sortDirection === 'asc' ? 'desc' : 'asc' })} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[0.6875rem] text-slate-400">{preferences.sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
        <label className="md:col-span-2 relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" /><input aria-label="Full text search" value={preferences.filter.text ?? ''} onChange={(event) => patchFilter({ text: event.target.value || undefined })} placeholder="Full-text: title, notes, comments, tags" className="w-full bg-slate-950/80 border border-white/10 rounded-lg pl-8 pr-2 py-1.5 text-[0.6875rem] text-slate-300" /></label>
        <input aria-label="Tag filter" value={preferences.filter.tags?.join(', ') ?? ''} onChange={(event) => patchFilter({ tags: csvValues(event.target.value) })} placeholder="Tags" className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300" />
        <input aria-label="Assignee filter" value={preferences.filter.assignees?.join(', ') ?? ''} onChange={(event) => patchFilter({ assignees: csvValues(event.target.value) })} placeholder="Assignee" className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300" />
        <input aria-label="Project filter" value={preferences.filter.projectIds?.join(', ') ?? ''} onChange={(event) => patchFilter({ projectIds: csvValues(event.target.value) })} placeholder="Project ID" className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300" />
        <select aria-label="Due filter" value={preferences.filter.due ?? 'any'} onChange={(event) => patchFilter({ due: event.target.value as TaskFilterDefinition['due'] })} className="bg-slate-950/80 border border-white/10 rounded-lg px-2 py-1.5 text-[0.6875rem] text-slate-300"><option value="any">Any due date</option><option value="none">No due date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="future">Future</option></select>
      </div>
    </div>

    {selectedVisible.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-2.5">
      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-300" /><span className="text-[0.6875rem] text-indigo-200">{selectedVisible.length} selected</span>
      <select value={bulkPriority} onChange={(event) => setBulkPriority(event.target.value as TaskItem['priority'])} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.6875rem] text-slate-300"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
      <button type="button" onClick={() => applyBulk({ priority: bulkPriority })} className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[0.6875rem] text-indigo-200">Apply priority</button>
      <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className="bg-slate-950 border border-white/10 rounded-lg px-2 py-1 text-[0.6875rem] text-slate-300"><option value="">Choose status…</option>{statusDefinitions.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select>
      <button type="button" disabled={!bulkStatus} onClick={() => applyBulk({ status: bulkStatus })} className="px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[0.6875rem] text-indigo-200 disabled:opacity-40">Apply status</button>
      <button type="button" onClick={() => setSelectedIds([])} className="px-2 py-1 text-[0.6875rem] text-slate-500">Clear</button>
      {bulkError && <span role="alert" className="text-[0.625rem] text-rose-300">{bulkError}</span>}
    </div>}

    {renderContent()}

    {/* One live region for the whole board move path, so a move is announced in text. */}
    <p role="status" aria-live="polite" data-task-board-status className="min-h-[1em] text-[0.625rem] text-slate-500">{boardMessage}</p>
  </div>;
};
