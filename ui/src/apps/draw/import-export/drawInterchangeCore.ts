// STATUS: DIAMANT VGT SUPREME — Astraea Draw encrypted native, SVG, Visio, print and clipboard interchange
import type { WorkspaceDocument } from '../../../shared/contracts/workspace';
import type { DrawDocumentModel, DrawObject } from '../../../shared/contracts/draw/workspaceDraw';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../platform/containers/container';
import { inspectBoundedForeignXml } from '../../../shared/interoperability/xml';
import { assertDrawDocument, DrawModelError } from '../model/drawDocumentEngine';
import { projectDrawScene } from '../interactions/drawSceneProjection';
import {
  dashArrayAttribute,
  describeDrawConnectorNode,
  describeDrawSceneNode,
  type DrawSceneShape,
  type DrawSceneStroke,
  type DrawSceneText,
} from '../interactions/drawSceneRenderModel';
import { drawPageToWhiteboardItems } from './drawProjectionAdapter';
import { exportDrawToVisioXml, importVisioXmlToDraw, VisioInteropError, type VisioConversionReport } from '../../../shared/interchange/visioVdx';

export const DRAW_INTERCHANGE_LIMITS={maxNativeBytes:128*1024*1024,maxSvgBytes:32*1024*1024,maxObjects:100_000,maxVisioBytes:24*1024*1024,maxClipboardBytes:16*1024*1024,maxSvgElements:10_000,maxSvgDepth:96} as const;
export interface DrawNativeOptions{password?:string;pin?:string;}
const enc=new TextEncoder();
function assertDrawWorkspaceDocument(doc:WorkspaceDocument):asserts doc is WorkspaceDocument&{drawData:DrawDocumentModel}{if(doc.kind!=='Draw'||!doc.drawData)throw new DrawModelError('draw-workspace-payload-missing');assertDrawDocument(doc.drawData);}
export async function packNativeDraw(document:WorkspaceDocument,options:DrawNativeOptions={}):Promise<Uint8Array>{assertDrawWorkspaceDocument(document);const bytes=await packLocalEncryptedContainer(document,options);if(bytes.byteLength<16||bytes.byteLength>DRAW_INTERCHANGE_LIMITS.maxNativeBytes)throw new DrawModelError('native-size-boundary');const magic=new TextDecoder().decode(bytes.subarray(0,4));if(!['VGT2','VGT3','VGT4','VGT5'].includes(magic))throw new DrawModelError('native-container-unencrypted');return bytes;}
export async function unpackNativeDraw(bytes:Uint8Array,options:DrawNativeOptions={}):Promise<WorkspaceDocument>{if(!(bytes instanceof Uint8Array)||bytes.byteLength<16||bytes.byteLength>DRAW_INTERCHANGE_LIMITS.maxNativeBytes)throw new DrawModelError('native-size-boundary');const magic=new TextDecoder().decode(bytes.subarray(0,4));if(!['VGT2','VGT3','VGT4','VGT5'].includes(magic))throw new DrawModelError('native-container-unencrypted');const doc=await unpackLocalEncryptedContainer(bytes,options);assertDrawWorkspaceDocument(doc);return doc;}
function esc(s:string):string{return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function base64Encode(bytes:Uint8Array):string{const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1]??0,c=bytes[i+2]??0,n=(a<<16)|(b<<8)|c;out+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<bytes.length?alphabet[(n>>>6)&63]:'=')+(i+2<bytes.length?alphabet[n&63]:'=');}return out;}
function base64Decode(source: string): Uint8Array {
  const clean = source.replace(/\s+/g, '');
  if (!clean || clean.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) {
    throw new DrawModelError('svg-metadata-base64-invalid');
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const lastDataIndex = clean.length - padding - 1;
  if (padding === 2 && (alphabet.indexOf(clean[lastDataIndex]) & 0x0f) !== 0) {
    throw new DrawModelError('svg-metadata-base64-invalid');
  }
  if (padding === 1 && (alphabet.indexOf(clean[lastDataIndex]) & 0x03) !== 0) {
    throw new DrawModelError('svg-metadata-base64-invalid');
  }

  const decodedLength = (clean.length / 4) * 3 - padding;
  if (decodedLength > DRAW_INTERCHANGE_LIMITS.maxSvgBytes) throw new DrawModelError('svg-metadata-base64-invalid');
  const out = new Uint8Array(decodedLength);
  let offset = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index]);
    const b = alphabet.indexOf(clean[index + 1]);
    const c = clean[index + 2] === '=' ? 0 : alphabet.indexOf(clean[index + 2]);
    const d = clean[index + 3] === '=' ? 0 : alphabet.indexOf(clean[index + 3]);
    if (a < 0 || b < 0 || c < 0 || d < 0) throw new DrawModelError('svg-metadata-base64-invalid');
    const value = (a << 18) | (b << 12) | (c << 6) | d;
    if (offset < decodedLength) out[offset++] = (value >>> 16) & 0xff;
    if (offset < decodedLength) out[offset++] = (value >>> 8) & 0xff;
    if (offset < decodedLength) out[offset++] = value & 0xff;
  }
  return out;
}

function boundedUtf8ByteLength(value: string, maximumBytes: number, errorCode: string): number {
  if (typeof value !== 'string') throw new DrawModelError(errorCode);
  if (value.length > maximumBytes) throw new DrawModelError(errorCode);
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < value.length) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
    if (bytes > maximumBytes) throw new DrawModelError(errorCode);
  }
  return bytes;
}
function strokeAttrs(stroke:DrawSceneStroke):string{const parts=[`fill="${esc(stroke.fill)}"`,`stroke="${esc(stroke.stroke)}"`,`stroke-width="${stroke.strokeWidth}"`];const dash=dashArrayAttribute(stroke.dash);if(dash)parts.push(`stroke-dasharray="${esc(dash)}"`);parts.push(`opacity="${stroke.opacity}"`);return parts.join(' ');}
function shapeElement(shape:DrawSceneShape,stroke:DrawSceneStroke):string{switch(shape.kind){case 'rect':return`<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.cornerRadius}" ${strokeAttrs(stroke)}/>`;case 'ellipse':return`<ellipse cx="${shape.cx}" cy="${shape.cy}" rx="${shape.rx}" ry="${shape.ry}" ${strokeAttrs(stroke)}/>`;case 'polygon':return`<polygon points="${shape.points.map((p)=>`${p.x},${p.y}`).join(' ')}" ${strokeAttrs(stroke)}/>`;case 'line':return`<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${strokeAttrs(stroke)}/>`;case 'polyline':return`<polyline points="${shape.points.map((p)=>`${p.x},${p.y}`).join(' ')}" fill="none" stroke="${esc(stroke.stroke)}" stroke-width="${stroke.strokeWidth}"/>`;case 'path':return`<path d="${esc(shape.d)}" fill="none" stroke="${esc(stroke.stroke)}" stroke-width="${stroke.strokeWidth}"/>`;}}
function textElement(text:DrawSceneText):string{return`<text x="${text.x}" y="${text.y}" text-anchor="${text.anchor}"${text.baseline==='middle'?' dominant-baseline="middle"':''} fill="${esc(text.fill)}" font-size="${text.fontSize}">${esc(text.text)}</text>`;}
function renderObject(o:DrawObject):string{const node=describeDrawSceneNode(o);if(!node.shape)return'';const tx=node.rotation?` transform="rotate(${node.rotation} ${node.rotationCenter.x} ${node.rotationCenter.y})"`:'';return`<g data-vgt-id="${esc(node.id)}" data-vgt-type="${esc(node.nodeType)}"${tx}>${shapeElement(node.shape,node.stroke)}${node.text?textElement(node.text):''}</g>`;}
function connectorSvg(model:DrawDocumentModel,o:DrawObject):string{if(!o.connector)return'';const connector=describeDrawConnectorNode(o,model.objects);const label=connector.label===null?'':esc(connector.label);return`<g data-vgt-id="${esc(connector.id)}" data-vgt-type="connector"><path d="${esc(connector.path)}" fill="none" stroke="#64748b" stroke-width="2" marker-end="url(#vgt-arrow)"/>${label?`<text x="${connector.labelX}" y="${connector.labelY}" fill="#cbd5e1" text-anchor="middle">${label}</text>`:''}</g>`;}
export function buildDrawSvg(model: DrawDocumentModel, pageId = model.activePageId): string {
  assertDrawDocument(model);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');

  // Single source of paint order/visibility for both the SVG export and the interactive canvas.
  const pageObjects = projectDrawScene(model, pageId).entries
    .filter((entry) => entry.visible)
    .map((entry) => entry.object);
  const body = pageObjects.filter((object) => object.type !== 'connector').map(renderObject).join('')
    + pageObjects.filter((object) => object.type === 'connector').map((object) => connectorSvg(model, object)).join('');
  const metadataJson = JSON.stringify({ format: 'VGT_DRAW_SVG_META_V1', model, pageId });
  const shell = `<svg xmlns="http://www.w3.org/2000/svg" width="${page.width}" height="${page.height}" viewBox="0 0 ${page.width} ${page.height}" role="img" aria-label="Astraea Draw ${esc(page.name)}"><metadata id="vgt-draw"></metadata><defs><marker id="vgt-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0,0 L10,4 L0,8 z" fill="#64748b"/></marker></defs>${body}</svg>`;
  const shellBytes = boundedUtf8ByteLength(shell, DRAW_INTERCHANGE_LIMITS.maxSvgBytes, 'svg-export-too-large');
  const metadataBytes = boundedUtf8ByteLength(metadataJson, DRAW_INTERCHANGE_LIMITS.maxSvgBytes, 'svg-export-too-large');
  const encodedMetadataBytes = Math.ceil(metadataBytes / 3) * 4;
  if (shellBytes + encodedMetadataBytes > DRAW_INTERCHANGE_LIMITS.maxSvgBytes) throw new DrawModelError('svg-export-too-large');
  const metadata = base64Encode(enc.encode(metadataJson));
  return shell.replace('<metadata id="vgt-draw"></metadata>', `<metadata id="vgt-draw">${metadata}</metadata>`);
}
function assertBoundedSvgStructure(source:string):void{let depth=0,maxDepth=0,elements=0;const tags=source.match(/<[^>]+>/g)??[];for(const raw of tags){if(raw.startsWith('<!--')||raw.startsWith('<?')||raw.startsWith('<!['))continue;if(/^<\//.test(raw)){depth=Math.max(0,depth-1);continue;}if(/^<!/.test(raw))continue;elements++;if(elements>DRAW_INTERCHANGE_LIMITS.maxSvgElements)throw new DrawModelError('svg-element-limit');if(!/\/\s*>$/.test(raw)){depth++;maxDepth=Math.max(maxDepth,depth);if(maxDepth>DRAW_INTERCHANGE_LIMITS.maxSvgDepth)throw new DrawModelError('svg-depth-limit');}}}
/**
 * Die **eine** Härtung für fremdes SVG: Größe, Tiefe, Elementzahl, aktiver Inhalt, Strukturgrenzen.
 *
 * Warum sie herausgezogen ist (Paket 15, AST-1307): der **vektorielle** Import eines fremden SVG (ohne
 * `VGT_DRAW_SVG_META_V1`) braucht **dieselbe** Härtung. *Eine zweite Kopie der Prüfungen wäre eine zweite
 * Wahrheit über dieselbe Grenze — und die erste, die jemand später ergänzt, wäre die falsche.*
 */
export function assertSafeDrawSvgSource(source: string): void {
  const byteLength = boundedUtf8ByteLength(source, DRAW_INTERCHANGE_LIMITS.maxSvgBytes, 'svg-size-boundary');
  if (byteLength < 8) throw new DrawModelError('svg-size-boundary');
  inspectBoundedForeignXml(source, {
    maxBytes: DRAW_INTERCHANGE_LIMITS.maxSvgBytes,
    maxDepth: DRAW_INTERCHANGE_LIMITS.maxSvgDepth,
    maxElements: DRAW_INTERCHANGE_LIMITS.maxSvgElements,
  });
  if (/<(?:script|foreignObject|iframe|object|embed)\b/i.test(source)
    || /\son[a-z]+\s*=/i.test(source)
    || /(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(source)) {
    throw new DrawModelError('svg-active-content-rejected');
  }
  assertBoundedSvgStructure(source);
}

export function importDrawSvg(source: string): DrawDocumentModel {
  assertSafeDrawSvgSource(source);
  const match = /<metadata\s+id=["']vgt-draw["']\s*>([A-Za-z0-9+/=\s]+)<\/metadata>/i.exec(source);
  if (!match) throw new DrawModelError('svg-semantic-metadata-missing');
  const metadataBytes = base64Decode(match[1]);
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes);
  } catch {
    throw new DrawModelError('svg-metadata-encoding-invalid');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    throw new DrawModelError('svg-metadata-json-invalid');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DrawModelError('svg-semantic-metadata-invalid');
  }
  const envelope = parsed as { format?: unknown; model?: unknown };
  if (envelope.format !== 'VGT_DRAW_SVG_META_V1' || !envelope.model) throw new DrawModelError('svg-semantic-metadata-invalid');
  assertDrawDocument(envelope.model as DrawDocumentModel);
  return structuredClone(envelope.model) as DrawDocumentModel;
}
export interface DrawVisioInteropResult { xml: string; conversion: VisioConversionReport; }
export function exportDrawVisio(documentTitle: string, model: DrawDocumentModel, pageId = model.activePageId): DrawVisioInteropResult {
  assertDrawDocument(model);
  const items = drawPageToWhiteboardItems(model, pageId);
  const result = exportDrawToVisioXml(documentTitle, items);
  boundedUtf8ByteLength(result.vdxXml, DRAW_INTERCHANGE_LIMITS.maxVisioBytes, 'visio-export-too-large');
  return { xml: result.vdxXml, conversion: result.conversion };
}

export function importDrawVisio(
  xml: string,
  base: DrawDocumentModel,
  pageId = base.activePageId,
): { model: DrawDocumentModel; conversion: VisioConversionReport } {
  boundedUtf8ByteLength(xml, DRAW_INTERCHANGE_LIMITS.maxVisioBytes, 'visio-import-too-large');
  assertDrawDocument(base);
  let imported: ReturnType<typeof importVisioXmlToDraw>;
  try {
    imported = importVisioXmlToDraw(xml);
  } catch (error) {
    if (error instanceof VisioInteropError) throw new DrawModelError(error.code);
    throw error;
  }
  if (imported.items.length > DRAW_INTERCHANGE_LIMITS.maxObjects) throw new DrawModelError('visio-object-limit');

  const model = structuredClone(base);
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const layerId = page.layerIds[0];
  for (const [index, item] of imported.items.entries()) {
    const id = `visio-${item.id}`;
    const object: DrawObject = item.type === 'connector'
      ? {
        id,
        pageId,
        layerId,
        type: 'connector',
        name: item.lineLabel ?? 'Connector',
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        locked: false,
        zIndex: model.revision + index,
        connector: {
          from: { objectId: `visio-${item.fromId ?? ''}`, anchor: 'auto' },
          to: { objectId: `visio-${item.toId ?? ''}`, anchor: 'auto' },
          route: 'orthogonal',
          autoRoute: true,
          waypoints: [],
          obstacleAvoidance: true,
          routingPriority: 0,
          crossingStyle: 'jump',
          semantic: { label: item.lineLabel },
          arrowStart: 'none',
          arrowEnd: 'triangle',
        },
      }
      : {
        id,
        pageId,
        layerId,
        type: item.type === 'frame' ? 'frame' : 'shape',
        name: item.text || item.name || 'Imported shape',
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation ?? 0,
        flipX: false,
        flipY: false,
        opacity: 1,
        locked: false,
        zIndex: model.revision + index,
        vector: item.type === 'frame' ? undefined : {
          kind: item.type === 'terminal' || item.shape?.kind === 'ellipse'
            ? 'ellipse'
            : item.type === 'decision' || item.shape?.kind === 'diamond' || item.shape?.kind === 'triangle'
              ? 'polygon'
              : item.type === 'text' ? 'text' : 'rectangle',
          style: {
            fill: item.shape?.fill ?? '#1e293b',
            stroke: item.shape?.stroke ?? '#60a5fa',
            strokeWidth: item.shape?.strokeWidth ?? 2,
            dash: [],
            opacity: 1,
            cornerRadius: item.shape?.kind === 'rounded-rectangle' ? 8 : 0,
            arrowStart: 'none',
            arrowEnd: 'none',
          },
        },
      };
    model.objects[id] = object;
    page.objectIds.push(id);
  }
  model.revision += 1;
  assertDrawDocument(model);
  return { model, conversion: imported.conversion };
}
export interface DrawPrintProjection{pageId:string;width:number;height:number;printableBounds:{x:number;y:number;width:number;height:number};svg:string;}
export function buildDrawPrintProjection(model:DrawDocumentModel,pageId=model.activePageId):DrawPrintProjection{const page=model.pages.find(p=>p.id===pageId);if(!page)throw new DrawModelError('page-missing');return{pageId,width:page.width,height:page.height,printableBounds:{...page.printableBounds},svg:buildDrawSvg(model,pageId)};}
export function buildDrawClipboardBundle(
  model: DrawDocumentModel,
  objectIds: readonly string[],
  pageId = model.activePageId,
): { semanticJson: string; svg: string } {
  assertDrawDocument(model);
  if (!Array.isArray(objectIds) || objectIds.length === 0 || objectIds.length > 10_000) {
    throw new DrawModelError('clipboard-selection-boundary');
  }
  const page = model.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new DrawModelError('page-missing');
  const pageObjectIds = new Set(page.objectIds);
  const selected = new Set(objectIds);
  if (selected.size === 0 || selected.size > 10_000) throw new DrawModelError('clipboard-selection-boundary');
  for (const id of selected) {
    if (!pageObjectIds.has(id) || !Object.hasOwn(model.objects, id)) throw new DrawModelError('clipboard-object-missing');
  }

  const partial = structuredClone(model);
  partial.pages = partial.pages.map((candidate) => candidate.id === pageId
    ? {
      ...candidate,
      objectIds: candidate.objectIds.filter((id) => selected.has(id)
        || (model.objects[id]?.type === 'connector'
          && selected.has(model.objects[id].connector?.from.objectId ?? '')
          && selected.has(model.objects[id].connector?.to.objectId ?? ''))),
    }
    : { ...candidate, objectIds: [] });
  const keep = new Set(partial.pages.flatMap((candidate) => candidate.objectIds));
  partial.objects = Object.fromEntries(Object.entries(partial.objects).filter(([id]) => keep.has(id)));
  partial.dataBindings = partial.dataBindings.filter((binding) => keep.has(binding.objectId));
  const semanticJson = JSON.stringify({ format: 'VGT_DRAW_CLIPBOARD_V1', model: partial });
  const svg = buildDrawSvg(partial, pageId);
  const bundleBytes = enc.encode(semanticJson).byteLength + enc.encode(svg).byteLength;
  if (bundleBytes > DRAW_INTERCHANGE_LIMITS.maxClipboardBytes) throw new DrawModelError('clipboard-size-boundary');
  return { semanticJson, svg };
}
