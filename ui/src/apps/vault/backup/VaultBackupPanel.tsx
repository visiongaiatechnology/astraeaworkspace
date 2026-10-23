import React, { useMemo, useState } from 'react';
import { ArchiveRestore, HardDriveDownload, ShieldCheck } from 'lucide-react';
import type { NetworkCapability, VaultBackupCatalogEntry, VaultBackupPolicy, VaultBackupTargetDefinition, WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { VaultBackupRuntimeSecrets, VaultBackupExecutionResult } from '../../../shared/vault/backup/vaultBackupActions';
import type { VaultBackupPreview } from '../../../shared/vault/backup/vaultBackupEngine';
import { normalizeVaultBackupPolicy, vaultBackupBundlePlanMessage, type VaultBackupBundlePlan } from '../../../shared/vault/backup/vaultBackupEngine';
import { createDirectoryBackupAdapter, createWebDavBackupAdapter, type DirectoryHandleLike, type VaultBackupTargetAdapter } from '../../../shared/vault/backup/vaultBackupTargets';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { vaultBackupCreated, vaultBackupFormat, vaultBackupText } from '../vaultBackupLocale';
import { vaultBackupEngineErrorText } from '../vaultBackupEngineErrorLocale';

interface DirectoryPickerWindow extends Window { showDirectoryPicker?: (options?: {mode?:'read'|'readwrite'})=>Promise<DirectoryHandleLike>; }
interface VaultBackupPanelProps {
  policy?: VaultBackupPolicy;
  catalog: VaultBackupCatalogEntry[];
  networkCapability: NetworkCapability;
  vaultPin: string | null;
  vaultPassword?: string | null;
  onUpdatePolicy: (policy: Partial<VaultBackupPolicy>)=>void;
  onCreateBackup: (adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets)=>Promise<VaultBackupExecutionResult>;
  /**
   * **V-012.** Die **vorab** errechnete Bündelgröße samt Grenzen. Sie wird **vor** dem Lauf angezeigt,
   * damit die 96-MiB-Grenze nicht erst sichtbar wird, wenn der Aufbau mittendrin abbricht.
   * Ohne diesen Wert bleibt der Bereich aus — kein Platzhalter, der nichts aussagt.
   */
  bundlePlan?: VaultBackupBundlePlan;
  onPreview: (entryId:string,adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets)=>Promise<VaultBackupPreview>;
  onRestoreAll: (entryId:string,adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets)=>Promise<WorkspaceDocument[]>;
  onRestoreFiles: (entryId:string,adapter:VaultBackupTargetAdapter,secrets:VaultBackupRuntimeSecrets,fileIds:string[])=>Promise<WorkspaceDocument>;
  onApplyDisasterRecovery: (documents:WorkspaceDocument[])=>void;
  onApplyFileRecovery: (vaultDocument:WorkspaceDocument)=>void;
}

export const VaultBackupPanel: React.FC<VaultBackupPanelProps> = (props) => {
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof vaultBackupText>[0]) => vaultBackupText(message, locale);
  const format = (message: Parameters<typeof vaultBackupFormat>[0], count: number) => vaultBackupFormat(message, count, locale);
  const targetKindText = (kind: VaultBackupTargetDefinition['kind']) => t(kind === 'local_folder' ? 'localFolder' : kind === 'external_drive' ? 'externalDrive' : kind === 'removable_media' ? 'removableMedia' : 'nasSelfHosted');
  const policy=normalizeVaultBackupPolicy(props.policy); const target=policy.target;
  const [directory,setDirectory]=useState<DirectoryHandleLike|null>(null);
  const [independentPassword,setIndependentPassword]=useState(''); const [webdavPassword,setWebdavPassword]=useState('');
  const [status,setStatus]=useState<string|null>(null); const [busy,setBusy]=useState(false);
  const [selectedBackupId,setSelectedBackupId]=useState(props.catalog[0]?.id??''); const [preview,setPreview]=useState<VaultBackupPreview|null>(null);
  const [selectedFileIds,setSelectedFileIds]=useState<Set<string>>(new Set());
  const selectedEntry=useMemo(()=>props.catalog.find((entry)=>entry.id===selectedBackupId),[props.catalog,selectedBackupId]);
  const secrets=():VaultBackupRuntimeSecrets=>({independentPassword:independentPassword||null,pin:props.vaultPin,vaultPassword:props.vaultPassword});
  const updateTarget=(patch:Partial<VaultBackupTargetDefinition>)=>{
    const current:VaultBackupTargetDefinition=target??{id:'vault-backup-primary',label:'Primary backup',kind:'local_folder',transport:'filesystem_access',airGapped:false};
    props.onUpdatePolicy({target:{...current,...patch}});
  };
  const adapter=():VaultBackupTargetAdapter=>{
    if(!target)throw new Error(t('configureTargetError'));
    if(target.transport==='filesystem_access'){if(!directory)throw new Error(t('selectTargetError'));return createDirectoryBackupAdapter(directory);}
    return createWebDavBackupAdapter(target,props.networkCapability,{password:webdavPassword||null});
  };
  const run=async<T,>(operation:()=>Promise<T>,success:(value:T)=>string)=>{setBusy(true);setStatus(null);try{const result=await operation();setStatus(success(result));return result;}catch(error){const knownLocalError=error instanceof Error&&[t('configureTargetError'),t('selectTargetError')].includes(error.message);setStatus(knownLocalError?error.message:vaultBackupEngineErrorText(error,locale));return undefined;}finally{setBusy(false);}};
  const chooseDirectory=async()=>{const picker=(globalThis.window as DirectoryPickerWindow).showDirectoryPicker;if(!picker){setStatus(t('directoryPickerUnavailable'));return;}try{setDirectory(await picker({mode:'readwrite'}));setStatus(t('directoryAuthorized'));}catch(error){if(error instanceof DOMException&&error.name==='AbortError')return;setStatus(vaultBackupEngineErrorText(error,locale));}};
  const configureKind=(kind:VaultBackupTargetDefinition['kind'])=>updateTarget({kind,transport:kind==='nas_self_hosted'?(target?.transport??'filesystem_access'):'filesystem_access',airGapped:kind==='removable_media'?Boolean(target?.airGapped):false});
  return (
    <section className="rounded-2xl border border-cyan-500/15 bg-slate-950/45 p-4 space-y-4">
      <div><h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><HardDriveDownload className="h-4 w-4 text-cyan-300"/>{t('heading')}</h3><p className="mt-1 text-[0.625rem] text-slate-500">{t('description')}</p></div>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-[0.625rem] text-slate-400">{t('target')}<select value={target?.kind??'local_folder'} onChange={(e)=>configureKind(e.target.value as VaultBackupTargetDefinition['kind'])} className="vgt-input mt-1 w-full"><option value="local_folder">{t('localFolder')}</option><option value="external_drive">{t('externalDrive')}</option><option value="removable_media">{t('removableMedia')}</option><option value="nas_self_hosted">{t('nasSelfHosted')}</option></select></label>
        <label className="text-[0.625rem] text-slate-400">{t('mode')}<select value={policy.mode} onChange={(e)=>props.onUpdatePolicy({mode:e.target.value as 'full'|'incremental'})} className="vgt-input mt-1 w-full"><option value="full">{t('full')}</option><option value="incremental">{t('incremental')}</option></select></label>
        <label className="text-[0.625rem] text-slate-400">{t('backupKey')}<select value={policy.keyMode} onChange={(e)=>props.onUpdatePolicy({keyMode:e.target.value as 'inherit_vault'|'independent_password'})} className="vgt-input mt-1 w-full"><option value="inherit_vault">{t('inheritVault')}</option><option value="independent_password">{t('independentPassword')}</option></select></label>
        {target?.kind==='nas_self_hosted'&&<label className="text-[0.625rem] text-slate-400">{t('transport')}<select value={target.transport} onChange={(e)=>updateTarget({transport:e.target.value as 'filesystem_access'|'webdav_https',airGapped:false})} className="vgt-input mt-1 w-full"><option value="filesystem_access">{t('osMountedFolder')}</option><option value="webdav_https">{t('webdavHttps')}</option></select></label>}
      </div>
      {!target||target.transport==='filesystem_access'?<div className="flex flex-wrap items-end gap-2"><button type="button" onClick={()=>void chooseDirectory()} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">{t('authorizeFolder')}</button><label className="flex items-center gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={Boolean(target?.airGapped)} onChange={(e)=>updateTarget({airGapped:e.target.checked})}/>{t('airGapped')}</label>{directory&&<span className="text-[0.625rem] text-emerald-300">{t('directoryGranted')}</span>}</div>:<div className="grid gap-2 md:grid-cols-3"><input className="vgt-input" placeholder={t('endpointPlaceholder')} value={target.endpointUrl??''} onChange={(e)=>updateTarget({endpointUrl:e.target.value})}/><input className="vgt-input" placeholder={t('webdavUserPlaceholder')} value={target.username??''} onChange={(e)=>updateTarget({username:e.target.value})}/><input className="vgt-input" type="password" placeholder={t('webdavPasswordPlaceholder')} value={webdavPassword} onChange={(e)=>setWebdavPassword(e.target.value)} autoComplete="off"/></div>}
      {policy.keyMode==='independent_password'&&<input className="vgt-input w-full" type="password" placeholder={t('independentPasswordPlaceholder')} value={independentPassword} onChange={(e)=>setIndependentPassword(e.target.value)} autoComplete="new-password"/>}
      <div className="grid gap-2 md:grid-cols-4"><label className="text-[0.625rem] text-slate-400">{t('keepBackups')}<input className="vgt-input mt-1 w-full" type="number" min={1} max={256} value={policy.retentionCount} onChange={(e)=>props.onUpdatePolicy({retentionCount:Number(e.target.value)})}/></label><label className="text-[0.625rem] text-slate-400">{t('retentionDays')}<input className="vgt-input mt-1 w-full" type="number" min={1} max={3650} value={policy.retentionDays} onChange={(e)=>props.onUpdatePolicy({retentionDays:Number(e.target.value)})}/></label><label className="flex items-center gap-2 text-[0.625rem] text-slate-300"><input type="checkbox" checked={Boolean(policy.schedule?.enabled)} onChange={(e)=>props.onUpdatePolicy({schedule:{enabled:e.target.checked,executor:policy.schedule?.executor??'local_agent',cadence:policy.schedule?.cadence??'daily',hourLocal:policy.schedule?.hourLocal??2,weekday:policy.schedule?.weekday}})}/>{t('scheduledJob')}</label><input className="vgt-input" placeholder={t('hostTargetReference')} value={target?.hostTargetRef??''} onChange={(e)=>updateTarget({hostTargetRef:e.target.value})}/></div>
      {policy.schedule?.enabled&&<div className="grid gap-2 md:grid-cols-3"><select className="vgt-input" aria-label={t('localAgent')} value={policy.schedule.executor} onChange={(e)=>props.onUpdatePolicy({schedule:{...policy.schedule!,executor:e.target.value as 'local_agent'|'self_hosted'}})}><option value="local_agent">{t('localAgent')}</option><option value="self_hosted">{t('selfHostedAgent')}</option></select><select className="vgt-input" aria-label={t('daily')} value={policy.schedule.cadence} onChange={(e)=>props.onUpdatePolicy({schedule:{...policy.schedule!,cadence:e.target.value as 'daily'|'weekly'}})}><option value="daily">{t('daily')}</option><option value="weekly">{t('weekly')}</option></select><input className="vgt-input" aria-label={t('scheduleHour')} type="number" min={0} max={23} value={policy.schedule.hourLocal} onChange={(e)=>props.onUpdatePolicy({schedule:{...policy.schedule!,hourLocal:Number(e.target.value)}})}/><p className="md:col-span-3 text-[0.625rem] text-amber-300">{t('scheduleInfo')}</p></div>}
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!target||props.bundlePlan?.fits===false} onClick={()=>void run(()=>props.onCreateBackup(adapter(),secrets()),(result)=>vaultBackupCreated(t(result.entry.mode),result.entry.id,result.entry.packageBytes,locale))} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy?t('working'):t('createVerify')}</button><span className="flex items-center gap-1 text-[0.625rem] text-emerald-300"><ShieldCheck className="h-3 w-3"/>{t('verifyAfterWrite')}</span></div>
      {/*
        **V-012.** Die Grenze steht **hier**, bevor der Lauf beginnt: Anzahl und geschätzte Bytes gegen die
        Limits, und bei Überschreitung der **Grund** — nicht bloß ein gesperrter Knopf. Ein gesperrter Knopf
        ohne Begründung wäre eine stumme Ablehnung; der Nutzer erfährt hier, **was** zu viel ist.
      */}
      {props.bundlePlan && <p
        className={`text-[0.625rem] ${props.bundlePlan.fits ? 'text-slate-400' : 'text-amber-300'}`}
        role={props.bundlePlan.fits ? undefined : 'alert'}
      >
        {vaultBackupBundlePlanMessage(props.bundlePlan)}
      </p>}
      {props.catalog.length>0&&<div className="space-y-2 border-t border-white/10 pt-3"><div className="flex flex-wrap gap-2"><select className="vgt-input min-w-[280px]" aria-label={t('verifyPreview')} value={selectedBackupId} onChange={(e)=>{setSelectedBackupId(e.target.value);setPreview(null);setSelectedFileIds(new Set());}}>{props.catalog.map((entry)=><option key={entry.id} value={entry.id}>{new Date(entry.createdAt).toLocaleString(locale)} · {t(entry.mode)} · {targetKindText(entry.targetKind)}</option>)}</select><button type="button" disabled={busy||!selectedEntry} onClick={()=>void run(()=>props.onPreview(selectedBackupId,adapter(),secrets()),(value)=>{setPreview(value);return format('backupVerified',value.totalWorkspaceDocuments);})} className="rounded bg-slate-800 px-3 py-2 text-xs">{t('verifyPreview')}</button><button type="button" disabled={busy||!selectedEntry} onClick={()=>void run(()=>props.onRestoreAll(selectedBackupId,adapter(),secrets()),(documents)=>{props.onApplyDisasterRecovery(documents);return format('recoveryApplied',documents.length);})} className="rounded bg-rose-700/80 px-3 py-2 text-xs text-white"><ArchiveRestore className="mr-1 inline h-3.5 w-3.5"/>{t('disasterRecovery')}</button></div>
        {preview&&<div className="rounded-lg border border-white/10 bg-black/20 p-3 text-[0.625rem] text-slate-300"><div>{t(preview.mode)} · {preview.changedDocuments.length} {t('changedDocs')} · {preview.deletedDocumentIds.length} {t('tombstones')} · {preview.totalWorkspaceDocuments} {t('total')}</div>{preview.vaultFiles.length>0&&<div className="mt-2 max-h-32 overflow-auto space-y-1">{preview.vaultFiles.map((file)=><label key={file.id} className="flex items-center gap-2"><input type="checkbox" aria-label={file.name} checked={selectedFileIds.has(file.id)} onChange={(e)=>setSelectedFileIds((prev)=>{const next=new Set(prev);e.target.checked?next.add(file.id):next.delete(file.id);return next;})}/><span>{file.name}</span><span className="text-slate-500">{file.sizeBytes} {t('fileSizeUnit')}</span></label>)}</div>}<button type="button" disabled={!selectedFileIds.size||busy} onClick={()=>void run(()=>props.onRestoreFiles(selectedBackupId,adapter(),secrets(),[...selectedFileIds]),(vaultDoc)=>{props.onApplyFileRecovery(vaultDoc);return format('restoredFiles',selectedFileIds.size);})} className="mt-2 rounded bg-indigo-700 px-2 py-1 text-[0.625rem] text-white">{t('restoreFiles')}</button></div>}
      </div>}
      {status&&<div role="status" className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[0.625rem] text-slate-300">{status}</div>}
    </section>
  );
};
