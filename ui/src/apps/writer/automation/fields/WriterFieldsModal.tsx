// STATUS: DIAMANT VGT SUPREME
import React, { useState } from 'react';
import { X, Cpu } from 'lucide-react';
import type { PageSetupConfig } from '../../types';
import { useWorkspaceLocale } from '../../../../shell/localization/workspaceLocale';
import { WRITER_FIELDS_COPY } from './writerFieldsLocale';

export interface WriterFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentTitle: string;
  pageSetup: PageSetupConfig;
  totalWords: number;
  onInsertField: (fieldStr: string) => void;
}

export const WriterFieldsModal: React.FC<WriterFieldsModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  pageSetup,
  totalWords,
  onInsertField,
}) => {
  const [selectedField, setSelectedField] = useState<string>('DATE_DE');
  const { locale } = useWorkspaceLocale();
  const copy = WRITER_FIELDS_COPY[locale];

  if (!isOpen) return null;

  const now = new Date();
  const dateStrDe = now.toLocaleDateString('de-DE');
  const dateStrIso = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('de-DE');

  const FIELD_DEFINITIONS = [
    { id: 'DATE_DE', ...copy.fields.DATE_DE, value: dateStrDe, code: '{DATE \\@ "dd.MM.yyyy"}' },
    { id: 'DATE_ISO', ...copy.fields.DATE_ISO, value: dateStrIso, code: '{DATE \\@ "yyyy-MM-dd"}' },
    { id: 'TIME', ...copy.fields.TIME, value: timeStr, code: '{TIME \\@ "HH:mm:ss"}' },
    { id: 'PAGE', ...copy.fields.PAGE, value: '1', code: '{PAGE}' },
    { id: 'NUMPAGES', ...copy.fields.NUMPAGES, value: '3', code: '{NUMPAGES}' },
    { id: 'PAGE_OF_PAGES', ...copy.fields.PAGE_OF_PAGES, value: 'Seite 1 von 3', code: '{PAGE} von {NUMPAGES}' },
    { id: 'TITLE', ...copy.fields.TITLE, value: documentTitle || 'Unbenanntes Dokument', code: '{TITLE}' },
    { id: 'AUTHOR', ...copy.fields.AUTHOR, value: 'Astraea Author', code: '{AUTHOR}' },
    { id: 'WORDS', ...copy.fields.WORDS, value: `${totalWords} Wörter`, code: '{NUMWORDS}' },
    { id: 'HEADER_TEXT', ...copy.fields.HEADER_TEXT, value: pageSetup.headerText || '(Keine Kopfzeile)', code: '{HEADER}' },
  ];

  const activeDef = FIELD_DEFINITIONS.find((f) => f.id === selectedField) || FIELD_DEFINITIONS[0];

  const handleInsert = () => {
    onInsertField(activeDef.value);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/15 rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 vgt-dialog-scroll-surface animate-in fade-in zoom-in-95 duration-150 select-none">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center space-x-2 text-blue-400">
            <Cpu className="w-4 h-4" />
            <h3 className="text-sm font-bold text-slate-100">{copy.title}</h3>
          </div>
          <button aria-label={copy.closeDialog} type="button" onClick={onClose} className="p-1 rounded text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Fields List */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 border border-white/5 rounded-xl p-1.5 bg-slate-950/50">
          {FIELD_DEFINITIONS.map((field) => {
            const isSelected = selectedField === field.id;
            return (
              <button
                key={field.id}
                type="button"
                onClick={() => setSelectedField(field.id)}
                className={`w-full text-left p-2 rounded-lg flex items-center justify-between text-xs transition-all ${
                  isSelected
                    ? 'bg-blue-600/20 border border-blue-500/40 text-blue-200'
                    : 'hover:bg-white/5 text-slate-300'
                }`}
              >
                <div className="truncate pr-2">
                  <span className="font-medium text-slate-100">{field.name}</span>
                  <span className="text-[0.625rem] text-slate-500 block font-mono">{field.code}</span>
                </div>
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[0.625rem] text-slate-300 font-mono shrink-0">
                  {field.value}
                </span>
              </button>
            );
          })}
        </div>

        {/* Preview Box */}
        <div className="p-3 bg-slate-950/70 border border-white/10 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-[0.6875rem] text-slate-400">
            <span>{copy.fieldCode} <code className="text-blue-400 font-mono">{activeDef.code}</code></span>
            <span className="text-[0.625rem] text-slate-500">{copy.category} {activeDef.category}</span>
          </div>
          <div className="text-xs font-semibold text-slate-100 pt-1">
            {copy.outputValue} <span className="text-emerald-400 font-mono">„{activeDef.value}“</span>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/5"
          >
            {copy.cancel}
          </button>
          <button
            type="button"
            onClick={handleInsert}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all"
          >
            {copy.insertFieldValue}
          </button>
        </div>
      </div>
    </div>
  );
};
