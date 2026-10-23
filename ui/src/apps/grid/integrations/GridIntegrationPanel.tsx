import React, { useMemo, useState } from 'react';
import type {
  GridPublishObjectDefinition,
  GridSheetModel,
  GridStructuredTable,
  ReferenceMode,
  WorkspaceDocument,
} from '../../../shared/contracts/workspace';
import type { GridPublishRequest, GridWorkspacePublishTarget } from './gridWorkspacePublish';

interface GridIntegrationPanelProps {
  sheet: GridSheetModel;
  selectedCell: string;
  selectedRange: string;
  publishObjects: GridPublishObjectDefinition[];
  publishTargets: GridWorkspacePublishTarget[];
  workspaceDocuments: WorkspaceDocument[];
  tables: GridStructuredTable[];
  onCreatePublishObject: (request: GridPublishRequest) => void;
  onDeletePublishObject: (id: string) => void;
  onPublishObject: (definitionId: string, targetDocumentId: string, mode: ReferenceMode) => void;
  onProtectToVault: (definitionId: string, vaultDocumentId: string) => Promise<string>;
}

const input = 'w-full bg-slate-950 border border-white/10 rounded px-2 py-1.5 text-[0.6875rem] text-slate-200';
const button = 'px-2.5 py-1.5 rounded bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-[0.625rem] text-blue-200 disabled:opacity-40';

export const GridIntegrationPanel: React.FC<GridIntegrationPanelProps> = ({
  sheet, selectedCell, selectedRange, publishObjects, publishTargets, workspaceDocuments, tables,
  onCreatePublishObject, onDeletePublishObject, onPublishObject, onProtectToVault,
}) => {
  const [definitionId, setDefinitionId] = useState(publishObjects[0]?.id ?? '');
  const [targetId, setTargetId] = useState(publishTargets[0]?.id ?? '');
  const [mode, setMode] = useState<ReferenceMode>('Live');
  const [vaultId, setVaultId] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const vaults = useMemo(() => workspaceDocuments.filter((doc) => doc.kind === 'Vault'), [workspaceDocuments]);
  const activeDefinition = publishObjects.find((item) => item.id === definitionId) ?? publishObjects[0];

  const create = (request: GridPublishRequest) => {
    try { onCreatePublishObject(request); setStatus(`${request.kind} publish object created.`); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Publish object creation failed.'); }
  };

  const run = async (action: () => Promise<string>) => {
    try { setStatus(await action()); } catch (error) { setStatus(error instanceof Error ? error.message : 'Integration action failed.'); }
  };

  return <div className="space-y-4">
    <section className="space-y-2">
      <div className="text-[0.625rem] uppercase tracking-wider text-slate-500">Publish Objects</div>
      <div className="grid grid-cols-3 gap-1.5">
        <button className={button} onClick={() => create({kind:'cell',title:`Cell ${selectedCell}`,sourceSheetId:sheet.id,sourceRange:selectedCell})}>Cell</button>
        <button className={button} onClick={() => create({kind:'range',title:`Range ${selectedRange}`,sourceSheetId:sheet.id,sourceRange:selectedRange})}>Range</button>
        <button className={button} onClick={() => create({kind:'kpi',title:`KPI ${selectedCell}`,sourceSheetId:sheet.id,sourceRange:selectedCell})}>KPI</button>
      </div>
      {tables.length > 0 && <div className="grid grid-cols-[1fr_auto] gap-1.5"><select id="grid-publish-table" className={input}>{tables.map((table)=><option key={table.id} value={table.id}>{table.name}</option>)}</select><button className={button} onClick={()=>{const el=document.getElementById('grid-publish-table') as HTMLSelectElement|null; const id=el?.value; const table=tables.find((item)=>item.id===id); if(table)create({kind:'table',title:table.name,sourceSheetId:sheet.id,sourceTableId:table.id});}}>Table</button></div>}
      {(sheet.pivots?.length ?? 0) > 0 && <div className="grid grid-cols-[1fr_auto] gap-1.5"><select id="grid-publish-pivot" className={input}>{sheet.pivots!.map((pivot)=><option key={pivot.id} value={pivot.id}>{pivot.name}</option>)}</select><button className={button} onClick={()=>{const el=document.getElementById('grid-publish-pivot') as HTMLSelectElement|null; const id=el?.value; const pivot=sheet.pivots?.find((item)=>item.id===id); if(pivot)create({kind:'pivot',title:pivot.name,sourceSheetId:sheet.id,sourcePivotId:pivot.id});}}>Pivot</button></div>}
      {publishObjects.length > 0 && <div className="space-y-1.5">
        <select className={input} value={activeDefinition?.id ?? ''} onChange={(event)=>setDefinitionId(event.target.value)}>{publishObjects.map((item)=><option key={item.id} value={item.id}>{item.title} · {item.kind}</option>)}</select>
        <div className="grid grid-cols-[1fr_80px] gap-1.5"><select className={input} value={targetId} onChange={(event)=>setTargetId(event.target.value)}><option value="">Target…</option>{publishTargets.map((target)=><option key={target.id} value={target.id}>{target.title} · {target.kind}</option>)}</select><select className={input} value={mode} onChange={(event)=>setMode(event.target.value as ReferenceMode)}><option>Live</option><option>Frozen</option></select></div>
        <div className="flex gap-1.5"><button className={button} disabled={!activeDefinition||!targetId} onClick={()=>activeDefinition&&targetId&&onPublishObject(activeDefinition.id,targetId,mode)}>Publish</button><button className={button} disabled={!activeDefinition} onClick={()=>activeDefinition&&onDeletePublishObject(activeDefinition.id)}>Delete</button></div>
      </div>}
      <p className="text-[0.5625rem] text-slate-500">Charts publish from Visualize. All other objects use stable Table-backed Fabric objects.</p>
    </section>

    <section className="space-y-2 border-t border-white/10 pt-3">
      <div className="text-[0.625rem] uppercase tracking-wider text-slate-500">Vault Protected Dataset</div>
      <select className={input} value={vaultId} onChange={(e)=>setVaultId(e.target.value)}><option value="">Vault target…</option>{vaults.map((doc)=><option key={doc.id} value={doc.id}>{doc.title}</option>)}</select>
      <button className={button} disabled={!activeDefinition||!vaultId} onClick={()=>activeDefinition&&vaultId&&void run(()=>onProtectToVault(activeDefinition.id,vaultId))}>Seal selected publish object into encrypted VGT container</button>
    </section>


    {status && <div className="rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-2 text-[0.625rem] text-cyan-200 break-words">{status}</div>}
  </div>;
};
