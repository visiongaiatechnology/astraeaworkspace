// STATUS: DIAMANT VGT SUPREME — encryption/key policy truth without false hardware claims
import type{AdminPolicyModel,EncryptionPolicy,KeySlotType}from'../model/types';
export interface KeyProviderEvidence{provider:string;available:boolean;hardwareBacked:boolean;attestationVerified:boolean;slotTypes:KeySlotType[];}
export function normalizeEncryptionPolicy(input:EncryptionPolicy):EncryptionPolicy{const iterations=Math.max(210_000,Math.min(5_000_000,Math.trunc(input.minimumPortablePasswordIterations)));const min=Math.max(4,Math.min(12,Math.trunc(input.pin.minDigits))),max=Math.max(min,Math.min(16,Math.trunc(input.pin.maxDigits)));return{...input,requireNativeEncryption:true,allowedKeySlotTypes:[...new Set(input.allowedKeySlotTypes)],minimumPortablePasswordIterations:iterations,pin:{minDigits:min,maxDigits:max,maxAttempts:Math.max(3,Math.min(10,Math.trunc(input.pin.maxAttempts))),lockoutSeconds:Math.max(30,Math.min(86_400,Math.trunc(input.pin.lockoutSeconds)))},rotationDays:Math.max(1,Math.min(3650,Math.trunc(input.rotationDays))),implicitMasterKey:false};}
export function evaluateKeyProvider(policy:EncryptionPolicy,evidence:KeyProviderEvidence):{allowed:boolean;hardwareClaim:string;reason:string}{if(!evidence.available)return{allowed:false,hardwareClaim:'Unavailable',reason:'provider-unavailable'};if(!evidence.slotTypes.some(s=>policy.allowedKeySlotTypes.includes(s)))return{allowed:false,hardwareClaim:'Available (unsupported slot)',reason:'slot-type-not-allowed'};if(policy.hardwareBackedPreference==='required-if-available'&&evidence.hardwareBacked&&!evidence.attestationVerified)return{allowed:false,hardwareClaim:'Hardware-backed claim unverified',reason:'hardware-attestation-required'};return{allowed:true,hardwareClaim:evidence.hardwareBacked&&evidence.attestationVerified?'Hardware-backed (verified)':'Software/OS protected (verified availability only)',reason:'provider-policy-satisfied'};}
export function configureRecoveryEscrow(model:AdminPolicyModel,input:{enabled:boolean;recipientKeyId?:string;disclosure:string},authorized:boolean):AdminPolicyModel{if(!authorized)throw new Error('admin-key-policy-denied');const disclosure=input.disclosure.trim().slice(0,1024);if(input.enabled&&(!input.recipientKeyId||disclosure.length<20))throw new Error('admin-recovery-escrow-disclosure-required');return{...model,encryption:normalizeEncryptionPolicy({...model.encryption,recoveryEscrow:{enabled:input.enabled,recipientKeyId:input.enabled?input.recipientKeyId?.trim().slice(0,192):undefined,disclosure}}),updatedAt:Date.now()};}
export function planKeyRotation(model:AdminPolicyModel,input:{domainId:string;currentKeyId:string;nextKeyId:string;recoveryProofAvailable:boolean}):{allowed:boolean;steps:string[];evidence:string[]}{if(!input.domainId||!input.currentKeyId||!input.nextKeyId||input.currentKeyId===input.nextKeyId)return{allowed:false,steps:[],evidence:['invalid-key-rotation-input']};if(model.encryption.migrationRequiresRecoveryProof&&!input.recoveryProofAvailable)return{allowed:false,steps:[],evidence:['recovery-proof-required']};return{allowed:true,steps:['create-next-key','seal-recovery-proof','reencrypt-domain','verify-readback','retire-old-key-after-grace'],evidence:['old-key-id','new-key-id','reencryption-count','verification-digest','retirement-receipt']};}

export const BREAK_GLASS_POLICY = Object.freeze({
  scheme: 'SHAMIR_GF256_3_OF_5',
  threshold: 3,
  shareCount: 5,
} as const);

export interface BreakGlassShareDescriptor {
  shareId: string;
  holderId: string;
  domain: 'personal' | 'enterprise';
}

/**
 * Admin-side policy validation only. Share bytes never enter the browser policy layer;
 * reconstruction is delegated to the native KeyVault boundary.
 */
export function validateBreakGlassPlan(shares: readonly BreakGlassShareDescriptor[]): {
  ready: boolean;
  reason: string;
} {
  const uniqueShares = new Set(shares.map((share) => share.shareId));
  const uniqueHolders = new Set(shares.map((share) => share.holderId));
  if (shares.length > BREAK_GLASS_POLICY.shareCount) return { ready: false, reason: 'too-many-shares' };
  if (uniqueShares.size !== shares.length || uniqueHolders.size !== shares.length) return { ready: false, reason: 'duplicate-share-or-holder' };
  if (shares.length < BREAK_GLASS_POLICY.threshold) return { ready: false, reason: 'threshold-not-met' };
  return { ready: true, reason: 'native-keyvault-reconstruction-required' };
}
