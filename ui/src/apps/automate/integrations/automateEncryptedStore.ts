// STATUS: DIAMANT VGT SUPREME — Authenticated encrypted .vautomate local store.
import type { AutomateDocumentModel, FlowExecutionRun } from '../model/types';
import { toOwnedArrayBuffer } from '../../../shared/binary/ownedBufferSource';
const E=new TextEncoder(),D=new TextDecoder('utf-8',{fatal:true}),MAGIC=E.encode('VGT3'),SALT=16,IV=12,TAG=16,MAX=128*1024*1024,ITER=210_000;
export interface AutomateEncryptedStore{schema:'vgt.automate.store/1';model:AutomateDocumentModel;runs:FlowExecutionRun[];savedAt:number;}
export class AutomateStoreError extends Error{constructor(public readonly code:string){super(code);this.name='AutomateStoreError';}}
async function derive(password:string,salt:Uint8Array){if(password.length<8||password.length>128)throw new AutomateStoreError('vautomate-password-boundary');const material=await crypto.subtle.importKey('raw',E.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt: toOwnedArrayBuffer(salt),iterations:ITER},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
function randomBytes(n:number){const b=new Uint8Array(n);crypto.getRandomValues(b);return b;}
/**
 * Die Kennung wird BYTEWEISE geprueft, nicht ueber den `fatal`-Decoder. `D.decode(bytes.subarray(0,4))`
 * wirft bei ungueltigem UTF-8 einen `TypeError` — und diese Pruefung steht AUSSERHALB des `try`, das
 * jeden Fehler auf die benannte `vautomate-authentication-failed` abbildet. Ein Container mit Kopfbytes
 * wie `FF FE FD FC` liess damit einen UNBENANNTEN Fehler entweichen; ein Aufrufer, der nur
 * `AutomateStoreError` faengt, sah gar nichts. Der Zeuge steht in
 * `testing/integration/automateEncryptedStore.test.ts`; er war vor dieser Funktion rot.
 */
function hatMagie(bytes:Uint8Array){if(bytes.byteLength<4)return false;for(let i=0;i<4;i+=1)if(bytes[i]!==MAGIC[i])return false;return true;}
export async function packVAutomate(store:AutomateEncryptedStore,password:string):Promise<Uint8Array>{if(store.schema!=='vgt.automate.store/1'||store.runs.length>5000)throw new AutomateStoreError('vautomate-store-invalid');const plain=E.encode(JSON.stringify(store));if(plain.byteLength>MAX-TAG-32)throw new AutomateStoreError('vautomate-size-boundary');const salt=randomBytes(SALT),iv=randomBytes(IV),key=await derive(password,salt),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:MAGIC},key,plain)),out=new Uint8Array(4+SALT+IV+cipher.length);out.set(MAGIC);out.set(salt,4);out.set(iv,20);out.set(cipher,32);return out;}
export async function unpackVAutomate(bytes:Uint8Array,password:string):Promise<AutomateEncryptedStore>{if(bytes.byteLength<4+SALT+IV+TAG||bytes.byteLength>MAX||!hatMagie(bytes))throw new AutomateStoreError('vautomate-container-invalid');const key=await derive(password,bytes.subarray(4,20));try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:toOwnedArrayBuffer(bytes.subarray(20,32)),additionalData:toOwnedArrayBuffer(MAGIC)},key,toOwnedArrayBuffer(bytes.subarray(32)));const parsed=JSON.parse(D.decode(plain)) as AutomateEncryptedStore;if(parsed.schema!=='vgt.automate.store/1'||!parsed.model||!Array.isArray(parsed.runs)||parsed.runs.length>5000)throw new Error('shape');return parsed;}catch{throw new AutomateStoreError('vautomate-authentication-failed');}}
