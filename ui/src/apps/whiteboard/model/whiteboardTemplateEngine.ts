import { secureRandomId } from '../../../shared/crypto/secureRandom';
// STATUS: DIAMANT VGT SUPREME
// Astraea Whiteboard bounded built-in and custom template engine.

import type { WhiteboardCustomTemplate, WhiteboardTemplateScope } from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { createWhiteboardDiagramPreset } from './whiteboardDiagramEngine';
import { clampCoordinate } from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_CUSTOM_TEMPLATE_MAX = 64;
export const WHITEBOARD_TEMPLATE_MAX_ITEMS = 2_000;
export type WhiteboardBuiltinTemplateId =
  | 'brainstorm' | 'swot' | 'retrospective' | 'kanban' | 'business-model-canvas' | 'lean-canvas'
  | 'customer-journey' | 'empathy-map' | 'affinity-diagram' | 'mind-map' | 'flowchart' | 'architecture-diagram'
  | 'org-chart' | 'roadmap' | 'project-kickoff' | 'lesson-plan' | 'meeting-agenda' | 'design-critique';

export interface WhiteboardBuiltinTemplateDescriptor { id: WhiteboardBuiltinTemplateId; name: string; category: string; }
export const WHITEBOARD_BUILTIN_TEMPLATES: WhiteboardBuiltinTemplateDescriptor[] = [
  ['brainstorm','Brainstorm','Workshop'],['swot','SWOT','Strategy'],['retrospective','Retrospective','Workshop'],['kanban','Kanban','Planning'],
  ['business-model-canvas','Business Model Canvas','Strategy'],['lean-canvas','Lean Canvas','Strategy'],['customer-journey','Customer Journey','Research'],['empathy-map','Empathy Map','Research'],
  ['affinity-diagram','Affinity Diagram','Research'],['mind-map','Mind Map','Diagram'],['flowchart','Flowchart','Diagram'],['architecture-diagram','Architecture Diagram','Diagram'],
  ['org-chart','Org Chart','Diagram'],['roadmap','Roadmap','Planning'],['project-kickoff','Project Kickoff','Planning'],['lesson-plan','Lesson Plan','Education'],
  ['meeting-agenda','Meeting Agenda','Workshop'],['design-critique','Design Critique','Design'],
].map(([id,name,category])=>({id:id as WhiteboardBuiltinTemplateId,name,category}));

const clean=(value:unknown,max=240)=>String(value??'').replace(/\0/g,'').trim().slice(0,max);
const uid=(prefix:string)=>secureRandomId(prefix);

function frame(title:string,x:number,y:number,width:number,height:number,zIndex=0):WhiteboardItem{return{id:uid('tpl-frame'),type:'frame',x,y,width,height,text:title,zIndex};}
function sticky(title:string,x:number,y:number,color:'yellow'|'cyan'|'purple'='yellow',width=190,height=120):WhiteboardItem{return{id:uid('tpl-sticky'),type:'sticky',x,y,width,height,text:title,color,zIndex:10};}
function text(title:string,x:number,y:number,width=260,height=50):WhiteboardItem{return{id:uid('tpl-text'),type:'text',x,y,width,height,text:title,zIndex:20};}
function card(title:string,subtitle:string,x:number,y:number,width=240,height=130):WhiteboardItem{return{id:uid('tpl-card'),type:'card',x,y,width,height,text:title,card:{cardKind:'generic',title,subtitle,tags:['template']},zIndex:10};}
function section(title:string,x:number,y:number,width:number,height:number,seed:string,color:'yellow'|'cyan'|'purple'='yellow'):WhiteboardItem[]{return[frame(title,x,y,width,height,0),sticky(seed,x+24,y+54,color,Math.max(150,width-48),Math.min(120,height-78))];}

function gridSections(originX:number,originY:number,columns:number,cellW:number,cellH:number,definitions:Array<[string,string,('yellow'|'cyan'|'purple')?]>):WhiteboardItem[]{
  const items:WhiteboardItem[]=[];
  definitions.forEach(([title,seed,color],index)=>{const x=originX+(index%columns)*cellW,y=originY+Math.floor(index/columns)*cellH;items.push(...section(title,x,y,cellW-16,cellH-16,seed,color));});
  return items;
}

export function createBuiltinWhiteboardTemplate(templateId:WhiteboardBuiltinTemplateId,originX:number,originY:number):WhiteboardItem[]{
  const x=clampCoordinate(originX),y=clampCoordinate(originY);
  if(templateId==='mind-map')return createWhiteboardDiagramPreset('mind-map',x,y);
  if(templateId==='flowchart')return createWhiteboardDiagramPreset('flowchart',x,y);
  if(templateId==='architecture-diagram')return createWhiteboardDiagramPreset('network',x,y);
  if(templateId==='org-chart')return createWhiteboardDiagramPreset('org-chart',x,y);
  if(templateId==='brainstorm')return[text('Brainstorm: How might we…?',x,y,520,60),sticky('Idea 1',x,y+110,'yellow'),sticky('Idea 2',x+230,y+110,'cyan'),sticky('Idea 3',x+460,y+110,'purple'),sticky('Wildcard',x+230,y+270,'yellow')];
  if(templateId==='swot')return gridSections(x,y,2,360,240,[['Strengths','What works in our favor?','cyan'],['Weaknesses','What limits us?','purple'],['Opportunities','Where can we grow?','yellow'],['Threats','What could derail us?','purple']]);
  if(templateId==='retrospective')return gridSections(x,y,3,310,320,[['Went well','Keep doing…','cyan'],['Needs improvement','Change…','purple'],['Actions','Owner + next step','yellow']]);
  if(templateId==='kanban')return gridSections(x,y,3,320,430,[['To do','Next item','yellow'],['In progress','Current work','cyan'],['Done','Completed','purple']]);
  if(templateId==='business-model-canvas')return gridSections(x,y,3,300,230,[['Key Partners','Partners and suppliers','purple'],['Key Activities','Critical activities','cyan'],['Value Propositions','Value created','yellow'],['Customer Relationships','Relationship model','cyan'],['Customer Segments','Who we serve','yellow'],['Key Resources','Critical resources','purple'],['Channels','How value reaches users','cyan'],['Cost Structure','Major costs','purple'],['Revenue Streams','How value is captured','yellow']]);
  if(templateId==='lean-canvas')return gridSections(x,y,3,300,230,[['Problem','Top problems','purple'],['Solution','Potential solution','cyan'],['Unique Value','Why this wins','yellow'],['Unfair Advantage','Hard to copy','purple'],['Customer Segments','Early adopters','yellow'],['Key Metrics','Signals that matter','cyan'],['Channels','Reach users','cyan'],['Cost Structure','Costs','purple'],['Revenue Streams','Revenue','yellow']]);
  if(templateId==='customer-journey')return gridSections(x,y,5,230,300,[['Discover','Touchpoints + feelings','yellow'],['Evaluate','Questions + friction','cyan'],['Adopt','Decision moments','purple'],['Use','Experience + support','cyan'],['Renew','Retention + advocacy','yellow']]);
  if(templateId==='empathy-map')return gridSections(x,y,3,290,240,[['Says','Quotes and language','yellow'],['Thinks','Beliefs and concerns','cyan'],['Does','Observed behavior','purple'],['Feels','Emotions','yellow'],['Pains','Frictions and risks','purple'],['Gains','Desired outcomes','cyan']]);
  if(templateId==='affinity-diagram')return[...gridSections(x,y,3,310,330,[['Theme A','Observation / note','yellow'],['Theme B','Observation / note','cyan'],['Theme C','Observation / note','purple']]),text('Drag related notes into themes; rename frames as patterns emerge.',x,y-60,800,40)];
  if(templateId==='roadmap')return gridSections(x,y,4,270,300,[['Now','Committed work','cyan'],['Next','Near-term bets','yellow'],['Later','Longer-term options','purple'],['Parking lot','Not scheduled','yellow']]);
  if(templateId==='project-kickoff')return gridSections(x,y,2,420,270,[['Objectives','What success means','cyan'],['Scope','In / out','yellow'],['Roles & owners','Who owns what','purple'],['Risks & next steps','Risk + owner + action','yellow']]);
  if(templateId==='lesson-plan')return gridSections(x,y,3,300,260,[['Objectives','Learners will…','cyan'],['Warm-up','Opening activity','yellow'],['Instruction','Core content','purple'],['Practice','Guided activity','cyan'],['Assessment','Evidence of learning','yellow'],['Reflection','Wrap-up / homework','purple']]);
  if(templateId==='meeting-agenda')return[text('Meeting agenda',x,y,500,55),card('1. Context','5 min · owner',x,y+90),card('2. Decision','15 min · decision required',x+270,y+90),card('3. Actions','10 min · owners + dates',x+540,y+90)];
  if(templateId==='design-critique')return gridSections(x,y,3,320,320,[['Intent','What problem is this solving?','cyan'],['Feedback','Specific observations','yellow'],['Decisions','What changes / stays?','purple']]);
  return [];
}

function normalizeRelativeItems(items:readonly WhiteboardItem[],selectedIds:readonly string[]):WhiteboardItem[]{
  const selected=new Set(selectedIds);
  const source=items.filter(item=>!item.hidden&&(selected.size===0||selected.has(item.id))).slice(0,WHITEBOARD_TEMPLATE_MAX_ITEMS);
  const ids=new Set(source.map(item=>item.id));
  const complete=source.filter(item=>item.type!=='connector'||(Boolean(item.fromId&&item.toId)&&ids.has(item.fromId!)&&ids.has(item.toId!)));
  if(complete.length===0)return[];
  const minX=Math.min(...complete.filter(i=>i.type!=='connector').map(i=>i.x),0),minY=Math.min(...complete.filter(i=>i.type!=='connector').map(i=>i.y),0);
  return complete.map(item=>({...item,x:item.type==='connector'?item.x:item.x-minX,y:item.type==='connector'?item.y:item.y-minY}));
}

export function createCustomWhiteboardTemplate(name:string,scope:WhiteboardTemplateScope,items:readonly WhiteboardItem[],selectedIds:readonly string[],description=''):WhiteboardCustomTemplate|null{
  const normalized=normalizeRelativeItems(items,selectedIds);if(normalized.length===0)return null;
  return{id:uid('wb-template'),name:clean(name,120)||'Custom template',description:clean(description,500)||undefined,scope:scope==='org'?'org':'user',createdAt:Date.now(),items:normalized.map(item=>({...item}))};
}

export function normalizeCustomWhiteboardTemplates(value:readonly WhiteboardCustomTemplate[]|undefined):WhiteboardCustomTemplate[]{
  const seen=new Set<string>();const out:WhiteboardCustomTemplate[]=[];
  for(const raw of (value??[]).slice(0,WHITEBOARD_CUSTOM_TEMPLATE_MAX)){
    const templateId=clean(raw?.id,160);if(!templateId||seen.has(templateId))continue;seen.add(templateId);
    const items=(raw.items??[]).slice(0,WHITEBOARD_TEMPLATE_MAX_ITEMS).filter(item=>Boolean(item?.id&&item?.type)).map(item=>({...item}));
    if(items.length===0)continue;
    out.push({id:templateId,name:clean(raw.name,120)||'Custom template',description:clean(raw.description,500)||undefined,scope:raw.scope==='org'?'org':'user',createdAt:Number.isFinite(raw.createdAt)?Math.max(0,raw.createdAt):0,items});
  }
  return out;
}

export function instantiateCustomWhiteboardTemplate(template:WhiteboardCustomTemplate,originX:number,originY:number):WhiteboardItem[]{
  const source=template.items.slice(0,WHITEBOARD_TEMPLATE_MAX_ITEMS);const idMap=new Map(source.map(item=>[item.id,uid('wb-tpl-item')]));const groupMap=new Map<string,string>();
  const remapGroup=(groupId:string|undefined)=>{if(!groupId)return undefined;if(!groupMap.has(groupId))groupMap.set(groupId,uid('wb-tpl-group'));return groupMap.get(groupId);};
  return source.map(item=>({...item,id:idMap.get(item.id)!,x:item.type==='connector'?item.x:clampCoordinate(originX+item.x),y:item.type==='connector'?item.y:clampCoordinate(originY+item.y),groupId:remapGroup(item.groupId),fromId:item.fromId?idMap.get(item.fromId):undefined,toId:item.toId?idMap.get(item.toId):undefined,constraints:item.constraints?{...item.constraints,keepInsideFrameId:item.constraints.keepInsideFrameId?idMap.get(item.constraints.keepInsideFrameId):undefined}:undefined}));
}

export function upsertCustomWhiteboardTemplate(templates:readonly WhiteboardCustomTemplate[],template:WhiteboardCustomTemplate):WhiteboardCustomTemplate[]{
  return normalizeCustomWhiteboardTemplates([template,...templates.filter(existing=>existing.id!==template.id)]).slice(0,WHITEBOARD_CUSTOM_TEMPLATE_MAX);
}
