// STATUS: DIAMANT VGT SUPREME
// Astraea Grid bounded workbook-level Find & Replace UI with a visible, keyboard-navigable hit list.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import type { GridCell, GridSheetModel } from '../../../shared/contracts/workspace';
import {
  describeGridWorkbookFindResult,
  findGridWorkbookMatchesDetailed,
  replaceGridWorkbookMatches,
  type GridFindField,
  type GridWorkbookMatch,
} from './gridWorkbookFindReplace';

interface GridFindReplaceModalProps {
  isOpen: boolean;
  activeSheetId: string;
  sheets: GridSheetModel[];
  cellsBySheet: Record<string, Record<string, GridCell>>;
  selectedCell: string;
  onClose: () => void;
  onSelectCell: (sheetId: string, coord: string) => void;
  onApplyWorkbookUpdate: (cellsBySheet: Record<string, Record<string, GridCell>>, sheets: GridSheetModel[]) => boolean | void;
}

export const GridFindReplaceModal: React.FC<GridFindReplaceModalProps> = ({
  isOpen,
  activeSheetId,
  sheets,
  cellsBySheet,
  selectedCell,
  onClose,
  onSelectCell,
  onApplyWorkbookUpdate,
}) => {
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [entireCell, setEntireCell] = useState(false);
  const [scope, setScope] = useState<'sheet' | 'workbook'>('sheet');
  const [fields, setFields] = useState<GridFindField[]>(['value', 'formula']);
  const [cursor, setCursor] = useState(0);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => ({ scope, activeSheetId, fields, matchCase, entireCell, maxMatches: 10_000 }), [scope, activeSheetId, fields, matchCase, entireCell]);
  // The bounded scan runs only while the dialog is open; a closed dialog must not pay for it.
  const result = useMemo(
    () => (isOpen ? findGridWorkbookMatchesDetailed(sheets, cellsBySheet, findText, options) : { matches: [], scannedCells: 0, truncated: false }),
    [isOpen, sheets, cellsBySheet, findText, options],
  );
  const matches = result.matches;

  useEffect(() => {
    if (!isOpen) return;
    setResultMsg(null);
  }, [isOpen, activeSheetId]);

  if (!isOpen) return null;

  const sheetName = (sheetId: string) => sheets.find((sheet) => sheet.id === sheetId)?.name ?? sheetId;
  const toggleField = (field: GridFindField) => {
    setFields((current) => current.includes(field) ? (current.length === 1 ? current : current.filter((item) => item !== field)) : [...current, field]);
    setCursor(0);
  };
  const selectMatch = (match: GridWorkbookMatch, index: number) => {
    setCursor(index);
    onSelectCell(match.sheetId, match.coord);
    setResultMsg(`${sheetName(match.sheetId)}!${match.coord} · ${match.field} · ${index + 1}/${matches.length}`);
  };
  const handleFindNext = () => {
    if (!matches.length) { setResultMsg(describeGridWorkbookFindResult(result, findText)); return; }
    const currentIndex = matches.findIndex((match) => match.sheetId === activeSheetId && match.coord === selectedCell);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % matches.length : cursor % matches.length;
    selectMatch(matches[nextIndex]!, nextIndex);
  };
  const handleListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!matches.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (cursor + delta + matches.length) % matches.length;
      selectMatch(matches[nextIndex]!, nextIndex);
      const item = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[nextIndex];
      item?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const match = matches[cursor];
      if (match) selectMatch(match, cursor);
    }
  };
  const applyMatches = (targetMatches: GridWorkbookMatch[]): number | false => {
    const replaced = replaceGridWorkbookMatches(sheets, cellsBySheet, targetMatches, findText, replaceText, { matchCase, entireCell });
    if (replaced.replaced && onApplyWorkbookUpdate(replaced.cellsBySheet, replaced.sheets) === false) {
      setResultMsg('Ersetzen blockiert: mindestens eine Zielzelle ist geschützt oder schreibgeschützt.');
      return 0;
    }
    setResultMsg(replaced.replaced ? `${replaced.replaced} Vorkommen ersetzt.` : 'Nichts ersetzt.');
    return replaced.replaced;
  };
  const handleReplace = () => {
    const current = matches.find((match) => match.sheetId === activeSheetId && match.coord === selectedCell) ?? matches[cursor];
    if (current && applyMatches([current]) !== false) handleFindNext();
  };

  const summary = describeGridWorkbookFindResult(result, findText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="grid-find-title">
      <div className="bg-slate-900 border border-white/15 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden text-xs flex flex-col max-h-[92vh]">
        <div className="px-4 py-3 bg-slate-950 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2"><Search className="w-4 h-4 text-blue-400" aria-hidden="true" /><span id="grid-find-title" className="font-bold text-slate-100 text-sm">Suchen und Ersetzen im Arbeitsbuch</span></div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white" aria-label="Suchen und Ersetzen schließen"><X className="w-4 h-4" aria-hidden="true" /></button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <label className="block"><span className="text-[0.6875rem] font-medium text-slate-300 block mb-1">Suchen nach</span><input value={findText} maxLength={4_096} onChange={(event) => { setFindText(event.target.value); setCursor(0); }} className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-blue-500" autoFocus /></label>
          <label className="block"><span className="text-[0.6875rem] font-medium text-slate-300 block mb-1">Ersetzen durch</span><input value={replaceText} maxLength={4_096} onChange={(event) => setReplaceText(event.target.value)} className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-1.5 text-slate-100 font-mono outline-none focus:border-blue-500" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-slate-300">Bereich<select value={scope} onChange={(event) => { setScope(event.target.value as 'sheet' | 'workbook'); setCursor(0); }} className="mt-1 w-full bg-slate-950 border border-white/10 rounded px-2 py-1"><option value="sheet">Aktuelles Blatt</option><option value="workbook">Gesamtes Arbeitsbuch</option></select></label>
            <fieldset><legend className="text-slate-300">Suchen in</legend><div className="mt-1 flex flex-wrap gap-2">{(['value','formula','comment'] as GridFindField[]).map((field) => <label key={field} className="flex items-center gap-1 text-slate-300"><input type="checkbox" checked={fields.includes(field)} onChange={() => toggleField(field)} />{field === 'value' ? 'Wert' : field === 'formula' ? 'Formel' : 'Kommentar'}</label>)}</div></fieldset>
          </div>
          <div className="flex gap-4"><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />Groß-/Kleinschreibung</label><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={entireCell} onChange={(event) => setEntireCell(event.target.checked)} />Ganze Zelle</label></div>

          <div role="status" aria-live="polite" className={`text-[0.6875rem] ${result.truncated ? 'text-amber-300' : 'text-slate-400'}`}>
            {summary} <span className="text-slate-500">Suche ist literal, niemals ein Benutzer-Regex.</span>
          </div>

          {matches.length > 0 && (
            <ul
              ref={listRef}
              role="listbox"
              aria-label="Trefferliste"
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              className="max-h-52 overflow-y-auto rounded border border-white/10 divide-y divide-white/5"
            >
              {matches.slice(0, 200).map((match, index) => (
                <li
                  key={`${match.sheetId}-${match.coord}-${match.field}-${match.commentId ?? index}`}
                  role="option"
                  aria-selected={index === cursor}
                  tabIndex={-1}
                  onClick={() => selectMatch(match, index)}
                  onDoubleClick={() => selectMatch(match, index)}
                  className={`flex cursor-pointer items-center gap-2 px-2 py-1 text-[0.625rem] ${index === cursor ? 'bg-blue-500/20 text-blue-100' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  <span className="font-mono text-slate-400">{sheetName(match.sheetId)}!{match.coord}</span>
                  <span className="rounded bg-white/5 px-1 text-slate-400">{match.field}</span>
                  <span className="truncate font-mono">{match.preview}</span>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 200 && <div className="text-[0.625rem] text-slate-500">Nur die ersten 200 Treffer werden aufgelistet; „Weitersuchen“ erreicht alle {matches.length}.</div>}

          {resultMsg && <div role="status" className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[0.6875rem] break-words">{resultMsg}</div>}
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={handleFindNext} className="py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-medium flex items-center justify-center gap-1"><ArrowRight className="w-3 h-3" aria-hidden="true" />Weitersuchen</button>
            <button type="button" onClick={handleReplace} disabled={!findText} className="py-1.5 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium">Ersetzen</button>
            <button type="button" onClick={() => applyMatches(matches)} disabled={!findText || !matches.length} className="py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-medium flex items-center justify-center gap-1"><Check className="w-3 h-3" aria-hidden="true" />Alle ersetzen</button>
          </div>
        </div>
      </div>
    </div>
  );
};
