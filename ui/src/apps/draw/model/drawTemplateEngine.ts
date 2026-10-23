// STATUS: DIAMANT VGT SUPREME — Astraea Draw editable diagram template packs
import type { DrawDiagramFamily, DrawDiagramMetadata, DrawDocumentModel, DrawObject, DrawPageId } from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, assertDrawDocument, transactDraw } from './drawDocumentEngine';
import { assertDrawObject, MAX_OBJECTS, safeId } from './drawDocumentValidation';
import { createVectorShape } from './drawVectorEngine';

export interface DrawTemplateDefinition { id:string; name:string; family:DrawDiagramFamily; category:string; description:string; seeds:readonly DrawTemplateSeed[]; }
/**
 * A seed may be a **container** (`container` lists the keys of its members). Containers become real
 * `group` objects with `childIds`, so lane/zone membership is the existing grouping fact rather than a
 * second containment rule: moving the lane moves its members, and dropping a node onto it re-parents it.
 */
export interface DrawTemplateSeed { key:string; role:string; shape:'rectangle'|'ellipse'|'diamond'|'line'|'icon'; x:number;y:number;width:number;height:number;text:string; metadata?:DeepReadonly<DrawDiagramMetadata>; container?:readonly string[]; }
const seed=(key:string,role:string,shape:DrawTemplateSeed['shape'],x:number,y:number,w:number,h:number,text:string,metadata?:DrawObject['diagram'],container?:readonly string[]):DrawTemplateSeed=>({key,role,shape,x,y,width:w,height:h,text,metadata,container});

type DeepReadonly<T> = T extends readonly (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function freezeDeep<T>(value: T): DeepReadonly<T> {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

function copyDiagramMetadata(metadata: DeepReadonly<DrawDiagramMetadata>): DrawDiagramMetadata {
  return {
    family: metadata.family,
    role: metadata.role,
    entity: metadata.entity
      ? {
        tableId: metadata.entity.tableId,
        fields: metadata.entity.fields.map((field) => ({
          id: field.id,
          name: field.name,
          type: field.type,
          primaryKey: field.primaryKey,
          foreignKey: field.foreignKey ? { ...field.foreignKey } : undefined,
        })),
      }
      : undefined,
    network: metadata.network ? { ...metadata.network } : undefined,
  };
}

const flowSeeds=[seed('start','start','ellipse',80,80,120,64,'Start'),seed('step','process','rectangle',280,72,160,80,'Process'),seed('decision','decision','diamond',520,72,120,90,'Decision'),seed('end','end','ellipse',740,80,120,64,'End')];
const umlKinds: Array<[DrawDiagramFamily,string]>=[['uml-class','Class'],['uml-sequence','Sequence'],['uml-component','Component'],['uml-deployment','Deployment'],['uml-use-case','Use Case'],['uml-activity','Activity'],['uml-state','State'],['uml-package','Package'],['uml-object','Object']];

export const BUILTIN_DRAW_TEMPLATES: DeepReadonly<DrawTemplateDefinition[]> = freezeDeep<DrawTemplateDefinition[]>([
  {id:'flowchart-basic',name:'Flowchart',family:'flowchart',category:'Process',description:'Editable process flow',seeds:flowSeeds},
  {id:'swimlane-cross-functional',name:'Cross-Functional Swimlane',family:'swimlane',category:'Process',description:'Editable lanes and process nodes',seeds:[seed('lane1','lane','rectangle',40,60,900,180,'Lane A',undefined,['p1']),seed('lane2','lane','rectangle',40,250,900,180,'Lane B',undefined,['p2']),seed('p1','process','rectangle',180,110,150,70,'Step A'),seed('p2','process','rectangle',520,300,150,70,'Step B')]},
  {id:'bpmn-basic',name:'BPMN Basic',family:'bpmn',category:'Process',description:'Events, task and gateway',seeds:[seed('event1','start-event','ellipse',80,120,70,70,'Start'),seed('task','task','rectangle',240,110,160,90,'Task'),seed('gateway','gateway','diamond',500,110,100,100,'Gateway'),seed('event2','end-event','ellipse',720,120,70,70,'End')]},
  {id:'dfd-basic',name:'Data Flow Diagram',family:'data-flow',category:'Process',description:'Process, store and external entity',seeds:[seed('external','external-entity','rectangle',80,100,150,80,'External Entity'),seed('process','process','ellipse',340,100,140,90,'Process'),seed('store','data-store','rectangle',610,100,180,80,'Data Store')]},
  {id:'process-map',name:'Process Map',family:'process-map',category:'Process',description:'Editable process map starter',seeds:flowSeeds},
  ...umlKinds.map(([family,label])=>({id:`${family}-basic`,name:`UML ${label}`,family,category:'UML 2.5',description:`Editable UML ${label} starter`,seeds:[seed('a','uml-node','rectangle',120,100,220,130,`${label} A`,{family,role:'node'}),seed('b','uml-node','rectangle',520,100,220,130,`${label} B`,{family,role:'node'})]})),
  {id:'erd-basic',name:'Entity Relationship Diagram',family:'erd',category:'Data',description:'Entities, keys and relations',seeds:[seed('entity-a','entity','rectangle',100,80,260,180,'Customer',{family:'erd',role:'entity',entity:{fields:[{id:'id',name:'id',type:'uuid',primaryKey:true},{id:'name',name:'name',type:'text'}]}}),seed('entity-b','entity','rectangle',520,80,260,180,'Order',{family:'erd',role:'entity',entity:{fields:[{id:'id',name:'id',type:'uuid',primaryKey:true},{id:'customer_id',name:'customer_id',type:'uuid',foreignKey:{tableId:'customer',fieldId:'id'}}]}})]},
  {id:'network-logical',name:'Logical Network',family:'network-logical',category:'Network',description:'Zones, VLAN/subnet metadata and topology',seeds:[seed('edge','router','icon',100,120,130,90,'Edge Router',{family:'network-logical',role:'router',network:{zone:'edge',vlan:'10',subnet:'10.0.10.0/24',deviceType:'router'}}),seed('fw','firewall','icon',360,120,130,90,'Firewall',{family:'network-logical',role:'firewall',network:{zone:'dmz',vlan:'20',subnet:'10.0.20.0/24',deviceType:'firewall'}}),seed('srv','server','icon',620,120,130,90,'Server',{family:'network-logical',role:'server',network:{zone:'internal',vlan:'30',subnet:'10.0.30.0/24',deviceType:'server'}})]},
  {id:'network-physical',name:'Physical Network',family:'network-physical',category:'Network',description:'Physical devices and links',seeds:[seed('switch','switch','icon',300,100,180,80,'Core Switch',{family:'network-physical',role:'switch',network:{deviceType:'switch'}})]},
  {id:'rack-42u',name:'42U Rack',family:'rack',category:'Network',description:'Rack/device starter',seeds:[seed('rack','rack','rectangle',200,40,300,800,'42U Rack',{family:'rack',role:'rack',network:{rackUnits:42,deviceType:'rack'}})]},
  {id:'org-chart',name:'Org Chart',family:'org-chart',category:'Business',description:'Editable organization chart',seeds:[seed('lead','person','rectangle',360,60,180,80,'Director'),seed('a','person','rectangle',160,240,180,80,'Team A'),seed('b','person','rectangle',560,240,180,80,'Team B')]},
  {id:'mind-map',name:'Mind Map',family:'mind-map',category:'Business',description:'Editable mind map',seeds:[seed('root','topic','ellipse',360,200,180,90,'Topic'),seed('a','topic','ellipse',80,80,160,70,'Branch A'),seed('b','topic','ellipse',700,80,160,70,'Branch B')]},
  {id:'timeline',name:'Timeline',family:'timeline',category:'Planning',description:'Editable milestones',seeds:[seed('m1','milestone','diamond',120,180,70,70,'M1'),seed('m2','milestone','diamond',420,180,70,70,'M2'),seed('m3','milestone','diamond',720,180,70,70,'M3')]},
  {id:'pert',name:'PERT',family:'pert',category:'Planning',description:'PERT dependency starter',seeds:[seed('a','activity','rectangle',80,100,150,70,'Activity A'),seed('b','activity','rectangle',360,100,150,70,'Activity B'),seed('c','activity','rectangle',640,100,150,70,'Activity C')]},
  {id:'gantt',name:'Gantt',family:'gantt',category:'Planning',description:'Gantt-like editable bars',seeds:[seed('a','task','rectangle',220,80,320,48,'Task A'),seed('b','task','rectangle',360,150,380,48,'Task B')]},
  {id:'floor-plan',name:'Floor Plan Basics',family:'floor-plan',category:'Engineering',description:'Walls/rooms starter',seeds:[seed('room','room','rectangle',100,80,600,400,'Room')]},
  {id:'electrical',name:'Electrical Basic',family:'electrical',category:'Engineering',description:'Electrical symbols starter',seeds:[seed('supply','supply','icon',100,120,100,70,'Supply'),seed('load','load','icon',480,120,100,70,'Load')]},
  {id:'engineering',name:'Engineering Basic',family:'engineering',category:'Engineering',description:'Generic engineering stencil starter',seeds:[seed('unit','unit','rectangle',250,100,260,160,'Engineering Unit')]},
] as DrawTemplateDefinition[]);

export function instantiateDrawTemplate(
  model: DrawDocumentModel,
  templateId: string,
  pageId: DrawPageId,
  layerId: string,
  idPrefix: string,
): DrawDocumentModel {
  assertDrawDocument(model);
  const definition = BUILTIN_DRAW_TEMPLATES.find((candidate) => candidate.id === templateId);
  if (!definition) throw new DrawModelError('template-missing');
  const prefix = safeId(idPrefix, 'template-prefix-invalid');
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('template-page-missing');
  if (!page.layerIds.includes(layerId)) throw new DrawModelError('template-layer-missing');
  if (Object.keys(model.objects).length + definition.seeds.length > MAX_OBJECTS) throw new DrawModelError('template-object-limit');

  const ids = new Set<string>();
  for (const templateSeed of definition.seeds) {
    const id = safeId(`${prefix}-${templateSeed.key}`, 'template-object-id-invalid');
    if (ids.has(id) || Object.hasOwn(model.objects, id)) throw new DrawModelError('template-object-id-conflict');
    ids.add(id);
  }

  const firstZIndex = Object.values(model.objects).reduce((highest, object) => Math.max(highest, object.zIndex), -1) + 1;
  const objects = definition.seeds.map((templateSeed, index) => {
    const object = createVectorShape({
      id: `${prefix}-${templateSeed.key}`,
      pageId,
      layerId,
      name: templateSeed.text,
      x: templateSeed.x,
      y: templateSeed.y,
      width: templateSeed.width,
      height: templateSeed.height,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      locked: false,
      zIndex: firstZIndex + index,
      diagram: templateSeed.metadata
        ? copyDiagramMetadata(templateSeed.metadata)
        : { family: definition.family, role: templateSeed.role },
      vector: {
        kind: templateSeed.shape === 'line' ? 'line'
          : templateSeed.shape === 'ellipse' ? 'ellipse'
            : templateSeed.shape === 'diamond' ? 'polygon'
              : templateSeed.shape === 'icon' ? 'icon' : 'rectangle',
        iconName: templateSeed.shape === 'icon' ? templateSeed.role : undefined,
      },
    });
    assertDrawObject(object, object.id);
    return object;
  });

  return transactDraw(model, (draft) => {
    const targetPage = draft.pages.find((candidate) => candidate.id === pageId);
    if (!targetPage || !targetPage.layerIds.includes(layerId)) throw new DrawModelError('template-target-invalid');
    for (const object of objects) {
      if (Object.hasOwn(draft.objects, object.id)) throw new DrawModelError('template-object-id-conflict');
      draft.objects[object.id] = object;
      targetPage.objectIds.push(object.id);
    }
    // Container seeds become groups over their members. Validated here so a malformed catalogue
    // (unknown member key, a container inside a container) fails closed instead of half-applying.
    definition.seeds.forEach((templateSeed, index) => {
      if (!templateSeed.container) return;
      const members = [...templateSeed.container];
      if (members.length === 0 || new Set(members).size !== members.length) throw new DrawModelError('template-container-invalid');
      const memberIds: string[] = [];
      for (const key of members) {
        const memberSeed = definition.seeds.find((candidate) => candidate.key === key);
        if (!memberSeed || memberSeed.container) throw new DrawModelError('template-container-member-invalid');
        memberIds.push(`${prefix}-${key}`);
      }
      const box = objects[index]!;
      const group: DrawObject = {
        id: box.id,
        pageId,
        layerId,
        type: 'group',
        name: templateSeed.text,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        locked: false,
        zIndex: box.zIndex,
        childIds: memberIds,
      };
      assertDrawObject(group, group.id);
      draft.objects[group.id] = group;
      for (const memberId of memberIds) {
        const member = draft.objects[memberId];
        if (!member) throw new DrawModelError('template-container-member-invalid');
        member.parentGroupId = group.id;
      }
    });
  });
}
