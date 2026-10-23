// STATUS: DIAMANT VGT SUPREME — authenticated .vconnect local store
import type{ConnectAccount,ConnectCalendar,ConnectContact,ConnectContactGroup,ConnectEvent,ConnectFolder,ConnectMailCacheState,ConnectMessage,ConnectSavedSearch}from'../../../platform/connectors/connectCoreTypes';
import type{ConnectDocumentModel}from'../domain/types';
import { parseHostileJson } from '../../../shared/security/hostileJson';
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';
/**
 * BATCH-CONNECT-2: `vgtConnectView` is the Connect-owned view projection of the canonical store. It is
 * optional so older `.vconnect` files stay readable, and it exists because the canonical `ConnectMessage`
 * (`platform/connectors/connectCoreTypes.ts:21`) has no field for the user-facing `folder`, `delivery`
 * or `isEncrypted` state — deriving those from a lossy legacy adapter would lose data on reopen.
 */
export interface ConnectStore{schema:'astraea-vconnect-v1';accounts:ConnectAccount[];folders:ConnectFolder[];messages:ConnectMessage[];mailCache:ConnectMailCacheState[];calendars:ConnectCalendar[];events:ConnectEvent[];contacts:ConnectContact[];groups:ConnectContactGroup[];savedSearches:ConnectSavedSearch[];updatedAt:number;vgtConnectView?:ConnectDocumentModel;}
export class ConnectStoreError extends Error{constructor(public readonly code:string){super(code);this.name='ConnectStoreError';}}
/**
 * Inline-secret shapes the store must never contain; mirrored by `domain/connectCredentialBoundary.ts`.
 * A secret can also sit *inside* a JSON string value, where the quotes are escaped (`\"password\":\"x\"`),
 * so both quote forms are accepted — otherwise the guard silently misses that case.
 */
const INLINE_SECRET=/(?:\\?"(?:password|passwd|passphrase|secret|token|accessToken|refreshToken|apiKey|privateKey|authorization|bearer)\\?"\s*:\s*\\?"(?!keyvault:\/)[^"\\]{1,})|(?:-----BEGIN [A-Z ]*PRIVATE KEY-----)|(?:\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{16,})/i;
const E=new TextEncoder(),D=new TextDecoder('utf-8',{fatal:true}),MAGIC=E.encode('VGT3'),SALT=16,IV=12,TAG=16,MAX=128*1024*1024,ITER=210_000;
function cat(...p:Uint8Array[]){const n=p.reduce((x,y)=>x+y.byteLength,0),o=new Uint8Array(n);let k=0;for(const x of p){o.set(x,k);k+=x.byteLength;}return o;}
async function key(password:string,salt:Uint8Array){if(password.length<12||password.length>128)throw new ConnectStoreError('vconnect-password-policy');const m=await crypto.subtle.importKey('raw',E.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt: toOwnedArrayBuffer(salt),iterations:ITER},m,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
function random(n:number){const x=new Uint8Array(n);crypto.getRandomValues(x);return x;}
function validateStore(s:ConnectStore){if(s.schema!=='astraea-vconnect-v1')throw new ConnectStoreError('vconnect-schema');if(s.accounts.length>256||s.messages.length>1_000_000||s.events.length>500_000||s.contacts.length>500_000)throw new ConnectStoreError('vconnect-object-limit');const json=JSON.stringify(s);if(/"credentialHandle"\s*:\s*"(?!keyvault:\/)/i.test(json))throw new ConnectStoreError('vconnect-secret-reference-invalid');// Fail-closed sidecar (BATCH-CONNECT-2): a document that carries an inline credential is rejected
// entirely, so the store can never become a second place where a password lives.
if(INLINE_SECRET.test(json))throw new ConnectStoreError('vconnect-inline-secret-rejected');return json;}
export async function packVConnect(store:ConnectStore,password:string):Promise<Uint8Array>{const plain=E.encode(validateStore(store));if(plain.byteLength>MAX-128)throw new ConnectStoreError('vconnect-size-limit');const salt=random(SALT),iv=random(IV),k=await key(password,salt);const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:MAGIC},k,plain));return cat(MAGIC,salt,iv,cipher);}
export async function unpackVConnect(bytes:Uint8Array,password:string):Promise<ConnectStore>{if(bytes.byteLength<4+SALT+IV+TAG||bytes.byteLength>MAX||D.decode(bytes.subarray(0,4))!=='VGT3')throw new ConnectStoreError('vconnect-container-invalid');const salt=bytes.subarray(4,20),iv=bytes.subarray(20,32),cipher=bytes.subarray(32),k=await key(password,salt);try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv: toOwnedArrayBuffer(iv),additionalData:toOwnedArrayBuffer(MAGIC)},k,toOwnedArrayBuffer(cipher));const parsed=parseHostileJson(D.decode(plain),{maxBytes:MAX,maxDepth:96,maxNodes:1_000_000,maxStringChars:1_048_576,maxObjectKeys:100_000,maxArrayItems:1_000_000}) as ConnectStore;validateStore(parsed);return parsed;}catch{throw new ConnectStoreError('vconnect-authentication-failed');}}
