// STATUS: DIAMANT VGT SUPREME
// Astraea Notes authoritative in-page Find & Replace with regex and match counter

import React, { useState } from 'react';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import { LinearPattern } from '../../../shared/patterns/linearPattern';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { notesSearchText } from '../notesSearchLocale';

const NOTES_FIND_MAX_PATTERN = 256;
const NOTES_FIND_MAX_CONTENT = 2 * 1024 * 1024;
function escapeLinearLiteral(value: string): string {
  let out = '';
  for (const char of value) out += '.+*?^$()[]{}|\\'.includes(char) ? `\\${char}` : char;
  return out;
}
function compileNotesPattern(searchTerm: string, caseSensitive: boolean, useRegex: boolean, contentLength: number): LinearPattern | null {
  if (!searchTerm || searchTerm.length > NOTES_FIND_MAX_PATTERN || contentLength > NOTES_FIND_MAX_CONTENT) return null;
  try {
    return new LinearPattern(useRegex ? searchTerm : escapeLinearLiteral(searchTerm), {
      caseInsensitive: !caseSensitive,
      limits: { maxPatternLength: NOTES_FIND_MAX_PATTERN * 2, maxInputLength: NOTES_FIND_MAX_CONTENT, maxStates: 4096, maxMatches: 20_000, maxRepeat: 128 },
    });
  } catch {
    return null;
  }
}

interface NotesFindReplaceModalProps {
  isOpen: boolean;
  content: string;
  onClose: () => void;
  onUpdateContent: (newContent: string) => void;
}

export const NotesFindReplaceModal: React.FC<NotesFindReplaceModalProps> = ({
  isOpen,
  content,
  onClose,
  onUpdateContent,
}) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof notesSearchText>[0]) => notesSearchText(message, locale);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);

  if (!isOpen) return null;

  // Calculate matches through the bounded linear matcher. Untrusted patterns never reach RegExp.
  const compiledPattern = searchTerm.trim() ? compileNotesPattern(searchTerm, caseSensitive, useRegex, content.length) : null;
  const matchCount = compiledPattern ? compiledPattern.findAll(content).length : 0;

  const handleReplaceOne = () => {
    if (!compiledPattern || matchCount === 0) return;
    onUpdateContent(compiledPattern.replace(content, replaceTerm, false).text);
  };

  const handleReplaceAll = () => {
    if (!compiledPattern || matchCount === 0) return;
    onUpdateContent(compiledPattern.replace(content, replaceTerm, true).text);
  };


  return (
    <div className="fixed top-12 right-6 z-50 select-none">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-84 p-3 text-xs flex flex-col space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-white/10">
          <div className="flex items-center space-x-1.5 text-slate-200 font-semibold">
            <Search className="w-3.5 h-3.5 text-blue-400" />
            <span>{t('title')}</span>
          </div>
          <button aria-label={t('close')} type="button" onClick={onClose} className="text-slate-400 hover:text-white p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search input & options */}
        <div className="space-y-1.5">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder={t('find')}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setMatchIndex(0);
              }}
              className="w-full bg-slate-950 border border-white/10 rounded-lg pl-2.5 pr-14 py-1.5 text-slate-200 outline-none focus:border-blue-500/50 font-mono text-[0.6875rem]"
            />
            <span className="absolute right-2 font-mono text-[0.625rem] text-slate-400">
              {searchTerm ? `${matchCount > 0 ? matchIndex + 1 : 0}/${matchCount}` : '0/0'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setCaseSensitive(!caseSensitive)}
                className={`px-1.5 py-0.5 rounded border text-[0.625rem] font-mono ${caseSensitive ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'border-white/10 text-slate-400'}`}
                title={t('matchCase')}
              >
                Aa
              </button>
              <button
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                className={`px-1.5 py-0.5 rounded border text-[0.625rem] font-mono ${useRegex ? 'bg-blue-600/30 border-blue-500 text-blue-300' : 'border-white/10 text-slate-400'}`}
                title={t('regularExpression')}
              >
                .*
              </button>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={() => setMatchIndex((i) => (matchCount > 0 ? (i - 1 + matchCount) % matchCount : 0))}
                className="p-1 rounded border border-white/10 text-slate-400 hover:text-white"
                aria-label={t('previousMatch')} title={t('previousMatch')}
              >
                <ChevronUp className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setMatchIndex((i) => (matchCount > 0 ? (i + 1) % matchCount : 0))}
                className="p-1 rounded border border-white/10 text-slate-400 hover:text-white"
                aria-label={t('nextMatch')} title={t('nextMatch')}
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Replace input & buttons */}
        <div className="space-y-1.5 pt-1 border-t border-white/10">
          <input
            type="text"
            placeholder={t('replaceWith')}
            value={replaceTerm}
            onChange={(e) => setReplaceTerm(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-slate-200 outline-none focus:border-blue-500/50 font-mono text-[0.6875rem]"
          />

          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={handleReplaceOne}
              disabled={matchCount === 0}
              className="px-2.5 py-1 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-30"
            >
              {t('replace')}
            </button>
            <button
              type="button"
              onClick={handleReplaceAll}
              disabled={matchCount === 0}
              className="px-2.5 py-1 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-30"
            >
              {t('replaceAll')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
