// STATUS: DIAMANT VGT SUPREME — Astraea Publish canonical document, page, frame and layout engine
import type {
  PublishDocumentModel, PublishPageGeometry, PublishPage, PublishMasterPage, 
  PublishFrame, PublishPageNumberFormat, PublishResponsiveRule, PublishRectMm, PublishPointMm,
  PublishStyle, PublishTypography, PublishTextFrameOptions,
} from '../../../shared/contracts/publish/workspacePublish';

export const PUBLISH_LIMITS = {
  maxPages: 4096,
  maxFrames: 250_000,
  maxMasters: 256,
  maxSections: 2048,
  maxGuidesPerPage: 4096,
  maxFrameTextChars: 8_000_000,
  maxStyles: 8192,
  maxThreadLength: 65_536,
  maxRulesPerFrame: 512,
  minPageMm: 10,
  maxPageMm: 5000,
  maxBleedMm: 100,
  maxSlugMm: 200,
} as const;

export class PublishModelError extends Error {
  readonly code:string;
  constructor(code:string){ super(code); this.name='PublishModelError'; this.code=code; }
}

const finite=(n:number)=>Number.isFinite(n);
const bounded=(n:number,min:number,max:number)=>finite(n)&&n>=min&&n<=max;
const deepClone=<T>(value:T):T=>structuredClone(value);
/**
 * Derselbe Klon, aber oeffentlich.
 *
 * Es gab bereits `structuredClone` an elf Stellen in diesem Verzeichnis und einen lokalen Alias hier.
 * Die Dokumenterzeugung braucht denselben Klon; eine zweite Definition waere genau die Doppelung, die
 * dieses Projekt wiederholt Runden gekostet hat („eine Definition pro Fakt").
 */
export const deepClonePublish=<T>(value:T):T=>deepClone(value);

export function publishStableId(prefix:string, seed:string):string{
  let h=0x811c9dc5;
  for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}
  return `${prefix}-${h.toString(16).padStart(8,'0')}`;
}

export function createDefaultPublishGeometry():PublishPageGeometry{
  return {widthMm:210,heightMm:297,orientation:'portrait',marginsMm:{top:20,right:15,bottom:20,left:15},bleedMm:3,slugMm:5,columns:2,columnGutterMm:6,baselineGridMm:4.233,documentGridMm:5,safeAreaMm:3};
}

export function createDefaultPublishTypography():PublishTypography{
  return {fontFamily:'system-ui, sans-serif',fontSizePt:10,language:'en',leadingPt:14,tracking:0,kerning:'metrics',baselineShiftPt:0,horizontalScalePercent:100,verticalScalePercent:100,composer:'paragraph',hyphenation:true,justification:{minWord:80,desiredWord:100,maxWord:133,minLetter:-2,desiredLetter:0,maxLetter:3},opticalMarginAlignment:false,keep:{keepWithNext:0,keepLinesTogether:false,keepFirstLines:2,keepLastLines:2,widowLines:2,orphanLines:2},openType:{ligatures:true,discretionaryLigatures:false,smallCaps:false,oldStyleFigures:false,tabularFigures:false,fractions:false,ordinals:false}};
}

export function createDefaultTextOptions():PublishTextFrameOptions{
  return {overset:false,autoSize:'none',insetsMm:{top:2,right:2,bottom:2,left:2},columns:1,columnGutterMm:4,verticalJustification:'top',alignToBaselineGrid:false,textWrap:{mode:'none',offsetMm:0,contourThreshold:0.5}};
}

function createPage(id:string,index:number,geometry:PublishPageGeometry,masterPageId?:string):PublishPage{
  return {id,name:`Page ${index+1}`,geometry:deepClone(geometry),rotationDeg:0,masterPageId,masterOverrides:{},frameIds:[],guides:[]};
}

function defaultStyles():PublishStyle[]{return[
  {id:'style-p-body',name:'Body',kind:'paragraph',properties:{fontFamily:'system-ui, sans-serif',fontSizePt:10,leadingPt:14,language:'en'}},
  {id:'style-p-heading1',name:'Heading 1',kind:'paragraph',properties:{fontFamily:'Georgia, serif',fontSizePt:28,leadingPt:32,keepWithNext:2}},
  {id:'style-c-emphasis',name:'Emphasis',kind:'character',properties:{italic:true}},
  {id:'style-o-default',name:'Default Object',kind:'object',properties:{opacity:1,strokeWidthPt:0}},
  {id:'style-t-default',name:'Default Table',kind:'table',properties:{headerRows:1}},
  {id:'style-cell-default',name:'Default Cell',kind:'cell',properties:{paddingMm:2}},
];}

export function createEmptyPublishDocument():PublishDocumentModel{
  const geometry=createDefaultPublishGeometry();
  const master:PublishMasterPage={id:'master-a',name:'A-Master',headerText:'Astraea Publication',footerText:'',showPageNumbers:true,frameIds:[]};
  const pages=[createPage('page-1',0,geometry,master.id),createPage('page-2',1,geometry,master.id)];
  const frames:PublishFrame[]=[
    createPublishFrame('text','page-1',0,{id:'frame-header-1',name:'Title',xMm:15,yMm:22,widthMm:180,heightMm:28,content:'Astraea Architecture Review',fontSizePt:28,fontFamily:'Georgia, serif',paragraphStyleId:'style-p-heading1',semanticRole:'H1'}),
    createPublishFrame('text','page-1',0,{id:'frame-body-col1',name:'Body column 1',xMm:15,yMm:55,widthMm:87,heightMm:210,content:'Local-first publishing mandates that page geometry, typography, and prepress preflight are verifiable at design time. In a sovereign environment, digital publication files are rendered deterministically without reliance on remote font servers or cloud conversion daemons.',semanticRole:'P'}),
    createPublishFrame('text','page-1',0,{id:'frame-body-col2',name:'Body column 2',xMm:108,yMm:55,widthMm:87,heightMm:210,content:'Astraea Publish keeps assets, typography, color management and export policy inside the encrypted workspace boundary. Linked data remains canonical and explicit rather than duplicated into hidden shadow documents.',semanticRole:'P'}),
  ];
  pages[0].frameIds=frames.map(f=>f.id);
  return {
    schemaVersion:1,revision:1,geometry:deepClone(geometry),pagesCount:pages.length,activePageIndex:0,pages,facingPages:true,startOnRight:true,masterPages:[master],
    sections:[{id:'section-main',name:'Main',startPageId:'page-1',startNumber:1,prefix:'',numberFormat:'arabic',includePrefix:false}],frames,selectedFrameId:null,
    smartGuides:{enabled:true,snapToGuides:true,snapToGrid:true,snapToFrames:true,toleranceMm:1.5},cmykSimulated:false,overprintPreview:false,showGuides:true,showBleed:true,showDocumentGrid:false,
    styles:defaultStyles(),assets:[],brandKits:[],swatches:[
      {id:'swatch-black',name:'Black',space:'CMYK',components:[0,0,0,100],tintPercent:100},
      {id:'swatch-paper',name:'Paper',space:'CMYK',components:[0,0,0,0],tintPercent:100},
    ],iccProfiles:[],preflightProfiles:[],books:[],toc:[],indexEntries:[],captions:[],crossReferences:[],variables:[],comments:[],layoutSnapshots:[],storyAssignments:[],dataMerges:[],tables:[],charts:[],barcodes:[],workspaceReferences:[],exportPresets:[]
  };
}

/**
 * Rechteck -> Rahmenfelder. **Eine** Definition der Namensabbildung.
 *
 * Gemessen (eigener Fehler, Runde Publish-11): `clampRectToPage` gibt `{x,y,width,height}` zurueck, ein
 * Rahmen traegt aber `xMm/yMm/widthMm/heightMm`. Ein `...rect` beim Erzeugen war deshalb **wirkungslos**:
 * der Rahmen bekam die Vorgabemasse (25/35/80/50) statt der berechneten Position, und nur der Beobachter
 * eines Protokolls hat das gezeigt — kein Test und kein `tsc`, weil `rect` als Teilobjekt typkompatibel
 * aussah (`Partial<PublishFrame>` erlaubt unbekannte Schluessel nicht, aber die Spread-Form schon).
 */
export function rectToFrameRect(rect:PublishRectMm):Pick<PublishFrame,'xMm'|'yMm'|'widthMm'|'heightMm'>{
  if(![rect.x,rect.y,rect.width,rect.height].every(finite))throw new PublishModelError('rect-not-finite');
  return {xMm:rect.x,yMm:rect.y,widthMm:rect.width,heightMm:rect.height};
}

export function createPublishFrame(type:PublishFrame['type'],pageId:string,pageIndex:number,overrides:Partial<PublishFrame>={}):PublishFrame{
  const seed=`${pageId}:${pageIndex}:${type}:${overrides.name??''}:${overrides.xMm??25}:${overrides.yMm??35}`;
  const id=overrides.id??publishStableId('frame',seed);
  const base:PublishFrame={id,pageIndex,pageId,type,name:overrides.name??`${type} frame`,xMm:25,yMm:35,widthMm:type==='text'?80:70,heightMm:type==='text'?50:60,rotationDeg:0,content:'',fontSizePt:10,fontFamily:'system-ui, sans-serif',lineHeight:1.4,fillColor:'transparent',strokeColor:'#64748b',strokeWidthPt:0,columns:1,opacity:1,locked:false,hidden:false,fitMode:'fit',focalPoint:{x:.5,y:.5},blendMode:'normal',semanticRole:type==='text'?'P':type==='image'?'Figure':'Artifact'};
  if(type==='text'){base.text=createDefaultTextOptions();base.typography=createDefaultPublishTypography();base.paragraphStyleId='style-p-body';}
  return {...base,...overrides,id,pageId,pageIndex};
}

export function getActivePublishPage(model:PublishDocumentModel):PublishPage{
  const page=model.pages[model.activePageIndex]; if(!page)throw new PublishModelError('active-page-missing'); return page;
}
export function getPageById(model:PublishDocumentModel,pageId:string):PublishPage{const page=model.pages.find(p=>p.id===pageId);if(!page)throw new PublishModelError('page-missing');return page;}

export function syncPublishCompatibility(model:PublishDocumentModel):PublishDocumentModel{
  if(!model.pages.length)throw new PublishModelError('pages-empty');
  const active=Math.max(0,Math.min(model.pages.length-1,model.activePageIndex|0));
  const pages=model.pages.map((p)=>({...p,frameIds:[...p.frameIds]}));
  const pageIndexById=new Map(pages.map((p,i)=>[p.id,i] as const));
  const frames=model.frames.map(f=>{const index=pageIndexById.get(f.pageId);if(index===undefined)throw new PublishModelError('frame-page-missing');return {...f,pageIndex:index};});
  return {...model,activePageIndex:active,pagesCount:pages.length,geometry:deepClone(pages[active].geometry),pages,frames};
}

export function normalizePublishModel(input:PublishDocumentModel|Partial<PublishDocumentModel>|undefined):PublishDocumentModel{
  const base=createEmptyPublishDocument(); if(!input)return base;
  const merged={...base,...deepClone(input)} as PublishDocumentModel;
  if(!Array.isArray(merged.pages)||!merged.pages.length){
    const count=Math.max(1,Math.min(PUBLISH_LIMITS.maxPages,Number(merged.pagesCount)||1));
    merged.pages=Array.from({length:count},(_,i)=>createPage(`page-${i+1}`,i,merged.geometry,merged.masterPages?.[0]?.id));
    for(const f of merged.frames??[]){const idx=Math.max(0,Math.min(count-1,f.pageIndex||0));f.pageId=merged.pages[idx].id;merged.pages[idx].frameIds.push(f.id);}
  }
  merged.smartGuides={...base.smartGuides,...(merged.smartGuides??{})};
  for(const key of ['styles','assets','brandKits','swatches','iccProfiles','preflightProfiles','books','toc','indexEntries','captions','crossReferences','variables','comments','layoutSnapshots','storyAssignments','dataMerges','tables','charts','barcodes','workspaceReferences','exportPresets'] as const){ if(!Array.isArray(merged[key])) (merged as any)[key]=[]; }
  const normalized=syncPublishCompatibility(merged);
  assertPublishDocument(normalized); return normalized;
}

function validateGeometry(g:PublishPageGeometry):void{
  if(!bounded(g.widthMm,PUBLISH_LIMITS.minPageMm,PUBLISH_LIMITS.maxPageMm)||!bounded(g.heightMm,PUBLISH_LIMITS.minPageMm,PUBLISH_LIMITS.maxPageMm))throw new PublishModelError('page-geometry-boundary');
  if(!bounded(g.bleedMm,0,PUBLISH_LIMITS.maxBleedMm)||!bounded(g.slugMm,0,PUBLISH_LIMITS.maxSlugMm))throw new PublishModelError('page-prepress-boundary');
  if(!Number.isInteger(g.columns)||g.columns<1||g.columns>64||!bounded(g.columnGutterMm,0,100))throw new PublishModelError('page-columns-boundary');
  if(!bounded(g.baselineGridMm,0.1,100)||!bounded(g.documentGridMm,0.1,500)||!bounded(g.safeAreaMm,0,100))throw new PublishModelError('page-grid-boundary');
  const m=g.marginsMm;if(Object.values(m).some(v=>!bounded(v,0,1000)))throw new PublishModelError('page-margin-boundary');
  if(m.left+m.right>=g.widthMm||m.top+m.bottom>=g.heightMm)throw new PublishModelError('page-live-area-empty');
}

export function assertPublishDocument(model:PublishDocumentModel):void{
  if(!model||model.schemaVersion!==1)throw new PublishModelError('schema-version-invalid');
  if(!Number.isInteger(model.revision)||model.revision<0)throw new PublishModelError('revision-invalid');
  if(!Array.isArray(model.pages)||model.pages.length<1||model.pages.length>PUBLISH_LIMITS.maxPages)throw new PublishModelError('page-count-boundary');
  if(model.pagesCount!==model.pages.length)throw new PublishModelError('page-count-mirror-mismatch');
  if(model.activePageIndex<0||model.activePageIndex>=model.pages.length)throw new PublishModelError('active-page-boundary');
  if(model.frames.length>PUBLISH_LIMITS.maxFrames||model.masterPages.length>PUBLISH_LIMITS.maxMasters||model.sections.length>PUBLISH_LIMITS.maxSections||model.styles.length>PUBLISH_LIMITS.maxStyles)throw new PublishModelError('collection-boundary');
  const ids=new Set<string>();
  const masterIds=new Set(model.masterPages.map(m=>m.id));
  for(const m of model.masterPages){if(!m.id||ids.has(m.id))throw new PublishModelError('master-id-duplicate');ids.add(m.id);if(m.parentMasterId&&!masterIds.has(m.parentMasterId))throw new PublishModelError('master-parent-missing');}
  const pageIds=new Set<string>();
  for(const p of model.pages){if(!p.id||pageIds.has(p.id))throw new PublishModelError('page-id-duplicate');pageIds.add(p.id);validateGeometry(p.geometry);if(p.masterPageId&&!masterIds.has(p.masterPageId))throw new PublishModelError('page-master-missing');if(p.guides.length>PUBLISH_LIMITS.maxGuidesPerPage)throw new PublishModelError('guide-count-boundary');}
  const frameIds=new Set<string>();
  for(const f of model.frames){if(!f.id||frameIds.has(f.id))throw new PublishModelError('frame-id-duplicate');frameIds.add(f.id);if(!pageIds.has(f.pageId))throw new PublishModelError('frame-page-missing');if(f.pageIndex!==model.pages.findIndex(p=>p.id===f.pageId))throw new PublishModelError('frame-page-index-mismatch');if(!bounded(f.xMm,-PUBLISH_LIMITS.maxPageMm,PUBLISH_LIMITS.maxPageMm*2)||!bounded(f.yMm,-PUBLISH_LIMITS.maxPageMm,PUBLISH_LIMITS.maxPageMm*2)||!bounded(f.widthMm,.1,PUBLISH_LIMITS.maxPageMm*2)||!bounded(f.heightMm,.1,PUBLISH_LIMITS.maxPageMm*2)||!bounded(f.rotationDeg,-36000,36000)||!bounded(f.opacity??1,0,1))throw new PublishModelError('frame-geometry-boundary');if(f.content.length>PUBLISH_LIMITS.maxFrameTextChars)throw new PublishModelError('frame-text-boundary');if((f.responsiveRules?.length??0)>PUBLISH_LIMITS.maxRulesPerFrame)throw new PublishModelError('frame-rules-boundary');}
  for(const p of model.pages){const seen=new Set<string>();for(const id of p.frameIds){if(!frameIds.has(id)||seen.has(id))throw new PublishModelError('page-frame-reference-invalid');seen.add(id);const f=model.frames.find(x=>x.id===id)!;if(f.pageId!==p.id)throw new PublishModelError('page-frame-owner-mismatch');}}
  for(const f of model.frames){if(!model.pages.find(p=>p.id===f.pageId)!.frameIds.includes(f.id))throw new PublishModelError('frame-unowned');}
  const sectionIds=new Set<string>();for(const s of model.sections){if(!s.id||sectionIds.has(s.id)||!pageIds.has(s.startPageId)||!Number.isInteger(s.startNumber))throw new PublishModelError('section-invalid');sectionIds.add(s.id);}
  validateTextThreads(model);
}

function validateTextThreads(model:PublishDocumentModel):void{
  const byId=new Map(model.frames.map(f=>[f.id,f] as const));
  for(const start of model.frames.filter(f=>f.type==='text'&&!f.text?.previousFrameId)){
    const visited=new Set<string>(); let cur:PublishFrame|undefined=start; let count=0;
    while(cur){if(visited.has(cur.id))throw new PublishModelError('text-thread-cycle');visited.add(cur.id);if(++count>PUBLISH_LIMITS.maxThreadLength)throw new PublishModelError('text-thread-limit');const nextId=cur.text?.nextFrameId;if(!nextId)break;const next=byId.get(nextId);if(!next||next.type!=='text')throw new PublishModelError('text-thread-target-invalid');if(next.text?.previousFrameId!==cur.id)throw new PublishModelError('text-thread-backlink-invalid');cur=next;}
  }
}

export function addPublishPage(model:PublishDocumentModel,geometry:PublishPageGeometry=model.geometry,afterIndex=model.activePageIndex):PublishDocumentModel{
  assertPublishDocument(model);if(model.pages.length>=PUBLISH_LIMITS.maxPages)throw new PublishModelError('page-limit');const insertAt=Math.max(0,Math.min(model.pages.length,afterIndex+1));const id=publishStableId('page',`${model.revision}:${insertAt}:${model.pages.length}:${geometry.widthMm}x${geometry.heightMm}`);if(model.pages.some(p=>p.id===id))throw new PublishModelError('page-id-collision');const master=model.pages[Math.max(0,Math.min(model.pages.length-1,afterIndex))]?.masterPageId;const pages=[...model.pages];pages.splice(insertAt,0,createPage(id,insertAt,geometry,master));return syncPublishCompatibility({...model,pages,activePageIndex:insertAt,revision:model.revision+1});
}

export function updateActivePageGeometry(model:PublishDocumentModel,patch:Partial<PublishPageGeometry>):PublishDocumentModel{
  const pages=model.pages.map((p,i)=>i===model.activePageIndex?{...p,geometry:{...p.geometry,...patch,marginsMm:patch.marginsMm?{...p.geometry.marginsMm,...patch.marginsMm}:p.geometry.marginsMm}}:p);
  const next=syncPublishCompatibility({...model,pages,revision:model.revision+1});assertPublishDocument(next);return next;
}

export function setActivePublishPage(model:PublishDocumentModel,index:number):PublishDocumentModel{
  if(!Number.isInteger(index)||index<0||index>=model.pages.length)throw new PublishModelError('active-page-boundary');return syncPublishCompatibility({...model,activePageIndex:index});
}

export function addFrameToPublish(model:PublishDocumentModel,type:PublishFrame['type'],overrides:Partial<PublishFrame>={}):PublishDocumentModel{
  const page=getActivePublishPage(model);const frame=createPublishFrame(type,page.id,model.activePageIndex,{...overrides,id:overrides.id??publishStableId('frame',`${model.revision}:${page.id}:${type}:${model.frames.length}`)});if(model.frames.some(f=>f.id===frame.id))throw new PublishModelError('frame-id-collision');const pages=model.pages.map(p=>p.id===page.id?{...p,frameIds:[...p.frameIds,frame.id]}:p);const next=syncPublishCompatibility({...model,pages,frames:[...model.frames,frame],selectedFrameId:frame.id,revision:model.revision+1});assertPublishDocument(next);return next;
}

/**
 * Seitenoperationen: duplizieren, verschieben, entfernen, Master zuweisen, drehen.
 *
 * Vorher konnte die Oberflaeche nur **anhaengen** (`addPublishPage`). „Seiten anlegen, duplizieren und
 * sortieren, Story-Anker bleiben erhalten" war damit nicht ausfuehrbar: es gab keine Umordnung. Jede
 * Funktion hier geht durch `syncPublishCompatibility` (Eigentum `page.frameIds` ist kanonisch) und
 * `assertPublishDocument`, damit die Reihenfolge nie in einen halbgueltigen Zustand laeuft.
 */
export function duplicatePublishPage(model:PublishDocumentModel,index:number):PublishDocumentModel{
  assertPublishDocument(model);
  if(!Number.isInteger(index)||index<0||index>=model.pages.length)throw new PublishModelError('page-index-boundary');
  if(model.pages.length>=PUBLISH_LIMITS.maxPages)throw new PublishModelError('page-limit');
  const source=model.pages[index];
  const pageId=publishStableId('page',`${model.revision}:dup:${source.id}:${model.pages.length}`);
  if(model.pages.some(p=>p.id===pageId))throw new PublishModelError('page-id-collision');
  const copy=createPage(pageId,index,deepClone(source.geometry),source.masterPageId);
  copy.name=`${source.name} copy`;copy.rotationDeg=source.rotationDeg;copy.masterOverrides=deepClone(source.masterOverrides);copy.guides=deepClone(source.guides).map((g,i)=>({...g,id:publishStableId('guide',`${pageId}:${i}:${g.axis}:${g.positionMm}`)}));
  const clonedFrames=model.frames.filter(f=>f.pageId===source.id).map(f=>({...deepClone(f),id:publishStableId('frame',`${pageId}:${f.id}:${model.frames.length}`),pageId}));
  copy.frameIds=clonedFrames.map(f=>f.id);
  const pages=[...model.pages];pages.splice(index+1,0,copy);
  const next=syncPublishCompatibility({...model,pages,frames:[...model.frames,...clonedFrames],activePageIndex:index+1,selectedFrameId:null,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

export function movePublishPage(model:PublishDocumentModel,fromIndex:number,toIndex:number):PublishDocumentModel{
  assertPublishDocument(model);
  if(!Number.isInteger(fromIndex)||fromIndex<0||fromIndex>=model.pages.length)throw new PublishModelError('page-index-boundary');
  if(!Number.isInteger(toIndex)||toIndex<0||toIndex>=model.pages.length)throw new PublishModelError('page-index-boundary');
  if(fromIndex===toIndex)return syncPublishCompatibility(model);
  const pages=[...model.pages];const [moved]=pages.splice(fromIndex,1);pages.splice(toIndex,0,moved);
  const next=syncPublishCompatibility({...model,pages,activePageIndex:toIndex,selectedFrameId:null,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

export function removePublishPage(model:PublishDocumentModel,index:number):PublishDocumentModel{
  assertPublishDocument(model);
  if(!Number.isInteger(index)||index<0||index>=model.pages.length)throw new PublishModelError('page-index-boundary');
  // Ein Dokument ohne Seite ist ungueltig. Abgelehnt statt stillschweigend ignoriert.
  if(model.pages.length<=1)throw new PublishModelError('page-last-undeletable');
  const page=model.pages[index];
  const pages=model.pages.filter((_,i)=>i!==index);
  const frames=model.frames.filter(f=>f.pageId!==page.id);
  const removedFrames=new Set(model.frames.filter(f=>f.pageId===page.id).map(f=>f.id));
  // Verkettungen durchtrennen, deren Partner mit der Seite verschwindet: ein baumelnder Verweis waere
  // ein ungueltiger Thread und liesse `assertPublishDocument` scheitern.
  const repaired=frames.map(f=>{if(f.type!=='text'||!f.text)return f;const next={...f.text};let dirty=false;if(next.nextFrameId&&removedFrames.has(next.nextFrameId)){delete next.nextFrameId;dirty=true;}if(next.previousFrameId&&removedFrames.has(next.previousFrameId)){delete next.previousFrameId;dirty=true;}return dirty?{...f,text:next}:f;});
  const next=syncPublishCompatibility({...model,pages,frames:repaired,activePageIndex:Math.min(index,pages.length-1),selectedFrameId:null,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

export function setPublishPageMaster(model:PublishDocumentModel,pageId:string,masterPageId:string|null):PublishDocumentModel{
  getPageById(model,pageId);
  if(masterPageId!==null&&!model.masterPages.some(m=>m.id===masterPageId))throw new PublishModelError('page-master-missing');
  const pages=model.pages.map(p=>p.id===pageId?{...p,masterPageId:masterPageId??undefined}:p);
  const next=syncPublishCompatibility({...model,pages,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

export function setPublishPageRotation(model:PublishDocumentModel,pageId:string,rotationDeg:0|90|180|270):PublishDocumentModel{
  getPageById(model,pageId);
  if(![0,90,180,270].includes(rotationDeg))throw new PublishModelError('page-rotation-invalid');
  const pages=model.pages.map(p=>p.id===pageId?{...p,rotationDeg}:p);
  const next=syncPublishCompatibility({...model,pages,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

/**
 * Ein Master ist eine Seite ohne Seitennummer — diese Funktion legt einen an und ist die **einzige**
 * Stelle, die `masterPages` erweitert.
 */
export function addPublishMasterPage(model:PublishDocumentModel,name:string,headerText='',footerText='',parentMasterId?:string):PublishDocumentModel{
  const cleanName=name.trim().slice(0,512);
  if(!cleanName)throw new PublishModelError('master-name-empty');
  if(parentMasterId&&!model.masterPages.some(m=>m.id===parentMasterId))throw new PublishModelError('master-parent-missing');
  if(model.masterPages.length>=PUBLISH_LIMITS.maxMasters)throw new PublishModelError('master-limit');
  const id=publishStableId('master',`${model.revision}:${cleanName}:${model.masterPages.length}`);
  if(model.masterPages.some(m=>m.id===id))throw new PublishModelError('master-id-collision');
  const next=syncPublishCompatibility({...model,masterPages:[...model.masterPages,{id,name:cleanName,headerText:headerText.slice(0,4096),footerText:footerText.slice(0,4096),showPageNumbers:true,frameIds:[],...(parentMasterId?{parentMasterId}:{})}],revision:model.revision+1});
  assertPublishDocument(next);return next;
}

export function updatePublishMasterPage(model:PublishDocumentModel,masterId:string,patch:Partial<Pick<PublishMasterPage,'name'|'headerText'|'footerText'|'showPageNumbers'>>):PublishDocumentModel{
  if(!model.masterPages.some(m=>m.id===masterId))throw new PublishModelError('master-missing');
  if(patch.name!==undefined&&!patch.name.trim())throw new PublishModelError('master-name-empty');
  const masterPages=model.masterPages.map(m=>m.id!==masterId?m:{...m,...patch,name:(patch.name??m.name).trim().slice(0,512),headerText:(patch.headerText??m.headerText).slice(0,4096),footerText:(patch.footerText??m.footerText).slice(0,4096)});
  const next=syncPublishCompatibility({...model,masterPages,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

/**
 * Setzt den Rahmen auf ein neues Rechteck **mit** Rasterung und Ueberlauf-Neuberechnung.
 *
 * Die beiden Regeln, die hier zusammenlaufen, existieren sonst nirgends: `snapRect` (bereits vorhanden)
 * und `estimateTextCapacity` (bereits vorhanden). Der Inspector setzte `xMm`/`widthMm` vorher **direkt**
 * und umging damit sowohl die Rasterung als auch die Groessenpruefung.
 */
export function setFrameRect(model:PublishDocumentModel,frameId:string,rect:Partial<PublishRectMm>&{rotationDeg?:number},options:{snap?:boolean;includeSelf?:boolean}={}):PublishDocumentModel{
  const frame=model.frames.find(f=>f.id===frameId);if(!frame)throw new PublishModelError('frame-missing');
  if(frame.locked)throw new PublishModelError('frame-locked');
  const page=getPageById(model,frame.pageId);
  const requested:PublishRectMm={x:finiteOr(rect.x,frame.xMm),y:finiteOr(rect.y,frame.yMm),width:finiteOr(rect.width,frame.widthMm),height:finiteOr(rect.height,frame.heightMm)};
  const snapped=options.snap===false?requested:snapRect(model,page,requested,options.includeSelf===true?undefined:frameId);
  const rotation=rect.rotationDeg===undefined?frame.rotationDeg:rect.rotationDeg;
  const frames=model.frames.map(f=>f.id!==frameId?f:refreshFrameOverset({...f,xMm:snapped.x,yMm:snapped.y,widthMm:snapped.width,heightMm:snapped.height,rotationDeg:rotation}));
  const next=syncPublishCompatibility({...model,pages:model.pages,frames,selectedFrameId:frameId,revision:model.revision+1});
  assertPublishDocument(next);return next;
}

const finiteOr=(value:number|undefined,fallback:number):number=>typeof value==='number'&&Number.isFinite(value)?value:fallback;

/** Ueberlauf ist eine **Folge** von Inhalt und Groesse, kein eigenes Feld, das jemand setzen darf. */
export function refreshFrameOverset(frame:PublishFrame):PublishFrame{
  if(frame.type!=='text')return frame;
  const text=frame.text??createDefaultTextOptions();
  const overset=frame.content.length>estimateTextCapacity(frame);
  return text.overset===overset?frame:{...frame,text:{...text,overset}};
}

/**
 * Der aeltere Name fuer dieselbe Operation. Er wird beibehalten, weil er den Fehlercode
 * `frame-unavailable` trug (Rahmen fehlt **oder** ist gesperrt) und Aufrufer darauf pruefen. Die Regel
 * selbst steht ausschliesslich in `setFrameRect` — vorher gab es hier eine zweite Kopie.
 */
export function moveResizeFrame(model:PublishDocumentModel,frameId:string,rect:PublishRectMm,rotationDeg?:number):PublishDocumentModel{
  const frame=model.frames.find(f=>f.id===frameId);if(!frame||frame.locked)throw new PublishModelError('frame-unavailable');
  return setFrameRect(model,frameId,{...rect,rotationDeg},{snap:true,includeSelf:false});
}

export function threadTextFrames(model:PublishDocumentModel,fromId:string,toId:string):PublishDocumentModel{
  if(fromId===toId)throw new PublishModelError('text-thread-self');const from=model.frames.find(f=>f.id===fromId),to=model.frames.find(f=>f.id===toId);if(!from||!to||from.type!=='text'||to.type!=='text')throw new PublishModelError('text-thread-target-invalid');
  const frames=model.frames.map(f=>{if(f.id===fromId)return{...f,text:{...(f.text??createDefaultTextOptions()),nextFrameId:toId}};if(f.id===toId)return{...f,text:{...(f.text??createDefaultTextOptions()),previousFrameId:fromId}};return f;});const next={...model,frames,revision:model.revision+1};assertPublishDocument(next);return next;
}

/**
 * Die Kapazitaet eines Textrahmens in Zeichen — **die eine Regel**.
 *
 * `freeAreaMm2` ist **optional** und traegt eine **gemessene** Zahl hinein (`AST-1381`): laeuft Text um ein
 * Hindernis, ist nicht die ganze Rahmenflaeche nutzbar. Wird die freie Flaeche gereicht, wird die Kapazitaet um
 * den **gemessenen** Anteil verringert.
 *
 * *Warum als Faktor und nicht als zweite Formel:* die Zeilen- und Zeichenrechnung bleibt **dieselbe**; es aendert
 * sich nur die Eingabe. Eine zweite Kapazitaetsregel waere eine zweite Wahrheit — und genau daran ist die
 * Verifikationssuite schon einmal gescheitert (`AST-1452`).
 */
export function estimateTextCapacity(frame:PublishFrame,freeAreaMm2?:number):number{
  if(frame.type!=='text')return 0;const t=frame.typography??createDefaultPublishTypography();const opts=frame.text??createDefaultTextOptions();const usableW=Math.max(1,frame.widthMm-opts.insetsMm.left-opts.insetsMm.right);const usableH=Math.max(1,frame.heightMm-opts.insetsMm.top-opts.insetsMm.bottom);const ptToMm=.352778;const lineMm=Math.max(1,t.leadingPt*ptToMm);const columns=Math.max(1,opts.columns);const columnWidth=(usableW-(columns-1)*opts.columnGutterMm)/columns;const avgCharMm=Math.max(.1,t.fontSizePt*ptToMm*.52*(t.horizontalScalePercent/100));const charsPerLine=Math.max(1,Math.floor(columnWidth/avgCharMm));const lines=Math.max(1,Math.floor(usableH/lineMm))*columns;const full=charsPerLine*lines;if(freeAreaMm2===undefined||!Number.isFinite(freeAreaMm2))return full;const frameArea=Math.max(1,frame.widthMm*frame.heightMm);const fraction=Math.max(0,Math.min(1,freeAreaMm2/frameArea));return Math.max(1,Math.floor(full*fraction));
}

/**
 * Verteilt den Text einer Story ueber die Kette.
 *
 * Befund (gemessen, Runde Publish-11): die vorherige Fassung schnitt den Text bei der Summe der
 * Rahmenkapazitaeten ab. Gemessen an zwei Rahmen mit 60.000 Zeichen Text und 660 Zeichen Kapazitaet wurden
 * aus 60.000 Zeichen **660** — 59.340 Zeichen Nutzertext verschwanden beim blossen Verketten zweier Rahmen,
 * ohne Meldung. Der Ueberlauf**hinweis** war da (`overset`), der Text aber nicht mehr.
 *
 * Jetzt bleibt alles erhalten: die Verteilung fuellt die Kette, und der Rest steht weiterhin im letzten
 * Rahmen mit `overset: true`. Damit gilt fuer jede Kette: Summe(Vorher) == Summe(Nachher). Nur so kann
 * "neuen Rahmen anhaengen" den Ueberlauf ueberhaupt aufloesen — vorher war der Text schon weg.
 */
/**
 * Verteilt den Text **einer** Story neu.
 *
 * Achtung, diese Funktion ist eine duenne Weiterleitung auf `reflowAllTextThreads` — und das ist Absicht.
 * Gemessen (eigener Fehler, Runde Publish-13): die Verteilung stand hier **zweimal**, einmal in dieser Funktion
 * und einmal in der Mehrketten-Variante. Der gemessene Textverlust (60.000 -> 660) wurde in der einen Kopie
 * behoben und blieb in der anderen stehen; nur ein Test mit zwei Aufrufen hat den Unterschied gezeigt. Es gibt
 * deshalb nur noch **eine** Verteilung, und beide Namen rufen sie auf. Der uebergebene Rahmen wird auf den
 * Anfang seiner Kette zurueckgefuehrt, damit das Ergebnis unabhaengig davon ist, welcher Rahmen gefragt wurde.
 */
export function reflowTextThread(model:PublishDocumentModel,startFrameId:string):PublishDocumentModel{
  const start=model.frames.find(f=>f.id===startFrameId);
  if(!start||start.type!=='text')throw new PublishModelError('text-thread-start-invalid');
  return reflowAllTextThreads(model);
}

export function detectOversetFrames(model:PublishDocumentModel):string[]{return model.frames.filter(f=>f.type==='text'&&(f.text?.overset||f.content.length>estimateTextCapacity(f))).map(f=>f.id);}

/**
 * Umfliesst **alle** Ketten in einem Durchgang.
 *
 * Gemessen (eigener Fehler, Runde Publish-11): ein Umfluss ueber alle Kopfrahmen fasste voellig unverbundene
 * Einzelrahmen als eine Story zusammen — aus zwei getrennten Texteinzeichen wurden drei. Die Bedingung ist
 * deshalb: nur ein Rahmen mit Vorgaenger **oder** Nachfolger ist eine Story.
 *
 * Warum in **einem** Durchgang und nicht als Schleife ueber `reflowTextThread`: jeder Aufruf wuerde den Text
 * der Kette neu verteilen, und der naechste Aufruf liest den bereits **veraenderten** Inhalt als Quelle. Die
 * Kette A→B mit je einem Zeichen verlor so das zweite Zeichen. Diese Funktion berechnet alle Verteilungen aus
 * dem **unveraenderten** Ausgangszustand und wendet sie gemeinsam an.
 */
export function reflowAllTextThreads(model:PublishDocumentModel):PublishDocumentModel{
  const replacements=new Map<string,PublishFrame>();
  /**
   * Die Verteilung, in Worten:
   *
   *   • `openIndex` ist der **erste** Rahmen, in den der Rest nicht mehr passt — er ist der einzige Traeger
   *     des Ueberlaufs. Rahmen nach ihm bleiben leer, weil der Rest schon einen Traeger hat.
   *   • Jeder Rahmen **vor** `openIndex` nimmt genau seine Kapazitaet, `openIndex` nimmt alles ab seinem
   *     Startpunkt, und `overset` ist genau dann wahr, wenn dieser Rest groesser ist als seine Kapazitaet.
   *
   * Damit gilt fuer jede Kette: Summe(Vorher) == Summe(Nachher). Genau das war vorher nicht wahr — gemessen
   * wurden aus 60.000 Zeichen 660, weil bei der Summe der Kapazitaeten abgeschnitten wurde. Der Ueberlauftext
   * stand danach nicht mehr im Dokument, obwohl der Ueberlauf**hinweis** blieb.
   *
   * Die Bilanz unten prueft diese Zusage bei jedem Aufruf und wirft, wenn sie verletzt wird. Sie vergleicht
   * die **ganze Kette** vorher mit der ganzen Kette nachher — nicht nur die ersetzten Rahmen: der Text kann
   * in einem einzigen Rahmen der Kette liegen, waehrend ein anderer leer ist.
   */
  const heads=model.frames.filter(f=>f.type==='text'&&!f.text?.previousFrameId&&Boolean(f.text?.nextFrameId));
  for(const head of heads){
    const modelIds=new Set(model.frames.map(f=>f.id));
    const byId=new Map(model.frames.map(f=>[f.id,f] as const));
    const chain:PublishFrame[]=[];let cur:PublishFrame|undefined=byId.get(head.id);const seen=new Set<string>();
    // Nur Rahmen, die im Modell **wirklich** existieren: ein Verweis auf einen geloeschten Rahmen darf nicht
    // dessen Inhalt in die Story ziehen (gemessen, Runde Publish-11).
    while(cur){if(seen.has(cur.id))throw new PublishModelError('text-thread-cycle');seen.add(cur.id);chain.push(cur);const nextId:string|undefined=cur.text?.nextFrameId;cur=nextId&&modelIds.has(nextId)?byId.get(nextId):undefined;}
    const remaining=chain.map(f=>f.content).join('');
    const capacities=chain.map(f=>estimateTextCapacity(f));
    let cursor=0;let openIndex=capacities.length-1;
    for(let index=0;index<capacities.length;index+=1){
      if(cursor+capacities[index]!>=remaining.length){openIndex=index;break;}
      cursor+=capacities[index]!;
    }
    let offset=0;
    const produced:string[]=[];
    for(let index=0;index<chain.length;index+=1){
      const f=chain[index]!;
      const isOpen=index===openIndex;
      const take=isOpen?remaining.slice(offset):remaining.slice(offset,offset+capacities[index]!);
      // Ueberlauf traegt nur der offene Rahmen, und nur, wenn der Rest seine Kapazitaet uebersteigt.
      const overset=isOpen&&take.length>capacities[index]!;
      offset+=take.length;
      produced.push(take);
      replacements.set(f.id,{...f,content:take,text:{...(f.text??createDefaultTextOptions()),overset}});
      if(isOpen)break;
    }
    // Bilanz **pro Kette**: der Umfluss darf Text weder verlieren noch erfinden.
    const before=remaining.length;
    const after=produced.reduce((sum,text)=>sum+text.length,0);
    if(before!==after)throw new PublishModelError(`text-reflow-not-conservative:${before}->${after}`);
  }
  const frames=model.frames.map(f=>replacements.get(f.id)??f);
  return {...model,frames,revision:model.revision+1};
}

export function resolveMasterChain(model:PublishDocumentModel,masterId:string):PublishMasterPage[]{const byId=new Map(model.masterPages.map(m=>[m.id,m] as const));const out:PublishMasterPage[]=[];const seen=new Set<string>();let cur=byId.get(masterId);while(cur){if(seen.has(cur.id))throw new PublishModelError('master-cycle');seen.add(cur.id);out.unshift(cur);cur=cur.parentMasterId?byId.get(cur.parentMasterId):undefined;}return out;}

export function effectiveMasterFrameIds(model:PublishDocumentModel,pageId:string):string[]{const page=getPageById(model,pageId);if(!page.masterPageId)return[];const chain=resolveMasterChain(model,page.masterPageId);const ids:string[]=[];for(const m of chain)for(const id of m.frameIds)if(!page.masterOverrides[id]&&!ids.includes(id))ids.push(id);return ids;}

function roman(n:number):string{if(n<=0||n>3999)return String(n);const pairs:[number,string][]=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];let s='';for(const [v,c] of pairs)while(n>=v){s+=c;n-=v;}return s;}
function alpha(n:number):string{if(n<=0)return String(n);let s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
export function formatPageNumber(n:number,format:PublishPageNumberFormat):string{switch(format){case'roman-upper':return roman(n);case'roman-lower':return roman(n).toLowerCase();case'alpha-upper':return alpha(n);case'alpha-lower':return alpha(n).toLowerCase();default:return String(n);}}
export function pageLabel(model:PublishDocumentModel,pageId:string):string{const index=model.pages.findIndex(p=>p.id===pageId);if(index<0)throw new PublishModelError('page-missing');const candidates=model.sections.map(s=>({...s,index:model.pages.findIndex(p=>p.id===s.startPageId)})).filter(s=>s.index>=0&&s.index<=index).sort((a,b)=>b.index-a.index);const section=candidates[0]??{startNumber:1,prefix:'',numberFormat:'arabic' as const,includePrefix:false,index:0};const n=section.startNumber+(index-section.index);return `${section.includePrefix?section.prefix:''}${formatPageNumber(n,section.numberFormat)}`;}

export function snapPoint(model:PublishDocumentModel,page:PublishPage,p:PublishPointMm,excludeFrameId?:string):PublishPointMm{
  if(!model.smartGuides.enabled)return p;const bleed=page.geometry.bleedMm;const candidatesX:number[]=[-bleed,0,page.geometry.widthMm,page.geometry.widthMm+bleed,page.geometry.marginsMm.left,page.geometry.widthMm-page.geometry.marginsMm.right];const candidatesY:number[]=[-bleed,0,page.geometry.heightMm,page.geometry.heightMm+bleed,page.geometry.marginsMm.top,page.geometry.heightMm-page.geometry.marginsMm.bottom];
  if(model.smartGuides.snapToGuides)for(const g of page.guides)(g.axis==='x'?candidatesX:candidatesY).push(g.positionMm);
  if(model.smartGuides.snapToFrames)for(const f of model.frames.filter(f=>f.pageId===page.id&&f.id!==excludeFrameId&&!f.hidden)){candidatesX.push(f.xMm,f.xMm+f.widthMm/2,f.xMm+f.widthMm);candidatesY.push(f.yMm,f.yMm+f.heightMm/2,f.yMm+f.heightMm);}
  const snap=(v:number,c:number[])=>{let best=v,d=model.smartGuides.toleranceMm+1,didSnap=false;for(const x of c){const dx=Math.abs(v-x);if(dx<d&&dx<=model.smartGuides.toleranceMm){best=x;d=dx;didSnap=true;}}return{value:best,didSnap};};const sx=snap(p.x,candidatesX),sy=snap(p.y,candidatesY);let x=sx.value,y=sy.value;
  if(model.smartGuides.snapToGrid){const g=page.geometry.documentGridMm;if(!sx.didSnap)x=Math.round(x/g)*g;if(!sy.didSnap)y=Math.round(y/g)*g;}return{x,y};
}
export function snapRect(model:PublishDocumentModel,page:PublishPage,r:PublishRectMm,excludeFrameId?:string):PublishRectMm{const p=snapPoint(model,page,{x:r.x,y:r.y},excludeFrameId);return{x:p.x,y:p.y,width:r.width,height:r.height};}

export function applyResponsiveRule(frame:PublishFrame,rule:PublishResponsiveRule,from:PublishPageGeometry,to:PublishPageGeometry):PublishFrame{
  if(!rule.enabled||rule.minPageWidthMm&&to.widthMm<rule.minPageWidthMm||rule.maxPageWidthMm&&to.widthMm>rule.maxPageWidthMm)return deepClone(frame);const sx=to.widthMm/from.widthMm,sy=to.heightMm/from.heightMm;let scale=1;if(rule.scaleMode==='proportional')scale=Math.min(sx,sy);else if(rule.scaleMode==='fit-width')scale=sx;else if(rule.scaleMode==='fit-height')scale=sy;let width=frame.widthMm*scale,height=frame.heightMm*scale,x=frame.xMm*sx,y=frame.yMm*sy;if(rule.anchorX==='right')x=to.widthMm-(from.widthMm-(frame.xMm+frame.widthMm))*sx-width;else if(rule.anchorX==='center')x=(to.widthMm-width)/2;else if(rule.anchorX==='stretch'){x=frame.xMm*sx;width=Math.max(.1,to.widthMm-x-(from.widthMm-(frame.xMm+frame.widthMm))*sx);}if(rule.anchorY==='bottom')y=to.heightMm-(from.heightMm-(frame.yMm+frame.heightMm))*sy-height;else if(rule.anchorY==='center')y=(to.heightMm-height)/2;else if(rule.anchorY==='stretch'){y=frame.yMm*sy;height=Math.max(.1,to.heightMm-y-(from.heightMm-(frame.yMm+frame.heightMm))*sy);}return{...deepClone(frame),xMm:x,yMm:y,widthMm:width,heightMm:height};
}
