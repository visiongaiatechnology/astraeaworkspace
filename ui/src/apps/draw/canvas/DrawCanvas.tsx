// STATUS: DIAMANT VGT SUPREME — Astraea Draw dedicated accessible workspace surface
//
// The main viewport is an *interactive* canvas: `DrawInteractiveSurface` renders every object as a real
// SVG node and forwards pointer/keyboard input into `drawCanvasSession`, whose pure steps are applied
// here. This component only wires: it owns no geometry, no hit-testing and no edit rules of its own.
// Persistence always goes through the canonical document (`workspaceDocument.drawData` ⇒
// `onUpdateDocument`); there is no second store.
import { isImeCompositionEvent } from '../../../shared/accessibility/accessibilityPlatform';
import { deliverDrawExport, drawDeliveryText, type DrawExportPart } from './drawExportDelivery';
import type { ExportDeliveryResult } from '../../../shared/interchange/exportDelivery';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { DrawDocumentModel, DrawLayer, DrawPage, DrawPoint } from '../../../shared/contracts/draw/workspaceDraw';
import { addDrawPage, createEmptyDrawDocument, transactDraw, upsertDrawLayer, upsertDrawObject } from '../model/drawDocumentEngine';
import { createVectorShape } from '../model/drawVectorEngine';
import { BUILTIN_DRAW_TEMPLATES, instantiateDrawTemplate } from '../model/drawTemplateEngine';
import {
  buildDrawPdf, buildDrawPng, buildDrawSvg, exportDrawVisio, importDrawSvg, importDrawVisio,
  packNativeDraw, unpackNativeDraw,
} from '../import-export/drawInterchangeEngine';
import { importForeignDrawSvg } from '../import-export/drawSvgVectorImport';
import { createDrawHistory, pushDrawHistory, redoDrawHistory, undoDrawHistory, type DrawHistoryState } from '../model/drawHistoryEngine';
import { useWorkspaceLocale } from '../../../shell/localization/workspaceLocale';
import { drawCanvasCount, drawCanvasEngineError, drawCanvasErrorText, drawCanvasText } from '../drawCanvasLocale';
import { drawInteractionText } from '../drawInteractionLocale';
import {
  createDrawCanvasSession, drawSessionCommand, drawSessionDoubleClick, drawSessionEndText,
  drawSessionKeyDown, drawSessionPointerCancel, drawSessionPointerDown, drawSessionPointerMove,
  drawSessionPointerUp, drawSessionSetText,
  type DrawCanvasSessionState, type DrawCanvasSessionStep, type DrawSessionCommand,
} from '../interactions/drawCanvasSession';
import type { DrawInteractionModifiers } from '../interactions/drawInteractionController';
import { DrawInteractiveSurface } from './DrawInteractiveSurface';
import { DrawShapeLibraryPanel } from './DrawShapeLibraryPanel';
import { DrawLayerPanel } from './DrawLayerPanel';
import { DrawStyleInspectorPanel } from './DrawStyleInspectorPanel';
import { DrawConnectorPanel } from './DrawConnectorPanel';
import { DrawDataGraphicsPanel } from './DrawDataGraphicsPanel';
import { DrawSendPanel } from './DrawSendPanel';
import { layoutDrawPage } from '../interactions/drawAutoLayoutEngine';
import {
  applyDrawDataGraphics, bindDrawDataGraphic, breakDrawDataBinding, drawDataBindingFor, drawDataFieldsFrom,
  relinkDrawDataBinding, setDrawDataBindingMode, unbindDrawDataGraphic,
} from '../interactions/drawDataGraphicsEngine';
import { drawSendCarrierPayload, sendDrawElement, readDrawSendState, type DrawSendElement } from '../integrations/drawSendEngine';
import { useDrawDropZone } from '../drop-zone/useDrawDropZone';
import { DrawDropZoneOverlay } from '../drop-zone/DrawDropZoneOverlay';
import { DRAW_DROP_ZONE_TITLE } from '../drop-zone/drawDropZoneContract';

interface DrawCanvasProps { document: WorkspaceDocument; onUpdateDocument:(doc:WorkspaceDocument)=>void; /** **Vom Shell verdrahtet (Runde 128):** Ohne Dokumentliste sind Draws Datengrafik-Engines (indWorkspaceDataGraphic + evaluateDataGraphics, W-361) unerreichbar — dieselbe Klasse wie ssertPdfStudioSchema/Insight (W-391). Additiv und optional, damit kein Aufrufer bricht. */ workspaceDocuments?:readonly WorkspaceDocument[]; }
type DrawDownloadPart = DrawExportPart;
/** Release Beta 0.1: native save on the desktop; the browser fallback is a download. */
const download=(parts:readonly DrawDownloadPart[],type:string,name:string):Promise<ExportDeliveryResult>=>deliverDrawExport(parts,type,name);
const noteExportDelivery=(result:ExportDeliveryResult,setNotice:(value:string|null)=>void)=>{setNotice(drawDeliveryText(result));};
const safeFileName=(value:string)=>value.replace(/[^A-Za-z0-9._-]+/g,'_').slice(0,120)||'drawing';
const isTextEntryTarget=(target:EventTarget|null):boolean=>{const element=target as {tagName?:string;isContentEditable?:boolean}|null;return Boolean(element&&(element.tagName==='TEXTAREA'||element.tagName==='INPUT'||element.isContentEditable));};
/** Der Browser-Rasterizer ist **die** Voraussetzung für PNG/PDF (`svgRasterizer` nutzt `Image`/Canvas). */
const rasterizerAvailable=typeof document!=='undefined';

export const DrawCanvas:React.FC<DrawCanvasProps>=({document:workspaceDocument,onUpdateDocument,workspaceDocuments})=>{
  const { locale } = useWorkspaceLocale();
  const t = (message: Parameters<typeof drawCanvasText>[0]) => drawCanvasText(message, locale);
  const ti = (message: Parameters<typeof drawInteractionText>[0]) => drawInteractionText(message, locale);
  /** **Paket 14:** die Ablagezone. Sie führt **keine** zweite Zieh-Session und **keine** zweite Erlaubnisliste:
   *  die Route entscheidet die versiegelte Matrix der Shell, das Urteil Paket 6 (`useDrawDropZone`). */
  const drawDropZone = useDrawDropZone({ targetDocument: workspaceDocument, documents: workspaceDocuments });
  const initial=workspaceDocument.drawData??createEmptyDrawDocument();
  const [session,setSession]=useState<DrawCanvasSessionState>(()=>createDrawCanvasSession(initial));
  const sessionRef=useRef(session);
  const [history,setHistory]=useState<DrawHistoryState>(()=>createDrawHistory(initial));
  const [templateId,setTemplateId]=useState(BUILTIN_DRAW_TEMPLATES[0].id);
  const [activeLayerId,setActiveLayerId]=useState(initial.pages.find(p=>p.id===initial.activePageId)?.layerIds[0]??'layer-main');
  const [portablePassword,setPortablePassword]=useState('');
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);
  /** Die **benannten** Teile einer Meldung (Visio: die nicht konvertierten Teile) — nie als Fließtext versteckt. */
  const [noticeItems,setNoticeItems]=useState<readonly string[]>([]);
  const [layoutMode,setLayoutMode]=useState<'table'|'hierarchy'>('hierarchy');
  const svgImportRef=useRef<HTMLInputElement>(null),nativeImportRef=useRef<HTMLInputElement>(null),visioImportRef=useRef<HTMLInputElement>(null);
  const canvasRef=useRef<HTMLDivElement>(null);
  const model=session.model;
  const page=model.pages.find(p=>p.id===model.activePageId)??model.pages[0];

  useEffect(()=>{
    const next=workspaceDocument.drawData??createEmptyDrawDocument();
    const fresh=createDrawCanvasSession(next);
    sessionRef.current=fresh;
    setSession(fresh);
    setHistory(createDrawHistory(next));
  },[workspaceDocument.id]);
  useEffect(()=>{if(!page.layerIds.includes(activeLayerId))setActiveLayerId(page.layerIds[0]);},[page.id,page.layerIds.join('|'),activeLayerId]);

  const publish=useCallback((next:DrawDocumentModel)=>{
    onUpdateDocument({...workspaceDocument,drawData:next,modified_at:Date.now(),version:workspaceDocument.version+1});
  },[onUpdateDocument,workspaceDocument]);

  /** Applies a pure session step: `none` only re-renders, `live` writes without history, `history`
   *  collapses the whole gesture/command into exactly one undo entry. */
  const applyStep=useCallback((step:DrawCanvasSessionStep)=>{
    sessionRef.current=step.state;
    setSession(step.state);
    if(step.commit==='none')return;
    if(step.commit==='history'){
      const target=step.state.model;
      setHistory(prev=>pushDrawHistory(prev,target));
    }
    publish(step.state.model);
    setError(null);
  },[publish]);

  const attempt=useCallback((run:()=>void)=>{try{run();}catch(e){setError(drawCanvasEngineError(e,locale));}},[locale]);
  const guarded=useCallback((run:()=>void|Promise<void>)=>{Promise.resolve().then(run).catch(e=>setError(drawCanvasEngineError(e,locale)));},[locale]);
  const command=useCallback((value:DrawSessionCommand)=>attempt(()=>applyStep(drawSessionCommand(sessionRef.current,value))),[applyStep,attempt]);

  /** Toolbar edits: one history entry each, selection preserved. */
  const persist=useCallback((next:DrawDocumentModel)=>{
    sessionRef.current=createDrawCanvasSession(next,sessionRef.current.selectedIds);
    setSession(sessionRef.current);
    setHistory(prev=>pushDrawHistory(prev,next));
    publish(next);
    setError(null);
  },[publish]);
  const persistHistory=useCallback((next:DrawHistoryState)=>{
    if(next===history)return;
    const fresh=createDrawCanvasSession(next.present,sessionRef.current.selectedIds);
    sessionRef.current=fresh;
    setSession(fresh);
    setHistory(next);
    publish(next.present);
    setError(null);
  },[history,publish]);

  const newId=(prefix:string)=>`${prefix}-${model.revision+1}-${model.pages.length}-${Object.keys(model.objects).length}`;
  const addRectangle=()=>attempt(()=>persist(upsertDrawObject(model,createVectorShape({id:newId('shape'),pageId:page.id,layerId:activeLayerId,name:'Rectangle',x:80,y:80,width:180,height:100,rotation:0,flipX:false,flipY:false,opacity:1,locked:false,zIndex:Object.keys(model.objects).length+1,richText:{runs:[{text:'Rectangle'}],autoFit:'shrink',padding:{top:8,right:8,bottom:8,left:8},verticalAlign:'middle',rotation:0},vector:{kind:'rectangle'}}))));
  const addPage=()=>attempt(()=>{const id=`page-${model.pages.length+1}-${model.revision+1}`;const p:DrawPage={id,name:`Page ${model.pages.length+1}`,width:1122,height:793,orientation:'landscape',printableBounds:{x:32,y:32,width:1058,height:729},objectIds:[],layerIds:[activeLayerId]};persist(addDrawPage(model,p));});
  const addLayer=()=>attempt(()=>{const id=`layer-${model.layers.length+1}-${model.revision+1}`;const layer:DrawLayer={id,name:`Layer ${model.layers.length+1}`,visible:true,locked:false,printable:true,order:page.layerIds.length};persist(upsertDrawLayer(model,layer,[page.id]));setActiveLayerId(id);});
  const applyTemplate=()=>attempt(()=>{
    const definition=BUILTIN_DRAW_TEMPLATES.find(candidate=>candidate.id===templateId);
    if(!definition)throw new Error(drawCanvasEngineError({code:'template-missing'},locale));
    persist(instantiateDrawTemplate(model,templateId,page.id,activeLayerId,`tpl${model.revision+1}`));
    setNotice(`${t('applyTemplate')}: ${definition.name}`);
    setNoticeItems([]);
  });
  const setZoom=(zoom:number)=>attempt(()=>persist(transactDraw(model,d=>{d.viewport.zoom=Math.max(.1,Math.min(4,zoom));})));
  const selectPage=(id:string)=>attempt(()=>persist(transactDraw(model,d=>{if(!d.pages.some(p=>p.id===id))throw new Error(drawCanvasErrorText('pageMissing',locale));d.activePageId=id;})));
  /** Eine leere Seite ist **kein** Fehler, aber sie wird **benannt** — kein stiller Export einer leeren Datei. */
  const noteEmptyPage=()=>{if(page.objectIds.length===0)setNotice(drawCanvasErrorText('exportEmptyPage',locale));};
  const exportSvg=()=>guarded(async()=>{noteEmptyPage();noteExportDelivery(await download([buildDrawSvg(model,page.id)],'image/svg+xml',`${safeFileName(workspaceDocument.title)}-${page.id}.svg`),setNotice);});
  const exportPng=()=>guarded(async()=>{noteEmptyPage();noteExportDelivery(await download([await buildDrawPng(model,page.id)],'image/png',`${safeFileName(workspaceDocument.title)}-${page.id}.png`),setNotice);});
  const exportPdf=()=>guarded(async()=>{noteEmptyPage();noteExportDelivery(await download([await buildDrawPdf(workspaceDocument.title,model,[page.id])],'application/pdf',`${safeFileName(workspaceDocument.title)}-${page.id}.pdf`),setNotice);});
  const exportVisio=()=>guarded(async()=>{noteEmptyPage();noteExportDelivery(await download([exportDrawVisio(workspaceDocument.title,model,page.id).xml],'application/xml',`${safeFileName(workspaceDocument.title)}-${page.id}.vdx`),setNotice);});
  const exportNative=()=>guarded(async()=>{if(portablePassword.length<12)throw new Error(drawCanvasErrorText('exportPassword',locale));noteExportDelivery(await download([await packNativeDraw({...workspaceDocument,kind:'Draw',drawData:model},{password:portablePassword})],'application/octet-stream',`${safeFileName(workspaceDocument.title)}.vdraw`),setNotice);});
  const importSvgFile=(file?:File)=>guarded(async()=>{if(!file)return;if(file.size>32*1024*1024)throw new Error(drawCanvasErrorText('svgTooLarge',locale));const source=await file.text();
    // **Zwei Leser, eine Härtung:** zuerst der Astraea-eigene Weg (Metadaten); lehnt er **benannt** ab, wird
    // dasselbe SVG als **sichere vektorielle Form** gelesen (Paket 15). Was dabei ausgelassen wurde, steht
    // in der Meldung — *kein stiller Verlust, kein zweiter Parser.*
    try{persist(importDrawSvg(source));setNotice(drawCanvasErrorText('svgImportSucceeded',locale));setNoticeItems([]);return;}
    catch(error){if(!(error&&typeof error==='object'&&'code'in error&&error.code==='svg-semantic-metadata-missing'))throw error;}
    const vector=importForeignDrawSvg(source,model,page.id,activeLayerId);
    persist(vector.model);
    setNotice(drawCanvasErrorText('svgVectorImported',locale).replace('{count}',String(vector.imported.join(', '))));
    setNoticeItems(vector.omitted);
  });
  const importVisioFile=(file?:File)=>guarded(async()=>{if(!file)return;if(file.size>24*1024*1024)throw new Error(drawCanvasErrorText('visioTooLarge',locale));const imported=importDrawVisio(await file.text(),model,page.id);persist(imported.model);setNotice(ti('visioReport').replace('{count}',String(imported.conversion.shapesConvertedCount)).replace('{omitted}',String(imported.conversion.omittedFeatures.length)));setNoticeItems([...imported.conversion.omittedFeatures]);});
  const importNativeFile=(file?:File)=>guarded(async()=>{if(!file)return;if(portablePassword.length<1)throw new Error(drawCanvasErrorText('enterPassword',locale));if(file.size>128*1024*1024)throw new Error(drawCanvasErrorText('vdrawTooLarge',locale));const imported=await unpackNativeDraw(new Uint8Array(await file.arrayBuffer()),{password:portablePassword});if(!imported.drawData)throw new Error(drawCanvasErrorText('payloadMissing',locale));persist({...imported.drawData,revision:Math.max(model.revision+1,imported.drawData.revision+1)});});
  const runAutoLayout=()=>attempt(()=>{const result=layoutDrawPage(model,{pageId:page.id,layout:layoutMode});if(result.movedIds.length===0)return;persist(result.model);});

  const insertStencilAtPageCentre=(stencilId:string)=>command({kind:'insert-stencil',stencilId,point:{x:page.width/2,y:page.height/2},layerId:activeLayerId});
  const dropStencil=(stencilId:string,point:DrawPoint)=>attempt(()=>applyStep(drawSessionCommand(sessionRef.current,{kind:'insert-stencil',stencilId,point,layerId:activeLayerId})));
  const runSurfaceCommand=(value:DrawSessionCommand)=>attempt(()=>applyStep(drawSessionCommand(sessionRef.current,value)));

  /* ---------------------------------------------------------------- Paket 14 — Datengrafik ----- */
  /** Die Quelldokumente kommen **vom Shell** (Array) — ohne sie waren `bindWorkspaceDataGraphic` und
   *  `evaluateDataGraphics` unerreichbar (der Prop-Kommentar nennt genau diesen Grund). */
  const workspaceDocumentList=workspaceDocuments??[];
  const [dataSourceDocumentId,setDataSourceDocumentId]=useState('');
  const snapshotForSelected=()=>{
    const subject=session.selectedIds.length===1?session.selectedIds[0]:null;
    if(!subject)return null;
    const binding=drawDataBindingFor(model,subject);
    const sourceDocumentId=dataSourceDocumentId||workspaceDocumentList.find(candidate=>candidate.id!==workspaceDocument.id)?.id||'';
    const sourceDocument=workspaceDocumentList.find(candidate=>candidate.id===(binding?.sourceDocumentId??sourceDocumentId));
    if(!sourceDocument)return null;
    const sourceObjectId=binding?.sourceUri?.split('/object/')[1]??Object.keys(sourceDocument.objects)[0];
    if(!sourceObjectId)return null;
    try{return drawDataFieldsFrom(sourceDocument,sourceObjectId);}catch{return null;}
  };
  const bindDataGraphics=(input:{sourceDocumentId:string;sourceObjectId:string;field:string})=>attempt(()=>{
    const sourceDocument=workspaceDocumentList.find(candidate=>candidate.id===input.sourceDocumentId);
    if(!sourceDocument)throw new Error(drawCanvasEngineError({code:'data-source-document-missing'},locale));
    const subject=session.selectedIds.length===1?session.selectedIds[0]:null;
    if(!subject)throw new Error(drawCanvasEngineError({code:'data-binding-object-missing'},locale));
    setDataSourceDocumentId(input.sourceDocumentId);
    const result=bindDrawDataGraphic(model,{
      objectId:subject,sourceDocument,sourceObjectId:input.sourceObjectId,
      rules:[{id:'rule-1',sourceField:input.field,operator:'eq',compareValue:'red',target:'fill',value:'#ef4444',allowGeometryMutation:false}],
    });
    persist(result.model);
    setNotice(`${ti('dataGraphics')}: ${input.field}`);
  });
  const setDataGraphicsMode=(mode:'live'|'frozen')=>attempt(()=>{
    const subject=session.selectedIds.length===1?session.selectedIds[0]:null;
    const binding=subject?drawDataBindingFor(model,subject):null;
    if(!binding)throw new Error(drawCanvasEngineError({code:'data-binding-missing'},locale));
    const read=snapshotForSelected();
    if(!read)throw new Error(drawCanvasEngineError({code:'data-binding-snapshot-missing'},locale));
    const next=setDrawDataBindingMode(model,binding.id,mode,read.snapshot,Date.now());
    persist(next.model);
    setNotice(`${ti('dataGraphics')}: ${mode}`);
  });
  const applyDataGraphics=()=>attempt(()=>{
    const read=snapshotForSelected();
    if(!read)throw new Error(drawCanvasEngineError({code:'data-binding-snapshot-missing'},locale));
    const binding=session.selectedIds.length===1?drawDataBindingFor(model,session.selectedIds[0]!):null;
    const snapshots=new Map<string,ReturnType<typeof drawDataFieldsFrom>['snapshot']>();
    if(binding?.sourceDocumentId)snapshots.set(binding.sourceDocumentId,read.snapshot);
    const result=applyDrawDataGraphics(model,snapshots);
    persist(result.model);
    setNotice(result.skipped.length===0
      ?`${ti('dataApply')}: ${result.applied.length}`
      :`${ti('dataApply')}: ${result.applied.length} · ${result.skipped.map(entry=>entry.code).join(', ')}`);
  });
  const breakDataGraphics=()=>attempt(()=>{const subject=session.selectedIds.length===1?session.selectedIds[0]:null;const binding=subject?drawDataBindingFor(model,subject):null;if(!binding)throw new Error(drawCanvasEngineError({code:'data-binding-missing'},locale));persist(breakDrawDataBinding(model,binding.id));});
  const removeDataGraphics=()=>attempt(()=>{const subject=session.selectedIds.length===1?session.selectedIds[0]:null;const binding=subject?drawDataBindingFor(model,subject):null;if(!binding)throw new Error(drawCanvasEngineError({code:'data-binding-missing'},locale));persist(unbindDrawDataGraphic(model,binding.id));});
  const relinkDataGraphics=()=>attempt(()=>{const subject=session.selectedIds.length===1?session.selectedIds[0]:null;const binding=subject?drawDataBindingFor(model,subject):null;if(!binding)throw new Error(drawCanvasEngineError({code:'data-binding-missing'},locale));const sourceDocument=workspaceDocumentList.find(candidate=>candidate.id===(binding.sourceDocumentId??dataSourceDocumentId));if(!sourceDocument)throw new Error(drawCanvasEngineError({code:'data-source-document-missing'},locale));const sourceObjectId=binding.sourceUri?.split('/object/')[1]??Object.keys(sourceDocument.objects)[0];if(!sourceObjectId)throw new Error(drawCanvasEngineError({code:'data-source-object-missing'},locale));persist(relinkDrawDataBinding(model,binding.id,{sourceDocument,sourceObjectId}));});

  /* ---------------------------------------------------------------- Paket 19 — Senden --------- */
  const [sendElement,setSendElement]=useState<DrawSendElement>(()=>({kind:'page',id:page.id}));
  const [sendTargetId,setSendTargetId]=useState('');
  /** Die **eine** Karte aller Dokumente, die die geteilte Fabric-Kette braucht (`Record`, nicht Array). */
  const documentMap=useMemo(()=>{
    const map:Record<string,WorkspaceDocument>={};
    for(const candidate of workspaceDocumentList)map[candidate.id]=candidate;
    map[workspaceDocument.id]=workspaceDocument;
    return map;
  },[workspaceDocumentList,workspaceDocument]);
  const sendReferences=Object.values(workspaceDocument.objects).filter(object=>object.type==='WorkspaceReference');
  const activeSendTarget=sendTargetId||workspaceDocumentList.find(candidate=>candidate.id!==workspaceDocument.id)?.id||'';
  const sendStatus=(()=>{
    const target=documentMap[activeSendTarget];
    if(!target)return null;
    for(const [referenceId,object] of Object.entries(target.objects)){
      // **Nur Verweise** dürfen beschrieben werden: `renderFabricReference` wirft für jedes andere Objekt
      // (`fabricState.ts:36`, `referenceObject`) — *gefunden vom Panel-Rendervertrag, nicht beim Lesen.*
      if(object.type!=='WorkspaceReference')continue;
      const state=readDrawSendState(documentMap,activeSendTarget,referenceId);
      if(state)return state.status;
    }
    return null;
  })();
  const sendElementTo=(mode:'Live'|'Frozen',targetDocumentId:string)=>attempt(()=>{
    if(!targetDocumentId)throw new Error(drawCanvasEngineError({code:'send-target-missing'},locale));
    const result=sendDrawElement({source:workspaceDocument,targetDocumentId,element:sendElement,mode,documents:documentMap,now:Date.now()});
    // **Ein Speicherweg für beide Dokumente.** Der Anker lebt im **Umschlag** (`document.objects`), nicht in
    // `drawData` — deshalb geht dieser Weg über `onUpdateDocument` (id-gekeyt), **nicht** über `persist`
    // (das einen Draw-Modellstand einschlägt). *Kein zweiter Speicher, kein zweites Dokumentabbild.*
    for(const nextDocument of Object.values(result.documents))onUpdateDocument(nextDocument);
    setSendTargetId(targetDocumentId);
    setNotice(`${ti('sendTitle')}: ${mode} · ${result.render.status}`);
  });
  const carrierFor=(element:DrawSendElement):string|null=>{
    try{return drawSendCarrierPayload({source:workspaceDocument,element});}catch{return null;}
  };

  const onKeyDown=(event:React.KeyboardEvent)=>{
    if(isImeCompositionEvent({isComposing:event.nativeEvent.isComposing,keyCode:event.keyCode,key:event.key}))return;
    const mod=event.ctrlKey||event.metaKey;
    if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();persistHistory(event.shiftKey?redoDrawHistory(history):undoDrawHistory(history));return;}
    if(mod&&event.key.toLowerCase()==='y'){event.preventDefault();persistHistory(redoDrawHistory(history));return;}
    // While a text field has focus only Escape leaves the editor; every other key belongs to the field.
    if(isTextEntryTarget(event.target)){
      if(event.key!=='Escape')return;
      attempt(()=>applyStep(drawSessionEndText(sessionRef.current)));
      event.preventDefault();
      return;
    }
    attempt(()=>{const step=drawSessionKeyDown(sessionRef.current,{key:event.key,shiftKey:event.shiftKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,altKey:event.altKey});if(!step)return;event.preventDefault();applyStep(step);});
  };

  const announcement=(code:string|null):string=>{
    if(!code)return '';
    const map:Record<string,Parameters<typeof drawInteractionText>[0]>={moving:'canvasMoved',resizing:'canvasResized',rotating:'canvasRotated',snapped:'canvasMoved','marquee-committed':'canvasMarquee','selection-cleared':'selectionNone','text-committed':'canvasTextCommitted',deleted:'deleteSelection',grouped:'groupSelection',ungrouped:'ungroupSelection',locked:'lockSelection',unlocked:'unlockSelection',connected:'connectSelection',disconnected:'disconnectSelection',inserted:'insertShape',styled:'styleInspector',typography:'fontSize',shadow:'shadow',selected:'stateSelected'};
    const key=map[code];
    return key?ti(key):code;
  };
  const surfaceAnnouncement=announcement(session.announcement);

  const handlers=({ 
    onPointerDown:(point:DrawPoint,modifiers:DrawInteractionModifiers,button:'primary'|'secondary')=>attempt(()=>applyStep(drawSessionPointerDown(sessionRef.current,{point,modifiers,button}))),
    onPointerMove:(point:DrawPoint,modifiers:DrawInteractionModifiers)=>attempt(()=>applyStep(drawSessionPointerMove(sessionRef.current,{point,modifiers}))),
    onPointerUp:(point:DrawPoint,modifiers:DrawInteractionModifiers)=>attempt(()=>applyStep(drawSessionPointerUp(sessionRef.current,{point,modifiers}))),
    onPointerCancel:()=>attempt(()=>applyStep(drawSessionPointerCancel(sessionRef.current))),
    onDoubleClick:(point:DrawPoint)=>attempt(()=>applyStep(drawSessionDoubleClick(sessionRef.current,point))),
    onTextChange:(text:string)=>attempt(()=>applyStep(drawSessionSetText(sessionRef.current,text))),
    onTextCommit:()=>attempt(()=>applyStep(drawSessionEndText(sessionRef.current))),
    onDropStencil:dropStencil,
  });

  const drawA11ySummary = t('a11ySummary').replace('{page}', page.name).replace('{objects}', String(page.objectIds.length)).replace('{pages}', String(model.pages.length)).replace('{layers}', String(model.layers.length)).replace('{zoom}', String(Math.round(model.viewport.zoom * 100)));

  return <section data-vgt-draw-root="true" className="flex h-full min-h-0 flex-1 flex-col bg-slate-950 text-slate-100" aria-label={t('workspace')} onKeyDown={onKeyDown} tabIndex={-1}>
    <p id="draw-canvas-summary" className="sr-only">{drawA11ySummary}</p>
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-slate-900/80 p-2" role="toolbar" aria-label={t('tools')}>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2" onClick={addRectangle} data-vgt-app-guide-anchor="Draw:first" aria-label={t('addRectangle')}>{t('rectangle')}</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2" onClick={addPage}>{t('addPage')}</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2" onClick={addLayer}>{t('addLayer')}</button>
      <select className="rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs" value={templateId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setTemplateId(e.target.value)} aria-label={t('template')} aria-describedby="draw-template-hint" data-vgt-template-select="true">
        <option value="">{ti('templateNoneSelected')}</option>
        {BUILTIN_DRAW_TEMPLATES.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="apply-template" onClick={applyTemplate} disabled={templateId===''}>{t('applyTemplate')}</button>
      <span id="draw-template-hint" data-vgt-template-hint="true" className="max-w-64 text-[0.625rem] leading-snug text-slate-400">{ti('templateHint')}</span>
      <select className="rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs" value={layoutMode} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setLayoutMode(e.target.value==='hierarchy'?'hierarchy':'table')} aria-label={ti('layoutMode')}>
        <option value="hierarchy">{ti('layoutHierarchy')}</option>
        <option value="table">{ti('layoutTable')}</option>
      </select>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="auto-layout" onClick={runAutoLayout}>{ti('autoLayout')}</button>
      <select className="rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs" value={page.id} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>selectPage(e.target.value)} aria-label={t('activePage')}>{model.pages.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select className="rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs" value={activeLayerId} onChange={(e:React.ChangeEvent<HTMLSelectElement>)=>setActiveLayerId(e.target.value)} data-vgt-app-guide-anchor="Draw:second" aria-label={t('activeLayer')}>{model.layers.filter(l=>page.layerIds.includes(l.id)).map(l=><option key={l.id} value={l.id}>{l.name}{l.locked?` (${t('locked')})`:''}</option>)}</select>
      <button className="rounded border border-white/15 px-2 py-1.5 text-xs" onClick={()=>persistHistory(undoDrawHistory(history))} disabled={!history.past.length} aria-label={t('undo')}>{t('undo')}</button>
      <button className="rounded border border-white/15 px-2 py-1.5 text-xs" onClick={()=>persistHistory(redoDrawHistory(history))} disabled={!history.future.length} aria-label={t('redo')}>{t('redo')}</button>
      <button className="rounded border border-white/15 px-2 py-1.5 text-xs" onClick={()=>setZoom(model.viewport.zoom-.1)} aria-label={t('zoomOut')}>−</button><span className="min-w-12 text-center text-xs" aria-live="polite">{Math.round(model.viewport.zoom*100)}%</span><button className="rounded border border-white/15 px-2 py-1.5 text-xs" onClick={()=>setZoom(model.viewport.zoom+.1)} aria-label={t('zoomIn')}>+</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="export-svg" onClick={exportSvg}>SVG</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="export-png" onClick={exportPng} disabled={!rasterizerAvailable} aria-describedby="draw-raster-hint">{ti('exportPng')}</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="export-pdf" onClick={exportPdf} disabled={!rasterizerAvailable} aria-describedby="draw-raster-hint">PDF</button>
      <span id="draw-raster-hint" data-vgt-raster-hint={rasterizerAvailable?'available':'unavailable'} className="max-w-56 text-[0.625rem] leading-snug text-slate-400">{rasterizerAvailable?'':drawCanvasErrorText('rasterUnavailable',locale)}</span>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" data-vgt-command="export-visio" onClick={exportVisio}>{ti('exportVisio')}</button>
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" onClick={()=>svgImportRef.current?.click()}>{t('importSvg')}</button><input ref={svgImportRef} type="file" accept="image/svg+xml,.svg" className="sr-only" onChange={(e:React.ChangeEvent<HTMLInputElement>)=>{void importSvgFile(e.target.files?.[0]);e.currentTarget.value='';}} />
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" onClick={()=>visioImportRef.current?.click()}>{ti('importVisio')}</button><input ref={visioImportRef} type="file" accept=".xml,.vdx,application/xml" className="sr-only" onChange={(e:React.ChangeEvent<HTMLInputElement>)=>{void importVisioFile(e.target.files?.[0]);e.currentTarget.value='';}} />
      <input className="w-48 rounded border border-white/15 bg-slate-950 px-2 py-1.5 text-xs" type="password" value={portablePassword} onChange={(e:React.ChangeEvent<HTMLInputElement>)=>setPortablePassword(e.target.value)} placeholder={t('passwordPlaceholder')} aria-label={t('portablePassword')} autoComplete="new-password" />
      <button className="rounded border border-white/15 px-3 py-1.5 text-xs" onClick={exportNative}>{t('encryptedVdraw')}</button><button className="rounded border border-white/15 px-3 py-1.5 text-xs" onClick={()=>nativeImportRef.current?.click()}>{t('openVdraw')}</button><input ref={nativeImportRef} type="file" accept=".vdraw,application/octet-stream" className="sr-only" onChange={(e:React.ChangeEvent<HTMLInputElement>)=>{void importNativeFile(e.target.files?.[0]);e.currentTarget.value='';}} />
    </div>
    {error&&<div className="border-b border-red-500/40 bg-red-950/40 px-4 py-2 text-xs text-red-100" role="alert">{error}</div>}
    {notice&&<div data-vgt-notice="true" className="border-b border-sky-500/40 bg-sky-950/40 px-4 py-2 text-xs text-sky-100" role="status">
      <p>{notice}</p>
      {noticeItems.length>0&&<ul data-vgt-notice-items={noticeItems.length} aria-label={ti('visioOmittedTitle')} className="mt-1 list-disc pl-5">
        {noticeItems.map(item=><li key={item} data-vgt-notice-item={item}>{item}</li>)}
      </ul>}
    </div>}
    <div className="flex min-h-0 flex-1">
      <DrawShapeLibraryPanel model={model} locale={locale} onInsert={insertStencilAtPageCentre} />
      {/*
        **Paket 14 — die Ablage-Verweisfläche.** Sie ist **echtes DOM** und liegt **außerhalb** der SVG-Zeichenfläche
        (Geschwister, nicht Kind): der UI/UX-Standard verbietet wesentliche Funktion, die **nur** in einer Leinwand
        lebt (§8.6, §21.3, §32). Der Bereich ist **immer** fokussierbar (`tabIndex={0}`) und beschreibt sich über die
        dauerhaft vorhandene Ansageregion der Zone (`aria-describedby`) — *eine Ablage, die man nur mit dem Zeiger
        erreicht, wäre auf einer Leinwand unerreichbar*. Die Zeiger-, Ablage- und Tastenereignisse kommen aus
        `useDrawDropZone`; hier steht **keine** Regel über Fachlichkeit.

        Der Zeiger-Handler **beobachtet nur** die Zeigerart für die angezeigte Touch-Strategie: er beginnt **keine**
        Geste, ruft **kein** `preventDefault` und **kein** `setPointerCapture` — *ein Zeigerereignis ist keine
        Touch-Strategie, und der Zug gehört der Quelle (Paket 5), nicht dem Empfänger.*
      */}
      <section
        role="group"
        aria-label={DRAW_DROP_ZONE_TITLE}
        aria-describedby={drawDropZone.announcerId}
        tabIndex={0}
        data-vgt-draw-drop-zone-region="true"
        className="relative flex min-h-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        onDragEnter={drawDropZone.onDragEnter}
        onDragOver={drawDropZone.onDragOver}
        onDragLeave={drawDropZone.onDragLeave}
        onDrop={drawDropZone.onDrop}
        onKeyDown={drawDropZone.onKeyDown}
        onPointerDown={(event:React.PointerEvent<HTMLElement>)=>drawDropZone.notePointerType(event.pointerType)}
      >
        <div
          data-vgt-canvas-scroll="true"
          className="flex min-h-0 flex-1 overflow-auto p-6"
          style={{backgroundImage:model.viewport.showGrid?'radial-gradient(circle, rgba(148,163,184,.25) 1px, transparent 1px)':'none',backgroundSize:`${Math.max(4,model.viewport.gridSize*model.viewport.zoom)}px ${Math.max(4,model.viewport.gridSize*model.viewport.zoom)}px`}}
        >
          <DrawInteractiveSurface
            model={model}
            page={page}
            session={session}
            locale={locale}
            handlers={handlers}
            canvasRef={canvasRef}
          />
        </div>
        <DrawDropZoneOverlay
          state={drawDropZone.state}
          inputKind={drawDropZone.inputKind}
          onConfirm={drawDropZone.confirm}
          onChooseIntent={drawDropZone.chooseIntent}
          onDismiss={drawDropZone.dismiss}
          onKeyDown={drawDropZone.onKeyDown}
        />
      </section>
      <DrawLayerPanel
        model={model}
        page={page}
        locale={locale}
        activeLayerId={activeLayerId}
        selectedIds={session.selectedIds}
        onSetActiveLayer={setActiveLayerId}
        onToggleLayerVisibility={(layerId,value)=>runSurfaceCommand({kind:'layer-visibility',layerId,value})}
        onToggleLayerLock={(layerId,value)=>runSurfaceCommand({kind:'layer-lock',layerId,value})}
        onToggleLayerPrintable={(layerId,value)=>runSurfaceCommand({kind:'layer-printable',layerId,value})}
        onStepLayer={(layerId,direction)=>runSurfaceCommand({kind:'layer-order',pageId:page.id,layerId,direction})}
        onRenameLayer={(layerId,name)=>runSurfaceCommand({kind:'rename-layer',layerId,name})}
        onAddLayer={addLayer}
        onSelectObject={(objectId)=>runSurfaceCommand({kind:'select-root',id:objectId})}
        onToggleObjectLock={(locked)=>runSurfaceCommand({kind:'set-locked',locked})}
        onZOrder={(action)=>runSurfaceCommand({kind:'z-order',action})}
        onGroup={()=>runSurfaceCommand({kind:'group'})}
        onUngroup={()=>runSurfaceCommand({kind:'ungroup'})}
        onAddToGroup={(groupId)=>runSurfaceCommand({kind:'add-to-container',containerId:groupId})}
        onMoveToLayer={(layerId)=>runSurfaceCommand({kind:'move-to-layer',layerId})}
        onConnect={()=>runSurfaceCommand({kind:'connect'})}
        onDisconnect={()=>runSurfaceCommand({kind:'disconnect'})}
        onToggleViewport={(patch)=>runSurfaceCommand({kind:'viewport',patch})}
        onAddGuide={(axis)=>runSurfaceCommand({kind:'guide-add',axis,position:axis==='x'?page.width/2:page.height/2})}
        onRemoveGuide={(guideId)=>runSurfaceCommand({kind:'guide-remove',guideId})}
      />
      <DrawConnectorPanel model={model} locale={locale} selectedIds={session.selectedIds} onCommand={command} />
      <DrawDataGraphicsPanel
        model={model}
        locale={locale}
        selectedIds={session.selectedIds}
        workspaceDocuments={workspaceDocumentList}
        onBind={bindDataGraphics}
        onSetMode={setDataGraphicsMode}
        onApply={applyDataGraphics}
        onBreak={breakDataGraphics}
        onRelink={relinkDataGraphics}
        onRemove={removeDataGraphics}
      />
      <DrawSendPanel
        model={model}
        locale={locale}
        workspaceDocuments={workspaceDocumentList}
        element={sendElement}
        onChooseElement={(next)=>setSendElement(next)}
        onSend={sendElementTo}
        carrierPayload={carrierFor}
        sourceDocumentId={workspaceDocument.id}
        status={sendStatus}
        referenceCount={sendReferences.length}
      />
      <DrawStyleInspectorPanel model={model} locale={locale} selectedIds={session.selectedIds} onCommand={command} />
    </div>
    <p
      data-vgt-canvas-announcement="true"
      className="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >{surfaceAnnouncement}</p>
    <div className="flex items-center justify-between border-t border-white/10 px-3 py-1 text-[0.6875rem] text-slate-400" aria-live="polite"><span>{drawCanvasCount('pageCount', model.pages.length, locale)} · {drawCanvasCount('objectCount', page.objectIds.length, locale)} · {drawCanvasCount('layerCount', model.layers.length, locale)}</span><span>{t('localFirst')} · Ctrl/Cmd+Z {t('undoShortcut')} · Ctrl/Cmd+Y {t('redoShortcut')} · {ti('connectorWaypointHint')}</span></div>
  </section>;
};
export default DrawCanvas;
