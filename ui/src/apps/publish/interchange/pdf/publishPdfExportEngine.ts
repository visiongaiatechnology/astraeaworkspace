// STATUS: DIAMANT VGT SUPREME — Astraea Publish deterministic print/tagged/interactive PDF core
import type { PublishDocumentModel, PublishFrame, PublishPreflightFinding } from '../../../../shared/contracts/publish/workspacePublish';
import { createDefaultPreflightProfile, runPublishPreflight, type IccProfileId } from '../../prepress/publishPrepressEngine';
import { pageLabel, PublishModelError } from '../../model/publishDocumentEngine';
import { toOwnedArrayBuffer } from '../../../../shared/binary/ownedBufferSource';
import { pdfUriByteStringLiteral } from '../../../../platform/interop/pdf/pdfTextStrings';
import { assertPdfXExportable, buildPdfXMetadataPacket, isPublishPdfXTarget } from './publishPdfStructure';

export type PublishPdfTarget='PDF'|'PDF/X-1a:2001'|'PDF/X-4:2010'|'Tagged-PDF';
export interface PublishPrinterMarks {cropMarks:boolean;bleedMarks:boolean;registrationMarks:boolean;colorBars:boolean;pageInformation:boolean;}
export interface PublishPdfOptions {
  target:PublishPdfTarget;profileId:IccProfileId;marks:PublishPrinterMarks;includeBleed:boolean;accessible:boolean;interactive:boolean;
  deterministicEpoch?:string;blockOnPreflightErrors:boolean;
  /**
   * **Das ICC-Profil als Bytes** — nur wenn wirklich vorhanden.
   *
   * PDF/X-1a **verlangt** ein eingebettetes Ausgabeprofil (`/DestOutputProfile`). Dieses Modul erfindet keines:
   * ein Profil ist eine Binärdatei, und ein erfundenes wäre eine Attrappe. Wird es gereicht, wird es **wirklich**
   * eingebettet; wird es **nicht** gereicht, lehnt der Bauer PDF/X-1a **benannt** ab (`AST-1417`).
   */
  outputProfileBytes?:Uint8Array;
}
export interface PublishPdfResult {bytes:Uint8Array;text:string;sha256:string;target:PublishPdfTarget;pages:number;preflight:PublishPreflightFinding[];marksApplied:string[];outputCondition:string;deterministic:boolean;}

const enc=new TextEncoder();
const MM_TO_PT=72/25.4;
const ascii=(s:string)=>s.normalize('NFKD').replace(/[^\x20-\x7E\n\r\t]/g,'?');
const pdfText=(s:string)=>ascii(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').replace(/[\r\n]+/g,' ').slice(0,65_535);
const num=(n:number)=>Number.isInteger(n)?String(n):Number(n.toFixed(4)).toString();
async function sha(bytes:Uint8Array){const d=await crypto.subtle.digest('SHA-256',toOwnedArrayBuffer(bytes));return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');}

class PdfObjects {
  objects:string[]=[];
  add(body:string){this.objects.push(body);return this.objects.length;}
  set(id:number,body:string){if(id<1||id>this.objects.length)throw new PublishModelError('pdf-object-id-invalid');this.objects[id-1]=body;}
  finish(rootId:number,infoId:number):string{let out='%PDF-1.7\n%VGT-PUBLISH\n';const offsets=[0];for(let i=0;i<this.objects.length;i++){offsets[i+1]=enc.encode(out).length;out+=`${i+1} 0 obj\n${this.objects[i]}\nendobj\n`;}const xref=enc.encode(out).length;out+=`xref\n0 ${this.objects.length+1}\n0000000000 65535 f \n`;for(let i=1;i<=this.objects.length;i++)out+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;out+=`trailer\n<< /Size ${this.objects.length+1} /Root ${rootId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return out;}
}

function role(frame:PublishFrame):string{const r=frame.semanticRole??(frame.type==='text'?'P':frame.type==='image'?'Figure':'Artifact');return /^H[1-3]$/.test(r)?r:r==='Figure'?'Figure':r==='Table'?'Table':r==='Form'?'Form':r==='Link'?'Link':r==='Artifact'?'Artifact':'P';}
function pageFrameOrder(model:PublishDocumentModel,pageId:string){return model.frames.filter(f=>f.pageId===pageId&&!f.hidden).sort((a,b)=>a.yMm-b.yMm||a.xMm-b.xMm||a.id.localeCompare(b.id));}
function rgbFromHex(hex:string|undefined):[number,number,number]{const h=(hex??'#111111').replace('#','');if(!/^[0-9a-fA-F]{6}$/.test(h))return[.07,.07,.07];return[parseInt(h.slice(0,2),16)/255,parseInt(h.slice(2,4),16)/255,parseInt(h.slice(4,6),16)/255];}
function contentForPage(model:PublishDocumentModel,pageIndex:number,marks:PublishPrinterMarks,media:{w:number;h:number;trimX:number;trimY:number;trimW:number;trimH:number}):{stream:string;mcids:Array<{frame:PublishFrame;mcid:number}>}{const page=model.pages[pageIndex],frames=pageFrameOrder(model,page.id);const ops:string[]=['q'];if(marks.cropMarks){const x=media.trimX,y=media.trimY,w=media.trimW,h=media.trimH;ops.push('0 G 0.4 w',`${num(x-14)} ${num(y)} m ${num(x-4)} ${num(y)} l S`,`${num(x)} ${num(y-14)} m ${num(x)} ${num(y-4)} l S`,`${num(x+w+4)} ${num(y)} m ${num(x+w+14)} ${num(y)} l S`,`${num(x+w)} ${num(y-14)} m ${num(x+w)} ${num(y-4)} l S`,`${num(x-14)} ${num(y+h)} m ${num(x-4)} ${num(y+h)} l S`,`${num(x)} ${num(y+h+4)} m ${num(x)} ${num(y+h+14)} l S`,`${num(x+w+4)} ${num(y+h)} m ${num(x+w+14)} ${num(y+h)} l S`,`${num(x+w)} ${num(y+h+4)} m ${num(x+w)} ${num(y+h+14)} l S`);}
 if(marks.registrationMarks){for(const [cx,cy] of [[media.trimX-24,media.trimY+media.trimH/2],[media.trimX+media.trimW+24,media.trimY+media.trimH/2]])ops.push(`${num(cx-5)} ${num(cy)} m ${num(cx+5)} ${num(cy)} l S`,`${num(cx)} ${num(cy-5)} m ${num(cx)} ${num(cy+5)} l S`);}
 if(marks.colorBars){let x=media.trimX,y=Math.max(4,media.trimY-22);for(const [r,g,b] of [[0,1,1],[1,0,1],[1,1,0],[0,0,0]] as [number,number,number][]){ops.push(`${r} ${g} ${b} rg`,`${num(x)} ${num(y)} 12 6 re f`);x+=14;}}
 if(marks.pageInformation){ops.push('0 0 0 rg','BT /F1 7 Tf',`${num(media.trimX)} ${num(media.trimY+media.trimH+18)} Td`,`(Page ${pdfText(pageLabel(model,page.id))} | Astraea Publish) Tj ET`);}
 const mcids:Array<{frame:PublishFrame;mcid:number}>=[];let mcid=0;for(const f of frames){const x=media.trimX+f.xMm*MM_TO_PT,y=media.trimY+(page.geometry.heightMm-f.yMm-f.heightMm)*MM_TO_PT,w=f.widthMm*MM_TO_PT,h=f.heightMm*MM_TO_PT;const r=role(f);if(r==='Artifact')ops.push('/Artifact BMC');else{ops.push(`/${r} <</MCID ${mcid}>> BDC`);mcids.push({frame:f,mcid});mcid++;}ops.push('q');if(f.rotationDeg){const rad=f.rotationDeg*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),cx=x+w/2,cy=y+h/2;ops.push(`${num(c)} ${num(s)} ${num(-s)} ${num(c)} ${num(cx-c*cx+s*cy)} ${num(cy-s*cx-c*cy)} cm`);}if(f.fillColor&&f.fillColor!=='transparent'){const [rr,gg,bb]=rgbFromHex(f.fillColor);ops.push(`${num(rr)} ${num(gg)} ${num(bb)} rg`,`${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);}if(f.strokeWidthPt&&f.strokeWidthPt>0){const [rr,gg,bb]=rgbFromHex(f.strokeColor);ops.push(`${num(rr)} ${num(gg)} ${num(bb)} RG ${num(f.strokeWidthPt)} w`,`${num(x)} ${num(y)} ${num(w)} ${num(h)} re S`);}if(f.type==='text'&&f.content){const fs=Math.max(1,Math.min(2000,f.typography?.fontSizePt??f.fontSizePt??10));const [rr,gg,bb]=rgbFromHex('#111111');ops.push(`${num(rr)} ${num(gg)} ${num(bb)} rg`,'BT',`/F1 ${num(fs)} Tf`,`${num(x+3)} ${num(y+h-fs-3)} Td`,`(${pdfText(f.content)}) Tj`,'ET');}else if(f.type==='image'){ops.push('.92 .92 .92 rg',`${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`,'0 0 0 rg','BT /F1 6 Tf',`${num(x+3)} ${num(y+3)} Td`,`(${pdfText(f.altText??f.name)}) Tj ET`);}else if(f.type==='barcode'&&f.barcodeId){const barcode=model.barcodes.find(b=>b.id===f.barcodeId);if(barcode){const rows=barcode.modules.length,cols=barcode.modules[0]?.length??0;if(rows&&cols){const sx=w/cols,sy=h/rows;ops.push('0 0 0 rg');for(let rr=0;rr<rows;rr++)for(let cc=0;cc<cols;cc++)if(barcode.modules[rr][cc])ops.push(`${num(x+cc*sx)} ${num(y+(rows-1-rr)*sy)} ${num(sx+.1)} ${num(sy+.1)} re f`);}}}ops.push('Q',r==='Artifact'?'EMC':'EMC');}ops.push('Q');return{stream:ops.join('\n'),mcids};}

export async function buildPublishPdf(model:PublishDocumentModel,options:Partial<PublishPdfOptions>={}):Promise<PublishPdfResult>{const rawLanguage=String(model.frames.find(f=>f.type==='text')?.typography?.language??model.styles.find(style=>style.kind==='paragraph'&&typeof style.properties.language==='string')?.properties.language??'en');const documentLanguage=/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(rawLanguage)?rawLanguage:'en';const defaultMarks:PublishPrinterMarks={cropMarks:true,bleedMarks:true,registrationMarks:true,colorBars:true,pageInformation:true};const defaults:PublishPdfOptions={target:'PDF/X-4:2010',profileId:'FOGRA51',marks:defaultMarks,includeBleed:true,accessible:true,interactive:false,deterministicEpoch:'19700101000000Z',blockOnPreflightErrors:false};const opts:PublishPdfOptions={...defaults,...options,marks:{...defaultMarks,...options.marks}};const preflight=runPublishPreflight(model,createDefaultPreflightProfile(opts.profileId));if(opts.blockOnPreflightErrors&&preflight.some(f=>f.severity==='error'))throw new PublishModelError('pdf-preflight-blocked');const objs=new PdfObjects();const catalogId=objs.add('');const pagesId=objs.add('');const fontId=objs.add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');const infoId=objs.add(`<< /Title (${pdfText('Astraea Publish')}) /Creator (Astraea Publish) /Producer (VisionGaiaTechnology) /CreationDate (D:${pdfText(opts.deterministicEpoch??'19700101000000Z')}) ${opts.target.startsWith('PDF/X')?`/GTS_PDFXVersion (${opts.target})`:''} >>`);
 /**
  * **Der Ausgabeintent — und das eingebettete Profil, wenn es wirklich vorliegt.**
  *
  * Gemessen (`AST-1417`, P0): der Intent trug den Bedingungsnamen, aber **kein** `/DestOutputProfile`. Für
  * PDF/X-4 genügt eine **registrierte** Bedingung namentlich; für **PDF/X-1a** ist das Profil Pflicht. Deshalb
  * wird es nur eingebettet, wenn Bytes gereicht werden — und die Pflichtprüfung unten lehnt PDF/X-1a ohne Profil
  * **benannt** ab, statt eine Datei mit falschem Etikett herauszugeben.
  */
 const profileBytes=opts.outputProfileBytes;
 const destOutputProfileId=profileBytes&&profileBytes.byteLength>0?objs.add(`<< /N 4 /Length ${profileBytes.byteLength} >>\nstream\n${Array.from(profileBytes,(b)=>String.fromCharCode(b)).join('')}\nendstream`):null;
 const outputIntentId=objs.add(`<< /Type /OutputIntent /S /GTS_PDFX /OutputConditionIdentifier (${opts.profileId}) /OutputCondition (${opts.profileId}) /RegistryName (http://www.color.org)${destOutputProfileId?` /DestOutputProfile ${destOutputProfileId} 0 R`:''} >>`);
 /**
  * **Das XMP-Paket mit der PDF/X-Identifikation** — das, was eine Datei **zu** PDF/X macht.
  *
  * Gemessen: bis hierher stand `/GTS_PDFXVersion` nur im **Info**-Wörterbuch; die Identifikation liegt in PDF/X
  * aber im **XMP**, und ein Prüfer sucht dort. Das Paket ist deterministisch (ohne Zeitstempel), damit derselbe
  * Auftrag dieselben Bytes ergibt — die Determinismus-Zusage dieses Bauers bleibt damit wahr.
  */
 const metadataId=isPublishPdfXTarget(opts.target)?objs.add(`<< /Type /Metadata /Subtype /XML /Length ${enc.encode(buildPdfXMetadataPacket(opts.target,opts.profileId)).length} >>\nstream\n${buildPdfXMetadataPacket(opts.target,opts.profileId)}\nendstream`):null;const structRootId=objs.add('');const parentTreeId=objs.add('');const pageIds:number[]=[],pageParentArrays:string[]=[];const structElementIds:number[]=[];const annotationIds:number[]=[];
 for(let i=0;i<model.pages.length;i++){const page=model.pages[i],g=page.geometry,bleed=opts.includeBleed?g.bleedMm*MM_TO_PT:0,slug=g.slugMm*MM_TO_PT,extra=(opts.marks.cropMarks||opts.marks.registrationMarks||opts.marks.colorBars||opts.marks.pageInformation)?Math.max(36,slug+bleed+18):bleed;const trimW=g.widthMm*MM_TO_PT,trimH=g.heightMm*MM_TO_PT,mediaW=trimW+extra*2,mediaH=trimH+extra*2,trimX=extra,trimY=extra;const rendered=contentForPage(model,i,opts.marks,{w:mediaW,h:mediaH,trimX,trimY,trimW,trimH});const contentId=objs.add(`<< /Length ${enc.encode(rendered.stream).length} >>\nstream\n${rendered.stream}\nendstream`);const pageId=objs.add('');pageIds.push(pageId);const refs:string[]=[];for(const item of rendered.mcids){const r=role(item.frame);const elemId=objs.add('');structElementIds.push(elemId);const alt=item.frame.altText?` /Alt (${pdfText(item.frame.altText)})`:'';objs.set(elemId,`<< /Type /StructElem /S /${r} /P ${structRootId} 0 R /Pg ${pageId} 0 R /K ${item.mcid}${alt} >>`);refs[item.mcid]=`${elemId} 0 R`;}
  pageParentArrays[i]=`[${refs.join(' ')}]`;const annots:number[]=[];if(opts.interactive){for(const f of pageFrameOrder(model,page.id)){if(f.semanticRole!=='Link'&&!f.workspaceReferenceId)continue;const x1=trimX+f.xMm*MM_TO_PT,y1=trimY+(g.heightMm-f.yMm-f.heightMm)*MM_TO_PT,x2=x1+f.widthMm*MM_TO_PT,y2=y1+f.heightMm*MM_TO_PT;const ref=f.workspaceReferenceId?model.workspaceReferences.find(r=>r.id===f.workspaceReferenceId):undefined;const uri=ref?.canonicalUri??'vgt://workspace/';const aid=objs.add(`<< /Type /Annot /Subtype /Link /Rect [${num(x1)} ${num(y1)} ${num(x2)} ${num(y2)}] /Border [0 0 0] /A << /S /URI /URI (${pdfUriByteStringLiteral(uri)}) >> >>`);annots.push(aid);annotationIds.push(aid);}}
  const bleedBox=`[${num(trimX-bleed)} ${num(trimY-bleed)} ${num(trimX+trimW+bleed)} ${num(trimY+trimH+bleed)}]`;objs.set(pageId,`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(mediaW)} ${num(mediaH)}] /TrimBox [${num(trimX)} ${num(trimY)} ${num(trimX+trimW)} ${num(trimY+trimH)}] /BleedBox ${bleedBox} /ArtBox [${num(trimX)} ${num(trimY)} ${num(trimX+trimW)} ${num(trimY+trimH)}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R /StructParents ${i}${annots.length?` /Annots [${annots.map(id=>`${id} 0 R`).join(' ')}]`:''} >>`);}
 objs.set(pagesId,`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>`${id} 0 R`).join(' ')}] >>`);objs.set(parentTreeId,`<< /Nums [${pageParentArrays.map((arr,i)=>`${i} ${arr}`).join(' ')}] >>`);objs.set(structRootId,`<< /Type /StructTreeRoot /K [${structElementIds.map(id=>`${id} 0 R`).join(' ')}] /ParentTree ${parentTreeId} 0 R >>`);objs.set(catalogId,`<< /Type /Catalog /Pages ${pagesId} 0 R /Lang (${pdfText(documentLanguage)}) /MarkInfo << /Marked ${opts.accessible?'true':'false'} >> /StructTreeRoot ${structRootId} 0 R /Trapped /False${metadataId?` /Metadata ${metadataId} 0 R`:''} ${opts.target.startsWith('PDF/X')?`/OutputIntents [${outputIntentId} 0 R]`:''} >>`);
 const text=objs.finish(catalogId,infoId);
 /**
  * **Fail-closed vor der Herausgabe** ✓✓ (`AST-1417`).
  *
  * Der Strom wird gegen die **eine** Pflichtdefinition geprüft (`publishPdfStructure.ts`), und zwar **bevor**
  * Bytes entstehen: *eine Datei, die sich PDF/X nennt und eine Pflicht nicht trägt, ist eine Attrappe.* Für
  * PDF/X-1a ohne eingebettetes Profil heisst das: **benannte Ablehnung** statt falsches Etikett.
  */
 assertPdfXExportable(text,opts.target);
 const bytes=enc.encode(text);const marksApplied=Object.entries(opts.marks).filter(([,v])=>v).map(([k])=>k);return{bytes,text,sha256:await sha(bytes),target:opts.target,pages:model.pages.length,preflight,marksApplied,outputCondition:opts.profileId,deterministic:true};}
