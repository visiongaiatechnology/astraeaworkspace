// STATUS: PLATIN — Notes notebook/section dialogs, bound to the one dialog contract (W-432)
import React, { useState } from 'react';
import { Book, Layers, X } from 'lucide-react';
import { useNotesDialogA11y } from '../editor/useNotesDialogA11y';

interface NewNotebookModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export const NewNotebookModal: React.FC<NewNotebookModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate(title.trim());
    setTitle('');
  };

  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create notebook">
      <div className="w-full max-w-sm glass-dropdown rounded-2xl p-5 border border-white/15 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <Book className="w-4 h-4 text-blue-400" />
            <span>Create Sovereign Notebook</span>
          </h3>
          <button
            type="button"
            aria-label="Close create notebook dialog"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="e.g. Cryptographic Whitepapers"
          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          autoFocus
          data-notes-dialog-initial-focus
        />
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

interface NewSectionModalProps {
  isOpen: boolean;
  notebookTitle: string;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export const NewSectionModal: React.FC<NewSectionModalProps> = ({
  isOpen,
  notebookTitle,
  onClose,
  onCreate,
}) => {
  const [title, setTitle] = useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate(title.trim());
    setTitle('');
  };

  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create section">
      <div className="w-full max-w-sm glass-dropdown rounded-2xl p-5 border border-white/15 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-400" />
            <span>Add Section in {notebookTitle}</span>
          </h3>
          <button
            type="button"
            aria-label="Close create section dialog"
            onClick={onClose}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
          }}
          placeholder="e.g. Protocol RFCs"
          className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          autoFocus
          data-notes-dialog-initial-focus
        />
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="px-4 py-1.5 rounded-lg text-xs bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-40"
          >
            Add Section
          </button>
        </div>
      </div>
    </div>
  );
};

interface NewSectionGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string) => void;
}

export const NewSectionGroupModal: React.FC<NewSectionGroupModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const dialogA11y = useNotesDialogA11y(isOpen, onClose);
  if (!isOpen) return null;
  const submit = () => {
    const clean = title.trim();
    if (!clean) return;
    onCreate(clean);
    setTitle('');
  };
  return (
    <div ref={dialogA11y.ref} tabIndex={-1} onKeyDown={dialogA11y.onKeyDown} className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Create section group">
      <div className="w-full max-w-sm glass-dropdown rounded-2xl p-5 border border-white/15 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2"><Layers className="w-4 h-4 text-violet-400" />Section Group</h3>
          <button type="button" aria-label="Close create section group dialog" onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') submit(); }} autoFocus data-notes-dialog-initial-focus maxLength={240} placeholder="e.g. Research" className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-100 focus:outline-none focus:border-violet-500" />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white">Cancel</button>
          <button type="button" onClick={submit} disabled={!title.trim()} className="px-4 py-1.5 rounded-lg text-xs bg-violet-600 text-white font-medium hover:bg-violet-500 disabled:opacity-40">Create Group</button>
        </div>
      </div>
    </div>
  );
};
