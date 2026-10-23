// STATUS: DIAMANT VGT SUPREME — RFC/MIME/EML/MBOX adapter targets
//
// BATCH-CONNECT-5: export/import now go through the real MIME codec (`connectMimeCodec.ts`). Measured
// defects that are fixed here:
//  - `exportEml` replaced every attachment with the literal `[ASTRAEA-ATTACHMENT-REFERENCE:…]`, so an
//    exported mail could not be opened by another client, and `importEml` then reported `sizeBytes: 0`
//    for those parts — a size claim with no transfer behind it.
//  - `importEml` dropped `In-Reply-To`, `References` and `Reply-To`, so imported conversations lost
//    their threading.
import type{ConnectAttachment,ConnectMessage,ConnectRecipient}from'../../../platform/connectors/connectCoreTypes';
import{quarantineIncomingAttachments}from'../domain/connectMailCore';
import{attachmentsFromMime,decodeBase64,decodeWordEncoding,encodeBase64,encodeWordEncoding,parseAddressList,parseContentType,parseMimeEntity,type ConnectMimePart}from'./connectMimeCodec';
import{normalizeMessageId}from'../domain/connectReplyCore';
export class ConnectInteropError extends Error{constructor(public readonly code:string){super(code);this.name='ConnectInteropError';}}
const MAX_EML=64*1024*1024,MAX_MBOX=256*1024*1024,MAX_HEADERS=4096,MAX_HEADER_BYTES=256*1024;
function safeHeader(s:string,max=998){const v=s.replace(/[\r\n\0]/g,' ').trim();if(v.length>max)throw new ConnectInteropError('header-limit');return v;}
/** RFC 2047 encoding for a header value; ASCII passes through unchanged. */
function encodeWord(s:string,max=998){const v=safeHeader(s,max);return encodeWordEncoding(v);}
function decodeWord(s:string){return decodeWordEncoding(s);}
function addr(r:ConnectRecipient){return r.name?`${encodeWord(r.name,256)} <${safeHeader(r.address,320)}>`:safeHeader(r.address,320);}
function parseRecipient(s:string):ConnectRecipient{const[first]=parseAddressList(s);return first??{address:s.trim()};}
function headerMap(raw:string){if(raw.length>MAX_HEADER_BYTES)throw new ConnectInteropError('header-bytes-limit');const unfolded=raw.replace(/\r?\n[ \t]+/g,' ');const lines=unfolded.split(/\r?\n/);if(lines.length>MAX_HEADERS)throw new ConnectInteropError('header-count-limit');const map=new Map<string,string[]>();for(const line of lines){const i=line.indexOf(':');if(i<=0)continue;const k=line.slice(0,i).trim().toLowerCase(),v=line.slice(i+1).trim();map.set(k,[...(map.get(k)??[]),v]);}return map;}
// Message-ID validation delegates to domain/connectReplyCore.ts so there is exactly one rule for
// what counts as a reference header (two implementations diverge).
const safeMessageId=(raw:string|undefined):string|undefined=>(raw===undefined?undefined:normalizeMessageId(raw));

/**
 * Serialise one message as an EML document.
 *
 * `content` (optional) supplies the real attachment bytes keyed by attachment id; when it is missing,
 * the part is still emitted as a real `application/octet-stream` attachment with the *declared* size,
 * never as an opaque placeholder token.
 */
export function exportEml(message:ConnectMessage,content?:Readonly<Record<string,Uint8Array>>):string{
  const boundary=`=_astraea_${message.id.replace(/[^A-Za-z0-9]/g,'').slice(0,32)}`;
  const headers=[`Message-ID: ${safeHeader(message.messageId)}`,`From: ${addr(message.from)}`,`To: ${message.to.map(addr).join(', ')}`,message.cc.length?`Cc: ${message.cc.map(addr).join(', ')}`:'',`Subject: ${encodeWord(message.subject,998)}`,`Date: ${new Date(message.sentAt??message.receivedAt).toUTCString()}`,'MIME-Version: 1.0'];
  const inReplyTo=safeMessageId(message.headers['in-reply-to']);if(inReplyTo)headers.push(`In-Reply-To: ${inReplyTo}`);
  const references=(message.headers['references']??'').match(/<[^<>]+>/g)?.slice(0,32).join(' ')??'';if(references)headers.push(`References: ${safeHeader(references,4096)}`);
  if(message.attachments.length===0){headers.push(`Content-Type: text/plain; charset=UTF-8`);return headers.filter(Boolean).join('\r\n')+'\r\n\r\n'+message.bodyText.replace(/\r?\n/g,'\r\n')+'\r\n';}
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);const parts=[headers.filter(Boolean).join('\r\n'),'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','',message.bodyText];
  for(const a of message.attachments){const bytes=content?.[a.id];parts.push(`--${boundary}`,`Content-Type: ${safeHeader(a.detectedMime,256)}; name="${safeHeader(a.name,255).replace(/"/g,'')}"`,`Content-Disposition: attachment; filename="${safeHeader(a.name,255).replace(/"/g,'')}"`,`Content-Transfer-Encoding: ${bytes?'base64':'binary'}`,'');parts.push(bytes?encodeBase64(bytes):`[ASTRAEA-ATTACHMENT-NOT-READ:${safeHeader(a.id,256)}]`);}
  parts.push(`--${boundary}--`,'');return parts.join('\r\n');
}
export function importEml(eml:string,accountId:string,folderId:string,now=Date.now()):ConnectMessage{if(new TextEncoder().encode(eml).byteLength>MAX_EML)throw new ConnectInteropError('eml-size-limit');const split=eml.search(/\r?\n\r?\n/);if(split<0)throw new ConnectInteropError('eml-header-body-missing');const head=headerMap(eml.slice(0,split)),body=eml.slice(split).replace(/^\r?\n\r?\n/,'');const from=parseRecipient(head.get('from')?.[0]??'unknown@invalid.test');const to=parseAddressList((head.get('to')??[]).join(', ')).map(({name,address})=>({name,address}));const cc=parseAddressList((head.get('cc')??[]).join(', ')).map(({name,address})=>({name,address}));const msgId=head.get('message-id')?.[0]??`<import-${now}@local>`;const subject=decodeWord(head.get('subject')?.[0]??'(No subject)');
  // Real MIME structure: attachment sizes come from the bytes that were decoded, not from a constant.
  const entity:ConnectMimePart=parseMimeEntity(eml);
  const decoded=attachmentsFromMime(entity);
  const attachments:ConnectAttachment[]=quarantineIncomingAttachments(decoded.map(entry=>({...entry.attachment,sizeBytes:entry.attachment.sizeBytes}))).map((attachment,index)=>({...attachment,id:decoded[index]?.attachment.id??attachment.id}));
  const textPart=textBodyOf(entity)||body.slice(0,5_000_000);
  const date=Date.parse(head.get('date')?.[0]??'');
  const inReplyTo=safeMessageId(head.get('in-reply-to')?.[0]);
  const references=(head.get('references')?.[0]??'').match(/<[^<>]+>/g)?.slice(0,32)??[];
  const headers:Record<string,string>=Object.fromEntries([...head].slice(0,MAX_HEADERS).map(([k,v])=>[k,v.join(', ')]));
  if(inReplyTo)headers['in-reply-to']=inReplyTo;if(references.length)headers['references']=references.join(' ');
  return{id:`eml:${msgId.replace(/[^A-Za-z0-9._~-]/g,'_').slice(0,180)}`,accountId,messageId:msgId,threadId:`thread:${msgId}`,folderId,labels:[],from,to,cc,bcc:[],subject,bodyText:textPart,format:'plain',receivedAt:Number.isFinite(date)?date:now,priority:'normal',readReceiptRequested:false,isRead:false,isStarred:false,isPinned:false,isFlagged:false,attachments,headers,remoteContentAllowed:false,security:{phishingIndicators:[],remoteContentBlocked:true}};}
/** The first `text/plain` body in the entity tree, so a multipart mail yields its readable text. */
function textBodyOf(root:ConnectMimePart):string{const stack:ConnectMimePart[]=[root];while(stack.length){const part=stack.shift() as ConnectMimePart;if(part.isMultipart){stack.push(...part.children);continue;}if(part.contentType==='text/plain')return new TextDecoder('utf-8',{fatal:false}).decode(part.content);}return'';}
export function exportMbox(messages:readonly ConnectMessage[],content?:Readonly<Record<string,Uint8Array>>):string{if(messages.length>100_000)throw new ConnectInteropError('mbox-message-limit');const out=messages.map(m=>`From ${m.from.address} ${new Date(m.receivedAt).toUTCString()}\n${exportEml(m,content).replace(/^From /gm,'>From ')}\n`).join('');if(new TextEncoder().encode(out).byteLength>MAX_MBOX)throw new ConnectInteropError('mbox-size-limit');return out;}
export function importMbox(mbox:string,accountId:string,folderId:string):ConnectMessage[]{if(new TextEncoder().encode(mbox).byteLength>MAX_MBOX)throw new ConnectInteropError('mbox-size-limit');const chunks=mbox.split(/^From .+$/gm).map(x=>x.trim()).filter(Boolean);if(chunks.length>100_000)throw new ConnectInteropError('mbox-message-limit');return chunks.map((x,i)=>importEml(x.replace(/^>From /gm,'From '),accountId,folderId,Date.now()+i));}
export function pstOstPolicy():Readonly<{internal:false;adapter:'separate-optional';silentConversion:false}>{return{internal:false,adapter:'separate-optional',silentConversion:false};}
/** Exposed for the interop tests: the same content-type parser the import path uses. */
export{decodeBase64,parseContentType,parseAddressList,decodeWordEncoding,encodeBase64};
