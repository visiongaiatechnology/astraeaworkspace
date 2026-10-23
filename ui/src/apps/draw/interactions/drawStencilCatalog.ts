// STATUS: PLATIN — built-in Draw shape library resolved through the canonical `searchStencils` rule.
import type {
  DrawDocumentModel, DrawObject, DrawShapeKind, DrawStencilDefinition, DrawStencilLibrary, DrawVectorStyle,
} from '../../../shared/contracts/draw/workspaceDraw';
import { DrawModelError, safeId } from '../model/drawDocumentValidation';
import { searchStencils } from '../model/drawDocumentEngine';
import { DEFAULT_DRAW_STYLE, createVectorFrame, createVectorShape } from '../model/drawVectorEngine';

export const BUILTIN_DRAW_STENCIL_LIBRARY_ID = 'draw-core-shapes';

interface ShapeSeed {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly kind: DrawShapeKind;
  readonly width: number;
  readonly height: number;
  readonly style?: Partial<DrawVectorStyle>;
  readonly role?: string;
  /** `frame` seeds become real `type: 'frame'` objects (see `createVectorFrame`) instead of shapes. */
  readonly objectType?: 'frame';
}

const SHAPES: readonly ShapeSeed[] = [
  { id: 'process', name: 'Process', category: 'Flowchart', tags: ['task', 'step', 'action', 'prozess'], kind: 'rectangle', width: 160, height: 80, role: 'process' },
  { id: 'decision', name: 'Decision', category: 'Flowchart', tags: ['if', 'branch', 'gateway', 'entscheidung'], kind: 'polygon', width: 140, height: 96, role: 'decision' },
  { id: 'terminator', name: 'Terminator', category: 'Flowchart', tags: ['start', 'end', 'stop', 'beginn'], kind: 'ellipse', width: 140, height: 72, role: 'terminator' },
  { id: 'data', name: 'Data', category: 'Flowchart', tags: ['input', 'output', 'io', 'daten'], kind: 'polygon', width: 160, height: 80, role: 'data' },
  { id: 'document', name: 'Document', category: 'Flowchart', tags: ['page', 'report', 'dokument'], kind: 'rectangle', width: 150, height: 90, role: 'document' },
  { id: 'database', name: 'Database', category: 'Flowchart', tags: ['store', 'cylinder', 'datenbank'], kind: 'ellipse', width: 120, height: 120, role: 'database' },
  { id: 'manual', name: 'Manual Operation', category: 'Flowchart', tags: ['human', 'manual', 'operator'], kind: 'polygon', width: 150, height: 80, role: 'manual' },
  { id: 'preparation', name: 'Preparation', category: 'Flowchart', tags: ['setup', 'prepare', 'vorbereitung'], kind: 'polygon', width: 150, height: 80, role: 'preparation' },
  { id: 'actor', name: 'Actor', category: 'UML', tags: ['user', 'person', 'akteur'], kind: 'icon', width: 64, height: 96, role: 'actor' },
  { id: 'class', name: 'Class', category: 'UML', tags: ['type', 'klasse', 'uml'], kind: 'rectangle', width: 200, height: 130, role: 'class' },
  { id: 'interface', name: 'Interface', category: 'UML', tags: ['contract', 'schnittstelle'], kind: 'rectangle', width: 200, height: 110, role: 'interface' },
  { id: 'component', name: 'Component', category: 'UML', tags: ['module', 'komponente'], kind: 'rectangle', width: 180, height: 110, role: 'component' },
  { id: 'note', name: 'Note', category: 'UML', tags: ['comment', 'annotation', 'notiz'], kind: 'polygon', width: 160, height: 90, role: 'note' },
  { id: 'entity', name: 'Entity', category: 'ERD', tags: ['table', 'relation', 'entität'], kind: 'rectangle', width: 240, height: 160, role: 'entity' },
  { id: 'weak-entity', name: 'Weak Entity', category: 'ERD', tags: ['dependent', 'schwach'], kind: 'rectangle', width: 240, height: 160, role: 'weak-entity' },
  { id: 'router', name: 'Router', category: 'Network', tags: ['edge', 'gateway', 'router'], kind: 'icon', width: 130, height: 90, role: 'router' },
  { id: 'switch', name: 'Switch', category: 'Network', tags: ['lan', 'switch'], kind: 'icon', width: 160, height: 80, role: 'switch' },
  { id: 'firewall', name: 'Firewall', category: 'Network', tags: ['security', 'dmz', 'firewall'], kind: 'icon', width: 130, height: 90, role: 'firewall' },
  { id: 'server', name: 'Server', category: 'Network', tags: ['host', 'service', 'server'], kind: 'icon', width: 130, height: 90, role: 'server' },
  { id: 'cloud', name: 'Cloud', category: 'Network', tags: ['wan', 'internet', 'cloud'], kind: 'icon', width: 150, height: 96, role: 'cloud' },
  { id: 'subnet', name: 'Subnet', category: 'Network', tags: ['zone', 'vlan', 'subnetz'], kind: 'rectangle', width: 320, height: 200, role: 'subnet', style: { fill: '#0f172a', stroke: '#64748b', strokeWidth: 1, dash: [6, 4], cornerRadius: 8 } },
  { id: 'lane', name: 'Swimlane', category: 'Process', tags: ['lane', 'pool', 'swimlane', 'spur'], kind: 'rectangle', width: 900, height: 180, role: 'lane', style: { fill: '#0b1220', stroke: '#475569', strokeWidth: 1, cornerRadius: 4 } },
  { id: 'milestone', name: 'Milestone', category: 'Planning', tags: ['timeline', 'goal', 'meilenstein'], kind: 'polygon', width: 80, height: 80, role: 'milestone' },
  { id: 'text', name: 'Text', category: 'Basic', tags: ['label', 'text', 'beschriftung'], kind: 'text', width: 160, height: 48, role: 'text', style: { fill: 'none', stroke: 'none', strokeWidth: 0 } },
  { id: 'rect', name: 'Rectangle', category: 'Basic', tags: ['box', 'rectangle', 'rechteck'], kind: 'rectangle', width: 160, height: 90, role: 'rectangle' },
  { id: 'ellipse', name: 'Ellipse', category: 'Basic', tags: ['circle', 'oval', 'ellipse'], kind: 'ellipse', width: 140, height: 100, role: 'ellipse' },
  { id: 'star', name: 'Star', category: 'Basic', tags: ['star', 'stern', 'badge'], kind: 'star', width: 110, height: 110, role: 'star' },
  { id: 'callout', name: 'Callout', category: 'Basic', tags: ['speech', 'bubble', 'sprechblase'], kind: 'callout', width: 170, height: 100, role: 'callout' },
  { id: 'arrow-shape', name: 'Arrow', category: 'Basic', tags: ['arrow', 'pfeil', 'direction'], kind: 'arrow', width: 170, height: 70, role: 'arrow' },
  { id: 'line-shape', name: 'Line', category: 'Basic', tags: ['line', 'linie', 'connector'], kind: 'line', width: 170, height: 2, role: 'line' },
  { id: 'frame', name: 'Frame', category: 'Container', tags: ['container', 'frame', 'rahmen'], kind: 'rectangle', width: 420, height: 300, role: 'frame', objectType: 'frame', style: { fill: 'none', stroke: '#64748b', strokeWidth: 1, dash: [8, 6], cornerRadius: 6 } },
];

function stencilFromSeed(seed: ShapeSeed): DrawStencilDefinition {
  const template: Omit<DrawObject, 'id' | 'pageId' | 'layerId' | 'zIndex'> = {
    type: seed.objectType === 'frame' ? 'frame' : 'shape',
    name: seed.name,
    x: 0,
    y: 0,
    width: seed.width,
    height: seed.height,
    rotation: 0,
    flipX: false,
    flipY: false,
    opacity: 1,
    locked: false,
    diagram: seed.role ? { family: 'flowchart', role: seed.role } : undefined,
    richText: {
      runs: [{ text: seed.name }],
      autoFit: 'shrink',
      padding: { top: 8, right: 8, bottom: 8, left: 8 },
      verticalAlign: 'middle',
      rotation: 0,
    },
    vector: {
      kind: seed.kind,
      style: { ...DEFAULT_DRAW_STYLE, ...(seed.style ?? {}) },
      iconName: seed.kind === 'icon' ? seed.role : undefined,
    },
  };
  return {
    id: `${BUILTIN_DRAW_STENCIL_LIBRARY_ID}:${seed.id}`,
    libraryId: BUILTIN_DRAW_STENCIL_LIBRARY_ID,
    category: seed.category,
    name: seed.name,
    tags: [...seed.tags],
    objectTemplate: template,
  };
}

export const BUILTIN_DRAW_STENCIL_LIBRARY: DrawStencilLibrary = Object.freeze({
  id: BUILTIN_DRAW_STENCIL_LIBRARY_ID,
  name: 'Astraea Core Shapes',
  version: 1,
  stencils: Object.freeze(SHAPES.map(stencilFromSeed)),
}) as DrawStencilLibrary;

/**
 * Searches the built-in library **and** document libraries through the canonical `searchStencils`
 * rule: the document is presented as a bounded view that includes the built-in library, so there is
 * exactly one matching implementation.
 */
export function searchDrawShapes(model: DrawDocumentModel, query: string, category?: string): DrawStencilDefinition[] {
  const view: DrawDocumentModel = {
    ...model,
    stencils: [BUILTIN_DRAW_STENCIL_LIBRARY, ...model.stencils.filter((library) => library.id !== BUILTIN_DRAW_STENCIL_LIBRARY_ID)],
  };
  return searchStencils(view, query, category);
}

export function listDrawShapeCategories(): string[] {
  return [...new Set(BUILTIN_DRAW_STENCIL_LIBRARY.stencils.map((stencil) => stencil.category))].sort();
}

export function findDrawStencil(model: DrawDocumentModel, stencilId: string): DrawStencilDefinition {
  safeId(stencilId, 'stencil-id-invalid');
  const found = searchDrawShapes(model, '').find((stencil) => stencil.id === stencilId);
  if (!found) throw new DrawModelError('stencil-missing');
  return found;
}

/**
 * Instantiates a stencil at a page position. Geometry, style and rich text all come from the stencil
 * template; only identity, placement and stacking order are supplied here.
 */
export function instantiateDrawStencil(
  model: DrawDocumentModel,
  stencilId: string,
  pageId: string,
  layerId: string,
  position: { readonly x: number; readonly y: number },
  options?: { readonly idSeed?: string; readonly keepText?: boolean },
): DrawObject {
  const stencil = findDrawStencil(model, stencilId);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  if (!page.layerIds.includes(layerId)) throw new DrawModelError('object-layer-missing');
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new DrawModelError('stencil-position-invalid');
  const highest = Object.values(model.objects).reduce((maximum, object) => Math.max(maximum, object.zIndex), -1);
  const seed = options?.idSeed ?? `stencil${model.revision + 1}`;
  const id = safeId(`${seed}-${stencil.id.replace(/[^A-Za-z0-9._:@-]+/gu, '-')}`, 'stencil-object-id-invalid');
  const { vector, richText, type, ...template } = stencil.objectTemplate;
  const input = {
    ...template,
    id,
    pageId,
    layerId,
    x: position.x,
    y: position.y,
    zIndex: highest + 1,
    richText: options?.keepText === false ? undefined : richText,
    vector: vector ?? { kind: 'rectangle' as const, style: { ...DEFAULT_DRAW_STYLE } },
  };
  // Ein Rahmen wird **als Rahmen** gebaut (`createVectorFrame`), sonst als Form — *die Objektart des
  // Stempels ist keine Verzierung: an ihr hängen die Live-Einbettung (Present/Notes) und der Zeiger-Träger.*
  return type === 'frame' ? createVectorFrame(input) : createVectorShape({ ...input, vector: input.vector });
}
