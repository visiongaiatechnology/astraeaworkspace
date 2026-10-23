// STATUS: DIAMANT VGT SUPREME — Astraea Publish deterministic HTML/EPUB/SVG/package export engine
import type { PublishDocumentModel, PublishFrame } from '../../../shared/contracts/publish/workspacePublish';
import { packageableAssets } from '../assets/publishAssetEngine';
import { assertPublishDocument, pageLabel, PublishModelError } from '../model/publishDocumentEngine';
import { splitPageLayers } from '../model/publishMasterFrames';
import { parseHostileJson } from '../../../shared/security/hostileJson';

const enc=new TextEncoder();
export type PublishDigitalLayout='reflow'|'fixed';
export interface PublishPackageEntry {path:string;mimeType:string;bytes:Uint8Array;sha256?:string;}
export interface PublishPackageResult {manifest:string;entries:PublishPackageEntry[];blockedAssetIds:string[];}

const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const attr=(s:string)=>esc(s).slice(0,8192);
function textRole(frame:PublishFrame):string{const r=frame.semanticRole??'P';if(r==='H1')return'h1';if(r==='H2')return'h2';if(r==='H3')return'h3';if(r==='Figure')return'figure';if(r==='Table')return'table';return'p';}
function frameText(frame:PublishFrame):string{return esc(frame.content).replace(/\n/g,'<br/>');}
/** Die Deklarationen des festen Satzes — **ohne** das `style=`-Attribut, damit sie sich mit anderen mischen lassen. */
function fixedDeclarations(frame:PublishFrame):string{return`position:absolute;left:${frame.xMm}mm;top:${frame.yMm}mm;width:${frame.widthMm}mm;height:${frame.heightMm}mm;transform:rotate(${frame.rotationDeg}deg);opacity:${frame.opacity??1};overflow:hidden;`;}
/**
 * **Kontur und Transparenz eines Rahmens als Deklarationen** — fuer HTML und EPUB (`AST-1406/1407`).
 *
 * Gemessen vorher: die HTML-Ausgabe eines Grafikrahmens war ein `<div>` **ohne** Kontur; `strokeWidthPt` und
 * `strokeColor` kamen darin nicht vor. Eine Form verlor damit in der reflow-faehigen Ausgabe ihre sichtbare
 * Bestimmung. *Keine zweite Regel: dieselben drei Felder, die auch der SVG-Export liest.*
 */
function shapeDeclarations(frame:PublishFrame):string{
  const parts:string[]=[];
  const width=frame.strokeWidthPt??0;
  if(width>0)parts.push(`border:${width}pt solid ${attr(frame.strokeColor??'#999')}`);
  if((frame.opacity??1)<1)parts.push(`opacity:${frame.opacity}`);
  if(frame.fillColor&&frame.fillColor!=='transparent')parts.push(`background:${attr(frame.fillColor)}`);
  return parts.join(';');
}
/**
 * Das `style`-Attribut eines Rahmens — **genau eines**.
 *
 * Gemessen (eigener Fehler, Runde Publish-15): die erste Fassung haengte die Formdeklarationen als **zweites**
 * `style=`-Attribut an, sobald das feste Layout schon eines trug. Zwei `style`-Attribute an einem Element sind
 * ungueltiges HTML, und der Browser nimmt stillschweigend das erste — *die Kontur waere spurlos verschwunden,
 * genau der Fehler, den dieser Punkt behebt.*
 */
function frameStyleAttr(frame:PublishFrame,layout:PublishDigitalLayout):string{
  const declarations=layout==='fixed'?`${fixedDeclarations(frame)}${shapeDeclarations(frame)}`:shapeDeclarations(frame);
  return declarations.length===0?'':` style="${declarations}"`;
}
function frameHtml(model:PublishDocumentModel,frame:PublishFrame,layout:PublishDigitalLayout):string{const role=textRole(frame),style=frameStyleAttr(frame,layout);if(frame.type==='text'){if(role==='h1'||role==='h2'||role==='h3')return`<${role}${style}>${frameText(frame)}</${role}>`;return`<p${style}${frame.semanticRole==='Artifact'?' aria-hidden="true"':''}>${frameText(frame)}</p>`;}if(frame.type==='image')return`<figure${style}><div class="vgt-image-placeholder" role="img" aria-label="${attr(frame.altText??frame.name)}"></div>${frame.altText?`<figcaption>${esc(frame.altText)}</figcaption>`:''}</figure>`;if(frame.type==='barcode'&&frame.barcodeId){const barcode=model.barcodes.find(b=>b.id===frame.barcodeId);if(barcode)return`<figure${style} class="barcode" data-symbology="${barcode.symbology}" aria-label="${attr(`Barcode ${barcode.payloadPreview}`)}">${barcode.modules.map(row=>`<span>${row.join('')}</span>`).join('')}</figure>`;}return`<div${style} data-vgt-frame-type="${frame.type}">${frameText(frame)}</div>`;}

export function buildPublishHtml(model:PublishDocumentModel,layout:PublishDigitalLayout='reflow'):string{const pages=model.pages.map((page)=>{const frames=model.frames.filter(f=>f.pageId===page.id&&!f.hidden).sort((a,b)=>a.yMm-b.yMm||a.xMm-b.xMm||a.id.localeCompare(b.id));const pageStyle=layout==='fixed'?` style="position:relative;width:${page.geometry.widthMm}mm;height:${page.geometry.heightMm}mm;overflow:hidden"`:'';return`<section class="vgt-page" data-page-label="${attr(pageLabel(model,page.id))}"${pageStyle}>${frames.map(f=>frameHtml(model,f,layout)).join('')}</section>`;}).join('');const css=layout==='fixed'?'.vgt-page{page-break-after:always}.vgt-image-placeholder{width:100%;height:100%;background:#ddd}.barcode span{display:block;font:1px monospace;line-height:1px;white-space:pre}':'body{max-width:52rem;margin:auto;font-family:serif;line-height:1.5}.vgt-page{margin-block:2rem}.vgt-image-placeholder{min-height:8rem;background:#ddd}.barcode span{display:block;font:1px monospace;line-height:1px;white-space:pre}';return`<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Astraea Publication</title><style>${css}</style></head><body>${pages}</body></html>`;}

export const PUBLISH_SVG_LIMITS={maxBytes:32*1024*1024,maxElements:120_000,maxDepth:96,maxMetadataBytes:16*1024*1024} as const;

/**
 * **Die Form eines Rahmens als SVG** — Kontur und Transparenz **erhalten** (`AST-1406/1407`).
 *
 * Gemessen vorher: der SVG-Export schrieb fuer **jeden** Nicht-Text-Rahmen ein `<rect>` mit Fuellung und einer
 * festen Konturfarbe — `strokeWidthPt` und `opacity` kamen darin **nicht** vor. Eine Form mit 4 pt Kontur und
 * 40 % Deckung verlor damit beides in der Ausgabe, und der Akzeptanzsatz lautet genau „Kontur und Transparenz
 * erhalten".
 *
 * Die Punktfolge kommt aus `shapeOutlinePoints` (`model/publishShapeOps.ts`) — **eine** Umrechnung fuer Canvas
 * und Export, nicht zwei.
 */
function shapeSvgBody(frame:PublishFrame,outline:readonly {x:number;y:number}[]):string{
  const stroke=frame.strokeColor??'#999';
  const width=frame.strokeWidthPt??0;
  const opacity=frame.opacity??1;
  const fill=frame.fillColor&&frame.fillColor!=='transparent'?frame.fillColor:'none';
  const strokeAttrs=` stroke="${attr(stroke)}" stroke-width="${width}" fill="${fill}"`;
  const opacityAttr=opacity<1?` opacity="${opacity}"`:'';
  if(outline.length>=3)return`<polygon data-vgt-shape="polygon" points="${outline.map((point)=>`${point.x},${point.y}`).join(' ')}"${strokeAttrs}${opacityAttr}/>`;
  if(outline.length===2)return`<line data-vgt-shape="line" x1="${outline[0]!.x}" y1="${outline[0]!.y}" x2="${outline[1]!.x}" y2="${outline[1]!.y}" stroke="${attr(stroke)}" stroke-width="${Math.max(width,1)}"${opacityAttr}/>`;
  return`<rect data-vgt-shape="rectangle" x="${frame.xMm}" y="${frame.yMm}" width="${frame.widthMm}" height="${frame.heightMm}"${strokeAttrs}${opacityAttr}/>`;
}

/** Die Punktfolge eines Rahmens, **normiert → Millimeter** — ohne die Anzeigeschicht zu laden. */
function frameOutline(frame:PublishFrame):{x:number;y:number}[]{
  const path=frame.clippingPath;
  if(!path||path.length===0)return[];
  return path.map((point)=>({x:frame.xMm+point.x*frame.widthMm,y:frame.yMm+point.y*frame.heightMm}));
}
function base64Encode(bytes:Uint8Array):string{const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';let out='';for(let i=0;i<bytes.length;i+=3){const a=bytes[i],b=bytes[i+1]??0,c=bytes[i+2]??0,n=(a<<16)|(b<<8)|c;out+=alphabet[(n>>>18)&63]+alphabet[(n>>>12)&63]+(i+1<bytes.length?alphabet[(n>>>6)&63]:'=')+(i+2<bytes.length?alphabet[n&63]:'=');}return out;}
function base64Decode(value:string):Uint8Array{const clean=value.replace(/\s+/g,'');if(!clean.length||clean.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(clean))throw new PublishModelError('svg-metadata-base64-invalid');const table='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const out:number[]=[];for(let i=0;i<clean.length;i+=4){const a=table.indexOf(clean[i]),b=table.indexOf(clean[i+1]),c=clean[i+2]==='='?0:table.indexOf(clean[i+2]),d=clean[i+3]==='='?0:table.indexOf(clean[i+3]);if(a<0||b<0||c<0||d<0)throw new PublishModelError('svg-metadata-base64-invalid');const n=(a<<18)|(b<<12)|(c<<6)|d;out.push((n>>>16)&255);if(clean[i+2]!=='=')out.push((n>>>8)&255);if(clean[i+3]!=='=')out.push(n&255);}return new Uint8Array(out);}
function assertBoundedPublishSvg(source:string):void{const bytes=enc.encode(source).byteLength;if(bytes<32||bytes>PUBLISH_SVG_LIMITS.maxBytes)throw new PublishModelError('svg-size-boundary');if(/<(?:script|foreignObject|iframe|object|embed)\b/i.test(source)||/<!DOCTYPE|<!ENTITY/i.test(source)||/\son[a-z]+\s*=/i.test(source)||/(?:href|xlink:href)\s*=\s*["']\s*(?:https?:|javascript:|data:text\/html)/i.test(source))throw new PublishModelError('svg-active-content-rejected');let depth=0,elements=0;for(const raw of source.match(/<[^>]+>/g)??[]){if(raw.startsWith('<!--')||raw.startsWith('<?')||raw.startsWith('<!['))continue;if(/^<\//.test(raw)){depth=Math.max(0,depth-1);continue;}if(/^<!/.test(raw))continue;if(++elements>PUBLISH_SVG_LIMITS.maxElements)throw new PublishModelError('svg-element-limit');if(!/\/\s*>$/.test(raw)&&!/^<\?/.test(raw)){if(++depth>PUBLISH_SVG_LIMITS.maxDepth)throw new PublishModelError('svg-depth-limit');}}}
export function buildPublishSvgPage(model:PublishDocumentModel,pageId=model.pages[model.activePageIndex]?.id):string{assertPublishDocument(model);const page=model.pages.find(p=>p.id===pageId);if(!page)throw new PublishModelError('svg-page-missing');
 /**
  * **Master-Rahmen erscheinen im Export auf jeder Seite** (`AST-1371`).
  *
  * Gemessen (eigener Fehler, Runde Publish-16): diese Zeile las `model.frames.filter(f=>f.pageId===page.id)`.
  * Ein Master-Rahmen wird auf **einer** Host-Seite gehostet — auf allen anderen Seiten fehlte die wiederkehrende
  * Kopfzeile damit in der Ausgabe, obwohl sie auf dem Bildschirm stand. Jetzt kommt die Aufteilung aus
  * `splitPageLayers` — **eine** Regel für Bildschirm und Ausgabe.
  */
 const layers=splitPageLayers(model,page.id);const frames=[...layers.masterFrames,...layers.pageFrames].sort((a,b)=>a.id.localeCompare(b.id));const metadataBytes=enc.encode(JSON.stringify({format:'VGT_PUBLISH_SVG_META_V1',pageId,model}));if(metadataBytes.byteLength>PUBLISH_SVG_LIMITS.maxMetadataBytes)throw new PublishModelError('svg-metadata-too-large');const metadata=base64Encode(metadataBytes);const body=frames.map(f=>{const tr=f.rotationDeg?` transform="rotate(${f.rotationDeg} ${f.xMm+f.widthMm/2} ${f.yMm+f.heightMm/2})"`:'';if(f.type==='text')return`<text data-vgt-id="${attr(f.id)}" x="${f.xMm}" y="${f.yMm+(f.fontSizePt??10)*.352778}" font-family="${attr(f.fontFamily??'sans-serif')}" font-size="${f.fontSizePt??10}pt"${tr}>${esc(f.content.slice(0,200000))}</text>`;if(f.type==='barcode'&&f.barcodeId){const barcode=model.barcodes.find(b=>b.id===f.barcodeId);if(!barcode)return'';const rows=barcode.modules.length,cols=barcode.modules[0]?.length??1,sx=f.widthMm/cols,sy=f.heightMm/rows;let rects='';for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)if(barcode.modules[r][c])rects+=`<rect x="${f.xMm+c*sx}" y="${f.yMm+r*sy}" width="${sx}" height="${sy}" fill="#000"/>`;return`<g data-vgt-id="${attr(f.id)}" aria-label="${attr(barcode.payloadPreview)}"${tr}>${rects}</g>`;}return`<g data-vgt-id="${attr(f.id)}"${tr}>${shapeSvgBody(f,frameOutline(f))}</g>`;}).join('');const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${page.geometry.widthMm}mm" height="${page.geometry.heightMm}mm" viewBox="0 0 ${page.geometry.widthMm} ${page.geometry.heightMm}" role="img" aria-label="Astraea Publish page ${attr(pageLabel(model,page.id))}"><metadata id="vgt-publish">${metadata}</metadata>${body}</svg>`;assertBoundedPublishSvg(svg);return svg;}
export function importPublishSvgPage(source:string):{model:PublishDocumentModel;pageId:string}{assertBoundedPublishSvg(source);const match=/<metadata\b[^>]*\bid=["']vgt-publish["'][^>]*>([A-Za-z0-9+/=\s]+)<\/metadata>/i.exec(source);if(!match)throw new PublishModelError('svg-semantic-metadata-missing');const bytes=base64Decode(match[1]);if(bytes.byteLength>PUBLISH_SVG_LIMITS.maxMetadataBytes)throw new PublishModelError('svg-metadata-too-large');let parsed:{format?:string;pageId?:string;model?:PublishDocumentModel};try{parsed=parseHostileJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes),{maxBytes:PUBLISH_SVG_LIMITS.maxMetadataBytes,maxDepth:96,maxNodes:250_000,maxStringChars:1_048_576,maxObjectKeys:100_000,maxArrayItems:250_000}) as typeof parsed;}catch{throw new PublishModelError('svg-semantic-metadata-invalid');}if(parsed.format!=='VGT_PUBLISH_SVG_META_V1'||!parsed.model||!parsed.pageId)throw new PublishModelError('svg-semantic-metadata-invalid');assertPublishDocument(parsed.model);if(!parsed.model.pages.some(p=>p.id===parsed.pageId))throw new PublishModelError('svg-semantic-page-missing');return{model:structuredClone(parsed.model),pageId:parsed.pageId};}

function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function u16(n:number){return[n&255,(n>>>8)&255];}function u32(n:number){return[n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255];}
/**
 * Der ZIP-Schreiber, oeffentlich.
 *
 * Er lag als lokale Funktion in dieser Datei. EPUB und Publikationspaket brauchen **denselben** Schreiber;
 * eine zweite Kopie waere genau die Doppelung, die dieses Projekt wiederholt Runden gekostet hat.
 */
export function zipStoreFiles(files:readonly {name:string;bytes:Uint8Array}[]):Uint8Array{return zipStore(files);}
function zipStore(files:readonly {name:string;bytes:Uint8Array}[]):Uint8Array{const local:number[]=[],central:number[]=[];let offset=0;for(const file of files){const name=enc.encode(file.name),crc=crc32(file.bytes),size=file.bytes.length;const header=[0x50,0x4b,0x03,0x04,...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0)];local.push(...header,...name,...file.bytes);central.push(0x50,0x4b,0x01,0x02,...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(size),...u32(size),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name);offset+=header.length+name.length+size;}const centralOffset=local.length,centralSize=central.length;const end=[0x50,0x4b,0x05,0x06,...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(centralOffset),...u16(0)];return new Uint8Array([...local,...central,...end]);}

export function buildPublishEpub(model:PublishDocumentModel,layout:PublishDigitalLayout='reflow'):Uint8Array{const html=buildPublishHtml(model,layout).replace(/^<!doctype html>/i,'').replace('<html lang="en">','<html xmlns="http://www.w3.org/1999/xhtml" lang="en">');const container='<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';const opf=`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">vgt-astraea-publish</dc:identifier><dc:title>Astraea Publication</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">1970-01-01T00:00:00Z</meta></metadata><manifest><item id="content" href="content.xhtml" media-type="application/xhtml+xml" properties="nav"/></manifest><spine><itemref idref="content"/></spine></package>`;return zipStore([{name:'mimetype',bytes:enc.encode('application/epub+zip')},{name:'META-INF/container.xml',bytes:enc.encode(container)},{name:'OEBPS/package.opf',bytes:enc.encode(opf)},{name:'OEBPS/content.xhtml',bytes:enc.encode(html)}]);}

function fromBase64(value:string):Uint8Array{const table='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';const clean=value.replace(/\s+/g,'');const out:number[]=[];for(let i=0;i<clean.length;i+=4){const a=table.indexOf(clean[i]),b=table.indexOf(clean[i+1]),c=clean[i+2]==='='?0:table.indexOf(clean[i+2]),d=clean[i+3]==='='?0:table.indexOf(clean[i+3]);if(a<0||b<0||c<0||d<0)throw new PublishModelError('package-base64-invalid');const n=(a<<18)|(b<<12)|(c<<6)|d;out.push((n>>>16)&255);if(clean[i+2]!=='=')out.push((n>>>8)&255);if(clean[i+3]!=='=')out.push(n&255);}return new Uint8Array(out);}
/**
 * **Tabellen gehoeren in das Paket** (`AST-1413`).
 *
 * Gemessen vorher: das Manifest nannte `pages`, `assets`, `profiles` und `styles` — die **Tabellen** kamen darin
 * **nicht** vor, und ihre Verweise auch nicht. Ein Paket, das die Preisuebersicht verschweigt, ist unvollstaendig,
 * *und der Empfaenger kann nicht pruefen, was fehlt.*
 *
 * Der **Modus** steht mit im Manifest: `live` heisst „folgt der Quelle", `frozen` heisst „Stand zum Zeitpunkt
 * der Ablage" — *ohne diese Angabe saehe der Empfaenger zwei gleiche Tabellen mit zwei Bedeutungen.*
 */
function publishTableManifestEntries(model:PublishDocumentModel):{id:string;name:string;rows:number;columns:number;filledCells:number;mode:string;sourceUri?:string;lastSourceVersion?:number}[]{
  return [...model.tables]
    .sort((a,b)=>a.id.localeCompare(b.id))
    .map((table)=>({
      id:table.id,name:table.name,rows:table.rows,columns:table.columns,
      filledCells:table.cells.filter((cell)=>cell.content.trim().length>0).length,
      mode:table.link?.mode??'standalone',
      ...(table.link?.sourceUri===undefined?{}:{sourceUri:table.link.sourceUri}),
      ...(table.link?.lastSourceVersion===undefined?{}:{lastSourceVersion:table.link.lastSourceVersion}),
    }));
}
export function buildPublishPackage(model:PublishDocumentModel):PublishPackageResult{const {assets,blocked}=packageableAssets(model);const entries:PublishPackageEntry[]=[];for(const asset of [...assets].sort((a,b)=>a.id.localeCompare(b.id))){if(asset.storage==='embedded'&&asset.embeddedBytesBase64)entries.push({path:`Links/${asset.name.replace(/[^A-Za-z0-9._-]/g,'_')}`,mimeType:asset.mimeType,bytes:fromBase64(asset.embeddedBytesBase64),sha256:asset.sha256});else entries.push({path:`Links/${asset.id}.link.json`,mimeType:'application/json',bytes:enc.encode(JSON.stringify({id:asset.id,uri:asset.canonicalUri,sha256:asset.sha256,mimeType:asset.mimeType})),sha256:asset.sha256});}for(const profile of [...model.iccProfiles].sort((a,b)=>a.id.localeCompare(b.id)))entries.push({path:`Profiles/${profile.id}.json`,mimeType:'application/json',bytes:enc.encode(JSON.stringify(profile)),sha256:profile.sha256});
 /**
  * **Die Tabellen selbst** fahren mit — als eigene Datei je Tabelle, damit der Empfaenger sie lesen kann, ohne
  * das ganze Dokument zu interpretieren. *Ein Manifesteintrag ohne Inhalt waere eine Erwaehnung, keine Lieferung.*
  */
 const tableEntries=publishTableManifestEntries(model);
 for(const table of [...model.tables].sort((a,b)=>a.id.localeCompare(b.id)))entries.push({path:`Tables/${table.id}.json`,mimeType:'application/json',bytes:enc.encode(JSON.stringify(table))});
 const manifest=JSON.stringify({format:'VGT_PUBLISH_PACKAGE_V1',schemaVersion:1,revision:model.revision,pages:model.pages.map(p=>p.id),assets:assets.map(a=>({id:a.id,path:`Links/${a.id}`,sha256:a.sha256})),blockedAssetIds:blocked,profiles:model.iccProfiles.map(p=>p.id),styles:model.styles.map(s=>s.id).sort(),tables:tableEntries,tableCount:tableEntries.length},null,2);entries.unshift({path:'manifest.json',mimeType:'application/json',bytes:enc.encode(manifest)});return{manifest,entries,blockedAssetIds:blocked};}
