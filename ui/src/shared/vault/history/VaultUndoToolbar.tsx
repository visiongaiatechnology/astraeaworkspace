import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';

interface Props { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; }
export const VaultUndoToolbar: React.FC<Props> = ({ canUndo, canRedo, onUndo, onRedo }) => (
  <div className="flex items-center gap-1" role="group" aria-label="Vault history">
    <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo Vault change" title="Undo (Ctrl/Cmd+Z)" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"><Undo2 className="h-3.5 w-3.5" /></button>
    <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo Vault change" title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)" className="rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"><Redo2 className="h-3.5 w-3.5" /></button>
  </div>
);
