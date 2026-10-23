// STATUS: PLATIN
// Astraea Whiteboard bounded diagram model, routing, presets and deterministic auto-layout.

import { secureRandomId } from '../../../shared/crypto/secureRandom';
import type {
  WhiteboardConnectorRoute,
  WhiteboardDiagramData,
  WhiteboardDiagramFamily,
  WhiteboardDiagramKind,
  WhiteboardIconName,
  WhiteboardShapeKind,
} from '../../../shared/contracts/workspace';
import type { WhiteboardItem } from '../types';
import { resolveWhiteboardConnectorPoint } from './whiteboardManipulationEngine';
import { clampCoordinate, clampDimension, WHITEBOARD_MAX_ITEMS } from '../viewport/whiteboardViewportEngine';

export const WHITEBOARD_DIAGRAM_MAX_FIELDS = 64;
export const WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES = 5_000;
export const WHITEBOARD_DIAGRAM_MAX_LAYOUT_SELECTION = 5_000;
export const WHITEBOARD_DIAGRAM_MAX_LAYOUT_EDGES = 20_000;
export const WHITEBOARD_DIAGRAM_MAX_ROUTING_OBSTACLES = 2_000;
export const WHITEBOARD_DIAGRAM_MAX_ROUTE_CHECKS = 100_000;

const FAMILIES: WhiteboardDiagramFamily[] = ['flowchart','uml','network','org-chart','mind-map','erd','swimlane','process-map','journey-map'];
const KINDS: WhiteboardDiagramKind[] = ['process','decision','terminal','uml-class','uml-interface','uml-actor','network-node','org-person','mind-topic','entity','swimlane','process-step','journey-stage'];
const ROUTES: WhiteboardConnectorRoute[] = ['straight','orthogonal','curved'];
const PRESETS = ['flowchart','uml','network','org-chart','mind-map','erd','swimlane','process-map','journey-map'] as const;
const LAYOUT_MODES = ['tree-horizontal','tree-vertical','graph'] as const;
const clean = (value: unknown, max = 512): string => typeof value === 'string'
  ? value.slice(0, max).replace(/\0/g, '')
  : '';
const id = (prefix: string) => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? `${prefix}-${crypto.randomUUID()}`
  : secureRandomId(prefix);

export type WhiteboardDiagramPreset = typeof PRESETS[number];
export type WhiteboardDiagramLayoutMode = typeof LAYOUT_MODES[number];

interface NodeSpec {
  family: WhiteboardDiagramFamily;
  kind: WhiteboardDiagramKind;
  title: string;
  subtitle?: string;
  fields?: string[];
  type?: 'shape' | 'icon' | 'table';
  shape?: WhiteboardShapeKind;
  icon?: WhiteboardIconName;
  width?: number;
  height?: number;
  x: number;
  y: number;
  lane?: string;
  stage?: string;
  zIndex?: number;
}

export interface WhiteboardConnectorPath {
  path: string;
  labelX: number;
  labelY: number;
  route: WhiteboardConnectorRoute;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /**
   * Bounds of this routed connector as the routing engine itself computed it: the convex-hull box of
   * every point the path can reach plus the label box. Consumers (canvas export, SVG export) must use
   * this instead of re-deriving endpoints — that is what kept a second, divergent connector geometry
   * alive in the raster exporter.
   */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Half extents of the routed connector label box; shared by every connector renderer/export. */
export const WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH = 32;
export const WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT = 12;

function pathBounds(
  points: ReadonlyArray<{ x: number; y: number }>,
  labelX: number,
  labelY: number,
  hasLabel: boolean,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (hasLabel) {
    minX = Math.min(minX, labelX - WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH);
    maxX = Math.max(maxX, labelX + WHITEBOARD_CONNECTOR_LABEL_HALF_WIDTH);
    minY = Math.min(minY, labelY - WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT);
    maxY = Math.max(maxY, labelY + WHITEBOARD_CONNECTOR_LABEL_HALF_HEIGHT);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return { minX, minY, maxX, maxY };
}

function cleanFields(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const count = Math.min(value.length, WHITEBOARD_DIAGRAM_MAX_FIELDS);
  const fields: string[] = [];
  for (let index = 0; index < count; index += 1) fields.push(clean(value[index], 300));
  return fields;
}

function boundedIds(ids: readonly string[]): Set<string> {
  const selected = new Set<string>();
  const count = Math.min(ids.length, WHITEBOARD_DIAGRAM_MAX_LAYOUT_SELECTION);
  for (let index = 0; index < count; index += 1) {
    if (typeof ids[index] === 'string') selected.add(ids[index]);
  }
  return selected;
}

export function normalizeWhiteboardDiagramItem(item: WhiteboardItem): WhiteboardItem {
  const diagram = item.diagram && FAMILIES.includes(item.diagram.family) && KINDS.includes(item.diagram.kind)
    ? {
        family: item.diagram.family,
        kind: item.diagram.kind,
        title: clean(item.diagram.title, 240),
        subtitle: clean(item.diagram.subtitle, 500) || undefined,
        fields: cleanFields(item.diagram.fields),
        lane: clean(item.diagram.lane, 120) || undefined,
        stage: clean(item.diagram.stage, 120) || undefined,
      }
    : undefined;
  const requestedRoute = item.connectorStyle?.route;
  const connectorStyle = item.type === 'connector'
    ? {
        route: requestedRoute === 'straight' || requestedRoute === 'orthogonal' || requestedRoute === 'curved' ? requestedRoute : 'curved',
        autoRoute: item.connectorStyle?.autoRoute !== false,
      }
    : undefined;
  return {
    ...item,
    diagram,
    connectorStyle,
    lineLabel: item.lineLabel === undefined ? undefined : clean(item.lineLabel, 200),
  };
}

function createNode(spec: NodeSpec, originX: number, originY: number): WhiteboardItem {
  const type = spec.type ?? 'shape';
  const diagram: WhiteboardDiagramData = {
    family: spec.family,
    kind: spec.kind,
    title: clean(spec.title, 240),
    subtitle: spec.subtitle ? clean(spec.subtitle, 500) : undefined,
    fields: cleanFields(spec.fields),
    lane: spec.lane,
    stage: spec.stage,
  };
  const base: WhiteboardItem = {
    id: id(`wb-${spec.family}`),
    type,
    x: clampCoordinate(originX + spec.x),
    y: clampCoordinate(originY + spec.y),
    width: clampDimension(spec.width ?? 190),
    height: clampDimension(spec.height ?? 100),
    text: diagram.title,
    diagram,
    zIndex: spec.zIndex ?? 10,
  };
  if (type === 'icon') {
    base.icon = { name: spec.icon ?? 'server', label: diagram.title };
  } else if (type === 'table') {
    base.table = {
      columns: ['Field', 'Type'],
      rows: (diagram.fields ?? ['id: UUID']).map((field) => {
        const [name, ...rest] = field.split(':');
        return [name.trim(), rest.join(':').trim() || 'value'];
      }),
    };
  } else {
    base.shape = {
      kind: spec.shape ?? 'rounded-rectangle',
      fill: '#0f172a',
      stroke: spec.family === 'journey-map' ? '#f59e0b' : spec.family === 'uml' || spec.family === 'erd' ? '#a78bfa' : '#38bdf8',
      strokeWidth: 2,
    };
  }
  return base;
}

function createConnector(fromId: string, toId: string, label = '', route: WhiteboardConnectorRoute = 'orthogonal'): WhiteboardItem {
  return {
    id: id('wb-diagram-conn'),
    type: 'connector',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    text: '',
    fromId,
    toId,
    fromAnchor: 'auto',
    toAnchor: 'auto',
    lineLabel: clean(label, 200) || undefined,
    connectorStyle: { route, autoRoute: true },
    zIndex: 5,
  };
}

export function createWhiteboardDiagramPreset(preset: WhiteboardDiagramPreset, originX: number, originY: number): WhiteboardItem[] {
  if (!PRESETS.includes(preset)) throw new RangeError('Unsupported Whiteboard diagram preset.');
  const nodes: WhiteboardItem[] = [];
  const links: Array<[number, number, string?, WhiteboardConnectorRoute?]> = [];
  const add = (spec: NodeSpec) => { nodes.push(createNode(spec, originX, originY)); return nodes.length - 1; };

  if (preset === 'flowchart') {
    const start = add({family:'flowchart',kind:'terminal',title:'Start',shape:'rounded-rectangle',x:0,y:0,width:150,height:70});
    const process = add({family:'flowchart',kind:'process',title:'Process',shape:'rectangle',x:260,y:0,width:180,height:90});
    const decision = add({family:'flowchart',kind:'decision',title:'Decision?',shape:'diamond',x:540,y:-5,width:150,height:110});
    const end = add({family:'flowchart',kind:'terminal',title:'End',shape:'rounded-rectangle',x:800,y:0,width:150,height:70});
    links.push([start,process,''],[process,decision,''],[decision,end,'Yes']);
  } else if (preset === 'uml') {
    const service = add({family:'uml',kind:'uml-class',title:'WorkspaceService',subtitle:'<<service>>',fields:['- repository: Repository','+ open(id): Document','+ save(doc): void'],x:0,y:0,width:250,height:180});
    const contract = add({family:'uml',kind:'uml-interface',title:'Repository',subtitle:'<<interface>>',fields:['+ load(id): Document','+ persist(doc): void'],x:380,y:0,width:240,height:160});
    const actor = add({family:'uml',kind:'uml-actor',title:'User',subtitle:'Actor',x:-260,y:40,width:150,height:100});
    links.push([actor,service,'uses'],[service,contract,'implements']);
  } else if (preset === 'network') {
    const user = add({family:'network',kind:'network-node',title:'Client',type:'icon',icon:'user',x:0,y:80,width:140,height:120});
    const gateway = add({family:'network',kind:'network-node',title:'Gateway',type:'icon',icon:'shield',x:260,y:80,width:150,height:120});
    const app = add({family:'network',kind:'network-node',title:'App Server',type:'icon',icon:'server',x:530,y:0,width:150,height:120});
    const db = add({family:'network',kind:'network-node',title:'Database',type:'icon',icon:'database',x:530,y:190,width:150,height:120});
    links.push([user,gateway,'TLS'],[gateway,app,'HTTPS'],[app,db,'SQL']);
  } else if (preset === 'org-chart') {
    const root = add({family:'org-chart',kind:'org-person',title:'CEO',subtitle:'Leadership',x:320,y:0,width:180,height:95});
    const a = add({family:'org-chart',kind:'org-person',title:'Engineering',subtitle:'VP Engineering',x:0,y:190,width:210,height:100});
    const b = add({family:'org-chart',kind:'org-person',title:'Product',subtitle:'VP Product',x:300,y:190,width:210,height:100});
    const c = add({family:'org-chart',kind:'org-person',title:'Operations',subtitle:'VP Operations',x:600,y:190,width:210,height:100});
    links.push([root,a],[root,b],[root,c]);
  } else if (preset === 'mind-map') {
    const root = add({family:'mind-map',kind:'mind-topic',title:'Central idea',x:320,y:140,width:220,height:100});
    const labels = [['Research',0,0],['Design',0,300],['Build',650,0],['Validate',650,300]] as const;
    labels.forEach(([title,x,y]) => { const child=add({family:'mind-map',kind:'mind-topic',title,x,y,width:180,height:85}); links.push([root,child]); });
  } else if (preset === 'erd') {
    const users = add({family:'erd',kind:'entity',title:'users',type:'table',fields:['id: uuid','org_id: uuid','email: text'],x:0,y:0,width:250,height:190});
    const orgs = add({family:'erd',kind:'entity',title:'organizations',type:'table',fields:['id: uuid','name: text'],x:420,y:0,width:250,height:170});
    const projects = add({family:'erd',kind:'entity',title:'projects',type:'table',fields:['id: uuid','org_id: uuid','owner_id: uuid'],x:420,y:260,width:250,height:190});
    links.push([users,orgs,'N:1'],[projects,orgs,'N:1'],[projects,users,'N:1']);
  } else if (preset === 'swimlane') {
    const laneA = add({family:'swimlane',kind:'swimlane',title:'Customer',lane:'Customer',x:0,y:0,width:900,height:170,zIndex:1});
    const laneB = add({family:'swimlane',kind:'swimlane',title:'Operations',lane:'Operations',x:0,y:200,width:900,height:170,zIndex:1});
    const request = add({family:'swimlane',kind:'process-step',title:'Submit request',lane:'Customer',x:120,y:45,width:180,height:80,zIndex:10});
    const review = add({family:'swimlane',kind:'process-step',title:'Review',lane:'Operations',x:380,y:245,width:180,height:80,zIndex:10});
    const confirm = add({family:'swimlane',kind:'process-step',title:'Confirmation',lane:'Customer',x:650,y:45,width:180,height:80,zIndex:10});
    nodes[request].constraints = { keepInsideFrameId: undefined };
    void laneA; void laneB;
    links.push([request,review,'handoff'],[review,confirm,'approved']);
  } else if (preset === 'process-map') {
    const titles = ['Intake','Validate','Execute','Review','Complete'];
    let prev = -1;
    titles.forEach((title,index) => { const cur=add({family:'process-map',kind:'process-step',title,stage:`Step ${index+1}`,x:index*240,y:index%2?80:0,width:170,height:90}); if(prev>=0) links.push([prev,cur,index===2?'control':'']); prev=cur; });
  } else if (preset === 'journey-map') {
    const stages = ['Discover','Evaluate','Adopt','Use','Renew'];
    let prev = -1;
    stages.forEach((title,index) => { const cur=add({family:'journey-map',kind:'journey-stage',title,stage:`Stage ${index+1}`,subtitle:index===0?'Awareness':index===4?'Retention':'Experience',x:index*225,y:0,width:190,height:130}); if(prev>=0) links.push([prev,cur,'next','curved']); prev=cur; });
  }
  return [...nodes, ...links.map(([from,to,label,route]) => createConnector(nodes[from].id,nodes[to].id,label,route))];
}


function segmentHitsRect(a: {x:number;y:number}, b: {x:number;y:number}, item: WhiteboardItem): boolean {
  if (a.x === b.x) {
    const minY=Math.min(a.y,b.y), maxY=Math.max(a.y,b.y);
    return a.x > item.x-18 && a.x < item.x+item.width+18 && maxY > item.y-18 && minY < item.y+item.height+18;
  }
  if (a.y === b.y) {
    const minX=Math.min(a.x,b.x), maxX=Math.max(a.x,b.x);
    return a.y > item.y-18 && a.y < item.y+item.height+18 && maxX > item.x-18 && minX < item.x+item.width+18;
  }
  return false;
}

interface RoutingContext {
  itemsById: ReadonlyMap<string, WhiteboardItem>;
  obstacles: WhiteboardItem[];
}

interface RouteWorkBudget {
  remaining: number;
}

function createRoutingContext(items: readonly WhiteboardItem[]): RoutingContext {
  const itemsById = new Map<string, WhiteboardItem>();
  const obstacles: WhiteboardItem[] = [];
  const inputCount = Math.min(items.length, WHITEBOARD_MAX_ITEMS);
  for (let index = 0; index < inputCount; index += 1) {
    const item = items[index];
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string') continue;
    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    if (item.type !== 'connector' && !item.hidden && hasFiniteGeometry(item) && obstacles.length < WHITEBOARD_DIAGRAM_MAX_ROUTING_OBSTACLES) obstacles.push(item);
  }
  return { itemsById, obstacles };
}

function hasFiniteGeometry(item: WhiteboardItem): boolean {
  return Number.isFinite(item.x) && Number.isFinite(item.y) && Number.isFinite(item.width) && Number.isFinite(item.height)
    && item.width >= 0 && item.height >= 0 && Number.isFinite(item.x + item.width) && Number.isFinite(item.y + item.height);
}

function resolveConnectorEndpoints(connector: WhiteboardItem, context: RoutingContext) {
  if (connector.type !== 'connector') return null;
  if (typeof connector.fromId !== 'string' || connector.fromId.length === 0 || typeof connector.toId !== 'string' || connector.toId.length === 0) return null;
  const fromItem = context.itemsById.get(connector.fromId);
  const toItem = context.itemsById.get(connector.toId);
  if (!fromItem || !toItem || fromItem.hidden || toItem.hidden || !hasFiniteGeometry(fromItem) || !hasFiniteGeometry(toItem)) return null;
  const fromCenter = { x: fromItem.x + fromItem.width / 2, y: fromItem.y + fromItem.height / 2 };
  const toCenter = { x: toItem.x + toItem.width / 2, y: toItem.y + toItem.height / 2 };
  return {
    from: resolveWhiteboardConnectorPoint(fromItem, connector.fromAnchor, toCenter),
    to: resolveWhiteboardConnectorPoint(toItem, connector.toAnchor, fromCenter),
  };
}

function orthogonalPoints(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: WhiteboardItem[],
  budget: RouteWorkBudget,
  sourceId: string | undefined,
  targetId: string | undefined,
): Array<{x:number;y:number}> {
  const candidates = [
    [from,{x:(from.x+to.x)/2,y:from.y},{x:(from.x+to.x)/2,y:to.y},to],
    [from,{x:from.x,y:(from.y+to.y)/2},{x:to.x,y:(from.y+to.y)/2},to],
  ];
  const score = (points:Array<{x:number;y:number}>) => {
    let total = 0;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
      for (const obstacle of obstacles) {
        if (obstacle.id === sourceId || obstacle.id === targetId) continue;
        if (budget.remaining <= 0) return total;
        budget.remaining -= 1;
        if (segmentHitsRect(points[pointIndex], points[pointIndex + 1], obstacle)) total += 1;
      }
    }
    return total;
  };
  let best=candidates[0], bestScore=score(best);
  if (budget.remaining <= 0) return best;
  const secondScore=score(candidates[1]); if(secondScore<bestScore){best=candidates[1];bestScore=secondScore;}
  if(bestScore===0) return best;
  const margin=64;
  const xs=obstacles.flatMap(o=>[o.x-margin,o.x+o.width+margin]);
  const ys=obstacles.flatMap(o=>[o.y-margin,o.y+o.height+margin]);
  const detours:Array<Array<{x:number;y:number}>>=[];
  for(const x of xs.slice(0,128)) detours.push([from,{x,y:from.y},{x,y:to.y},to]);
  for(const y of ys.slice(0,128)) detours.push([from,{x:from.x,y},{x:to.x,y},to]);
  for(const candidate of detours){if(budget.remaining<=0)break;const s=score(candidate); if(s<bestScore){best=candidate;bestScore=s;if(s===0)break;}}
  return best;
}

function buildConnectorPath(connector: WhiteboardItem, context: RoutingContext, budget: RouteWorkBudget): WhiteboardConnectorPath | null {
  const endpoints = resolveConnectorEndpoints(connector, context);
  if (!endpoints) return null;
  const { from, to } = endpoints;
  const requestedRoute = connector.connectorStyle?.route;
  const route: WhiteboardConnectorRoute = requestedRoute === 'straight' || requestedRoute === 'orthogonal' || requestedRoute === 'curved'
    ? requestedRoute
    : 'curved';
  const hasLabel = Boolean(connector.lineLabel);
  if (route === 'straight') {
    const labelX = (from.x + to.x) / 2;
    const labelY = (from.y + to.y) / 2 - 8;
    return { path: `M ${from.x} ${from.y} L ${to.x} ${to.y}`, labelX, labelY, route, from, to, bounds: pathBounds([from, to], labelX, labelY, hasLabel) };
  }
  if (route === 'curved') {
    const dx=to.x-from.x, dy=to.y-from.y;
    const distance=Math.max(36,Math.min(220,Math.hypot(dx,dy)*.35));
    const vector=(anchor:string)=>anchor==='left'?[-distance,0]:anchor==='right'?[distance,0]:anchor==='top'?[0,-distance]:[0,distance];
    const [fx,fy]=vector(from.anchor),[tx,ty]=vector(to.anchor);
    const c1={x:from.x+fx,y:from.y+fy},c2={x:to.x+tx,y:to.y+ty};
    const labelX=(from.x+to.x+c1.x+c2.x)/4;
    const labelY=(from.y+to.y+c1.y+c2.y)/4-8;
    // The hull of the four control points contains the whole cubic segment, so it is a safe bound.
    return { path: `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`, labelX, labelY, route, from, to, bounds: pathBounds([from, c1, c2, to], labelX, labelY, hasLabel) };
  }
  const sourceId=connector.fromId,targetId=connector.toId;
  const obstacles=connector.connectorStyle?.autoRoute===false?[]:context.obstacles;
  const pts=orthogonalPoints(from,to,obstacles,budget,sourceId,targetId);
  const path=pts.map((point,index)=>`${index===0?'M':'L'} ${Math.round(point.x)} ${Math.round(point.y)}`).join(' ');
  const middle=pts[Math.floor(pts.length/2)] ?? {x:(from.x+to.x)/2,y:(from.y+to.y)/2};
  const labelX = middle.x;
  const labelY = middle.y - 8;
  return { path, labelX, labelY, route, from, to, bounds: pathBounds(pts, labelX, labelY, hasLabel) };
}

export function buildWhiteboardConnectorPath(connector: WhiteboardItem, items: readonly WhiteboardItem[]): WhiteboardConnectorPath | null {
  return buildConnectorPath(connector, createRoutingContext(items), { remaining: WHITEBOARD_DIAGRAM_MAX_ROUTE_CHECKS });
}

export function buildWhiteboardConnectorPaths(items: readonly WhiteboardItem[]): ReadonlyMap<string, WhiteboardConnectorPath> {  const context = createRoutingContext(items);
  const paths = new Map<string, WhiteboardConnectorPath>();
  const budget: RouteWorkBudget = { remaining: WHITEBOARD_DIAGRAM_MAX_ROUTE_CHECKS };
  const inputCount = Math.min(items.length, WHITEBOARD_MAX_ITEMS);
  for (let index = 0; index < inputCount; index += 1) {
    const connector = items[index];
    if (!connector || typeof connector !== 'object') continue;
    if (connector.type !== 'connector' || connector.hidden) continue;
    const path = buildConnectorPath(connector, context, budget);
    if (path) paths.set(connector.id, path);
  }
  return paths;
}

export const WHITEBOARD_MINDMAP_MAX_CHILDREN_PER_NODE = 32;
export const WHITEBOARD_MINDMAP_CHILD_TITLE = 'New topic';

export interface WhiteboardMindMapChildResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly items: WhiteboardItem[];
  readonly newNodeId?: string;
  readonly connectorId?: string;
}

/**
 * Adds one mind-map child node to an existing node and connects it to its parent.
 *
 * This is the missing keyboard-authoring path of "Mindmap-Verbindungen": before it existed, a mind map
 * could only be created as a whole preset, and no pointer or keyboard action could extend an existing
 * node. The child is placed deterministically next to the parent (alternating sides, stacking per row)
 * and the parent/child structure — the canonical connector with `fromId`/`toId` — is preserved, so the
 * existing auto-layout keeps working on the result.
 */
export function addWhiteboardMindMapChild(
  items: WhiteboardItem[],
  parentId: string,
  options: { title?: string } = {},
): WhiteboardMindMapChildResult {
  if (!Array.isArray(items)) return { ok: false, reason: 'Board items must be a canonical array.', items: [] };
  if (items.length >= WHITEBOARD_MAX_ITEMS) return { ok: false, reason: 'Board object ceiling reached.', items };
  const parent = items.find((item) => item.id === parentId);
  if (!parent || parent.type === 'connector') return { ok: false, reason: 'Select a node before adding a child node.', items };
  const childCount = items.reduce((count, item) => count + (
    item.type === 'connector' && (item.fromId === parentId || item.toId === parentId) ? 1 : 0
  ), 0);
  if (childCount >= WHITEBOARD_MINDMAP_MAX_CHILDREN_PER_NODE) {
    return { ok: false, reason: `A node cannot hold more than ${WHITEBOARD_MINDMAP_MAX_CHILDREN_PER_NODE} children.`, items };
  }
  const title = clean(options.title, 240) || WHITEBOARD_MINDMAP_CHILD_TITLE;
  const right = childCount % 2 === 0;
  const row = Math.floor(childCount / 2);
  const width = 180;
  const height = 85;
  const x = right ? parent.x + parent.width + 160 : parent.x - width - 160;
  const y = parent.y + row * 110;
  const child: WhiteboardItem = {
    id: id('wb-mind-node'),
    type: 'shape',
    x: clampCoordinate(x),
    y: clampCoordinate(y),
    width: clampDimension(width),
    height: clampDimension(height),
    text: title,
    diagram: { family: 'mind-map', kind: 'mind-topic', title },
    shape: { kind: 'rounded-rectangle', fill: '#0f172a', stroke: '#38bdf8', strokeWidth: 2 },
    zIndex: 10,
  };
  const connector = createConnector(parent.id, child.id, '', 'curved');
  return { ok: true, items: [...items, child, connector], newNodeId: child.id, connectorId: connector.id };
}

export function setWhiteboardConnectorRoute(items: WhiteboardItem[], ids: readonly string[], route: WhiteboardConnectorRoute, autoRoute = true): WhiteboardItem[] {
  if (!ROUTES.includes(route)) throw new RangeError('Unsupported Whiteboard connector route.');
  if (typeof autoRoute !== 'boolean') throw new TypeError('Connector auto-route flag must be boolean.');
  const selected=boundedIds(ids);
  return items.map(item=>item.type==='connector'&&selected.has(item.id)?{...item,connectorStyle:{route,autoRoute}}:item);
}

export function setWhiteboardConnectorLabel(items: WhiteboardItem[], ids: readonly string[], label: string): WhiteboardItem[] {
  const selected=boundedIds(ids); const value=clean(label,200) || undefined;
  return items.map(item=>item.type==='connector'&&selected.has(item.id)?{...item,lineLabel:value}:item);
}

export function autoLayoutWhiteboardDiagram(items: WhiteboardItem[], selectedIds: readonly string[], mode: WhiteboardDiagramLayoutMode): WhiteboardItem[] {
  if (!LAYOUT_MODES.includes(mode)) throw new RangeError('Unsupported Whiteboard diagram layout mode.');
  const selected = boundedIds(selectedIds);
  const nodes: WhiteboardItem[] = [];
  const inputCount = Math.min(items.length, WHITEBOARD_MAX_ITEMS);
  for (let index = 0; index < inputCount && nodes.length < WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES; index += 1) {
    const item = items[index];
    if (item.type !== 'connector' && item.diagram && !item.locked && (selected.size === 0 || selected.has(item.id))) nodes.push(item);
  }
  if(nodes.length<2) return items;
  const nodeIds=new Set(nodes.map(n=>n.id));
  const edges: WhiteboardItem[] = [];
  for (let index = 0; index < inputCount && edges.length < WHITEBOARD_DIAGRAM_MAX_LAYOUT_EDGES; index += 1) {
    const item = items[index];
    if (item.type === 'connector' && item.fromId && item.toId && nodeIds.has(item.fromId) && nodeIds.has(item.toId)) edges.push(item);
  }
  const incoming=new Map(nodes.map(n=>[n.id,0])); const children=new Map(nodes.map(n=>[n.id,[] as string[]]));
  for(const edge of edges){const fromId=edge.fromId,toId=edge.toId;if(!fromId||!toId)continue;incoming.set(toId,(incoming.get(toId)??0)+1);children.get(fromId)?.push(toId);}
  const levels=new Map<string,number>(); const queue=nodes.filter(n=>(incoming.get(n.id)??0)===0).sort((a,b)=>a.id.localeCompare(b.id)).map(n=>n.id);
  if(queue.length===0) queue.push(nodes.slice().sort((a,b)=>a.id.localeCompare(b.id))[0].id);
  for(const root of queue) levels.set(root,0);
  let cursor=0;
  while(cursor<queue.length&&cursor<WHITEBOARD_DIAGRAM_MAX_LAYOUT_NODES){const current=queue[cursor++]; const level=levels.get(current)??0; for(const child of (children.get(current)??[]).sort()){const next=Math.max(levels.get(child)??0,level+1); if(!levels.has(child)){levels.set(child,next);queue.push(child);} else levels.set(child,next);}}
  for(const node of nodes) if(!levels.has(node.id)) levels.set(node.id,0);
  const byLevel=new Map<number,WhiteboardItem[]>(); for(const node of nodes){const level=levels.get(node.id)??0;(byLevel.get(level)??(byLevel.set(level,[]),byLevel.get(level)!)).push(node);}
  const minX=Math.min(...nodes.map(n=>n.x)), minY=Math.min(...nodes.map(n=>n.y));
  const horizontal=mode==='tree-horizontal';
  const positions=new Map<string,{x:number;y:number}>();
  for(const [level,group] of [...byLevel.entries()].sort((a,b)=>a[0]-b[0])){group.sort((a,b)=>a.id.localeCompare(b.id));group.forEach((node,index)=>{const major=level*300;const minor=index*180;positions.set(node.id,horizontal?{x:minX+major,y:minY+minor}:{x:minX+minor,y:minY+major});});}
  if(mode==='graph') {
    const ordered=[...nodes].sort((a,b)=>(levels.get(a.id)??0)-(levels.get(b.id)??0)||a.id.localeCompare(b.id));
    ordered.forEach((node,index)=>positions.set(node.id,{x:minX+(index%4)*280,y:minY+Math.floor(index/4)*190}));
  }
  return items.map(item=>{const pos=positions.get(item.id);return pos?{...item,x:clampCoordinate(pos.x),y:clampCoordinate(pos.y)}:item;});
}
