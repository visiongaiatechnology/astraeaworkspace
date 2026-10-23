/**
 * Astraea Vault — production-path local cryptographic self-test.
 * No result claims live relay/network/hardware backing; every test executes the same local cores used by Vault.
 * STATUS: DIAMANT VGT SUPREME
 */
import { packBrowserCredentialContainer, unpackBrowserCredentialContainer } from '../../../../platform/containers/browserContainerCrypto';
import type { WorkspaceDocument } from '../../../../shared/contracts/workspace';
import { buildVaultChunkIntegrity, verifyVaultChunkIntegrity } from '../../../../shared/vault/integrity/vaultIntegrity';
import { detectVaultExecutable } from '../../../../shared/vault/preview/vaultPreviewQuarantineEngine';
import {
  generateHardwareBoundKeyPair,
  signWithHardwareKey,
  verifyHardwareSignature,
  generateAttestationReport,
  zeroizeMemoryBuffer,
} from '../../../../shared/vault/security/hardware/vaultHardwareKeyEngine';

export interface VaultTestResult { id:string; name:string; passed:boolean; durationMs:number; message:string; }
export interface VaultSuiteReport {
  suite: 'Astraea Vault Local Security Self-Test';
  timestamp:string; overallPassed:boolean; passedCount:number; totalCount:number; results:VaultTestResult[];
}

const sampleDocument = (): WorkspaceDocument => ({
  schema_version:1,id:'vault-self-test',title:'Vault self-test',kind:'Vault',created_at:1,modified_at:1,version:1,
  theme_id:'default',root_object_ids:[],objects:{},vaultData:{files:[],folders:[],spaces:[],shares:[],trash:[]},
});

async function runCase(id:string,name:string,operation:()=>Promise<string>):Promise<VaultTestResult>{
  const started=performance.now();
  try{return {id,name,passed:true,durationMs:Math.round((performance.now()-started)*100)/100,message:await operation()};}
  catch(error){return {id,name,passed:false,durationMs:Math.round((performance.now()-started)*100)/100,message:error instanceof Error?error.message:'self_test_failed'};}
}

export async function runVaultTestSuite():Promise<VaultSuiteReport>{
  const results:VaultTestResult[]=[];

  results.push(await runCase('VGT3_CONTAINER_ROUNDTRIP','1. VGT3 encrypted container + wrong-credential fail-closed',async()=>{
    const password='vault-self-test-password-2026';
    const bytes=await packBrowserCredentialContainer(sampleDocument(),'password',password);
    if(new TextDecoder().decode(bytes.subarray(0,4))!=='VGT3')throw new Error('VGT3 header missing');
    const raw=new TextDecoder().decode(bytes);if(raw.includes('Vault self-test'))throw new Error('plaintext leaked into encrypted container');
    const opened=await unpackBrowserCredentialContainer(bytes,password);if(opened.id!=='vault-self-test')throw new Error('container roundtrip identity mismatch');
    let rejected=false;try{await unpackBrowserCredentialContainer(bytes,'definitely-wrong-password');}catch{rejected=true;}
    if(!rejected)throw new Error('wrong credential was accepted');
    return 'Production VGT3 pack/open path passed; plaintext hidden and wrong credential rejected.';
  }));

  results.push(await runCase('NON_EXTRACTABLE_SIGNING','2. Non-extractable WebCrypto signing self-verification',async()=>{
    const {descriptor}=await generateHardwareBoundKeyPair('Vault local self-test key');
    const attestation=await generateAttestationReport(descriptor.id);
    const payload=new TextEncoder().encode('Astraea Vault local signing self-test');
    const signature=await signWithHardwareKey(descriptor.id,payload);
    if(!descriptor.isNonExtractable||!attestation.valid||!await verifyHardwareSignature(descriptor.id,signature,payload))throw new Error('local signing verification failed');
    return 'Non-extractable signing handle verified locally; no hardware-backing claim is inferred.';
  }));

  results.push(await runCase('CHUNK_INTEGRITY','3. Production chunk integrity + tamper detection',async()=>{
    const bytes=new Uint8Array(128*1024);for(let i=0;i<bytes.length;i++)bytes[i]=(i*31)%256;
    const manifest=await buildVaultChunkIntegrity(bytes,64*1024);if(!await verifyVaultChunkIntegrity(bytes,manifest))throw new Error('clean payload failed integrity');
    const tampered=new Uint8Array(bytes);tampered[70_000]^=0xff;if(await verifyVaultChunkIntegrity(tampered,manifest))throw new Error('tampered payload passed integrity');
    return 'Production SHA-256 chunk/Merkle path rejected a one-byte mutation.';
  }));

  results.push(await runCase('QUARANTINE_EXECUTABLE','Executable/polyglot quarantine classifier',async()=>{
    const pe=new Uint8Array([0x4d,0x5a,0,0]);const elf=new Uint8Array([0x7f,0x45,0x4c,0x46]);const pdf=new TextEncoder().encode('%PDF-1.7');
    if(!detectVaultExecutable(pe,'invoice.pdf.exe')||!detectVaultExecutable(elf,'payload.bin')||detectVaultExecutable(pdf,'report.pdf'))throw new Error('executable classifier mismatch');
    return 'Production executable detector blocked PE/ELF while leaving a PDF header non-executable.';
  }));

  results.push(await runCase('MEMORY_ZEROIZE','Sensitive buffer zeroization',async()=>{
    const secret=new Uint8Array([1,2,3,4,5,6,7,8]);zeroizeMemoryBuffer(secret);if(!secret.every((byte)=>byte===0))throw new Error('buffer was not zeroized');
    return 'Sensitive test buffer was overwritten with zeros in place.';
  }));

  const passedCount=results.filter((result)=>result.passed).length;
  return {suite:'Astraea Vault Local Security Self-Test',timestamp:new Date().toISOString(),overallPassed:passedCount===results.length,passedCount,totalCount:results.length,results};
}
