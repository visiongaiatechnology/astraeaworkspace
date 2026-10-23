// STATUS: DIAMANT VGT SUPREME — BATCH-CONNECT-6: visible Connect UI ↔ canonical core bridge, both directions
// BATCH-CONNECT-6 adds the inverse mapping (`coreMessageToLegacy`, `coreEventToLegacy`,
// `coreContactToLegacy`) in this same module, so the canonical arrays of a `.vconnect` file can be
// read back without a second parser and without inventing fields the canonical model cannot carry.
import type{ConnectDocumentModel,ConnectMessage as LegacyMessage,ConnectEvent as LegacyEvent,ConnectContact as LegacyContact}from'../domain/types';
import type{ConnectDraft,ConnectMessage,ConnectEvent,ConnectContact}from'../../../platform/connectors/connectCoreTypes';
import{normalizeDraft,queueDraft,searchMessages}from'../domain/connectMailCore';
import{selectVisibleMessages}from'../domain/connectMailboxView';
import{validateEvent}from'../domain/connectCalendarCore';
import{validateContact}from'../domain/connectContactsCore';
// One rule for "what is a valid Message-ID": the reply core owns it, and the inverse mapping below
// must not grow a second regex for the same concept.
import{normalizeMessageId}from'../domain/connectReplyCore';
const LOCAL_SOURCE={kind:'local' as const,sourceId:'connect-ui'};
export function legacyMessageToCore(m:LegacyMessage):ConnectMessage{const headers:Record<string,string>={};if(m.inReplyTo)headers['in-reply-to']=m.inReplyTo;if(m.references?.length)headers['references']=m.references.join(' ');if(m.replyTo)headers['reply-to']=m.replyTo;const measuredBytes=new Map((m.attachmentBytes??[]).map((a)=>[a.name,a.sizeBytes]));return{id:m.id,accountId:'connect-ui-local',messageId:m.messageId??`<${m.id}@astraea.local>`,threadId:m.threadId??`thread:${m.id}`,folderId:`connect-ui-local:${m.folder}`,labels:m.labels??[],from:{name:m.sender,address:m.senderEmail.includes('@')?m.senderEmail:'unknown@invalid.test'},to:m.recipients.map(address=>({address:address.includes('@')?address:'unknown@invalid.test'})),cc:(m.cc??[]).map(address=>({address})),bcc:[],subject:m.subject,bodyText:m.body,format:'plain',receivedAt:m.timestamp,priority:'normal',readReceiptRequested:false,isRead:!m.isUnread,isStarred:m.isStarred,isPinned:false,isFlagged:false,// BATCH-CONNECT-6: an exact `attachmentBytes` measurement wins over the whole-kilobyte
  // `sizeKb` figure. Deriving the canonical size from `sizeKb` alone made a 3-byte attachment read
  // as `sizeBytes: 0` in the canonical store (measured), which is precisely the "size claim with no
  // transfer behind it" shape AST-1603 exists to prevent.
  attachments:(m.attachments??[]).map((a,i)=>({id:`${m.id}:att:${i}`,name:a.name,sizeBytes:measuredBytes.get(a.name)??Math.max(0,a.sizeKb)*1024,declaredMime:'application/octet-stream',detectedMime:'application/octet-stream',safePreview:false,malwareScanState:'not-scanned'})),headers,remoteContentAllowed:false,security:{encryptedBy:m.isEncrypted?'pgp':undefined,signedBy:m.signatureKind,signatureStatus:m.signatureStatus,phishingIndicators:[],remoteContentBlocked:true}};}
export function filterLegacyMessages(model:ConnectDocumentModel):LegacyMessage[]{let rows=selectVisibleMessages(model);if(model.searchQuery.trim()){const ids=new Set(searchMessages(rows.map(legacyMessageToCore),model.searchQuery).map(m=>m.id));rows=rows.filter(m=>ids.has(m.id));}return rows;}
export function validateCompose(to:string,subject:string,body:string,now=Date.now()):ConnectDraft{const draft:ConnectDraft={id:`draft:${now}`,accountId:'connect-ui-local',identityId:'local-identity',to:to.split(',').map(x=>({address:x.trim()})).filter(x=>x.address),cc:[],bcc:[],subject,bodyText:body,format:'plain',attachments:[],priority:'normal',readReceiptRequested:false,updatedAt:now};return normalizeDraft(draft);}
export function queueCompose(to:string,subject:string,body:string,now=Date.now()){return queueDraft(validateCompose(to,subject,body,now),now,10_000,now);}
/**
 * BATCH-CONNECT-4: queue a compose draft that already carries reply/forward headers. The draft is
 * validated by the same `normalizeDraft` path, so a reply cannot bypass the recipient/attachment
 * bounds that a new message has to satisfy.
 */
export function queueComposeDraft(draft:ConnectDraft,now=Date.now()){return queueDraft(normalizeDraft(draft),now,10_000,now);}
export function composeDraftFromFields(fields:{to:string;cc?:string;subject:string;body:string;inReplyTo?:string;references?:readonly string[];replyToMessageId?:string;forwardOfMessageId?:string;attachments?:ConnectDraft['attachments']},now=Date.now()):ConnectDraft{return normalizeDraft({id:`draft:${now}`,accountId:'connect-ui-local',identityId:'local-identity',to:fields.to.split(',').map(x=>({address:x.trim()})).filter(x=>x.address),cc:(fields.cc??'').split(',').map(x=>({address:x.trim()})).filter(x=>x.address),bcc:[],subject:fields.subject,bodyText:fields.body,format:'plain',attachments:fields.attachments??[],priority:'normal',readReceiptRequested:false,replyToMessageId:fields.replyToMessageId,forwardOfMessageId:fields.forwardOfMessageId,updatedAt:now});}
export function legacyEventToCore(e:LegacyEvent):ConnectEvent{return validateEvent({id:e.id,calendarId:'connect-ui-local',uid:`${e.id}@astraea.local`,title:e.title,start:`${e.startDate}T${e.startTime}:00Z`,end:`${e.endDate}T${e.endTime}:00Z`,allDay:false,timezone:'UTC',location:e.location,categories:[e.category],notes:e.description,attachments:[],alerts:[],attendees:e.attendees.map(address=>({address,role:'required',status:'needs-action'})),status:'confirmed',sequence:0});}
/**
 * BATCH-CONNECT-6: the two directions of `legacyMessageToCore` live in the *same* module, so a
 * `.vconnect` file written by another app (or by an older build without `vgtConnectView`) can be read
 * back as the messages the canonical arrays really carry. `fromConnectStore` used to hand back the
 * caller's in-memory fallback instead, which reported a payload the container never held.
 *
 * The inverse is deliberately lossy in exactly the places the canonical model is lossy (there is no
 * `ConnectMessage` field for `delivery`, `isEncrypted` or `remoteUid`); those stay undefined and must
 * not be invented here. Everything the canonical arrays *do* carry is recovered verbatim.
 */
const CONNECT_LEGACY_FOLDERS:ReadonlySet<string>=new Set(['inbox','sent','drafts','archive','vault','junk','trash']);
const folderIdPrefix=(folderId:string):LegacyMessage['folder']=>{const name=folderId.slice(folderId.indexOf(':')+1);return(CONNECT_LEGACY_FOLDERS.has(name)?name:'inbox') as LegacyMessage['folder'];};
const dateTimeParts=(iso:string):[string,string]=>{const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);return match?[match[1],match[2]]:['1970-01-01','00:00'];};
/**
 * `normalizeMessageId` is typed `(raw: string)` and throws on `undefined` (`raw.trim()`), while it
 * answers `undefined` for an empty string. An absent header is the normal case for the first mail of
 * a thread, so the inverse mapping needs the total form; it is wrapped here rather than loosening the
 * reply core's signature, which other call sites rely on.
 */
const optionalMessageId=(raw:string|undefined):string|undefined=>{if(raw===undefined)return undefined;try{return normalizeMessageId(raw);}catch{return undefined;}};
export function coreMessageToLegacy(m:ConnectMessage):LegacyMessage{return{id:m.id,threadId:m.threadId,sender:m.from.name??m.from.address,senderEmail:m.from.address,recipients:m.to.map(r=>r.address),cc:m.cc.length?m.cc.map(r=>r.address):undefined,subject:m.subject,messageId:optionalMessageId(m.messageId),inReplyTo:optionalMessageId(m.headers['in-reply-to']),references:(m.headers['references']??'').match(/<[^<>]+>/g)?.slice(0,32),replyTo:optionalMessageId(m.headers['reply-to']),snippet:'',body:m.bodyText,timestamp:m.receivedAt,folder:folderIdPrefix(m.folderId),remoteFolderId:m.folderId,labels:m.labels.length?m.labels:undefined,isUnread:!m.isRead,isStarred:m.isStarred,isEncrypted:Boolean(m.security.encryptedBy),signatureStatus:m.security.signatureStatus,signatureKind:m.security.signedBy,attachments:m.attachments.length?m.attachments.map(a=>({name:a.name,sizeKb:Math.round(a.sizeBytes/1024)})):undefined,attachmentBytes:m.attachments.length?m.attachments.map(a=>({name:a.name,sizeBytes:a.sizeBytes,sha256:a.sha256})):undefined};}
export function coreEventToLegacy(e:ConnectEvent):LegacyEvent{const[startDate,startTime]=dateTimeParts(e.start);const[endDate,endTime]=dateTimeParts(e.end);return{id:e.id,title:e.title,startDate,startTime,endDate,endTime,location:e.location,category:(e.categories[0]??'general') as LegacyEvent['category'],attendees:e.attendees.map(a=>a.address),description:e.notes};}
export function coreContactToLegacy(c:ConnectContact):LegacyContact{return{id:c.id,fullName:c.displayName.value,email:c.emails[0]?.value??'',phone:c.phones[0]?.value,organization:c.organization?.value??'',role:c.notes?.value??'',gpgFingerprint:c.customFields.gpgFingerprint?.value};}
export function legacyContactToCore(c:LegacyContact,now=Date.now()):ConnectContact{return validateContact({id:c.id,accountId:'connect-ui-local',displayName:{value:c.fullName,source:LOCAL_SOURCE,updatedAt:now},emails:[{value:c.email,source:LOCAL_SOURCE,updatedAt:now}],phones:c.phone?[{value:c.phone,source:LOCAL_SOURCE,updatedAt:now}]:[],organization:c.organization?{value:c.organization,source:LOCAL_SOURCE,updatedAt:now}:undefined,addresses:[],notes:c.role?{value:c.role,source:LOCAL_SOURCE,updatedAt:now}:undefined,customFields:c.gpgFingerprint?{gpgFingerprint:{value:c.gpgFingerprint,source:LOCAL_SOURCE,updatedAt:now}}:{},tags:[],favorite:false});}
