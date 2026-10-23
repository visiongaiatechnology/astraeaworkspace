// STATUS: DIAMANT VGT SUPREME
// Astraea Grid authoritative sheet/edit controls for workbook structure and advanced editing.

import React, { useMemo, useState } from 'react';
import type { GridSheetModel } from '../../../shared/contracts/workspace';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import type { FlashFillTransform, GridGoToSpecialKind, GridTransferMode } from '../editing/gridAdvancedEditing';
import type { GridRichTextRun } from '../editing/gridCellTypes';
import type { GridStructureEdit } from '../workbook/gridWorkbookStructure';
import { GRID_SHEET_EDIT_COPY } from '../locale/gridSheetEditLocale';
import { parseGridRange } from '../compat/gridProfessional';

type CalcMode = 'automatic'|'manual'|'automatic-except-data-tables';

interface GridSheetEditPanelProps {
  sheet: GridSheetModel;
  selectedCell: string;
  selectedRange: string;
  selectionRanges: string[];
  locale: string;
  calculationMode: CalcMode;
  onUpdateSheet: (patch: Partial<GridSheetModel>) => void;
  onPatchWorkbook: (patch: { locale?: string; calculationMode?: CalcMode; properties?: Record<string,string> }) => void;
  onStructureEdit: (edit: GridStructureEdit) => void;
  onSetAxisHidden: (axis: 'row'|'col', hidden: boolean) => void;
  onGroupAxis: (axis: 'row'|'col', collapsed?: boolean) => void;
  onGoTo: (target: string) => boolean;
  onGoToSpecial: (kind: GridGoToSpecialKind) => number;
  onTransferSelection: (target: string, mode: GridTransferMode) => boolean;
  onFlashFill: (target: string, transform: FlashFillTransform) => number;
  onAddDisjoint: () => void;
  onClearDisjoint: () => void;
  onSetRichTextCell: (coord: string, runs: readonly GridRichTextRun[]) => void;
}

const flashTransforms: readonly FlashFillTransform[] = [
  'trim', 'upper', 'lower', 'first-word', 'last-word', 'initials', 'before-at', 'after-at',
];

export const GridSheetEditPanel: React.FC<GridSheetEditPanelProps> = ({
  sheet, selectedCell, selectedRange, selectionRanges, locale, calculationMode, onUpdateSheet, onPatchWorkbook,
  onStructureEdit, onSetAxisHidden, onGroupAxis, onGoTo, onGoToSpecial, onTransferSelection, onFlashFill,
  onAddDisjoint, onClearDisjoint, onSetRichTextCell,
}) => {
  const { locale: workspaceLocale } = useWorkspaceLocale();
  const copy = GRID_SHEET_EDIT_COPY[workspaceLocale];
  const bounds = useMemo(() => parseGridRange(selectedRange), [selectedRange]);
  const [goTo, setGoTo] = useState(selectedCell);
  const [special, setSpecial] = useState<GridGoToSpecialKind>('formulas');
  const [transferTarget, setTransferTarget] = useState(selectedCell);
  const [transferMode, setTransferMode] = useState<GridTransferMode>('move');
  const [flashTarget, setFlashTarget] = useState(selectedCell);
  const [flashTransform, setFlashTransform] = useState<FlashFillTransform>('trim');
  const [moveTarget, setMoveTarget] = useState(0);
  const [propertyKey, setPropertyKey] = useState('');
  const [propertyValue, setPropertyValue] = useState('');
  const [richText, setRichText] = useState('');
  const [richBold, setRichBold] = useState(false);
  const [richItalic, setRichItalic] = useState(false);
  const [richUnderline, setRichUnderline] = useState(false);
  const [richColor, setRichColor] = useState('#e2e8f0');

  const rowIndex = bounds?.startRow ?? 0;
  const rowCount = bounds ? bounds.endRow - bounds.startRow + 1 : 1;
  const colIndex = bounds?.startCol ?? 0;
  const colCount = bounds ? bounds.endCol - bounds.startCol + 1 : 1;

  const addProperty = () => {
    const key = propertyKey.trim().slice(0,64); if (!key) return;
    onPatchWorkbook({ properties: { [key]: propertyValue.slice(0,512) } });
    setPropertyKey(''); setPropertyValue('');
  };

  return <div className="space-y-4">
    <section className="space-y-2">
      <h3 className="font-semibold text-slate-200">{copy.sections.viewPanes}</h3>
      <div className="grid grid-cols-3 gap-1">
        {(['normal','page-layout','page-break'] as const).map((mode) => <button key={mode} type="button" onClick={() => onUpdateSheet({viewMode:mode})} className={sheet.viewMode === mode || (!sheet.viewMode && mode==='normal') ? 'vgt-button-primary' : 'vgt-button-secondary'}>{copy.viewModes[mode]}</button>)}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.625rem] text-slate-400">{copy.fields.zoom}<input type="number" min={25} max={400} value={sheet.zoom ?? 100} onChange={(e)=>onUpdateSheet({zoom:Math.max(25,Math.min(400,Number(e.target.value)||100))})} className="vgt-input w-full"/></label>
        <label className="text-[0.625rem] text-slate-400">{copy.fields.splitRow}<input type="number" min={0} value={sheet.splitPanes?.row ?? 0} onChange={(e)=>onUpdateSheet({splitPanes:{...(sheet.splitPanes??{}),row:Math.max(0,Number(e.target.value)||0)}})} className="vgt-input w-full"/></label>
        <label className="text-[0.625rem] text-slate-400">{copy.fields.splitColumn}<input type="number" min={0} value={sheet.splitPanes?.col ?? 0} onChange={(e)=>onUpdateSheet({splitPanes:{...(sheet.splitPanes??{}),col:Math.max(0,Number(e.target.value)||0)}})} className="vgt-input w-full"/></label>
        <button type="button" onClick={()=>onUpdateSheet({splitPanes:undefined})} className="vgt-button-secondary">{copy.actions.clearSplit}</button>
        <label className="text-[0.625rem] text-slate-400">{copy.fields.freezeRows}<input type="number" min={0} value={sheet.freezeRows ?? 0} onChange={(e)=>onUpdateSheet({freezeRows:Math.max(0,Number(e.target.value)||0)})} className="vgt-input w-full"/></label>
        <label className="text-[0.625rem] text-slate-400">{copy.fields.freezeColumns}<input type="number" min={0} value={sheet.freezeCols ?? 0} onChange={(e)=>onUpdateSheet({freezeCols:Math.max(0,Number(e.target.value)||0)})} className="vgt-input w-full"/></label>
      </div>
    </section>

    <section className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="font-semibold text-slate-200">{copy.sections.rowsColumns}</h3>
      <div className="text-[0.625rem] text-slate-500">{copy.selectionSummary(selectedRange, rowIndex+1, rowIndex+rowCount, colIndex+1, colIndex+colCount)}</div>
      <div className="grid grid-cols-2 gap-1">
        <button type="button" onClick={()=>onStructureEdit({kind:'insert-row',index:rowIndex,count:rowCount})} className="vgt-button-secondary">{copy.actions.insertRows}</button>
        <button type="button" onClick={()=>onStructureEdit({kind:'delete-row',index:rowIndex,count:rowCount})} className="vgt-button-secondary">{copy.actions.deleteRows}</button>
        <button type="button" onClick={()=>onStructureEdit({kind:'insert-col',index:colIndex,count:colCount})} className="vgt-button-secondary">{copy.actions.insertColumns}</button>
        <button type="button" onClick={()=>onStructureEdit({kind:'delete-col',index:colIndex,count:colCount})} className="vgt-button-secondary">{copy.actions.deleteColumns}</button>
        <button type="button" onClick={()=>onSetAxisHidden('row',true)} className="vgt-button-secondary">{copy.actions.hideRows}</button>
        <button type="button" onClick={()=>onSetAxisHidden('row',false)} className="vgt-button-secondary">{copy.actions.unhideRows}</button>
        <button type="button" onClick={()=>onSetAxisHidden('col',true)} className="vgt-button-secondary">{copy.actions.hideColumns}</button>
        <button type="button" onClick={()=>onSetAxisHidden('col',false)} className="vgt-button-secondary">{copy.actions.unhideColumns}</button>
        <button type="button" onClick={()=>onGroupAxis('row',false)} className="vgt-button-secondary">{copy.actions.groupRows}</button>
        <button type="button" onClick={()=>onGroupAxis('row',true)} className="vgt-button-secondary">{copy.actions.groupCollapseRows}</button>
        <button type="button" onClick={()=>onGroupAxis('col',false)} className="vgt-button-secondary">{copy.actions.groupColumns}</button>
        <button type="button" onClick={()=>onGroupAxis('col',true)} className="vgt-button-secondary">{copy.actions.groupCollapseColumns}</button>
      </div>
      <div className="flex gap-2"><input type="number" min={0} value={moveTarget} onChange={(e)=>setMoveTarget(Math.max(0,Number(e.target.value)||0))} aria-label={copy.fields.moveTarget} className="vgt-input flex-1"/><button type="button" onClick={()=>onStructureEdit({kind:'move-row',from:rowIndex,to:moveTarget,count:rowCount})} className="vgt-button-secondary">{copy.actions.moveRows}</button><button type="button" onClick={()=>onStructureEdit({kind:'move-col',from:colIndex,to:moveTarget,count:colCount})} className="vgt-button-secondary">{copy.actions.moveColumns}</button></div>
    </section>

    <section className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="font-semibold text-slate-200">{copy.sections.advanced}</h3>
      <div className="flex gap-2"><input value={goTo} onChange={(e)=>setGoTo(e.target.value)} className="vgt-input flex-1" placeholder={copy.goToPlaceholder} aria-label={copy.actions.goTo}/><button type="button" onClick={()=>onGoTo(goTo)} className="vgt-button-primary">{copy.actions.goTo}</button></div>
      <div className="flex gap-2"><select value={special} onChange={(e)=>setSpecial(e.target.value as GridGoToSpecialKind)} className="vgt-input flex-1" aria-label={copy.specialKindLabel}>{(Object.entries(copy.specialKinds) as [GridGoToSpecialKind,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={()=>onGoToSpecial(special)} className="vgt-button-secondary">{copy.actions.goToSpecial}</button></div>
      <div className="flex gap-2"><button type="button" onClick={onAddDisjoint} className="vgt-button-secondary">{copy.actions.addSelectionRange}</button><button type="button" onClick={onClearDisjoint} disabled={selectionRanges.length<=1} className="vgt-button-secondary">{copy.actions.clearMultiRange}</button></div>
      <div className="text-[0.625rem] text-slate-500">{copy.activeRanges(selectionRanges.length)}</div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={transferTarget} onChange={(e)=>setTransferTarget(e.target.value)} className="vgt-input" placeholder={copy.transfer.targetPlaceholder} aria-label={copy.transfer.targetPlaceholder}/><select value={transferMode} onChange={(e)=>setTransferMode(e.target.value as GridTransferMode)} className="vgt-input" aria-label={copy.transfer.modeLabel}>{(Object.entries(copy.transfer.modes) as [GridTransferMode,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button type="button" onClick={()=>onTransferSelection(transferTarget,transferMode)} className="vgt-button-primary">{copy.transfer.apply}</button></div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={flashTarget} onChange={(e)=>setFlashTarget(e.target.value)} className="vgt-input" placeholder={copy.flashFill.targetPlaceholder} aria-label={copy.flashFill.targetPlaceholder}/><select value={flashTransform} onChange={(e)=>setFlashTransform(e.target.value as FlashFillTransform)} className="vgt-input" aria-label={copy.flashFill.transformLabel}>{flashTransforms.map((value)=><option key={value} value={value}>{copy.flashFill.transforms[value]}</option>)}</select><button type="button" onClick={()=>onFlashFill(flashTarget,flashTransform)} className="vgt-button-primary">{copy.flashFill.apply}</button></div>
      <div className="space-y-1 rounded border border-white/10 p-2">
        <div className="text-[0.625rem] text-slate-400">{copy.richText.inCell(selectedCell)}</div>
        <textarea value={richText} maxLength={32768} onChange={(e)=>setRichText(e.target.value)} className="vgt-input min-h-16 w-full" placeholder={copy.richText.placeholder} aria-label={copy.richText.placeholder}/>
        <div className="flex flex-wrap items-center gap-2"><label><input type="checkbox" checked={richBold} onChange={(e)=>setRichBold(e.target.checked)}/> {copy.richText.bold}</label><label><input type="checkbox" checked={richItalic} onChange={(e)=>setRichItalic(e.target.checked)}/> {copy.richText.italic}</label><label><input type="checkbox" checked={richUnderline} onChange={(e)=>setRichUnderline(e.target.checked)}/> {copy.richText.underline}</label><input type="color" value={richColor} onChange={(e)=>setRichColor(e.target.value)} aria-label={copy.richText.color}/><button type="button" onClick={()=>onSetRichTextCell(selectedCell,[{text:richText,bold:richBold,italic:richItalic,underline:richUnderline,textColor:richColor}])} className="vgt-button-secondary">{copy.richText.apply}</button></div>
      </div>
    </section>

    <section className="space-y-2 border-t border-white/10 pt-3">
      <h3 className="font-semibold text-slate-200">{copy.sections.workbook}</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[0.625rem] text-slate-400">{copy.workbook.locale}<input value={locale} onChange={(e)=>onPatchWorkbook({locale:e.target.value})} className="vgt-input w-full"/></label>
        <label className="text-[0.625rem] text-slate-400">{copy.workbook.calculation}<select value={calculationMode} onChange={(e)=>onPatchWorkbook({calculationMode:e.target.value as CalcMode})} className="vgt-input w-full">{(Object.entries(copy.workbook.calculationModes) as [CalcMode,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2"><input value={propertyKey} onChange={(e)=>setPropertyKey(e.target.value)} className="vgt-input" placeholder={copy.workbook.propertyPlaceholder} aria-label={copy.workbook.propertyPlaceholder}/><input value={propertyValue} onChange={(e)=>setPropertyValue(e.target.value)} className="vgt-input" placeholder={copy.workbook.valuePlaceholder} aria-label={copy.workbook.valuePlaceholder}/><button type="button" onClick={addProperty} className="vgt-button-secondary">{copy.workbook.setProperty}</button></div>
    </section>
  </div>;
};
