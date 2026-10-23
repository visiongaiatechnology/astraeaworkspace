// STATUS: DIAMANT VGT SUPREME — local-only content extraction adapters for Vault search.
import type { WorkspaceDocument } from '../../contracts/workspace';
import { importOfficeDocument } from '../../../platform/interop/index';
import { dataUrlToBytes } from '../integrity/vaultIntegrity';
import { openPdfDocumentForInspection } from '../../../platform/documents/pdfjs/pdfDocumentInspection';
import { isLocalTextDetectionAvailable, performLocalImageOcr } from '../../../platform/media/ocr/localTextDetection';
import type { VaultSearchAdapters } from './vaultSearchEngine';

const MAX_EXTRACT_CHARS = 512_000;
const MAX_PDF_PAGES = 256;
const OFFICE_EXTENSIONS = new Set(['docx','xlsx','pptx','ods']);

function extension(name:string):string{const i=name.lastIndexOf('.');return i>=0?name.slice(i+1).toLowerCase():'';}
function isTextMime(mime:string):boolean{return mime.startsWith('text/')||['application/json','application/xml','application/yaml'].includes(mime);}

export function extractWorkspaceSearchText(document: WorkspaceDocument): string {
  const parts:string[]=[]; let chars=0; let nodes=0;
  const seen=new WeakSet<object>();
  const visit=(value:unknown,depth:number,key='')=>{
    if(chars>=MAX_EXTRACT_CHARS||nodes>=50_000||depth>16||value==null)return;
    nodes++;
    if(typeof value==='string'){
      if(key==='payloadDataUrl'||key==='src'||value.startsWith('data:'))return;
      const take=value.slice(0,Math.max(0,MAX_EXTRACT_CHARS-chars)); if(take){parts.push(take);chars+=take.length;} return;
    }
    if(typeof value!=='object')return;
    if(seen.has(value as object))return; seen.add(value as object);
    if(Array.isArray(value)){for(const item of value)visit(item,depth+1);return;}
    for(const [childKey,child] of Object.entries(value as Record<string,unknown>)) visit(child,depth+1,childKey);
  };
  visit({title:document.title,objects:document.objects},0);
  return parts.join('\n').slice(0,MAX_EXTRACT_CHARS);
}

async function pdfText(bytes:Uint8Array):Promise<string>{
  const pdf=await openPdfDocumentForInspection(bytes); try{
    const parts:string[]=[];let chars=0;const pages=Math.min(pdf.snapshot.pageCount,MAX_PDF_PAGES);
    for(let page=1;page<=pages&&chars<MAX_EXTRACT_CHARS;page++){
      const items=await pdf.getTextItems(page);const text=items.map((item)=>item.str).join(' ');const take=text.slice(0,MAX_EXTRACT_CHARS-chars);parts.push(take);chars+=take.length;
    }
    return parts.join('\n');
  }finally{await pdf.destroy();}
}

export const vaultSearchAdapters: VaultSearchAdapters = {
  async extractAttachmentText(file){
    if(!file.payloadDataUrl)return '';
    const bytes=dataUrlToBytes(file.payloadDataUrl);const mime=file.mimeType??'application/octet-stream';
    if(isTextMime(mime))return new TextDecoder('utf-8',{fatal:false}).decode(bytes).slice(0,MAX_EXTRACT_CHARS);
    if(mime==='application/pdf'||extension(file.name)==='pdf')return pdfText(bytes);
    if(OFFICE_EXTENSIONS.has(extension(file.name))){const imported=await importOfficeDocument(new File([bytes as unknown as BlobPart],file.name,{type:mime}));return extractWorkspaceSearchText(imported);}
    return '';
  },
  async extractWorkspaceText(document){return extractWorkspaceSearchText(document);},
  async extractOcrText(file){
    if(!file.payloadDataUrl||!['image/png','image/jpeg','image/webp'].includes(file.mimeType??'')||!isLocalTextDetectionAvailable())return '';
    const result=await performLocalImageOcr(file.payloadDataUrl);return result.fullText.slice(0,MAX_EXTRACT_CHARS);
  },
};
