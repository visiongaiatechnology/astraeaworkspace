// STATUS: DIAMANT VGT SUPREME — Whiteboard Search & Organization Core
import type { WhiteboardBookmark, WhiteboardObjectAuthorship } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';

export interface WhiteboardOrganizationFilters { query?: string; type?: string; tag?: string; author?: string; frameId?: string; }
export interface WhiteboardBoardOutlineEntry { frameId: string; label: string; childCount: number; x: number; y: number; }
export interface WhiteboardHealthDiagnostics { total:number; visible:number; hidden:number; locked:number; frames:number; connectors:number; liveObjects:number; duplicateIds:string[]; invalidGeometry:string[]; danglingConnectors:string[]; orphanedFrameConstraints:string[]; }
const clean=(value:unknown,max=80)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const lower=(value:unknown)=>clean(value,4096).toLocaleLowerCase();
export const normalizeWhiteboardTags=(tags:unknown):string[]=>Array.isArray(tags)?[...new Set(tags.map((tag)=>clean(tag,64)).filter(Boolean))].slice(0,32):[];
export const addWhiteboardTag=(item:WhiteboardItem,tag:string):WhiteboardItem=>({...item,tags:normalizeWhiteboardTags([...(item.tags??[]),tag])});
export const removeWhiteboardTag=(item:WhiteboardItem,tag:string):WhiteboardItem=>({...item,tags:normalizeWhiteboardTags(item.tags).filter((candidate)=>candidate!==tag)});

export function whiteboardSearchText(item:WhiteboardItem):string {
  const parts:unknown[]=[item.id,item.type,item.text,item.name,item.lineLabel,item.linkUri,...normalizeWhiteboardTags(item.tags)];
  if(item.card)parts.push(item.card.title,item.card.subtitle,item.card.status,...(item.card.tags??[]));
  if(item.document)parts.push(item.document.title,item.document.excerpt,item.document.documentKind);
  if(item.chart)parts.push(item.chart.title,...item.chart.labels);
  if(item.code)parts.push(item.code.language,item.code.code);
  if(item.icon)parts.push(item.icon.name,item.icon.label);
  if(item.reaction)parts.push(item.reaction.emoji,item.reaction.label);
  if(item.diagram)parts.push(item.diagram.family,item.diagram.kind,item.diagram.title,item.diagram.subtitle,...(item.diagram.fields??[]));
  if(item.liveObject)parts.push(item.liveObject.kind,item.liveObject.sourceTitle,item.liveObject.sourceUri,item.liveObject.selector,item.liveObject.mode);
  return parts.map((part)=>clean(part,2048)).filter(Boolean).join(' ').toLocaleLowerCase();
}
export function containingWhiteboardFrame(item:WhiteboardItem,frames:readonly WhiteboardItem[]):string|undefined {
  if(item.type==='frame')return item.id;
  const explicit=item.constraints?.keepInsideFrameId; if(explicit&&frames.some((frame)=>frame.id===explicit))return explicit;
  const cx=item.x+item.width/2,cy=item.y+item.height/2;
  return frames.filter((frame)=>frame.type==='frame'&&cx>=frame.x&&cx<=frame.x+frame.width&&cy>=frame.y&&cy<=frame.y+frame.height).sort((a,b)=>(a.width*a.height)-(b.width*b.height))[0]?.id;
}
export function filterWhiteboardItems(items:readonly WhiteboardItem[],filters:WhiteboardOrganizationFilters,authors:Record<string,WhiteboardObjectAuthorship>={}):WhiteboardItem[] {
  const frames=items.filter((item)=>item.type==='frame'); const query=lower(filters.query); const tag=clean(filters.tag,64); const author=clean(filters.author,128);
  return items.filter((item)=>{
    if(query&&!whiteboardSearchText(item).includes(query))return false;
    if(filters.type&&item.type!==filters.type)return false;
    if(tag&&!normalizeWhiteboardTags(item.tags).includes(tag))return false;
    if(author){const owner=authors[item.id];if(!owner||![owner.actorId,owner.actorName].some((value)=>value===author))return false;}
    if(filters.frameId&&containingWhiteboardFrame(item,frames)!==filters.frameId)return false;
    return true;
  });
}
export function buildWhiteboardOutline(items:readonly WhiteboardItem[]):WhiteboardBoardOutlineEntry[] {
  const frames=items.filter((item)=>item.type==='frame'); return frames.map((frame)=>({frameId:frame.id,label:clean(frame.text||frame.name||frame.id,120),childCount:items.filter((item)=>item.id!==frame.id&&containingWhiteboardFrame(item,frames)===frame.id).length,x:frame.x,y:frame.y})).sort((a,b)=>a.y-b.y||a.x-b.x||a.label.localeCompare(b.label)).slice(0,512);
}
export function collectWhiteboardTags(items:readonly WhiteboardItem[]):string[]{return [...new Set(items.flatMap((item)=>normalizeWhiteboardTags(item.tags)))].sort((a,b)=>a.localeCompare(b)).slice(0,512);}
export function collectWhiteboardAuthors(authors:Record<string,WhiteboardObjectAuthorship>):Array<{id:string;name:string}>{const map=new Map<string,string>();for(const author of Object.values(authors)){if(author.actorId)map.set(author.actorId,clean(author.actorName||author.actorId,128));}return [...map].map(([id,name])=>({id,name})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,512);}
export function sortWhiteboardLayers(items:readonly WhiteboardItem[]):WhiteboardItem[]{return [...items].sort((a,b)=>(b.zIndex??0)-(a.zIndex??0)||a.id.localeCompare(b.id)).slice(0,1000);}
export function diagnoseWhiteboard(items:readonly WhiteboardItem[]):WhiteboardHealthDiagnostics {
  const ids=new Set<string>(),duplicates=new Set<string>(),invalid:string[]=[],dangling:string[]=[],orphaned:string[]=[]; const frames=new Set(items.filter((item)=>item.type==='frame').map((item)=>item.id));
  for(const item of items){if(ids.has(item.id))duplicates.add(item.id);ids.add(item.id);if(!Number.isFinite(item.x)||!Number.isFinite(item.y)||!Number.isFinite(item.width)||!Number.isFinite(item.height)||item.width<=0||item.height<=0||Math.abs(item.x)>1e7||Math.abs(item.y)>1e7)invalid.push(item.id);if(item.type==='connector'&&(!item.fromId||!item.toId||!items.some((candidate)=>candidate.id===item.fromId)||!items.some((candidate)=>candidate.id===item.toId)))dangling.push(item.id);const frameId=item.constraints?.keepInsideFrameId;if(frameId&&!frames.has(frameId))orphaned.push(item.id);}
  return {total:items.length,visible:items.filter((item)=>!item.hidden).length,hidden:items.filter((item)=>item.hidden).length,locked:items.filter((item)=>item.locked).length,frames:frames.size,connectors:items.filter((item)=>item.type==='connector').length,liveObjects:items.filter((item)=>item.type==='live').length,duplicateIds:[...duplicates].slice(0,256),invalidGeometry:invalid.slice(0,256),danglingConnectors:dangling.slice(0,256),orphanedFrameConstraints:orphaned.slice(0,256)};
}
export function normalizeNamedLocations(bookmarks:readonly WhiteboardBookmark[]):WhiteboardBookmark[]{return bookmarks.filter((bookmark)=>bookmark&&typeof bookmark.id==='string'&&typeof bookmark.name==='string'&&Number.isFinite(bookmark.x)&&Number.isFinite(bookmark.y)&&Number.isFinite(bookmark.zoom)).slice(0,256).map((bookmark)=>({...bookmark,name:clean(bookmark.name,120)}));}
