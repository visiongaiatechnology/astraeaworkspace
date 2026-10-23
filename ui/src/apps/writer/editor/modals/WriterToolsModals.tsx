// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { MailMergeConfig } from '../../types';
import { X, Bookmark, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';
import { WRITER_SYMBOL_CATEGORIES } from '../../editing/special-characters/writerSpecialCharacters';

export interface WriterSymbolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertSymbol: (symbol: string) => void;
}

export const WriterSymbolsModal: React.FC<WriterSymbolsModalProps> = ({
  isOpen,
  onClose,
  onInsertSymbol,
}) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <h3 className="text-sm font-bold text-slate-100">Insert Special Character or Symbol</h3>
          <button aria-label="Close Insert Special Character or Symbol dialog" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
          {WRITER_SYMBOL_CATEGORIES.map((cat) => (
            <div key={cat.name} className="space-y-1.5">
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider text-slate-400">
                {cat.name}
              </span>
              <div className="grid grid-cols-6 gap-1.5">
                {cat.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      onInsertSymbol(entry.value);
                      onClose();
                    }}
                    className="min-h-12 rounded-lg bg-slate-950/70 border border-white/5 hover:border-blue-500 hover:bg-blue-600/20 text-slate-200 font-mono flex flex-col items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:ring-2 focus:ring-blue-500"
                    title={`${entry.label} (${entry.codePoint})`}
                  >
                    <span className={entry.display.length > 2 ? 'text-[0.625rem] font-bold' : 'text-lg'}>{entry.display}</span>
                    <span className="text-[0.5rem] text-slate-500">{entry.codePoint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export interface WriterBookmarkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBookmark: (name: string) => void;
}

export const WriterBookmarkModal: React.FC<WriterBookmarkModalProps> = ({
  isOpen,
  onClose,
  onAddBookmark,
}) => {
  const [bookmarkName, setBookmarkName] = useState('');
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-sm w-full p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Bookmark className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Add Bookmark</h3>
          </div>
          <button aria-label="Close Add Bookmark dialog" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-300">Bookmark Name</label>
          <input
            type="text"
            value={bookmarkName}
            onChange={(e) => setBookmarkName(e.target.value)}
            placeholder="e.g. Section_Overview"
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
          />
        </div>
        <div className="flex justify-end space-x-2 pt-2 border-t border-white/10">
          <button onClick={onClose} className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white">
            Cancel
          </button>
          <button
            onClick={() => {
              if (bookmarkName.trim()) {
                onAddBookmark(bookmarkName.trim());
                setBookmarkName('');
                onClose();
              }
            }}
            className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Add Bookmark
          </button>
        </div>
      </div>
    </div>
  );
};

export interface WriterMailMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  mailMergeConfig: MailMergeConfig;
  onUpdateMailMergeConfig: (cfg: MailMergeConfig) => void;
  onInsertMergeField: (fieldTag: string) => void;
}

export const WriterMailMergeModal: React.FC<WriterMailMergeModalProps> = ({
  isOpen,
  onClose,
  mailMergeConfig,
  onUpdateMailMergeConfig,
  onInsertMergeField,
}) => {
  const [csvInput, setCsvInput] = useState('');
  if (!isOpen) return null;

  const handleLoadCsv = () => {
    const lines = csvInput.trim().split('\n').filter(Boolean);
    if (lines.length === 0) return;
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const records = lines.slice(1).map((line) => {
      const vals = line.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const rec: Record<string, string> = {};
      headers.forEach((h, i) => {
        rec[h] = vals[i] || '';
      });
      return rec;
    });
    onUpdateMailMergeConfig({
      ...mailMergeConfig,
      records,
      currentRecordIndex: 0,
    });
    setCsvInput('');
  };

  const fields = mailMergeConfig.records[0] ? Object.keys(mailMergeConfig.records[0]) : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <FileSpreadsheet className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">Mail Merge & Data Fields</h3>
          </div>
          <button aria-label="Close Mail Merge & Data Fields dialog" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-300">Available Merge Fields</label>
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-slate-950 border border-white/10">
            {fields.length === 0 && (
              <span className="text-xs text-slate-500 italic">No records loaded yet.</span>
            )}
            {fields.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => onInsertMergeField(`{{${field}}}`)}
                className="px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-mono hover:bg-blue-600/30 transition-colors"
                title={`Insert {{${field}}}`}
              >
                «{field}»
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-white/10">
          {mailMergeConfig.records.length > 0 ? (
            <div className="p-3 rounded-xl bg-slate-950/70 border border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Record Navigator:</span>
                <div className="flex items-center space-x-2">
                  <button aria-label="Previous mail merge record"
                    type="button"
                    disabled={mailMergeConfig.currentRecordIndex <= 0}
                    onClick={() => onUpdateMailMergeConfig({ ...mailMergeConfig, currentRecordIndex: Math.max(0, mailMergeConfig.currentRecordIndex - 1) })}
                    className="p-1 rounded bg-slate-900 border border-white/10 text-slate-300 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-slate-200">
                    {mailMergeConfig.currentRecordIndex + 1} of {mailMergeConfig.records.length}
                  </span>
                  <button aria-label="Next mail merge record"
                    type="button"
                    disabled={mailMergeConfig.currentRecordIndex >= mailMergeConfig.records.length - 1}
                    onClick={() => onUpdateMailMergeConfig({ ...mailMergeConfig, currentRecordIndex: Math.min(mailMergeConfig.records.length - 1, mailMergeConfig.currentRecordIndex + 1) })}
                    className="p-1 rounded bg-slate-900 border border-white/10 text-slate-300 disabled:opacity-40"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-2 rounded bg-slate-900 text-[0.6875rem] font-mono text-slate-300">
                <pre className="overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(mailMergeConfig.records[mailMergeConfig.currentRecordIndex], null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[0.6875rem] text-slate-400">Paste CSV data below with column headers on line 1:</p>
              <textarea
                rows={4}
                value={csvInput}
                onChange={(e) => setCsvInput(e.target.value)}
                placeholder="First_Name,Last_Name,Company,Email\nAlice,Smith,Acme Corp,alice@acme.com"
                className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-slate-200 font-mono outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleLoadCsv}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
              >
                Load Records
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={mailMergeConfig.previewEnabled}
              onChange={(e) => onUpdateMailMergeConfig({ ...mailMergeConfig, previewEnabled: e.target.checked })}
              className="accent-blue-500"
            />
            <span>Live Preview Merged Document</span>
          </label>
          <button onClick={onClose} className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
