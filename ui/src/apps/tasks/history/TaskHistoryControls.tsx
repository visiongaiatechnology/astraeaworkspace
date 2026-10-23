import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';

export const TaskHistoryControls: React.FC<{
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}> = ({ canUndo, canRedo, onUndo, onRedo }) => (
  <div className="flex items-center gap-1" role="group" aria-label="Task edit history">
    <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo last Work Management edit" title="Undo (Ctrl/Cmd+Z)" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"><Undo2 className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo last Work Management edit" title="Redo (Ctrl/Cmd+Shift+Z)" className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"><Redo2 className="h-3.5 w-3.5" /></button>
  </div>
);
