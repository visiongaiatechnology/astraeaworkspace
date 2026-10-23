// STATUS: DIAMANT VGT SUPREME — encrypted native Astraea Publish interchange
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import type { PublishDocumentModel } from '../../../../shared/contracts/publish/workspacePublish';
import { packLocalEncryptedContainer, unpackLocalEncryptedContainer } from '../../../../platform/containers/container';
import { assertPublishDocument, PublishModelError } from '../../model/publishDocumentEngine';

export const PUBLISH_NATIVE_LIMITS={maxBytes:128*1024*1024} as const;
export interface PublishNativeOptions { password?:string; pin?:string; }
function assertPublishWorkspaceDocument(doc:WorkspaceDocument):asserts doc is WorkspaceDocument&{publishData:PublishDocumentModel}{if(doc.kind!=='Publish'||!doc.publishData)throw new PublishModelError('publish-workspace-payload-missing');assertPublishDocument(doc.publishData);}
function assertEncryptedMagic(bytes:Uint8Array):void{const magic=new TextDecoder().decode(bytes.subarray(0,4));if(!['VGT2','VGT3','VGT4','VGT5'].includes(magic))throw new PublishModelError('native-container-unencrypted');}
export async function packNativePublish(document:WorkspaceDocument,options:PublishNativeOptions={}):Promise<Uint8Array>{
  assertPublishWorkspaceDocument(document);const bytes=await packLocalEncryptedContainer(document,options);if(bytes.byteLength<16||bytes.byteLength>PUBLISH_NATIVE_LIMITS.maxBytes)throw new PublishModelError('native-size-boundary');assertEncryptedMagic(bytes);return bytes;
}
export async function unpackNativePublish(bytes:Uint8Array,options:PublishNativeOptions={}):Promise<WorkspaceDocument>{
  if(!(bytes instanceof Uint8Array)||bytes.byteLength<16||bytes.byteLength>PUBLISH_NATIVE_LIMITS.maxBytes)throw new PublishModelError('native-size-boundary');assertEncryptedMagic(bytes);const doc=await unpackLocalEncryptedContainer(bytes,options);assertPublishWorkspaceDocument(doc);return doc;
}
