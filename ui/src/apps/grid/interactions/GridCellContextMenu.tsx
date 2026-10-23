// STATUS: DIAMANT VGT SUPREME
// Isolated Grid cell context menu actions.
import React from 'react';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { GRID_OFFICE_COPY } from '../locale/gridOfficeLocale';

export interface GridCellContextMenuProps {
  x:number; y:number; onClose:()=>void;
  onCopy?:()=>void; onCut?:()=>void; onPaste?:()=>void; onOpenPasteSpecial?:()=>void;
  onOpenGoalSeek?:()=>void; onMergeCells?:()=>void; onUnmergeCells?:()=>void;
  onClearContents?:()=>void; onOpenComments?:()=>void; onOpenFindReplace?:()=>void;
}

const action=(label:string,shortcut:string|undefined,run:(()=>void)|undefined,close:()=>void,danger=false)=>run ? (
  <button type="button" onClick={()=>{run();close();}} className={`w-full text-left px-3 py-1.5 hover:text-white flex items-center justify-between ${danger?'text-red-300 hover:bg-red-600':'hover:bg-blue-600'}`}>
    <span>{label}</span>{shortcut&&<span className="text-[0.625rem] text-slate-400">{shortcut}</span>}
  </button>
):null;

export const GridCellContextMenu:React.FC<GridCellContextMenuProps>=({x,y,onClose,onCut,onCopy,onPaste,onOpenPasteSpecial,onMergeCells,onUnmergeCells,onOpenGoalSeek,onClearContents,onOpenComments,onOpenFindReplace})=>{
  const { locale } = useWorkspaceLocale();
  const copy = GRID_OFFICE_COPY[locale].contextMenu;
  return <div role="menu" aria-label={copy.accessibleName} className="fixed z-50 bg-slate-900 border border-white/20 rounded-lg shadow-2xl py-1 text-xs text-slate-200 min-w-[160px] max-w-[min(18rem,calc(100vw-1rem))]" style={{top:y,left:x}} onClick={(e)=>e.stopPropagation()}>
    {action(copy.cut,'Ctrl+X',onCut,onClose)}{action(copy.copy,'Ctrl+C',onCopy,onClose)}{action(copy.paste,'Ctrl+V',onPaste,onClose)}{action(copy.pasteSpecial,'Ctrl+Alt+V',onOpenPasteSpecial,onClose)}
    <div className="border-t border-white/10 my-1" />
    {action(copy.merge,undefined,onMergeCells,onClose)}{action(copy.unmerge,undefined,onUnmergeCells,onClose)}
    <div className="border-t border-white/10 my-1" />
    {action(copy.goalSeek,undefined,onOpenGoalSeek,onClose)}{action(copy.clearContents,'Del',onClearContents,onClose,true)}
    <div className="border-t border-white/10 my-1" />
    {action(copy.comments,'Shift+F2',onOpenComments,onClose)}{action(copy.findReplace,'Ctrl+F',onOpenFindReplace,onClose)}
  </div>;
};
